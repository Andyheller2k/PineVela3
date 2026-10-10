-- Founder-keyed suspension. Removed memberships remain unavailable until the
-- independent four-vote/appeal protocol is implemented. No identities are seeded.
alter table public.admin_memberships add column sessions_invalidated_at timestamptz;

create or replace function private.administrator_session_allowed(context uuid,session uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.account_contexts c join auth.sessions s on s.user_id=c.auth_user_id
    join public.admin_memberships m on m.context_id=c.id left join private.admin_secrets k on k.context_id=c.id
    where c.id=context and c.kind='admin' and c.status='active' and m.status='active' and s.id=session
    and (k.sessions_invalidated_at is null or s.created_at>=k.sessions_invalidated_at)
    and (m.sessions_invalidated_at is null or s.created_at>=m.sessions_invalidated_at)
    and (s.not_after is null or s.not_after>clock_timestamp()));
$$;
revoke all on function private.administrator_session_allowed(uuid,uuid) from public,anon,authenticated,pinevela_backend;

create function private.guard_administrator_membership_status() returns trigger
language plpgsql set search_path='' as $$
declare actor uuid;
begin
  if tg_op='DELETE' then raise exception using errcode='42501',message='Administrator removal requires its independent review and appeal protocol';end if;
  if (new.context_id,new.slot,new.joined_at) is distinct from (old.context_id,old.slot,old.joined_at)
    or new.sessions_invalidated_at is distinct from old.sessions_invalidated_at
    or new.changed_at is distinct from old.changed_at then
    raise exception using errcode='42501',message='Administrator identity and lifecycle metadata are immutable';end if;
  if new.status is not distinct from old.status then return new;end if;
  if old.slot=1 then raise exception using errcode='42501',message='The founder cannot be suspended or removed';end if;
  if old.status not in ('active','suspended') or new.status not in ('active','suspended') then
    raise exception using errcode='42501',message='Administrator removal requires its independent review and appeal protocol';end if;
  perform pg_advisory_xact_lock(hashtextextended('platform-settings',0));
  actor:=private.approval_authorized_context();
  if actor is null or not exists(select 1 from public.admin_memberships m join public.account_contexts c on c.id=m.context_id
    where m.context_id=actor and m.slot=1 and m.status='active' and c.kind='admin' and c.status='active') then
    raise exception using errcode='42501',message='The active founder approval key is required';end if;
  new.changed_at:=clock_timestamp();new.sessions_invalidated_at:=new.changed_at;
  return new;
end;
$$;
create trigger guard_administrator_membership_status before update or delete on public.admin_memberships
  for each row execute function private.guard_administrator_membership_status();

create function private.guard_administrator_context() returns trigger
language plpgsql set search_path='' as $$
begin
  if old.kind='admin' or exists(select 1 from public.admin_memberships where context_id=old.id) then
    if tg_op='DELETE' then raise exception using errcode='42501',message='Administrator removal requires its independent review and appeal protocol';end if;
    if (new.id,new.auth_user_id,new.primary_owner_id,new.kind,new.status) is distinct from
       (old.id,old.auth_user_id,old.primary_owner_id,old.kind,old.status) then
      raise exception using errcode='42501',message='Administrator ownership and access must use the governance protocol';end if;
  end if;
  return new;
end;
$$;
create trigger guard_administrator_context before update or delete on public.account_contexts
  for each row execute function private.guard_administrator_context();

create function private.administrator_membership_status_event() returns trigger
language plpgsql set search_path='' as $$
declare actor uuid;notice uuid;recipient uuid;title text;message text;target_name text;
begin
  if new.status is not distinct from old.status then return new;end if;
  actor:=private.approval_authorized_context();
  select coalesce(nullif(p.display_name,''),'administrator') into target_name from public.account_contexts c
    join public.profiles p on p.id=c.auth_user_id where c.id=new.context_id;
  title:=case when new.status='active' then 'Administrator access restored' else 'Administrator access suspended' end;
  message:='Administrator #'||new.slot::text||' ('||target_name||'): '||case when new.status='active'
    then 'the main administrator restored access. A new sign-in is required to access the administrator portal.'
    else 'the main administrator suspended access. Administrator portal access has been revoked.' end;
  insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id,event_data)
    values(actor,'administrator_membership_'||new.status,'account_context',new.context_id,jsonb_build_object('from',old.status,'to',new.status));
  insert into public.notifications(sender_context_id,category,title,message,link)
    values(actor,'admin_governance',title,message,'governance') returning id into notice;
  insert into public.notification_recipients(notification_id,context_id)
    select notice,recipients.id from (
      select m.context_id as id from public.admin_memberships m join public.account_contexts c on c.id=m.context_id
        where m.status='active' and c.kind='admin' and c.status='active'
      union select new.context_id
      union select p.id from public.account_contexts target join public.account_contexts p on p.auth_user_id=target.auth_user_id
        and p.kind='primary' and p.status='active' where target.id=new.context_id
    ) recipients;
  for recipient in select context_id from public.notification_recipients where notification_id=notice loop
    perform pg_notify('pinevela_notifications',recipient::text);
  end loop;
  return new;
end;
$$;
create trigger administrator_membership_status_event after update of status on public.admin_memberships
  for each row execute function private.administrator_membership_status_event();
revoke all on function private.guard_administrator_membership_status(),private.guard_administrator_context(),
  private.administrator_membership_status_event() from public,anon,authenticated,pinevela_backend;
