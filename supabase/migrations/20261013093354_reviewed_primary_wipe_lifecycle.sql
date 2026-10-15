-- Primary-only native closure and verified re-entry. No HTTP execution gate.
select pg_advisory_xact_lock(hashtextextended('residence-deletion-freeze',0));
select pg_advisory_xact_lock(hashtextextended('platform-settings',0));
alter table public.account_contexts drop constraint account_contexts_check;
alter table public.account_contexts add constraint primary_context_lifecycle
 check(kind<>'primary' or(primary_owner_id is null and status in('active','closed')));
alter table private.system_wipe_preparations drop constraint system_wipe_preparations_state_check;
alter table private.system_wipe_preparations add constraint system_wipe_preparations_state_check check(state in('active','cancelled','completed')),
 add column completed_at timestamptz,add check((state='completed')=(completed_at is not null));
alter table private.system_wipe_freezes drop constraint system_wipe_freezes_state_check;
alter table private.system_wipe_freezes add constraint system_wipe_freezes_state_check check(state in('frozen','cancelled','completed')),
 add column completed_at timestamptz,add check((state='completed')=(completed_at is not null));

create table private.primary_wipe_executions(
 id uuid primary key default gen_random_uuid(),authorization_id uuid not null unique references private.system_wipe_execution_authorizations(id),
 preparation_id uuid not null unique references private.system_wipe_preparations(id),proposal_id uuid not null unique references public.admin_proposals(id),
 founder_context_id uuid not null references public.admin_memberships(context_id),context_ids uuid[] not null,
 transaction_id text not null,backend_pid integer not null,state text not null default 'running'check(state in('running','completed')),
 started_at timestamptz not null,completed_at timestamptz,notification_id uuid references public.notifications(id),
 check(cardinality(context_ids)>0),check((state='completed')=(completed_at is not null)),check((state='completed')=(notification_id is not null))
);
alter table private.primary_wipe_executions enable row level security;
revoke all on private.primary_wipe_executions from public,anon,authenticated,pinevela_backend;
create table private.primary_wipe_reentries(
 execution_id uuid not null references private.primary_wipe_executions(id),context_id uuid not null references public.account_contexts(id),
 auth_user_id uuid not null references auth.users(id),session_id uuid not null,
 transaction_id text not null,backend_pid integer not null,created_at timestamptz not null default clock_timestamp(),
 primary key(execution_id,context_id)
);
alter table private.primary_wipe_reentries enable row level security;
revoke all on private.primary_wipe_reentries from public,anon,authenticated,pinevela_backend;

create function private.primary_wipe_actor_current(e private.primary_wipe_executions)returns boolean
 language sql stable set search_path=''as $$
 select coalesce(current_setting('transaction_isolation')='read committed'and current_setting('role')='none'
  and e.transaction_id=pg_current_xact_id()::text and e.backend_pid=pg_backend_pid()
  and e.founder_context_id=private.approval_authorized_context() and private.platform_available()
  and exists(select 1 from private.system_wipe_execution_authorizations a join public.admin_memberships m on m.context_id=a.founder_context_id
   where a.id=e.authorization_id and a.preparation_id=e.preparation_id and a.founder_context_id=e.founder_context_id
    and a.auth_user_id=auth.uid()and a.session_id::text=auth.jwt()->>'session_id'
    and a.approval_key_version::text=current_setting('pinevela.approval_key_version',true)
    and a.created_at<=e.started_at and a.expires_at>clock_timestamp()and m.slot=1 and m.status='active'
    and private.account_session_allowed(e.founder_context_id,a.session_id)
    and private.administrator_session_allowed(e.founder_context_id,a.session_id)),false);
