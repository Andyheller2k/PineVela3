-- Verified subject-bound administrator invitations. No users or memberships are seeded.
alter table private.admin_invitations
  add column invited_name text not null default '',
  add column invited_auth_user_id uuid references auth.users(id),
  add column issued_approval_key_version uuid,
  add column accepted_context_id uuid references public.account_contexts(id),
  add column cancellation_reason text check(cancellation_reason in ('cancelled','expired','issuer_changed','legacy_protocol'));
-- Earlier invitations have no reviewed credential version; retain their history, close grants.
update private.admin_invitations set cancelled_at=clock_timestamp(),cancellation_reason='legacy_protocol'
  where accepted_at is null and cancelled_at is null;
create unique index administrator_invitation_open_email on private.admin_invitations(invited_email)
  where accepted_at is null and cancelled_at is null;
alter table private.admin_invitations add constraint administrator_invitation_protocol check
  (issued_approval_key_version is null or
    (length(invited_name) between 1 and 100 and invited_email=lower(btrim(invited_email))
      and invitation_digest ~ '^[a-f0-9]{64}$' and (accepted_at is null)=(accepted_context_id is null)));
revoke all on private.admin_invitations from public,anon,authenticated,pinevela_backend;

create function private.invitation_issuer_valid(i private.admin_invitations) returns boolean
language sql stable set search_path='' as $$
  select exists(select 1 from public.admin_memberships m join public.account_contexts c on c.id=m.context_id
    join private.admin_secrets k on k.context_id=m.context_id where m.context_id=i.created_by_context_id
      and m.slot=1 and m.status='active' and c.kind='admin' and c.status='active'
      and k.approval_key_hash is not null and k.approval_key_version=i.issued_approval_key_version);
$$;
create function private.invitation_identity_valid(subject uuid,mailbox text) returns boolean
language sql stable set search_path='' as $$
  select exists(select 1 from auth.users u join auth.identities i on i.user_id=u.id
    join public.profiles p on p.id=u.id where u.id=subject and lower(u.email)=mailbox
      and u.email_confirmed_at is not null and not u.is_anonymous and p.primary_owner_id is null
      and (u.banned_until is null or u.banned_until<=clock_timestamp())
      and lower(i.identity_data->>'email')=mailbox and
        (i.provider='email' or i.provider='google' and i.identity_data->>'email_verified'='true'));
$$;
create function private.invitation_acceptance_allowed(i private.admin_invitations,target uuid) returns boolean
language sql stable set search_path='' as $$
  select i.accepted_at is null and i.cancelled_at is null and i.expires_at>clock_timestamp()
    and i.id::text=current_setting('pinevela.admin_invitation_id',true)
    and i.invitation_digest=current_setting('pinevela.admin_invitation_digest',true)
    and private.invitation_issuer_valid(i) and private.current_kind()='primary'
    and (i.invited_auth_user_id is null or i.invited_auth_user_id=auth.uid())
    and private.invitation_identity_valid(auth.uid(),i.invited_email)
    and exists(select 1 from public.account_contexts c where c.id=target and c.kind='admin'
      and c.auth_user_id=auth.uid() and c.primary_owner_id=auth.uid() and c.status='active')
    and not exists(select 1 from public.account_contexts c where c.auth_user_id=auth.uid()
      and c.kind<>'primary' and c.id<>target);
