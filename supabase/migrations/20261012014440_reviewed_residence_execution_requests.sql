-- Durable keyed handoff only. No worker is started and no public rollout enabled.
select pg_advisory_xact_lock(hashtextextended('residence-deletion-freeze',0));
select pg_advisory_xact_lock(hashtextextended('platform-settings',0));
create table private.residence_execution_requests (
 id uuid primary key default gen_random_uuid(),
 authorization_id uuid not null unique references private.residence_execution_authorizations(id),
 proposal_id uuid not null references public.admin_proposals(id),
 founder_context_id uuid not null references public.admin_memberships(context_id),
 auth_user_id uuid not null,
 session_id uuid not null,
 approval_key_version uuid not null,
 state text not null default 'requested' check(state in('requested','completed','invalidated')),
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null,
 execution_id uuid unique references private.residence_executions(id),
 finished_at timestamptz,
 failure_code text check(failure_code in('consent_expired','consent_changed')),
 check((state<>'requested')=(finished_at is not null)),
 check((state='completed')=(execution_id is not null)),
 check((state='invalidated')=(failure_code is not null))
);
alter table private.residence_execution_requests enable row level security;
revoke all on private.residence_execution_requests from public,anon,authenticated,pinevela_backend;
-- Once a queued decision is invalidated it cannot revive when access returns.
create or replace function private.residence_execution_authorization_current(a private.residence_execution_authorizations) returns boolean
language sql stable set search_path='' as $$
 select coalesce(a.created_at<=clock_timestamp() and a.expires_at>clock_timestamp()
  and a.expires_at<=a.created_at+interval '5 minutes' and private.platform_available()
  and not exists(select 1 from private.residence_execution_requests r where r.authorization_id=a.id and r.state='invalidated')
  and exists(select 1 from private.residence_deletion_preparations f
   join public.admin_proposals p on p.id=f.proposal_id
   join private.residence_recovery_evidence r on r.preparation_id=f.id
   join private.residence_cleanup_plans q on q.preparation_id=f.id
   join public.admin_memberships m on m.context_id=a.founder_context_id
   join public.account_contexts c on c.id=m.context_id
   join private.admin_secrets k on k.context_id=c.id
   join private.account_sessions binding on binding.session_id=a.session_id and binding.auth_user_id=a.auth_user_id
   where f.id=a.preparation_id and f.state='frozen' and p.kind='residence_deletion' and p.status='approved'
    and private.residence_review_current(p) and private.residence_review_quorum(p.id)
    and f.founder_context_id=a.founder_context_id and m.slot=1 and m.status='active'
    and c.kind='admin' and c.status='active' and c.auth_user_id=a.auth_user_id
    and binding.active_context_id=c.id and private.portal_session_allowed(c.id,binding.portal_pin_version)
    and private.administrator_session_allowed(c.id,a.session_id) and private.account_session_allowed(c.id,a.session_id)
    and k.approval_key_hash is not null and k.approval_key_version=a.approval_key_version
    and (k.locked_until is null or k.locked_until<=clock_timestamp())
    and a.scope_digest=f.preview_digest and a.scope_digest=p.baseline_digest
    and a.plan_digest=q.plan_digest and q.plan=private.residence_cleanup_preview(f.id)
    and a.native_catalog_digest=q.native_catalog_digest and a.native_catalog_digest=r.native_catalog_digest
    and a.native_catalog_digest=private.residence_recovery_catalog_digest()
    and exists(select 1 from public.admin_votes v where v.proposal_id=p.id
     and v.administrator_context_id=a.founder_context_id and v.decision='approved')),false);
$$;
create function private.residence_execution_request_current(r private.residence_execution_requests) returns boolean
language sql stable set search_path='' as $$
 select coalesce(r.state='requested' and r.created_at<=clock_timestamp() and r.expires_at>clock_timestamp()
  and exists(select 1 from private.residence_execution_authorizations a
   join private.residence_deletion_preparations f on f.id=a.preparation_id
   where a.id=r.authorization_id and f.proposal_id=r.proposal_id
    and a.founder_context_id=r.founder_context_id and a.auth_user_id=r.auth_user_id
    and a.session_id=r.session_id and a.approval_key_version=r.approval_key_version
    and r.created_at>=a.created_at and r.expires_at=a.expires_at
    and private.residence_execution_authorization_current(a)),false);
