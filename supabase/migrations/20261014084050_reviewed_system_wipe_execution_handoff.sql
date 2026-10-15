-- Durable own-key founder handoff. Public/worker release gates remain off.
select pg_advisory_xact_lock(hashtextextended('residence-deletion-freeze',0));
select pg_advisory_xact_lock(hashtextextended('platform-settings',0));
create table private.system_wipe_execution_requests(
 id uuid primary key default gen_random_uuid(),
 authorization_id uuid not null unique references private.system_wipe_execution_authorizations(id),
 preparation_id uuid not null references private.system_wipe_preparations(id),
 proposal_id uuid not null references public.admin_proposals(id),
 founder_context_id uuid not null references public.admin_memberships(context_id),
 auth_user_id uuid not null,session_id uuid not null,approval_key_version uuid not null,
 state text not null default 'requested'check(state in('requested','completed','invalidated')),
 created_at timestamptz not null default clock_timestamp(),expires_at timestamptz not null,
 queued_notification_id uuid not null unique references public.notifications(id),
 terminal_notification_id uuid references public.notifications(id),
 execution_id uuid unique references private.primary_wipe_executions(id),
 finished_at timestamptz,failure_code text check(failure_code in('consent_expired','consent_changed')),
 check((state<>'requested')=(finished_at is not null)),check((state='completed')=(execution_id is not null)),
 check((state='invalidated')=(failure_code is not null)),check((state<>'requested')=(terminal_notification_id is not null))
);
create index system_wipe_execution_requests_pending on private.system_wipe_execution_requests(created_at,id)where state='requested';
create index system_wipe_execution_requests_proposal on private.system_wipe_execution_requests(proposal_id,created_at desc);
alter table private.system_wipe_execution_requests enable row level security;
revoke all on private.system_wipe_execution_requests from public,anon,authenticated,pinevela_backend;
-- Invalidated queued consent cannot revive after a suspension/lock is lifted.
create or replace function private.system_wipe_execution_authorization_current(a private.system_wipe_execution_authorizations)returns boolean
 language sql stable set search_path=''as $$
 select coalesce(a.created_at<=clock_timestamp()and a.expires_at>clock_timestamp()and a.expires_at<=a.created_at+interval'5 minutes'and private.platform_available()
  and not exists(select 1 from private.system_wipe_execution_requests q where q.authorization_id=a.id and q.state='invalidated')
  and exists(select 1 from private.system_wipe_freezes f join private.system_wipe_preparations prep on prep.id=f.preparation_id
   join public.admin_proposals p on p.id=prep.proposal_id join private.system_wipe_recovery_evidence r on r.preparation_id=prep.id
   join public.admin_memberships m on m.context_id=a.founder_context_id join public.account_contexts c on c.id=m.context_id
   join private.admin_secrets k on k.context_id=c.id join private.account_sessions b on b.session_id=a.session_id and b.auth_user_id=a.auth_user_id
   where prep.id=a.preparation_id and prep.state='active'and f.state='frozen'and p.status='approved'
    and private.system_wipe_current(p)and private.system_wipe_quorum(p.id)and private.system_wipe_pause_ready(p)
    and p.wipe_final_decision='approve-backup'and p.wipe_founder_context_id=a.founder_context_id
    and f.founder_context_id=a.founder_context_id and m.slot=1 and m.status='active'and c.status='active'and c.kind='admin'and c.auth_user_id=a.auth_user_id
    and b.active_context_id=c.id and private.portal_session_allowed(c.id,b.portal_pin_version)
    and private.administrator_session_allowed(c.id,a.session_id)and private.account_session_allowed(c.id,a.session_id)
    and k.approval_key_hash is not null and k.approval_key_version=a.approval_key_version and(k.locked_until is null or k.locked_until<=clock_timestamp())
    and a.scope_digest=f.scope_digest and a.scope_digest=prep.scope_digest and a.scope_digest=p.baseline_digest and a.freeze_created_at=f.created_at
    and r.checkpoint_created_at>=f.created_at and a.native_catalog_digest=r.native_catalog_digest and a.native_catalog_digest=private.residence_recovery_catalog_digest()),false);
$$;