$$;
create function private.primary_wipe_write_allowed(schema_name text,table_name text,operation text,before_row jsonb,after_row jsonb)returns boolean
 language sql stable set search_path=''as $$
 select coalesce(exists(select 1 from private.primary_wipe_executions e where e.state='running'
  and private.primary_wipe_actor_current(e) and schema_name='public'and table_name='account_contexts'and operation='UPDATE'
  and before_row->>'id'=any(e.context_ids::text[])and before_row->>'kind'='primary'and before_row->>'status'='active'
  and after_row->>'status'='closed'and before_row-array['status','updated_at']=after_row-array['status','updated_at']),false);
$$;
create function private.primary_wipe_execution_guard()returns trigger language plpgsql set search_path=''as $$
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
   -- Email-only re-entry is a separate unfinished path. Never close an identity
   -- here if this implementation cannot offer it a verified way back in.
   or exists(select 1 from jsonb_array_elements(p.preview->'accounts')target where not exists(
    select 1 from auth.users u join auth.identities i on i.user_id=u.id and i.provider='google'
     where u.id::text=target->>'authUserId'and u.email_confirmed_at is not null and not u.is_anonymous
      and u.deleted_at is null and i.identity_data->'email_verified'='true'::jsonb and lower(i.identity_data->>'email')=lower(u.email)))
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
create trigger primary_wipe_execution_guard before insert or update or delete on private.primary_wipe_executions for each row execute function private.primary_wipe_execution_guard();
create trigger primary_wipe_execution_truncate_guard before truncate on private.primary_wipe_executions for each statement execute function private.primary_wipe_execution_guard();
create function private.primary_wipe_commit_guard()returns trigger language plpgsql set search_path=''as $$
begin
 if exists(select 1 from private.primary_wipe_executions e join private.system_wipe_preparations f on f.id=e.preparation_id
  join private.system_wipe_freezes z on z.preparation_id=f.id join public.admin_proposals p on p.id=e.proposal_id
  where e.id=new.id and(e.state<>'completed'or f.state<>'completed'or z.state<>'completed'or p.status<>'executed'))then
  raise exception using errcode='42501',message='Primary closure must finish and release its pause in one transaction';end if;return null;
end;
$$;
create constraint trigger primary_wipe_commit_guard after insert or update on private.primary_wipe_executions deferrable initially deferred
 for each row execute function private.primary_wipe_commit_guard();

create function private.primary_context_guard()returns trigger language plpgsql set search_path=''as $$
begin
 if tg_op='INSERT'then
  if new.kind='primary'and new.status<>'active'then raise exception using errcode='42501',message='New primary accounts must be active';end if;return new;
 end if;
 if old.kind<>'primary'and(tg_op='DELETE'or new.kind<>'primary')then return case when tg_op='DELETE'then old else new end;end if;
 if tg_op='DELETE'then raise exception using errcode='42501',message='Retain verified primary account history';end if;
 if(old.id,old.kind,old.auth_user_id,old.primary_owner_id)is distinct from(new.id,new.kind,new.auth_user_id,new.primary_owner_id)then
  raise exception using errcode='42501',message='Primary identity and ownership are immutable';end if;
 if new.status is distinct from old.status and not private.primary_wipe_write_allowed('public','account_contexts','UPDATE',to_jsonb(old),to_jsonb(new))then
  if old.status<>'closed'or new.status<>'active'or not exists(select 1 from private.primary_wipe_reentries r
   join private.primary_wipe_executions e on e.id=r.execution_id where r.context_id=old.id and r.auth_user_id=old.auth_user_id
    and r.transaction_id=pg_current_xact_id()::text and r.backend_pid=pg_backend_pid()and e.state='completed'
    and r.auth_user_id=auth.uid()and r.session_id::text=auth.jwt()->>'session_id')then
   raise exception using errcode='42501',message='Reviewed primary closure or verified retained re-entry required';end if;
 end if;return new;
end;
$$;
create trigger primary_context_guard before insert or update or delete on public.account_contexts for each row execute function private.primary_context_guard();

