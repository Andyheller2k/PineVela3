-- Context-bound approval credentials and reviewed recovery. No accounts/keys are seeded.
alter table private.admin_secrets add column approval_key_version uuid not null default gen_random_uuid(),
  add column approval_attempt_window timestamptz, add column sessions_invalidated_at timestamptz,
  add constraint approval_key_format check(approval_key_hash is null or approval_key_hash ~ '^scrypt-sha256\$[a-f0-9]{32}\$[a-f0-9]{64}$'),
  add constraint approval_key_enrollment_pair check((approval_key_hash is null)=(approval_enrolled_at is null));
alter table public.admin_proposals add column recovery_roster_revision bigint;
update public.admin_proposals set recovery_roster_revision=0,
  status=case when status in ('pending','approved') then 'invalidated' else status end where kind='administrator_key_reset';
alter table public.admin_proposals add constraint recovery_revision_present check
  (kind<>'administrator_key_reset' or recovery_roster_revision is not null and recovery_roster_revision>=0);
create unique index administrator_recovery_open on public.admin_proposals(target_context_id,(preview->>'action'))
  where kind='administrator_key_reset' and status='pending';

create function private.administrator_session_allowed(context uuid,session uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.account_contexts c join auth.sessions s on s.user_id=c.auth_user_id
    left join private.admin_secrets k on k.context_id=c.id where c.id=context and c.kind='admin' and s.id=session
    and (k.sessions_invalidated_at is null or s.created_at>=k.sessions_invalidated_at)
    and (s.not_after is null or s.not_after>clock_timestamp()));
$$;
revoke all on function private.administrator_session_allowed(uuid,uuid) from public,anon,authenticated,pinevela_backend;
-- Preserve maintenance, genuine session, PIN, active allocation and employment boundaries.
create or replace function private.bound_context_id() returns uuid
language sql stable security definer set search_path='' as $$
  select s.active_context_id from private.account_sessions s
  join public.account_contexts c on c.id=s.active_context_id
  join auth.sessions live on live.id=s.session_id and live.user_id=s.auth_user_id
  where s.auth_user_id=(select auth.uid()) and c.auth_user_id=s.auth_user_id and c.status='active'
    and (live.not_after is null or live.not_after>now()) and private.portal_session_allowed(c.id,s.portal_pin_version)
    and (c.kind<>'admin' or private.administrator_session_allowed(c.id,s.session_id)
      and exists(select 1 from public.admin_memberships m where m.context_id=c.id and m.status='active'))
    and (c.kind<>'staff' or exists(select 1 from public.staff_assignments a where a.staff_context_id=c.id and a.status='active' and a.ended_at is null))
    and (c.kind<>'resident' or exists(select 1 from public.allocations a where a.resident_context_id=c.id and a.ended_at is null))
    and s.session_id=case when (select auth.jwt()->>'session_id') ~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
      then (select auth.jwt()->>'session_id')::uuid else null end limit 1;
$$;

create function private.approval_authorized_context() returns uuid
language sql stable set search_path='' as $$
  select k.context_id from private.admin_secrets k where k.context_id=private.current_context_id()
    and private.current_kind()='admin' and k.approval_key_hash is not null
    and k.approval_key_version::text=current_setting('pinevela.approval_key_version',true)
    and (k.locked_until is null or k.locked_until<=clock_timestamp());
$$;
create function private.recovery_roster() returns jsonb
language sql stable set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',m.context_id,'slot',m.slot,'name',p.display_name) order by m.slot),'[]'::jsonb)
  from public.admin_memberships m join public.account_contexts c on c.id=m.context_id join public.profiles p on p.id=c.auth_user_id
  join private.admin_secrets k on k.context_id=m.context_id
  where m.status='active' and c.status='active' and c.kind='admin' and k.approval_key_hash is not null;
$$;
create function private.recovery_digest(target uuid,action text,revision bigint) returns text
language sql immutable set search_path='' as $$
  select md5(jsonb_build_object('target',target,'action',action,'revision',revision)::text);