create function private.system_wipe_execution_request_current(q private.system_wipe_execution_requests)returns boolean
language sql stable set search_path=''as $$
 select coalesce(q.state='requested'and q.created_at<=clock_timestamp()and q.expires_at>clock_timestamp()
  and exists(select 1 from private.system_wipe_execution_authorizations a join private.system_wipe_preparations f on f.id=a.preparation_id
   where a.id=q.authorization_id and a.preparation_id=q.preparation_id and f.proposal_id=q.proposal_id
    and a.founder_context_id=q.founder_context_id and a.auth_user_id=q.auth_user_id and a.session_id=q.session_id
    and a.approval_key_version=q.approval_key_version and q.created_at>=a.created_at and q.expires_at=a.expires_at
    and private.system_wipe_execution_authorization_current(a)),false);
$$;
create function private.system_wipe_execution_request_guard()returns trigger language plpgsql set search_path=''as $$
declare a private.system_wipe_execution_authorizations;e private.primary_wipe_executions;proposal uuid;
begin
 if tg_op in('DELETE','TRUNCATE')then raise exception using errcode='42501',message='Wipe request history is retained';end if;
 if current_setting('role')<>'none'or current_setting('transaction_isolation')<>'read committed'then
  raise exception using errcode='42501',message='Trusted READ COMMITTED wipe request transaction required';end if;
 perform pg_advisory_xact_lock(hashtextextended('residence-deletion-freeze',0));
 perform pg_advisory_xact_lock(hashtextextended('platform-settings',0));
 if tg_op='INSERT'then
  select * into a from private.system_wipe_execution_authorizations where id=new.authorization_id;
  select proposal_id into proposal from private.system_wipe_preparations where id=a.preparation_id;
  new.id:=gen_random_uuid();new.created_at:=clock_timestamp();new.expires_at:=a.expires_at;
  if a.id is null or new.state<>'requested'or new.execution_id is not null or new.finished_at is not null
   or new.terminal_notification_id is not null or new.failure_code is not null
   or new.preparation_id is distinct from a.preparation_id or new.proposal_id is distinct from proposal
   or new.founder_context_id is distinct from a.founder_context_id or new.auth_user_id is distinct from a.auth_user_id
   or new.session_id is distinct from a.session_id or new.approval_key_version is distinct from a.approval_key_version
   or new.founder_context_id is distinct from private.approval_authorized_context()or new.auth_user_id is distinct from auth.uid()
   or new.session_id::text is distinct from auth.jwt()->>'session_id'
   or new.approval_key_version::text is distinct from current_setting('pinevela.approval_key_version',true)
   or current_setting('pinevela.system_wipe_request_confirmation',true)is distinct from 'CLOSE REVIEWED OPERATIONAL PORTALS'
   or not private.system_wipe_execution_request_current(new)
   or exists(select 1 from private.primary_wipe_executions where preparation_id=a.preparation_id)
   or exists(select 1 from private.system_wipe_execution_requests q where q.preparation_id=a.preparation_id and private.system_wipe_execution_request_current(q))then
   raise exception using errcode='42501',message='Exact current founder consent and explicit own-key request required';end if;
  if not exists(select 1 from public.notifications n where n.id=new.queued_notification_id and n.sender_context_id=new.founder_context_id
   and n.category='admin_governance'and n.title='Reviewed system wipe queued')then
   raise exception using errcode='42501',message='Atomic reviewed request notification required';end if;
 else
  if old.state<>'requested'or to_jsonb(new)-array['state','execution_id','finished_at','failure_code','terminal_notification_id']
   is distinct from to_jsonb(old)-array['state','execution_id','finished_at','failure_code','terminal_notification_id']then
   raise exception using errcode='42501',message='Request identity, deadlines and terminal history are immutable';end if;
  if new.state='completed'then
   select * into e from private.primary_wipe_executions where id=new.execution_id;
   if e.id is null or e.execution_kind<>'operational'or e.state<>'completed'or e.authorization_id<>old.authorization_id
    or e.preparation_id<>old.preparation_id or e.proposal_id<>old.proposal_id or e.founder_context_id<>old.founder_context_id
    or e.started_at<old.created_at or not private.primary_wipe_actor_current(e)then
    raise exception using errcode='42501',message='Exact originating native operational execution required';end if;
   new.finished_at:=clock_timestamp();new.failure_code:=null;new.terminal_notification_id:=e.notification_id;
  elsif new.state='invalidated'then
   if private.system_wipe_execution_request_current(old)or new.execution_id is not null
    or exists(select 1 from private.primary_wipe_executions where authorization_id=old.authorization_id)then
    raise exception using errcode='42501',message='Only unusable unexecuted requests may be invalidated';end if;
   if not exists(select 1 from public.notifications where id=new.terminal_notification_id and sender_context_id is null
    and category='admin_governance'and title='Reviewed system wipe request invalidated')then
    raise exception using errcode='42501',message='Atomic invalidation notification required';end if;
   new.finished_at:=clock_timestamp();new.failure_code:=case when old.expires_at<=clock_timestamp()then 'consent_expired'else 'consent_changed'end;
  else raise exception using errcode='42501',message='Unsupported wipe request transition';end if;
 end if;return new;