create function private.primary_reentry_guard()returns trigger language plpgsql set search_path=''as $$
declare c public.account_contexts;e private.primary_wipe_executions;
begin
 if tg_op<>'INSERT'then raise exception using errcode='42501',message='Primary re-entry history is immutable';end if;
 if current_setting('role')<>'none'or current_setting('transaction_isolation')<>'read committed'
  or current_setting('pinevela.primary_reentry_verified',true)is distinct from 'verified-google-signup'then
  raise exception using errcode='42501',message='Verified explicit Google signup required';end if;
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
   join auth.identities i on i.user_id=u.id and i.provider='google'join public.profiles p on p.id=u.id
   where u.id=new.auth_user_id and s.id=new.session_id and(s.not_after is null or s.not_after>clock_timestamp())
    and u.email_confirmed_at is not null and not u.is_anonymous and u.deleted_at is null
    and(u.banned_until is null or u.banned_until<=clock_timestamp())and p.primary_owner_id is null
    and i.identity_data->'email_verified'='true'::jsonb and lower(i.identity_data->>'email')=lower(u.email)
    and not exists(select 1 from private.account_access_epochs epoch where epoch.context_id=any(private.account_lineage(c.id))and s.created_at<=epoch.valid_after))then
  raise exception using errcode='42501',message='Own live verified identity and completed normal-wipe closure required';end if;
 new.created_at:=clock_timestamp();new.transaction_id:=pg_current_xact_id()::text;new.backend_pid:=pg_backend_pid();return new;
end;
$$;
create trigger primary_reentry_guard before insert or update or delete on private.primary_wipe_reentries for each row execute function private.primary_reentry_guard();
create trigger primary_reentry_truncate_guard before truncate on private.primary_wipe_reentries for each statement execute function private.primary_reentry_guard();
create function private.primary_reentry_recorded()returns trigger language plpgsql set search_path=''as $$
declare notice uuid;
begin
 delete from private.account_sessions where active_context_id=new.context_id;
 update public.account_contexts set status='active',updated_at=clock_timestamp()where id=new.context_id;
 insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id)values(new.context_id,'primary_wipe_reentry','primary_wipe_execution',new.execution_id);
 insert into public.notifications(category,title,message,link)values('account_status','Primary account reopened',
  'Your verified primary account is active again. Previous history remains; closed residences and stores were not reopened.','/user/dashboard?tab=notifications')returning id into notice;
 insert into public.notification_recipients(notification_id,context_id)values(notice,new.context_id);
 perform pg_notify('pinevela_notifications',new.context_id::text);return new;
end;
$$;
create trigger primary_reentry_recorded after insert on private.primary_wipe_reentries for each row execute function private.primary_reentry_recorded();

create function private.run_primary_wipe(consent_id uuid)returns uuid language plpgsql set search_path=''as $$
declare e private.primary_wipe_executions;notice uuid;recipient uuid;
begin
 insert into private.primary_wipe_executions(authorization_id)values(consent_id)returning * into e;
 delete from private.account_sessions where active_context_id=any(e.context_ids);
 update public.account_contexts set status='closed',updated_at=clock_timestamp()where id=any(e.context_ids);
 insert into public.notifications(sender_context_id,category,title,message,link)values(e.founder_context_id,'account_status',
  'Primary account closed after reviewed system wipe','Five administrators and the founder approved closing your primary portal. Your verified login and account history remain. Choose Sign Up with Google to reopen your primary account.','/login?mode=register')returning id into notice;
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
revoke all on function private.primary_wipe_actor_current(private.primary_wipe_executions),private.primary_wipe_write_allowed(text,text,text,jsonb,jsonb),
 private.primary_wipe_execution_guard(),private.primary_wipe_commit_guard(),private.primary_context_guard(),private.primary_reentry_guard(),
 private.primary_reentry_recorded(),private.run_primary_wipe(uuid)from public,anon,authenticated,pinevela_backend;