$$;
create function private.residence_execution_request_guard() returns trigger
language plpgsql set search_path='' as $$
declare a private.residence_execution_authorizations;e private.residence_executions;proposal uuid;
begin
 if tg_op in('DELETE','TRUNCATE') then raise exception using errcode='42501',message='Execution request history is retained';end if;
 if current_setting('role')<>'none' or current_setting('transaction_isolation')<>'read committed' then
  raise exception using errcode='42501',message='Trusted native execution request transaction required';end if;
 perform pg_advisory_xact_lock(hashtextextended('residence-deletion-freeze',0));
 perform pg_advisory_xact_lock(hashtextextended('platform-settings',0));
 if tg_op='INSERT' then
  select * into a from private.residence_execution_authorizations where id=new.authorization_id;
  select proposal_id into proposal from private.residence_deletion_preparations where id=a.preparation_id;
  new.id:=gen_random_uuid();new.created_at:=clock_timestamp();new.expires_at:=a.expires_at;
  if a.id is null or new.state<>'requested' or new.execution_id is not null or new.finished_at is not null or new.failure_code is not null
   or new.proposal_id is distinct from proposal or new.founder_context_id is distinct from a.founder_context_id
   or new.auth_user_id is distinct from a.auth_user_id or new.session_id is distinct from a.session_id
   or new.approval_key_version is distinct from a.approval_key_version
   or new.founder_context_id is distinct from private.approval_authorized_context()
   or new.auth_user_id is distinct from auth.uid() or new.session_id::text is distinct from auth.jwt()->>'session_id'
   or new.approval_key_version::text is distinct from current_setting('pinevela.approval_key_version',true)
   or current_setting('pinevela.residence_execution_request_confirmation',true) is distinct from 'DELETE APPROVED HOSTEL'
   or not private.residence_execution_request_current(new) then
   raise exception using errcode='42501',message='Current own-key founder, exact consent and explicit request required';end if;
 else
  if old.state<>'requested' or to_jsonb(new)-array['state','execution_id','finished_at','failure_code'] is distinct from
   to_jsonb(old)-array['state','execution_id','finished_at','failure_code'] then
   raise exception using errcode='42501',message='Execution request identity and terminal history are immutable';end if;
  if new.state='completed' then
   select * into e from private.residence_executions where id=new.execution_id;
   if e.id is null or e.state<>'completed' or e.authorization_id<>old.authorization_id or e.proposal_id<>old.proposal_id
    or e.founder_context_id<>old.founder_context_id or not private.residence_execution_actor_current(e) then
    raise exception using errcode='42501',message='Exact originating completed native execution required';end if;
   new.finished_at:=clock_timestamp();new.failure_code:=null;
  elsif new.state='invalidated' then
   if private.residence_execution_request_current(old) or new.execution_id is not null
    or exists(select 1 from private.residence_executions where authorization_id=old.authorization_id) then
    raise exception using errcode='42501',message='Only unusable unexecuted requests may be invalidated';end if;
   new.finished_at:=clock_timestamp();new.failure_code:=case when old.expires_at<=clock_timestamp() then 'consent_expired' else 'consent_changed' end;
  else raise exception using errcode='42501',message='Unsupported execution request transition';end if;
 end if;return new;
end;
$$;
create trigger residence_execution_request_guard before insert or update or delete on private.residence_execution_requests
 for each row execute function private.residence_execution_request_guard();
create trigger residence_execution_request_truncate before truncate on private.residence_execution_requests
 for each statement execute function private.residence_execution_request_guard();
-- New internal relations must participate in migration 49's reference boundary.
create trigger zz_residence_queued_reference_guard before insert or update on private.residence_execution_requests
 for each row execute function private.residence_queued_reference_guard();
create function private.residence_execution_request_commit_guard() returns trigger
language plpgsql set search_path='' as $$
begin
 if exists(select 1 from private.residence_executions e join private.residence_execution_requests r on r.authorization_id=e.authorization_id
  where e.id=new.id and e.state='completed' and (r.state<>'completed' or r.execution_id is distinct from e.id)) then
  raise exception using errcode='42501',message='Execution and its requested handoff must complete atomically';end if;
 return null;
end;
$$;
create constraint trigger residence_execution_request_commit_guard after insert or update on private.residence_executions
 deferrable initially deferred for each row execute function private.residence_execution_request_commit_guard();
revoke all on function private.residence_execution_request_current(private.residence_execution_requests),
 private.residence_execution_request_guard(),private.residence_execution_request_commit_guard() from public,anon,authenticated,pinevela_backend;