$$;
create function private.recovery_execution_allowed(target uuid,action text) returns boolean
language sql stable set search_path='' as $$
  select exists(select 1 from public.admin_proposals p join private.admin_pricing_state s on s.singleton
    where p.id::text=current_setting('pinevela.admin_recovery_proposal_id',true) and p.kind='administrator_key_reset'
      and p.target_context_id=target and p.preview->>'action'=action and p.status='pending' and p.expires_at>clock_timestamp()
      and p.recovery_roster_revision=s.roster_revision and p.quorum=2 and p.created_at<=clock_timestamp()
      and p.baseline_digest=private.recovery_digest(target,action,s.roster_revision)
      and private.approval_authorized_context() is not null and private.approval_authorized_context()<>target
      and exists(select 1 from public.admin_votes v where v.proposal_id=p.id and v.administrator_context_id=private.approval_authorized_context() and v.decision='approved')
      and (select count(*)=2 and bool_and(v.decision='approved' and v.administrator_context_id<>target
        and m.status='active' and c.status='active' and c.kind='admin' and k.approval_key_hash is not null)
        from public.admin_votes v join public.admin_memberships m on m.context_id=v.administrator_context_id
        join public.account_contexts c on c.id=m.context_id join private.admin_secrets k on k.context_id=m.context_id where v.proposal_id=p.id));
$$;

create function private.guard_administrator_approval_key() returns trigger
language plpgsql set search_path='' as $$
declare clearing boolean;
begin
  if tg_op='DELETE' then
    if exists(select 1 from public.admin_memberships m join public.account_contexts c on c.id=m.context_id where m.context_id=old.context_id and m.status='active' and c.status='active') then
      raise exception using errcode='42501',message='Active administrator keys require reviewed recovery';end if;return old;
  end if;
  if tg_op='UPDATE' and new.context_id is distinct from old.context_id then raise exception using errcode='42501',message='Key owner is immutable';end if;
  if not exists(select 1 from public.admin_memberships m join public.account_contexts c on c.id=m.context_id
    where m.context_id=new.context_id and m.status='active' and c.status='active' and c.kind='admin') then
    raise exception using errcode='42501',message='Active administrator required';end if;
  if tg_op='UPDATE' then
    clearing:=old.approval_key_hash is not null and new.approval_key_hash is null or old.settings_key_hash is not null and new.settings_key_hash is null;
    if clearing then
      if not private.recovery_execution_allowed(new.context_id,case when new.approval_key_hash is null and old.approval_key_hash is not null then 'reset-key' else 'reset-settings-key' end) then
        raise exception using errcode='42501',message='Two independent administrator approvals required';end if;
      new.sessions_invalidated_at:=clock_timestamp();
    elsif new.sessions_invalidated_at is distinct from old.sessions_invalidated_at then
      raise exception using errcode='42501',message='Session invalidation is server controlled';end if;
  elsif new.sessions_invalidated_at is not null then raise exception using errcode='42501',message='Session invalidation is server controlled';end if;
  if tg_op='INSERT' and new.approval_key_hash is not null or tg_op='UPDATE' and new.approval_key_hash is distinct from old.approval_key_hash then
    if tg_op='UPDATE' and old.approval_key_hash is not null then
      if new.approval_key_hash is not null or not private.recovery_execution_allowed(new.context_id,'reset-key') then
        raise exception using errcode='42501',message='Reviewed key recovery required';end if;
      new.approval_enrolled_at:=null;
    else
      if new.approval_key_hash is null or private.current_kind() is distinct from 'admin' or private.current_context_id() is distinct from new.context_id
        or not exists(select 1 from auth.sessions s where s.id=(auth.jwt()->>'session_id')::uuid and s.user_id=auth.uid()
          and s.created_at between clock_timestamp()-interval '5 minutes' and clock_timestamp() and (s.not_after is null or s.not_after>clock_timestamp())) then
        raise exception using errcode='42501',message='Fresh verified administrator sign-in required';end if;
      new.approval_enrolled_at:=clock_timestamp();
    end if;
    new.approval_key_version:=gen_random_uuid();new.failed_attempts:=0;new.approval_attempt_window:=null;new.locked_until:=null;
  elsif tg_op='UPDATE' and (new.approval_key_version,new.approval_enrolled_at) is distinct from (old.approval_key_version,old.approval_enrolled_at) then
    raise exception using errcode='42501',message='Approval enrollment metadata is immutable';
  end if;return new;