create or replace function private.system_wipe_preparation_guard()returns trigger language plpgsql set search_path='' as $$
declare actor uuid;p public.admin_proposals;
begin
 if tg_op in('DELETE','TRUNCATE') then raise exception using errcode='42501',message='Wipe preparation history is immutable';end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception using errcode='42501',message='Wipe preparation requires READ COMMITTED';end if;
 perform pg_advisory_xact_lock(hashtextextended('residence-deletion-freeze',0));
 perform pg_advisory_xact_lock(hashtextextended('platform-settings',0));
 actor:=private.approval_authorized_context();
 if actor is null or not exists(select 1 from public.admin_memberships where context_id=actor and slot=1 and status='active')then
  raise exception using errcode='42501',message='Current own-key founder proof required';end if;
 if tg_op='UPDATE'and old.state='active'and new.state='completed'then
  if to_jsonb(new)-array['state','completed_at']is distinct from to_jsonb(old)-array['state','completed_at']or not exists(
   select 1 from private.primary_wipe_executions e where e.preparation_id=old.id and e.state='completed'and private.primary_wipe_actor_current(e))then
   raise exception using errcode='42501',message='Only completed native closure may finish preparation';end if;
  new.completed_at:=clock_timestamp();return new;
 end if;
 if tg_op='INSERT' then
  select * into p from public.admin_proposals where id=new.proposal_id for update;
  if p.id is null or p.kind is distinct from 'system_wipe' or p.status is distinct from 'approved'
   or not private.system_wipe_current(p) or not private.system_wipe_quorum(p.id)
   or p.wipe_final_decision is distinct from 'approve-backup' or p.wipe_founder_context_id is distinct from actor
   or new.founder_context_id is distinct from actor or new.scope_digest is distinct from p.baseline_digest
   or new.state is distinct from 'active' or new.cancelled_at is not null or new.cancelled_by is not null or new.cancellation_reason is not null
   or current_setting('pinevela.system_wipe_preparation_confirmation',true)is distinct from 'START WIPE BACKUP' then
   raise exception using errcode='42501',message='Current five-admin and final founder backup consent required';end if;
  if(select count(*)from private.system_wipe_preparations where state='active')>=10 then raise exception using errcode='54000',message='Cancel existing backup preparations before starting another';end if;
  new.created_at:=clock_timestamp();
 else
  if old.state<>'active' or new.state is distinct from 'cancelled' or new.cancellation_reason is null or length(btrim(new.cancellation_reason))not between 3 and 500
   or to_jsonb(new)-array['state','cancelled_at','cancelled_by','cancellation_reason']is distinct from to_jsonb(old)-array['state','cancelled_at','cancelled_by','cancellation_reason']then
   raise exception using errcode='42501',message='Only keyed founder cancellation may update preparation';end if;
  new.cancelled_at:=clock_timestamp();new.cancelled_by:=actor;
 end if;return new;
end;
$$;

