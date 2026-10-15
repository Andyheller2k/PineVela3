-- Explicit email proof for retained primary portals; live wipe execution stays disabled.
select pg_advisory_xact_lock(hashtextextended('residence-deletion-freeze',0));
select pg_advisory_xact_lock(hashtextextended('platform-settings',0));
alter table private.primary_wipe_reentries add column proof_method text not null default 'verified-google-signup'
 check(proof_method in('verified-google-signup','verified-email-reentry'));

-- Confirmed Auth mailbox and native provider identity are required. A verified
-- Google mailbox can also receive an email OTP; no user-editable metadata grants access.
create function private.primary_reentry_identity_supported(subject uuid,method text)returns boolean
 language sql stable set search_path=''as $$
 select coalesce(method in('verified-google-signup','verified-email-reentry')and exists(
  select 1 from auth.users u join auth.identities i on i.user_id=u.id
  where u.id=subject and u.email is not null and u.email_confirmed_at is not null
   and not u.is_anonymous and u.deleted_at is null
   and(u.banned_until is null or u.banned_until<=clock_timestamp())
   and lower(i.identity_data->>'email')=lower(u.email)
   and((i.provider='google'and i.identity_data->'email_verified'='true'::jsonb)
    or(method='verified-email-reentry'and i.provider='email'))),false);
$$;
revoke all on function private.primary_reentry_identity_supported(uuid,text)from public,anon,authenticated,pinevela_backend;