end;$$;
create trigger system_wipe_execution_request_guard before insert or update or delete on private.system_wipe_execution_requests
 for each row execute function private.system_wipe_execution_request_guard();
create trigger system_wipe_execution_request_truncate before truncate on private.system_wipe_execution_requests
 for each statement execute function private.system_wipe_execution_request_guard();

create function private.system_wipe_request_commit_guard()returns trigger language plpgsql set search_path=''as $$
declare q private.system_wipe_execution_requests;e private.primary_wipe_executions;notice uuid;
begin
 select * into q from private.system_wipe_execution_requests where id=new.id;
 if tg_op='INSERT'and not exists(select 1 from private.audit_events where resource_id=q.id
  and event_type='system_wipe_execution_requested'and actor_context_id=q.founder_context_id)then
  raise exception using errcode='42501',message='Atomic request audit required';end if;
 if q.state='requested'then
  if tg_op='INSERT'and not private.system_wipe_execution_request_current(q)then
   raise exception using errcode='42501',message='Queued request must retain current consent until commit';end if;
  notice:=q.queued_notification_id;
 elsif q.state='completed'then
  select * into e from private.primary_wipe_executions where id=q.execution_id;
  if e.id is null or e.state<>'completed'or e.execution_kind<>'operational'or e.authorization_id<>q.authorization_id
   or e.proposal_id<>q.proposal_id or not private.primary_wipe_actor_current(e)then
   raise exception using errcode='42501',message='Atomic operational receipt and request completion required';end if;
  notice:=q.terminal_notification_id;
 else
  if not exists(select 1 from private.audit_events where resource_id=q.id and event_type='system_wipe_execution_request_invalidated')then
   raise exception using errcode='42501',message='Atomic invalidation audit required';end if;
  notice:=q.terminal_notification_id;
 end if;
 if exists(select 1 from public.admin_memberships m join public.account_contexts c on c.id=m.context_id
  where m.status='active'and c.status='active'and not exists(select 1 from public.notification_recipients where notification_id=notice and context_id=c.id))then
  raise exception using errcode='42501',message='Every active administrator needs the request outcome';end if;
 return null;
end;$$;
create constraint trigger system_wipe_request_commit_guard after insert or update on private.system_wipe_execution_requests
 deferrable initially deferred for each row execute function private.system_wipe_request_commit_guard();
create function private.system_wipe_execution_handoff_commit_guard()returns trigger language plpgsql set search_path=''as $$
begin
 if exists(select 1 from private.primary_wipe_executions e join private.system_wipe_execution_requests q on q.authorization_id=e.authorization_id
  where e.id=new.id and e.state='completed'and(q.state<>'completed'or q.execution_id is distinct from e.id))then
  raise exception using errcode='42501',message='Execution and requested handoff must complete atomically';end if;return null;
end;$$;
create constraint trigger system_wipe_execution_handoff_commit_guard after insert or update on private.primary_wipe_executions
 deferrable initially deferred for each row execute function private.system_wipe_execution_handoff_commit_guard();
revoke all on function private.system_wipe_execution_request_current(private.system_wipe_execution_requests),private.system_wipe_execution_request_guard(),
 private.system_wipe_request_commit_guard(),private.system_wipe_execution_handoff_commit_guard()from public,anon,authenticated,pinevela_backend;