create or replace function private.system_wipe_freeze_guard()returns trigger language plpgsql set search_path='' as $$
declare actor uuid;f private.system_wipe_preparations;p public.admin_proposals;
begin
 if tg_op in('DELETE','TRUNCATE')then raise exception using errcode='42501',message='Wipe pause history is immutable';end if;
 if current_setting('transaction_isolation')<>'read committed'then raise exception using errcode='42501',message='Wipe pauses require READ COMMITTED';end if;
 perform pg_advisory_xact_lock(hashtextextended('residence-deletion-freeze',0));
 perform pg_advisory_xact_lock(hashtextextended('platform-settings',0));
 actor:=private.approval_authorized_context();
 select * into f from private.system_wipe_preparations where id=new.preparation_id for update;
 select * into p from public.admin_proposals where id=f.proposal_id for update;
 if actor is null or actor is distinct from f.founder_context_id
  or not exists(select 1 from public.admin_memberships where context_id=actor and slot=1 and status='active')then
  raise exception using errcode='42501',message='Current own-key founder required';end if;
 if tg_op='UPDATE'and old.state='frozen'and new.state='completed'then
  if to_jsonb(new)-array['state','completed_at']is distinct from to_jsonb(old)-array['state','completed_at']or not exists(
   select 1 from private.primary_wipe_executions e where e.preparation_id=old.preparation_id and e.state='completed'and private.primary_wipe_actor_current(e))then
   raise exception using errcode='42501',message='Only completed native closure may release a wipe pause';end if;
  new.completed_at:=clock_timestamp();return new;
 end if;
 if tg_op='INSERT'then
  if f.state is distinct from 'active' or p.status is distinct from 'approved'
   or not private.system_wipe_current(p) or not private.system_wipe_quorum(p.id)
   or p.wipe_final_decision is distinct from 'approve-backup' or p.wipe_founder_context_id is distinct from actor
   or new.founder_context_id is distinct from actor or new.scope_digest is distinct from f.scope_digest
   or new.state is distinct from 'frozen' or new.cancelled_at is not null
   or current_setting('pinevela.system_wipe_pause_confirmation',true)is distinct from 'PAUSE REVIEWED WIPE'
   or not private.system_wipe_pause_ready(p)
   or exists(select 1 from private.system_wipe_recovery_evidence where preparation_id=f.id)
   or exists(select 1 from private.system_wipe_freezes where state='frozen')then
   raise exception using errcode='42501',message='Fresh five-admin founder review without unsettled work or earlier backup evidence required';end if;
  new.created_at:=clock_timestamp();
 else
  if old.state<>'frozen' or new.state is distinct from 'cancelled' or f.state is distinct from 'cancelled'
   or to_jsonb(new)-array['state','cancelled_at']is distinct from to_jsonb(old)-array['state','cancelled_at']then
   raise exception using errcode='42501',message='Only founder preparation cancellation can release a wipe pause';end if;
  new.cancelled_at:=clock_timestamp();
 end if;return new;
end;
$$;

