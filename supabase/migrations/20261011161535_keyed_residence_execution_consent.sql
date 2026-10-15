-- Final keyed founder consent only. No operational deletion or Storage execution.
create table private.residence_execution_authorizations (
 id uuid primary key default gen_random_uuid(),
 preparation_id uuid not null references private.residence_cleanup_plans(preparation_id),
 founder_context_id uuid not null references public.admin_memberships(context_id),
 auth_user_id uuid not null,
 session_id uuid not null,
 approval_key_version uuid not null,
 scope_digest text not null check(scope_digest ~ '^[a-f0-9]{64}$'),
 plan_digest text not null check(plan_digest ~ '^[a-f0-9]{64}$'),
 native_catalog_digest text not null check(native_catalog_digest ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default clock_timestamp(),
 check(expires_at>created_at and expires_at<=created_at+interval '5 minutes')
);
create index residence_execution_authorizations_preparation_idx
 on private.residence_execution_authorizations(preparation_id,created_at desc);
alter table private.residence_execution_authorizations enable row level security;
revoke all on private.residence_execution_authorizations from public,anon,authenticated,pinevela_backend;

create function private.residence_execution_authorization_current(a private.residence_execution_authorizations) returns boolean
language sql stable set search_path='' as $$
 select coalesce(a.created_at<=clock_timestamp() and a.expires_at>clock_timestamp()
  and a.expires_at<=a.created_at+interval '5 minutes' and private.platform_available()
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
create function private.residence_execution_authorization_guard() returns trigger
language plpgsql set search_path='' as $$
declare actor uuid;p public.admin_proposals;
begin
 if tg_op<>'INSERT' then raise exception using errcode='42501',message='Founder execution consent is immutable';end if;
 if current_setting('transaction_isolation')<>'read committed' then
  raise exception using errcode='42501',message='Founder execution consent requires READ COMMITTED';end if;
 perform pg_advisory_xact_lock(hashtextextended('residence-deletion-freeze',0));
 perform pg_advisory_xact_lock(hashtextextended('platform-settings',0));
 actor:=private.approval_authorized_context();
 select p0.* into p from public.admin_proposals p0 join private.residence_deletion_preparations f
  on f.proposal_id=p0.id where f.id=new.preparation_id for update of p0;
 new.created_at:=clock_timestamp();new.expires_at:=least(new.created_at+interval '5 minutes',p.expires_at);
 if actor is null or actor is distinct from new.founder_context_id or new.auth_user_id is distinct from auth.uid()
  or new.session_id::text is distinct from auth.jwt()->>'session_id'
  or new.approval_key_version::text is distinct from current_setting('pinevela.approval_key_version',true)
  or current_setting('pinevela.residence_execution_confirmation',true) is distinct from 'AUTHORIZE APPROVED HOSTEL'
  or not private.residence_execution_authorization_current(new) then
  raise exception using errcode='42501',message='Current keyed founder, exact verified plan and explicit final consent are required';end if;
 if exists(select 1 from private.residence_execution_authorizations a where a.preparation_id=new.preparation_id
   and private.residence_execution_authorization_current(a)) then
  raise exception using errcode='23505',message='A current founder authorization is already recorded';end if;
 return new;
end;
$$;
create trigger residence_execution_authorization_guard before insert or update or delete on private.residence_execution_authorizations
 for each row execute function private.residence_execution_authorization_guard();
create trigger residence_execution_authorization_truncate_guard before truncate on private.residence_execution_authorizations
 for each statement execute function private.residence_execution_authorization_guard();
revoke all on function private.residence_execution_authorization_current(private.residence_execution_authorizations),
 private.residence_execution_authorization_guard() from public,anon,authenticated,pinevela_backend;