end;
$$;
create trigger guard_administrator_approval_key before insert or update or delete on private.admin_secrets
  for each row execute function private.guard_administrator_approval_key();
create or replace function private.guard_administrator_settings_key() returns trigger
language plpgsql set search_path='' as $$
begin
  if tg_op='UPDATE' and new.context_id is distinct from old.context_id then raise exception using errcode='42501',message='Key ownership is immutable';end if;
  if not exists(select 1 from public.admin_memberships m join public.account_contexts c on c.id=m.context_id
    where m.context_id=new.context_id and m.status='active' and c.kind='admin' and c.status='active') then
    raise exception using errcode='42501',message='Active administrator required';end if;
  if tg_op='INSERT' and new.settings_key_hash is not null or tg_op='UPDATE' and new.settings_key_hash is distinct from old.settings_key_hash then
    if tg_op='UPDATE' and old.settings_key_hash is not null then
      if new.settings_key_hash is not null or not private.recovery_execution_allowed(new.context_id,'reset-settings-key') then
        raise exception using errcode='42501',message='Key recovery requires approved governance';end if;
      new.settings_enrolled_at:=null;
    else
      if new.settings_key_hash is null or private.current_kind() is distinct from 'admin' or private.current_context_id() is distinct from new.context_id
        or not exists(select 1 from auth.sessions s where s.id=(auth.jwt()->>'session_id')::uuid and s.user_id=auth.uid()
          and s.created_at between clock_timestamp()-interval '5 minutes' and clock_timestamp() and (s.not_after is null or s.not_after>clock_timestamp())) then
        raise exception using errcode='42501',message='Fresh verified administrator sign-in required';end if;
      new.settings_enrolled_at:=clock_timestamp();
    end if;
    new.settings_key_version:=gen_random_uuid();new.settings_failed_attempts:=0;new.settings_attempt_window:=null;new.settings_locked_until:=null;
  elsif tg_op='UPDATE' and (new.settings_key_version,new.settings_enrolled_at) is distinct from (old.settings_key_version,old.settings_enrolled_at) then
    raise exception using errcode='42501',message='Settings enrollment metadata is immutable';end if;
  return new;
end;
$$;
-- Approval key changes also invalidate reviews, including reversals of roster changes.
create or replace function private.pricing_roster_changed() returns trigger
language plpgsql set search_path='' as $$
declare changed boolean; executing text;
begin
  if tg_table_name='admin_memberships' then
    if tg_op<>'UPDATE' then changed:=true;else changed:=(new.context_id,new.slot,new.status) is distinct from (old.context_id,old.slot,old.status);end if;
  elsif tg_table_name='account_contexts' then
    if tg_op='INSERT' then changed:=new.kind='admin';elsif tg_op='DELETE' then changed:=old.kind='admin';
    else changed:=(new.kind='admin' or old.kind='admin') and (new.status,new.kind,new.auth_user_id) is distinct from (old.status,old.kind,old.auth_user_id);end if;
  else
    if tg_op='INSERT' then changed:=new.settings_key_hash is not null or new.approval_key_hash is not null;
    elsif tg_op='DELETE' then changed:=old.settings_key_hash is not null or old.approval_key_hash is not null;
    else changed:=(new.settings_key_hash,new.settings_key_version,new.approval_key_hash,new.approval_key_version)
      is distinct from (old.settings_key_hash,old.settings_key_version,old.approval_key_hash,old.approval_key_version);end if;
  end if;
  if changed then
    update private.admin_pricing_state set roster_revision=roster_revision+1 where singleton;
    executing:=coalesce(current_setting('pinevela.admin_recovery_proposal_id',true),'');
    update public.admin_proposals set status='invalidated' where status in ('pending','approved')
      and (kind='pricing' or kind='administrator_key_reset' and id::text<>executing);
  end if;return null;
end;
$$;