create or replace function private.system_wipe_proposal_guard() returns trigger language plpgsql set search_path='' as $$
declare actor uuid:=private.approval_authorized_context();roster_revision bigint;resource_revision bigint;
begin
 if tg_op='DELETE' then if old.kind='system_wipe' then raise exception using errcode='42501',message='System wipe review history is immutable';end if;return old;end if;
 if tg_op='UPDATE' and new.kind is distinct from old.kind and(old.kind='system_wipe' or new.kind='system_wipe') then raise exception using errcode='42501',message='System wipe review kind is immutable';end if;
 if new.kind<>'system_wipe' then return new;end if;
 if tg_op='UPDATE'and old.status='approved'and new.status='executed'then
  if to_jsonb(new)-array['status','executed_at','executed_by_context_id']is distinct from to_jsonb(old)-array['status','executed_at','executed_by_context_id']or not exists(
   select 1 from private.primary_wipe_executions e where e.proposal_id=old.id and e.state='completed'and private.primary_wipe_actor_current(e))then
   raise exception using errcode='42501',message='Only completed native closure may finish a wipe review';end if;
  new.executed_at:=clock_timestamp();new.executed_by_context_id:=private.approval_authorized_context();return new;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('platform-settings',0));
 select s.roster_revision into roster_revision from private.admin_pricing_state s where singleton;
 select revision into resource_revision from private.residence_review_state where singleton;
 if tg_op='INSERT' then
  if actor is null or actor is distinct from new.proposer_context_id or new.target_context_id is not null or new.target_residence_id is not null
   or new.status<>'pending' or new.quorum<>5 or new.wipe_roster_revision is distinct from roster_revision or new.wipe_resource_revision is distinct from resource_revision
   or not coalesce(private.valid_system_wipe_scopes(new.preview->'scopes'),false)
   or new.preview is distinct from private.system_wipe_preview(new.preview->'scopes') or jsonb_array_length(new.preview->'roster')<>5
   or not exists(select 1 from jsonb_array_elements(new.preview->'roster') r where r->>'slot'='1')
   or new.baseline_digest is distinct from private.system_wipe_digest(new.preview,roster_revision)
   or jsonb_array_length(new.preview->'accounts')+jsonb_array_length(new.preview->'residences')+jsonb_array_length(new.preview->'stores')=0
   or length(btrim(new.reason)) not between 3 and 500 or new.decided_at is not null or new.executed_at is not null or new.executed_by_context_id is not null
   or new.wipe_final_decision is not null or new.wipe_founder_context_id is not null or new.wipe_final_reason is not null or new.wipe_final_decided_at is not null then
   raise exception using errcode='42501',message='Five keyed administrators and an exact nonempty native wipe review required';end if;
  if exists(select 1 from public.admin_proposals where kind='system_wipe' and status in('pending','approved') and preview->'scopes'=new.preview->'scopes') then raise exception using errcode='23505',message='This wipe scope is already under review';end if;
  if(select count(*)from public.admin_proposals where kind='system_wipe' and status in('pending','approved'))>=10 then raise exception using errcode='54000',message='Too many active wipe reviews';end if;
  new.created_at:=clock_timestamp();new.expires_at:=new.created_at+interval'24 hours';
 else
  if to_jsonb(new)-array['status','decided_at','wipe_final_decision','wipe_founder_context_id','wipe_final_reason','wipe_final_decided_at']
   is distinct from to_jsonb(old)-array['status','decided_at','wipe_final_decision','wipe_founder_context_id','wipe_final_reason','wipe_final_decided_at'] then raise exception using errcode='42501',message='Saved wipe scope and execution metadata are immutable';end if;
  if new.status is distinct from old.status then
   if old.status not in('pending','approved') then raise exception using errcode='42501',message='Wipe review is final';end if;
   if new.status='expired' and old.expires_at<=clock_timestamp() then null;
   elsif new.status='invalidated' and not private.system_wipe_current(old) then null;
   elsif new.status='approved' and old.status='pending' and actor is not null and private.system_wipe_current(old) and private.system_wipe_quorum(old.id) then null;
   elsif new.status='rejected' and actor is not null and private.system_wipe_current(old) and(old.status='pending' and exists(select 1 from public.admin_votes where proposal_id=old.id and administrator_context_id=actor and decision='rejected')
    or old.status='approved' and private.system_wipe_quorum(old.id) and new.wipe_final_decision='reject' and old.wipe_final_decision is null
     and exists(select 1 from public.admin_memberships where context_id=actor and slot=1 and status='active')) then null;
   else raise exception using errcode='42501',message='Wipe execution remains disabled; current independent consent required';end if;
   new.decided_at:=clock_timestamp();
  elsif new.decided_at is distinct from old.decided_at then raise exception using errcode='42501',message='Decision time is server controlled';end if;
  if(new.wipe_final_decision,new.wipe_founder_context_id,new.wipe_final_reason,new.wipe_final_decided_at) is distinct from(old.wipe_final_decision,old.wipe_founder_context_id,old.wipe_final_reason,old.wipe_final_decided_at) then
   if old.status<>'approved' or old.wipe_final_decision is not null or actor is null or not private.system_wipe_current(old) or not private.system_wipe_quorum(old.id)
    or not exists(select 1 from public.admin_memberships where context_id=actor and slot=1 and status='active')
    or new.wipe_final_decision is null or new.wipe_final_reason is null or new.wipe_final_decision not in('approve-backup','reject') or length(btrim(new.wipe_final_reason)) not between 3 and 500
    or new.wipe_final_decision='reject' and new.status<>'rejected' or new.wipe_final_decision='approve-backup' and new.status<>'approved' then
    raise exception using errcode='42501',message='Current keyed founder final review required';end if;
   new.wipe_founder_context_id:=actor;new.wipe_final_decided_at:=clock_timestamp();
  end if;
 end if;return new;