create or replace function private.primary_wipe_execution_guard()returns trigger language plpgsql set search_path=''as $$
declare a private.system_wipe_execution_authorizations;p public.admin_proposals;f private.system_wipe_preparations;r private.system_wipe_recovery_evidence;
begin
 if tg_op in('DELETE','TRUNCATE')then raise exception using errcode='42501',message='Primary wipe history is immutable';end if;
 if current_setting('role')<>'none'or current_setting('transaction_isolation')<>'read committed'then raise exception using errcode='42501',message='Trusted READ COMMITTED execution required';end if;
 perform pg_advisory_xact_lock(hashtextextended('residence-deletion-freeze',0));perform pg_advisory_xact_lock(hashtextextended('platform-settings',0));
 if tg_op='INSERT'then
  select * into a from private.system_wipe_execution_authorizations where id=new.authorization_id for share;
  select * into f from private.system_wipe_preparations where id=a.preparation_id for update;
  select * into p from public.admin_proposals where id=f.proposal_id for update;
  select * into r from private.system_wipe_recovery_evidence where preparation_id=f.id;
  if a.id is null or not private.system_wipe_execution_authorization_current(a)
   or a.founder_context_id is distinct from private.approval_authorized_context()or a.auth_user_id is distinct from auth.uid()
   or a.session_id::text is distinct from auth.jwt()->>'session_id'
   or a.approval_key_version::text is distinct from current_setting('pinevela.approval_key_version',true)
   or current_setting('pinevela.primary_wipe_confirmation',true)is distinct from 'CLOSE REVIEWED PRIMARY ACCOUNTS'
   or current_setting('pinevela.primary_wipe_recovery_checked',true)is distinct from(to_jsonb(r)-'verified_at')::text
   or new.state is distinct from 'running'or new.completed_at is not null or new.notification_id is not null
   or p.preview->>'version'is distinct from '1'or p.preview->'scopes'not in('["users"]'::jsonb,'["total"]'::jsonb)
   or jsonb_array_length(p.preview->'accounts')=0
   or exists(select 1 from jsonb_array_elements(p.preview->'accounts')c where c->>'kind'<>'primary'or c->>'status'<>'active')
   or exists(select 1 from jsonb_array_elements(p.preview->'accounts')target
    where not private.primary_reentry_identity_supported((target->>'authUserId')::uuid,'verified-email-reentry'))
   or exists(select 1 from jsonb_each(p.preview->'resources')x where x.key not in('account_contexts','profiles','media_assets')and jsonb_array_length(x.value)>0)
   or exists(select 1 from jsonb_array_elements(p.preview#>'{rowDigests,pending_enrollments}')e where e->>'status'in('pending_email','pending_review'))then
   raise exception using errcode='42501',message='Exact primary-only scope, fresh founder consent and restored recovery required; operational scopes remain disabled';end if;
  new.preparation_id:=f.id;new.proposal_id:=p.id;new.founder_context_id:=a.founder_context_id;
  new.context_ids:=array(select jsonb_array_elements_text(p.preview#>'{resources,account_contexts}')::uuid order by 1);
  new.transaction_id:=pg_current_xact_id()::text;new.backend_pid:=pg_backend_pid();new.started_at:=clock_timestamp();
 else
  if old.state<>'running'or new.state is distinct from 'completed'or not private.primary_wipe_actor_current(old)
   or to_jsonb(new)-array['state','completed_at','notification_id']is distinct from to_jsonb(old)-array['state','completed_at','notification_id']
   or exists(select 1 from public.account_contexts c where c.id=any(old.context_ids)and(c.kind<>'primary'or c.status<>'closed'))
   or(select count(*)from public.account_contexts where id=any(old.context_ids))<>cardinality(old.context_ids)
   or exists(select 1 from private.account_sessions where active_context_id=any(old.context_ids))
   or new.notification_id is null or not exists(select 1 from public.notifications where id=new.notification_id and sender_context_id=old.founder_context_id and category='account_status'and title='Primary account closed after reviewed system wipe')
   or exists(select 1 from unnest(old.context_ids)x where not exists(select 1 from public.notification_recipients where notification_id=new.notification_id and context_id=x))
   or not exists(select 1 from private.audit_events where event_type='primary_wipe_completed'and resource_id=old.id and actor_context_id=old.founder_context_id)then
   raise exception using errcode='42501',message='Exact atomic closure, binding revocation, notices and audit required';end if;
  new.completed_at:=clock_timestamp();
 end if;return new;
end;
$$;

create or replace function private.primary_reentry_guard()returns trigger language plpgsql set search_path=''as $$
declare c public.account_contexts;e private.primary_wipe_executions;
begin
 if tg_op<>'INSERT'then raise exception using errcode='42501',message='Primary re-entry history is immutable';end if;
 if current_setting('role')<>'none'or current_setting('transaction_isolation')<>'read committed'
  or new.proof_method not in('verified-google-signup','verified-email-reentry')
  or current_setting('pinevela.primary_reentry_verified',true)is distinct from new.proof_method then
  raise exception using errcode='42501',message='Verified explicit primary re-entry required';end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('residence-deletion-freeze',0));
 perform pg_advisory_xact_lock_shared(hashtextextended('account-policies',0));
 perform pg_advisory_xact_lock_shared(hashtextextended('platform-maintenance',0));
 select * into c from public.account_contexts where id=new.context_id for update;
 select * into e from private.primary_wipe_executions where c.id=any(context_ids)and state='completed'order by completed_at desc limit 1;
 if c.id is null or c.kind<>'primary'or c.status<>'closed'or c.primary_owner_id is not null
  or e.id is distinct from new.execution_id or new.auth_user_id is distinct from c.auth_user_id
  or new.auth_user_id is distinct from auth.uid()or new.session_id::text is distinct from auth.jwt()->>'session_id'
  or not private.platform_available()or coalesce((private.account_access(c.id)->>'banned')::boolean,true)
  or not exists(select 1 from auth.users u join auth.sessions s on s.user_id=u.id
   join public.profiles p on p.id=u.id
   where u.id=new.auth_user_id and s.id=new.session_id and(s.not_after is null or s.not_after>clock_timestamp())
    and u.email_confirmed_at is not null and not u.is_anonymous and u.deleted_at is null
    and(u.banned_until is null or u.banned_until<=clock_timestamp())and p.primary_owner_id is null
    and private.primary_reentry_identity_supported(u.id,new.proof_method)
    and not exists(select 1 from private.account_access_epochs epoch where epoch.context_id=any(private.account_lineage(c.id))and s.created_at<=epoch.valid_after))then
  raise exception using errcode='42501',message='Own live verified identity and completed normal-wipe closure required';end if;
 new.created_at:=clock_timestamp();new.transaction_id:=pg_current_xact_id()::text;new.backend_pid:=pg_backend_pid();return new;
end;
$$;

create or replace function private.run_primary_wipe(consent_id uuid)returns uuid language plpgsql set search_path=''as $$
declare e private.primary_wipe_executions;notice uuid;recipient uuid;
begin
 insert into private.primary_wipe_executions(authorization_id)values(consent_id)returning * into e;
 delete from private.account_sessions where active_context_id=any(e.context_ids);
 update public.account_contexts set status='closed',updated_at=clock_timestamp()where id=any(e.context_ids);
 insert into public.notifications(sender_context_id,category,title,message,link)values(e.founder_context_id,'account_status',
  'Primary account closed after reviewed system wipe','Five administrators and the founder approved closing your primary portal. Your verified login and account history remain. Choose Sign Up with Google or Reopen primary account with email to reopen your primary portal.','/login?mode=register')returning id into notice;
 insert into public.notification_recipients(notification_id,context_id)
  select notice,id from(select unnest(e.context_ids)as id union select context_id from public.admin_memberships where status='active')r;
 for recipient in select context_id from public.notification_recipients where notification_id=notice loop perform pg_notify('pinevela_notifications',recipient::text);end loop;
 insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id)values(e.founder_context_id,'primary_wipe_completed','primary_wipe_execution',e.id);
 update private.primary_wipe_executions set state='completed',notification_id=notice where id=e.id;
 update private.system_wipe_freezes set state='completed'where preparation_id=e.preparation_id;
 update private.system_wipe_preparations set state='completed'where id=e.preparation_id;
 update public.admin_proposals set status='executed'where id=e.proposal_id;
 return e.id;
end;
$$;