create function private.recovery_proposal_guard() returns trigger
language plpgsql set search_path='' as $$
declare revision bigint; actor uuid; action text;
begin
  if tg_op='DELETE' then
    if old.kind='administrator_key_reset' then raise exception using errcode='42501',message='Recovery history is immutable';end if;return old;
  end if;
  if tg_op='UPDATE' and new.kind<>old.kind and (new.kind='administrator_key_reset' or old.kind='administrator_key_reset') then
    raise exception using errcode='42501',message='Proposal kind is immutable';end if;
  if new.kind<>'administrator_key_reset' then return new;end if;
  select roster_revision into revision from private.admin_pricing_state where singleton;
  action:=new.preview->>'action';actor:=private.approval_authorized_context();
  if tg_op='INSERT' then
    if actor is null or actor is distinct from new.proposer_context_id or new.target_context_id is null or actor=new.target_context_id
      or action is null or action not in ('reset-key','reset-settings-key') or new.target_residence_id is not null or new.quorum<>2 or new.status<>'pending'
      or new.recovery_roster_revision<>revision or new.baseline_digest<>private.recovery_digest(new.target_context_id,action,revision)
      or new.preview<>jsonb_build_object('action',action,'roster',private.recovery_roster()) or length(btrim(new.reason)) not between 3 and 500
      or new.decided_at is not null or new.executed_at is not null or new.executed_by_context_id is not null
      or not exists(select 1 from public.admin_memberships m join public.account_contexts c on c.id=m.context_id
        join private.admin_secrets k on k.context_id=m.context_id where m.context_id=new.target_context_id and m.status='active' and c.status='active'
          and case when action='reset-key' then k.approval_key_hash is not null else k.settings_key_hash is not null end)
      or (select count(*) from jsonb_array_elements(private.recovery_roster()) member where member->>'id'<>new.target_context_id::text)<2 then
      raise exception using errcode='42501',message='Eligible independent recovery proposal required';end if;
    if (select count(*) from public.admin_proposals p where p.kind='administrator_key_reset' and p.status='pending')>=10 then
      raise exception using errcode='54000',message='Too many open recovery proposals';end if;
    new.created_at:=clock_timestamp();new.expires_at:=new.created_at+interval '24 hours';
  else
    if (new.id,new.proposer_context_id,new.target_context_id,new.target_residence_id,new.preview,new.baseline_digest,new.reason,new.quorum,new.created_at,new.expires_at,new.recovery_roster_revision)
      is distinct from (old.id,old.proposer_context_id,old.target_context_id,old.target_residence_id,old.preview,old.baseline_digest,old.reason,old.quorum,old.created_at,old.expires_at,old.recovery_roster_revision) then
      raise exception using errcode='42501',message='Reviewed proposal metadata is immutable';end if;
    if new.status is distinct from old.status then
      if old.status<>'pending' then raise exception using errcode='42501',message='Recovery decision is final';end if;
      if new.status='expired' and old.expires_at<=clock_timestamp() or new.status='invalidated' and old.recovery_roster_revision<>revision then null;
      elsif new.status='rejected' and actor is not null and exists(select 1 from public.admin_votes v where v.proposal_id=new.id and v.administrator_context_id=actor and v.decision='rejected') then null;
      elsif new.status='executed' and actor is not null and new.id::text=current_setting('pinevela.admin_recovery_proposal_id',true)
        and actor<>new.target_context_id and exists(select 1 from private.admin_secrets k where k.context_id=new.target_context_id
          and k.sessions_invalidated_at>=old.created_at and case when action='reset-key' then k.approval_key_hash is null else k.settings_key_hash is null end)
        and (select count(*)=2 and bool_and(decision='approved' and administrator_context_id<>new.target_context_id) from public.admin_votes where proposal_id=new.id) then
        new.executed_at:=clock_timestamp();new.executed_by_context_id:=actor;
      else raise exception using errcode='42501',message='Independent approved recovery required';end if;
      new.decided_at:=clock_timestamp();
    elsif (new.decided_at,new.executed_at,new.executed_by_context_id) is distinct from (old.decided_at,old.executed_at,old.executed_by_context_id) then
      raise exception using errcode='42501',message='Decision metadata is server controlled';end if;
  end if;return new;
end;
$$;
create trigger recovery_proposal_guard before insert or update or delete on public.admin_proposals
  for each row execute function private.recovery_proposal_guard();