end;
$$;

create or replace function private.residence_freeze_write_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare before_row jsonb:='{}';after_row jsonb:='{}';item record;fields record;scope jsonb;ids jsonb;table_ids jsonb;
begin
 if tg_op<>'INSERT' then before_row:=to_jsonb(old);end if;
 if tg_op<>'DELETE' then after_row:=to_jsonb(new);end if;
 if tg_op='UPDATE' and before_row=after_row then return new;end if;
 if exists(select 1 from private.primary_wipe_executions where state='running'and transaction_id=pg_current_xact_id()::text and backend_pid=pg_backend_pid())
  and not private.primary_wipe_write_allowed(tg_table_schema,tg_table_name,tg_op,before_row,after_row)then
  raise exception using errcode='42501',message='Primary execution may change only its exact reviewed primary statuses';end if;
 if private.system_wipe_row_paused(tg_table_schema,tg_table_name,before_row,after_row)
  and not private.primary_wipe_write_allowed(tg_table_schema,tg_table_name,tg_op,before_row,after_row)then
  raise exception using errcode='55000',message='Reviewed wipe records are paused for recovery verification';end if;
 if exists(select 1 from private.residence_executions where state='running' and transaction_id=pg_current_xact_id()::text and backend_pid=pg_backend_pid())
  and not private.residence_execution_write_allowed(tg_table_schema,tg_table_name,tg_op,before_row,after_row) then
  raise exception using errcode='42501',message='Execution may change only its exact reviewed rows and operations';end if;
 for item in select f.id,p.preview from private.residence_deletion_preparations f
  join public.admin_proposals p on p.id=f.proposal_id where f.state='frozen' loop
  scope:=item.preview->'resources';table_ids:=coalesce(scope->tg_table_name,'[]'::jsonb);
  for fields in select key,value from jsonb_each_text(before_row) union select key,value from jsonb_each_text(after_row) loop
   if fields.value is null then continue;end if;
   ids:=case fields.key
    when 'residence_id' then scope->'residences' when 'block_id' then scope->'blocks'
    when 'assigned_block_id' then scope->'blocks' when 'floor_id' then scope->'floors'
    when 'room_id' then scope->'rooms' when 'bed_id' then scope->'beds'
    when 'allocation_id' then scope->'allocations' when 'staff_assignment_id' then scope->'staff_assignments'
    when 'assigned_staff_assignment_id' then scope->'staff_assignments' when 'issue_id' then scope->'maintenance_issues'
    when 'case_id' then scope->'verification_cases' when 'inspection_id' then scope->'verification_inspections'
    when 'account_context_id' then scope->'account_contexts' when 'context_id' then scope->'account_contexts'
    when 'manager_context_id' then scope->'account_contexts' when 'created_by_manager_id' then scope->'account_contexts'
    when 'resident_context_id' then scope->'account_contexts' when 'staff_context_id' then scope->'account_contexts'
    when 'owner_context_id' then scope->'account_contexts' when 'linked_context_id' then scope->'account_contexts'
    when 'initiator_context_id' then scope->'account_contexts' when 'applicant_context_id' then scope->'account_contexts'
    when 'reporter_context_id' then scope->'account_contexts' when 'actor_context_id' then scope->'account_contexts'
    when 'auth_user_id' then scope->'profiles' when 'primary_owner_id' then scope->'profiles'
    else '[]'::jsonb end;
   if (fields.key in('id','context_id','issue_id') and table_ids ? fields.value) or coalesce(ids ? fields.value,false) then
    if private.residence_execution_write_allowed(tg_table_schema,tg_table_name,tg_op,before_row,after_row,item.id) then continue;end if;
    raise exception using errcode='55000',message='Reviewed housing records are paused for backup preparation';end if;
  end loop;
 end loop;
 return case when tg_op='DELETE' then old else new end;
end;
$$;