$$;
create function private.guard_admin_invitation() returns trigger
language plpgsql set search_path='' as $$
declare actor uuid; expected_subject uuid;
begin
  if tg_op='DELETE' then raise exception using errcode='42501',message='Invitation history is immutable';end if;
  actor:=private.approval_authorized_context();
  if tg_op='INSERT' then
    select id into expected_subject from auth.users where lower(email)=new.invited_email;
    if actor is null or actor is distinct from new.created_by_context_id
      or not exists(select 1 from public.admin_memberships where context_id=actor and slot=1 and status='active')
      or not private.invitation_issuer_valid(new) or new.invited_auth_user_id is distinct from expected_subject
      or new.accepted_at is not null or new.accepted_context_id is not null or new.cancelled_at is not null or new.cancellation_reason is not null
      or new.reserved_slot not between 2 and 5 or length(btrim(new.invited_name)) not between 1 and 100
      or new.invited_email<>lower(btrim(new.invited_email)) or new.invited_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      or length(new.invited_email)>254 or new.invitation_digest !~ '^[a-f0-9]{64}$'
      or (select count(*) from auth.users where lower(email)=new.invited_email)>1
      or exists(select 1 from public.admin_memberships where slot=new.reserved_slot)
      or exists(select 1 from public.account_contexts where auth_user_id=expected_subject and kind<>'primary') then
      raise exception using errcode='42501',message='Founder-reviewed invitation required';end if;
    new.created_at:=clock_timestamp();new.expires_at:=new.created_at+interval '24 hours';
  else
    if (new.id,new.invited_email,new.invited_name,new.invited_auth_user_id,new.reserved_slot,new.invitation_digest,new.created_by_context_id,new.created_at,new.expires_at,new.issued_approval_key_version)
      is distinct from (old.id,old.invited_email,old.invited_name,old.invited_auth_user_id,old.reserved_slot,old.invitation_digest,old.created_by_context_id,old.created_at,old.expires_at,old.issued_approval_key_version) then
      raise exception using errcode='42501',message='Reviewed invitation is immutable';end if;
    if (new.accepted_at,new.accepted_context_id,new.cancelled_at,new.cancellation_reason)
      is not distinct from (old.accepted_at,old.accepted_context_id,old.cancelled_at,old.cancellation_reason) then return new;end if;
    if old.accepted_at is not null or old.cancelled_at is not null then raise exception using errcode='42501',message='Invitation decision is final';end if;
    if new.accepted_context_id is not null and new.cancelled_at is null and new.cancellation_reason is null
      and private.invitation_acceptance_allowed(old,new.accepted_context_id)
      and exists(select 1 from public.admin_memberships where context_id=new.accepted_context_id and slot=old.reserved_slot and status='active') then
      new.accepted_at:=clock_timestamp();
    elsif new.cancelled_at is not null and new.accepted_context_id is null and new.accepted_at is null then
      if old.expires_at<=clock_timestamp() then new.cancellation_reason:='expired';
      elsif not private.invitation_issuer_valid(old) then new.cancellation_reason:='issuer_changed';
      elsif actor is not null and exists(select 1 from public.admin_memberships where context_id=actor and slot=1 and status='active') then
        new.cancellation_reason:='cancelled';
      else raise exception using errcode='42501',message='Founder approval key required';end if;
      new.cancelled_at:=clock_timestamp();
    else raise exception using errcode='42501',message='Verified invitation acceptance required';end if;
  end if;return new;
end;
$$;
create trigger guard_admin_invitation before insert or update or delete on private.admin_invitations
  for each row execute function private.guard_admin_invitation();
create function private.guard_invited_administrator() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.slot=1 then return new;end if;
  if new.status<>'active' or not exists(select 1 from private.admin_invitations i where i.reserved_slot=new.slot
    and private.invitation_acceptance_allowed(i,new.context_id)) then
    raise exception using errcode='42501',message='Verified reserved invitation required';end if;
  new.joined_at:=clock_timestamp();new.changed_at:=new.joined_at;return new;
end;
$$;
create trigger guard_invited_administrator before insert on public.admin_memberships
  for each row execute function private.guard_invited_administrator();
create function private.admin_invitation_recorded() returns trigger
language plpgsql set search_path='' as $$
declare event text; notice uuid; recipient uuid;
begin
  if tg_op='INSERT' then event:='created';
  elsif new.accepted_at is distinct from old.accepted_at then event:='accepted';
  elsif new.cancelled_at is distinct from old.cancelled_at then event:=new.cancellation_reason;
  else return null;end if;
  insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id)
    values(private.current_context_id(),'administrator_invitation_'||event,'admin_invitation',new.id);
  insert into public.notifications(sender_context_id,category,title,message,link)
    values(private.current_context_id(),'admin_governance','Administrator invitation '||event,
      'An administrator invitation for slot #'||new.reserved_slot||' changed state. Open Admin Approvals to review it.','governance') returning id into notice;
  insert into public.notification_recipients(notification_id,context_id) select notice,m.context_id from public.admin_memberships m
    join public.account_contexts c on c.id=m.context_id where m.status='active' and c.kind='admin' and c.status='active';
  for recipient in select context_id from public.notification_recipients where notification_id=notice loop perform pg_notify('pinevela_notifications',recipient::text);end loop;
  return null;
end;
$$;
create trigger admin_invitation_recorded after insert or update on private.admin_invitations
  for each row execute function private.admin_invitation_recorded();
-- Close stale grants when issuer authority changes, including later reversals.
create function private.admin_invitation_issuer_changed() returns trigger
language plpgsql set search_path='' as $$
begin
  update private.admin_invitations i set cancelled_at=clock_timestamp()
    where i.accepted_at is null and i.cancelled_at is null and not private.invitation_issuer_valid(i);
  return null;
end;
$$;
create trigger admin_invitation_issuer_changed after update of approval_key_hash,approval_key_version on private.admin_secrets
  for each row execute function private.admin_invitation_issuer_changed();
create trigger admin_invitation_issuer_changed after update of status,slot,context_id on public.admin_memberships
  for each row execute function private.admin_invitation_issuer_changed();
create trigger admin_invitation_issuer_changed after update of status,kind,auth_user_id on public.account_contexts
  for each row execute function private.admin_invitation_issuer_changed();
revoke all on function private.invitation_issuer_valid(private.admin_invitations),private.invitation_identity_valid(uuid,text),
  private.invitation_acceptance_allowed(private.admin_invitations,uuid),private.guard_admin_invitation(),private.guard_invited_administrator(),
  private.admin_invitation_recorded(),private.admin_invitation_issuer_changed() from public,anon,authenticated,pinevela_backend;