create function private.recovery_vote_guard() returns trigger
language plpgsql set search_path='' as $$
declare p public.admin_proposals; actor uuid;
begin
  if tg_op='UPDATE' and exists(select 1 from public.admin_proposals where id=old.proposal_id and kind='administrator_key_reset') then
    raise exception using errcode='42501',message='Recovery votes are immutable';end if;
  select * into p from public.admin_proposals where id=case when tg_op='DELETE' then old.proposal_id else new.proposal_id end;
  if p.kind<>'administrator_key_reset' then return case when tg_op='DELETE' then old else new end;end if;
  if tg_op<>'INSERT' then raise exception using errcode='42501',message='Recovery votes are immutable';end if;
  actor:=private.approval_authorized_context();
  if actor is null or actor is distinct from new.administrator_context_id or actor=p.target_context_id or p.status<>'pending'
    or p.expires_at<=clock_timestamp() or p.recovery_roster_revision<>(select roster_revision from private.admin_pricing_state where singleton)
    or not exists(select 1 from jsonb_array_elements(p.preview->'roster') r where r->>'id'=actor::text)
    or exists(select 1 from public.admin_votes v where v.proposal_id=p.id and v.decision='rejected')
    or (select count(*) from public.admin_votes where proposal_id=p.id)>=2
    or actor=p.proposer_context_id and new.decision<>'approved'
    or actor<>p.proposer_context_id and not exists(select 1 from public.admin_votes where proposal_id=p.id and administrator_context_id=p.proposer_context_id and decision='approved') then
    raise exception using errcode='42501',message='Current independent approval key and proposal required';end if;
  new.decided_at:=clock_timestamp();return new;
end;
$$;
create trigger recovery_vote_guard before insert or update or delete on public.admin_votes
  for each row execute function private.recovery_vote_guard();
create function private.recovery_vote_recorded() returns trigger
language plpgsql set search_path='' as $$
declare p public.admin_proposals;
begin
  select * into p from public.admin_proposals where id=new.proposal_id;
  if p.kind<>'administrator_key_reset' or new.administrator_context_id=p.proposer_context_id then return null;end if;
  if new.decision='rejected' then update public.admin_proposals set status='rejected' where id=p.id;
  else
    perform set_config('pinevela.admin_recovery_proposal_id',p.id::text,true);
    if p.preview->>'action'='reset-key' then update private.admin_secrets set approval_key_hash=null where context_id=p.target_context_id;
    else update private.admin_secrets set settings_key_hash=null where context_id=p.target_context_id;end if;
    update public.admin_proposals set status='executed' where id=p.id;
    perform set_config('pinevela.admin_recovery_proposal_id','',true);
  end if;return null;
end;
$$;
create trigger recovery_vote_recorded after insert on public.admin_votes for each row execute function private.recovery_vote_recorded();
create function private.recovery_proposal_recorded() returns trigger
language plpgsql set search_path='' as $$
declare notice uuid; recipient uuid; event text;
begin
  if new.kind<>'administrator_key_reset' or tg_op='UPDATE' and new.status=old.status then return null;end if;
  event:=case when tg_op='INSERT' then 'submitted' else new.status end;
  insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id)
    values(private.current_context_id(),'administrator_key_recovery_'||event,'admin_proposal',new.id);
  insert into public.notifications(sender_context_id,category,title,message,link)
    values(private.current_context_id(),'admin_governance','Administrator key recovery '||event,
      case when event='executed' then 'Two other administrators approved recovery. The target must sign in again and enroll their new key.'
      else 'An administrator key recovery proposal changed state. Open Admin Approvals to review it.' end,'governance') returning id into notice;
  insert into public.notification_recipients(notification_id,context_id) select notice,m.context_id from public.admin_memberships m
    join public.account_contexts c on c.id=m.context_id where m.status='active' and c.status='active' and c.kind='admin';
  for recipient in select context_id from public.notification_recipients where notification_id=notice loop perform pg_notify('pinevela_notifications',recipient::text);end loop;
  return null;
end;
$$;
create trigger recovery_proposal_recorded after insert or update on public.admin_proposals for each row execute function private.recovery_proposal_recorded();
revoke all on function private.approval_authorized_context(),private.recovery_roster(),private.recovery_digest(uuid,text,bigint),
  private.recovery_execution_allowed(uuid,text),private.guard_administrator_approval_key(),private.recovery_proposal_guard(),
  private.recovery_vote_guard(),private.recovery_vote_recorded(),private.recovery_proposal_recorded() from public,anon,authenticated,pinevela_backend;
