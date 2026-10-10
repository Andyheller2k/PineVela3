-- One-way admin announcements reuse the existing recipient-scoped inbox.
alter table public.notifications add column admin_message_type text;
alter table public.notifications add constraint notifications_admin_message_type_check
  check (admin_message_type is null or (category='admin_message' and admin_message_type in ('info','success','warning','error')
    and sender_context_id is not null and length(btrim(title)) between 1 and 120 and length(btrim(message)) between 1 and 4000));

create table private.admin_message_deliveries (
  id uuid primary key default gen_random_uuid(),
  sender_context_id uuid not null references public.account_contexts(id),
  selection_digest text not null check (selection_digest ~ '^[0-9a-f]{64}$'),
  recipient_context_ids uuid[] not null check (cardinality(recipient_context_ids) between 1 and 2000
    and array_position(recipient_context_ids,null) is null),
  recipient_counts jsonb not null check (jsonb_typeof(recipient_counts)='object'),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp()+interval '15 minutes',
  notification_id uuid unique references public.notifications(id),
  content_digest text check (content_digest ~ '^[0-9a-f]{64}$'),
  completed_at timestamptz,
  check ((notification_id is null and content_digest is null and completed_at is null) or
    (notification_id is not null and content_digest is not null and completed_at is not null)),
  check (expires_at>created_at and expires_at<=created_at+interval '16 minutes'),
  check (completed_at is null or completed_at>=created_at)
);
create index admin_message_deliveries_sender_created_idx on private.admin_message_deliveries(sender_context_id,created_at);
alter table private.admin_message_deliveries enable row level security;
revoke all on private.admin_message_deliveries from public,anon,authenticated,pinevela_backend;

create function private.admin_message_delivery_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
declare expected_ids uuid[];
begin
  if new.sender_context_id is distinct from private.current_context_id() or private.current_kind() is distinct from 'admin'
    or not exists(select 1 from public.admin_memberships m join public.account_contexts x on x.id=m.context_id
      where m.context_id=new.sender_context_id and m.status='active' and x.status='active' and x.auth_user_id=(select auth.uid())) then
    raise exception 'Active sender administrator required' using errcode='42501';
  end if;
  if tg_op='INSERT' then
    if new.notification_id is not null or new.created_at<clock_timestamp()-interval '1 minute'
      or new.created_at>clock_timestamp()+interval '1 minute' then
      raise exception 'Create an unsent current preview' using errcode='42501';
    end if;
    select array_agg(x.id order by x.id) into expected_ids from public.account_contexts x
      where x.id=any(new.recipient_context_ids) and x.status='active' and x.kind in ('primary','manager','resident','seller','staff');
    if expected_ids is distinct from new.recipient_context_ids then
      raise exception 'Recipient snapshot must contain sorted distinct active portals' using errcode='42501';
    end if;
  else
    if old.notification_id is not null or new.notification_id is null or
      row(new.id,new.sender_context_id,new.selection_digest,new.recipient_context_ids,new.recipient_counts,new.created_at,new.expires_at)
      is distinct from row(old.id,old.sender_context_id,old.selection_digest,old.recipient_context_ids,old.recipient_counts,old.created_at,old.expires_at)
      or old.expires_at<=clock_timestamp() or new.completed_at<clock_timestamp()-interval '1 minute'
      or new.completed_at>clock_timestamp()+interval '1 minute' then
      raise exception 'Preview snapshot and completed delivery are immutable' using errcode='42501';
    end if;
    if not exists(select 1 from public.notifications n where n.id=new.notification_id and n.category='admin_message'
      and n.admin_message_type is not null and n.sender_context_id=new.sender_context_id) then
      raise exception 'Delivery needs its sender announcement' using errcode='42501';
    end if;
    select array_agg(r.context_id order by r.context_id) into expected_ids from public.notification_recipients r
      where r.notification_id=new.notification_id;
    if expected_ids is distinct from new.recipient_context_ids then
      raise exception 'Delivery recipients must match the reviewed snapshot' using errcode='42501';
    end if;
  end if;
  return new;
end; $$;
revoke all on function private.admin_message_delivery_guard() from public,anon,authenticated,pinevela_backend;
create trigger admin_message_delivery_guard before insert or update on private.admin_message_deliveries
  for each row execute function private.admin_message_delivery_guard();

create function private.admin_announcement_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='UPDATE' and (old.admin_message_type is not null or new.admin_message_type is not null) then
    raise exception 'Sent announcements are immutable' using errcode='42501';
  end if;
  if new.admin_message_type is not null and (new.sender_context_id is distinct from private.current_context_id()
    or private.current_kind() is distinct from 'admin' or not exists(select 1 from public.admin_memberships m
      where m.context_id=new.sender_context_id and m.status='active')) then
    raise exception 'Active administrator sender required' using errcode='42501';
  end if;
  return new;
end; $$;
revoke all on function private.admin_announcement_guard() from public,anon,authenticated,pinevela_backend;
create trigger admin_announcement_guard before insert or update on public.notifications
  for each row execute function private.admin_announcement_guard();

create function private.admin_announcement_recipient_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if exists(select 1 from public.notifications n where n.id=new.notification_id and n.admin_message_type is not null) then
    if private.current_kind() is distinct from 'admin' or not exists(select 1 from public.notifications n
      where n.id=new.notification_id and n.sender_context_id=private.current_context_id())
      or exists(select 1 from private.admin_message_deliveries d where d.notification_id=new.notification_id)
      or not exists(select 1 from public.account_contexts x where x.id=new.context_id and x.status='active'
        and x.kind in ('primary','manager','resident','seller','staff')) then
      raise exception 'Announcement recipient scope is immutable after delivery' using errcode='42501';
    end if;
  end if;
  return new;
end; $$;
revoke all on function private.admin_announcement_recipient_guard() from public,anon,authenticated,pinevela_backend;
create trigger admin_announcement_recipient_guard before insert on public.notification_recipients
  for each row execute function private.admin_announcement_recipient_guard();
