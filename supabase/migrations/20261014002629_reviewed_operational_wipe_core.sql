-- Reviewed normal-wipe operational core. No HTTP/CLI execution gate is enabled.
select pg_advisory_xact_lock(hashtextextended('residence-deletion-freeze',0));
select pg_advisory_xact_lock(hashtextextended('platform-settings',0));
do $$begin
 if exists(select 1 from private.system_wipe_freezes where state='frozen')then
  raise exception using errcode='55000',message='Cancel existing wipe pauses before updating execution protocol';end if;
end;$$;
-- Reuse the retained execution ledger/FKs so primary re-entry has one history.
alter table private.primary_wipe_executions
 add column execution_kind text not null default 'primary'check(execution_kind in('primary','operational')),
 add column operational_context_ids uuid[] not null default '{}',
 add column recipient_context_ids uuid[] not null default '{}',
 add column effect_plan jsonb not null default '[]'check(jsonb_typeof(effect_plan)='array');
do $$declare item record;begin
 for item in select conname from pg_constraint where conrelid='private.primary_wipe_executions'::regclass
  and contype='c'and pg_get_constraintdef(oid)like'%cardinality(context_ids)%'loop
  execute format('alter table private.primary_wipe_executions drop constraint %I',item.conname);end loop;
end;$$;
alter table private.primary_wipe_executions add constraint wipe_execution_scope_shape
 check(execution_kind='primary'and cardinality(context_ids)>0 and effect_plan='[]'::jsonb
  or execution_kind='operational'and jsonb_array_length(effect_plan)>0);
alter table public.maintenance_issues add column withdrawn_by_wipe_id uuid references private.primary_wipe_executions(id);
alter table public.verification_cases add column withdrawn_by_wipe_id uuid references private.primary_wipe_executions(id);
alter table public.verification_inspections add column withdrawn_by_wipe_id uuid references private.primary_wipe_executions(id);
alter table public.seller_applications add column withdrawn_by_wipe_id uuid references private.primary_wipe_executions(id);
alter table private.manager_closure_requests add column withdrawn_by_wipe_id uuid references private.primary_wipe_executions(id);
-- Several own requests can resolve through one reviewed operational wipe, while
-- individual residence reviews retain their original one-request relationship.
drop index private.manager_closure_requests_proposal;
create unique index manager_closure_requests_proposal on private.manager_closure_requests(proposal_id)
 where proposal_id is not null and withdrawn_by_wipe_id is null;

create function private.operational_wipe_effect(schema_name text,table_name text,key_name text,before_row jsonb,
 new_values jsonb default null)returns jsonb language sql immutable set search_path=''as $$
 select jsonb_build_object('schema',schema_name,'table',table_name,'key',key_name,'id',before_row->>key_name,
  'operation',case when new_values is null then 'DELETE'else 'UPDATE'end,
  'beforeDigest',encode(sha256(convert_to(before_row::text,'UTF8')),'hex'),
  'immutableDigest',encode(sha256(convert_to((before_row-array(select jsonb_object_keys(coalesce(new_values,'{}'))))::text,'UTF8')),'hex'),
  'values',new_values);
$$;
create function private.operational_wipe_plan(e private.primary_wipe_executions,preview jsonb)returns jsonb
language plpgsql set search_path=''as $$
declare contexts uuid[]:=array(select jsonb_array_elements_text(preview#>'{resources,account_contexts}')::uuid);
 homes uuid[]:=array(select jsonb_array_elements_text(preview#>'{resources,residences}')::uuid);
 stores uuid[]:=array(select jsonb_array_elements_text(preview#>'{resources,stores}')::uuid);
 effects jsonb:='[]';part jsonb;stamp timestamptz:=transaction_timestamp();
begin
 -- Changes are static native product transitions, never browser/operator SQL.
 select coalesce(jsonb_agg(private.operational_wipe_effect('private','account_enrollments','id',to_jsonb(t),jsonb_build_object('status','cancelled'))order by t.id),'[]')into part
  from private.account_enrollments t where t.status in('pending_email','pending_review')and private.system_wipe_enrollment_selected(t,preview);effects:=effects||part;
 select coalesce(jsonb_agg(private.operational_wipe_effect('public','meetings','id',to_jsonb(t),jsonb_build_object('status','cancelled','updated_at',stamp))order by t.id),'[]')into part
  from public.meetings t where preview#>'{resources,meetings}' ? t.id::text and t.status in('requested','accepted');effects:=effects||part;
 select coalesce(jsonb_agg(private.operational_wipe_effect('public','staff_bargains','id',to_jsonb(t),jsonb_build_object('status','cancelled','updated_at',stamp))order by t.id),'[]')into part
  from public.staff_bargains t where preview#>'{resources,staff_bargains}' ? t.id::text and t.status in('proposed','declined');effects:=effects||part;
 select coalesce(jsonb_agg(private.operational_wipe_effect('public','residence_change_requests','id',to_jsonb(t),jsonb_build_object('status','invalidated','decided_at',e.started_at,'decided_by_context_id',e.founder_context_id))order by t.id),'[]')into part
  from public.residence_change_requests t where preview#>'{resources,residence_change_requests}' ? t.id::text and t.status='pending';effects:=effects||part;
 select coalesce(jsonb_agg(private.operational_wipe_effect('public','maintenance_issues','id',to_jsonb(t),jsonb_build_object('withdrawn_by_wipe_id',e.id,'updated_at',stamp))order by t.id),'[]')into part
  from public.maintenance_issues t where preview#>'{resources,maintenance_issues}' ? t.id::text and t.status not in('closed','resident_confirmed')
   and t.withdrawn_by_wipe_id is null and(t.reporter_context_id=any(contexts)or t.residence_id=any(homes));effects:=effects||part;
 select coalesce(jsonb_agg(private.operational_wipe_effect('public','verification_inspections','id',to_jsonb(t),jsonb_build_object('withdrawn_by_wipe_id',e.id))order by t.id),'[]')into part
  from public.verification_inspections t where preview#>'{resources,verification_inspections}' ? t.id::text
   and t.status in('assigned','in_progress','submitted')and t.withdrawn_by_wipe_id is null;effects:=effects||part;
 select coalesce(jsonb_agg(private.operational_wipe_effect('public','verification_cases','id',to_jsonb(t),jsonb_build_object('withdrawn_by_wipe_id',e.id))order by t.id),'[]')into part
  from public.verification_cases t where preview#>'{resources,verification_cases}' ? t.id::text
   and t.status in('submitted','inspection_pending','under_review','more_info_required')and t.withdrawn_by_wipe_id is null;effects:=effects||part;
 select coalesce(jsonb_agg(private.operational_wipe_effect('public','seller_applications','id',to_jsonb(t),jsonb_build_object('withdrawn_by_wipe_id',e.id))order by t.id),'[]')into part
  from public.seller_applications t where preview#>'{resources,seller_applications}' ? t.id::text and t.status='submitted'and t.withdrawn_by_wipe_id is null;effects:=effects||part;
 select coalesce(jsonb_agg(private.operational_wipe_effect('private','manager_closure_requests','id',to_jsonb(t),jsonb_build_object('state','resolved','proposal_id',e.proposal_id,'decided_at',e.started_at,'decided_by_context_id',e.founder_context_id,'decision_reason',null,'withdrawn_by_wipe_id',e.id))order by t.id),'[]')into part
  from private.manager_closure_requests t where t.manager_context_id=any(contexts)and t.state in('pending','reviewing')and t.withdrawn_by_wipe_id is null;effects:=effects||part;
 select coalesce(jsonb_agg(private.operational_wipe_effect('public','listings','id',to_jsonb(t),jsonb_build_object('is_published',false,'updated_at',stamp))order by t.id),'[]')into part
  from public.listings t where t.store_id=any(stores)and t.is_published;effects:=effects||part;
 select coalesce(jsonb_agg(private.operational_wipe_effect('public','store_subscriptions','id',to_jsonb(t),jsonb_build_object('status','cancelled'))order by t.id),'[]')into part
  from public.store_subscriptions t where t.store_id=any(stores)and t.status='active';effects:=effects||part;
 select coalesce(jsonb_agg(private.operational_wipe_effect('private','manager_operation_keys','manager_context_id',to_jsonb(t),jsonb_build_object('key_hash',null,'version',t.version+1,'failed_attempts',0,'locked_until',null))order by t.manager_context_id),'[]')into part
  from private.manager_operation_keys t where t.manager_context_id=any(contexts)and t.key_hash is not null;effects:=effects||part;
 select coalesce(jsonb_agg(private.operational_wipe_effect('private','room_activation_keys','id',to_jsonb(t),jsonb_build_object('revoked_at',e.started_at))order by t.id),'[]')into part
  from private.room_activation_keys t join public.rooms r on r.id=t.room_id join public.floors f on f.id=r.floor_id join public.blocks b on b.id=f.block_id
  where t.revoked_at is null and(b.residence_id=any(homes)or t.claimed_by=any(contexts));effects:=effects||part;
 select coalesce(jsonb_agg(private.operational_wipe_effect('public','allocations','id',to_jsonb(t),jsonb_build_object('ended_at',e.started_at))order by t.id),'[]')into part
  from public.allocations t join public.rooms r on r.id=t.room_id join public.floors f on f.id=r.floor_id join public.blocks b on b.id=f.block_id
  where t.ended_at is null and(t.resident_context_id=any(contexts)or b.residence_id=any(homes));effects:=effects||part;
 select coalesce(jsonb_agg(private.operational_wipe_effect('public','staff_assignments','id',to_jsonb(t),jsonb_build_object('status','removed','ended_at',e.started_at,'end_reason','Closed after reviewed system wipe'))order by t.id),'[]')into part
  from public.staff_assignments t where t.ended_at is null and(t.residence_id=any(homes)or t.staff_context_id=any(contexts)or t.created_by_manager_id=any(contexts));effects:=effects||part;
 select coalesce(jsonb_agg(private.operational_wipe_effect('public','manager_assignments','id',to_jsonb(t),jsonb_build_object('ended_at',e.started_at))order by t.id),'[]')into part
  from public.manager_assignments t where t.ended_at is null and(t.residence_id=any(homes)or t.manager_context_id=any(contexts));effects:=effects||part;
 select coalesce(jsonb_agg(private.operational_wipe_effect('public','stores','id',to_jsonb(t),jsonb_build_object('status','closed'))order by t.id),'[]')into part
  from public.stores t where t.id=any(stores)and t.status<>'closed';effects:=effects||part;
 select coalesce(jsonb_agg(private.operational_wipe_effect('public','residences','id',to_jsonb(t),jsonb_build_object('status','closed','updated_at',stamp))order by t.id),'[]')into part
  from public.residences t where t.id=any(homes)and t.status<>'closed';effects:=effects||part;
 select coalesce(jsonb_agg(private.operational_wipe_effect('private','account_sessions','session_id',to_jsonb(t))order by t.session_id),'[]')into part
  from private.account_sessions t where t.active_context_id=any(contexts);effects:=effects||part;
 select coalesce(jsonb_agg(private.operational_wipe_effect('public','account_contexts','id',to_jsonb(t),jsonb_build_object('status','closed','updated_at',stamp))order by t.id),'[]')into part
  from public.account_contexts t where t.id=any(contexts)and t.kind<>'admin'and t.status<>'closed';effects:=effects||part;
 if jsonb_array_length(effects)>50000 then raise exception using errcode='54000',message='Operator-reviewed bulk closure required';end if;
 return effects;
end;$$;
create function private.operational_wipe_write_allowed(schema_name text,table_name text,operation text,before_row jsonb,after_row jsonb)returns boolean
language plpgsql stable set search_path=''as $$
declare e private.primary_wipe_executions;effect jsonb;fields text[];
begin
 select * into e from private.primary_wipe_executions where execution_kind='operational'and state='running'
  and transaction_id=pg_current_xact_id()::text and backend_pid=pg_backend_pid();
 if not found or not private.primary_wipe_actor_current(e)then return false;end if;
 for effect in select value from jsonb_array_elements(e.effect_plan)loop
  if effect->>'schema'=schema_name and effect->>'table'=table_name and effect->>'operation'=operation
   and effect->>'id'=before_row->>(effect->>'key')then
   if effect->>'beforeDigest'<>encode(sha256(convert_to(before_row::text,'UTF8')),'hex')then return false;end if;
   if operation='DELETE'then return after_row='{}'::jsonb;end if;
   fields:=array(select jsonb_object_keys(effect->'values'));
   return after_row @> (effect->'values')and before_row-fields=after_row-fields;
  end if;
 end loop;return false;
end;$$;
create function private.operational_wipe_complete(e private.primary_wipe_executions)returns boolean
language plpgsql stable set search_path=''as $$
declare effect jsonb;row_value jsonb;fields text[];
begin
 for effect in select value from jsonb_array_elements(e.effect_plan)loop
  execute format('select to_jsonb(t)from %I.%I t where %I::text=$1',effect->>'schema',effect->>'table',effect->>'key')into row_value using effect->>'id';
  if effect->>'operation'='DELETE'then if row_value is not null then return false;end if;
  else
   fields:=array(select jsonb_object_keys(effect->'values'));
   if row_value is null or not(row_value @> (effect->'values'))or effect->>'immutableDigest'<>
    encode(sha256(convert_to((row_value-fields)::text,'UTF8')),'hex')then return false;end if;
  end if;
 end loop;
 return not exists(select 1 from private.account_sessions where active_context_id=any(e.operational_context_ids));
end;$$;

CREATE OR REPLACE FUNCTION private.primary_wipe_write_allowed(schema_name text, table_name text, operation text, before_row jsonb, after_row jsonb)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select private.operational_wipe_write_allowed(schema_name,table_name,operation,before_row,after_row)or coalesce(exists(select 1 from private.primary_wipe_executions e where e.execution_kind='primary'and e.state='running'
  and private.primary_wipe_actor_current(e) and schema_name='public'and table_name='account_contexts'and operation='UPDATE'
  and before_row->>'id'=any(e.context_ids::text[])and before_row->>'kind'='primary'and before_row->>'status'='active'
  and after_row->>'status'='closed'and before_row-array['status','updated_at']=after_row-array['status','updated_at']),false);
$function$;

CREATE OR REPLACE FUNCTION private.primary_wipe_execution_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare a private.system_wipe_execution_authorizations;p public.admin_proposals;f private.system_wipe_preparations;r private.system_wipe_recovery_evidence;
begin

 if tg_op in('INSERT','UPDATE')and new.execution_kind='operational'then
  if current_setting('role')<>'none'or current_setting('transaction_isolation')<>'read committed'then
   raise exception using errcode='42501',message='Trusted READ COMMITTED operational execution required';end if;
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
    or current_setting('pinevela.operational_wipe_confirmation',true)is distinct from 'CLOSE REVIEWED OPERATIONAL PORTALS'
    or current_setting('pinevela.primary_wipe_recovery_checked',true)is distinct from(to_jsonb(r)-'verified_at')::text
    or new.state is distinct from 'running'or new.completed_at is not null or new.notification_id is not null
    or p.preview->>'version'is distinct from '1'
    or exists(select 1 from jsonb_array_elements(p.preview->'accounts')target where target->>'kind'='admin')
    or exists(select 1 from jsonb_array_elements(p.preview->'accounts')target where target->>'kind'='primary'
     and(not private.primary_reentry_identity_supported((target->>'authUserId')::uuid,'verified-email-reentry')
      or exists(select 1 from public.profiles canonical where canonical.id=(target->>'authUserId')::uuid and canonical.primary_owner_id is not null)))then
    raise exception using errcode='42501',message='Exact reviewed operational scope, current founder and restored recovery required';end if;
   new.preparation_id:=f.id;new.proposal_id:=p.id;new.founder_context_id:=a.founder_context_id;
   new.context_ids:=array(select(c->>'id')::uuid from jsonb_array_elements(p.preview->'accounts')c where c->>'kind'='primary'order by 1);
   new.operational_context_ids:=array(select jsonb_array_elements_text(p.preview#>'{resources,account_contexts}')::uuid order by 1);
   new.recipient_context_ids:=array(select distinct id from(
    select unnest(new.operational_context_ids)id union select unnest(private.account_lineage(t.id))from public.account_contexts t where t.id=any(new.operational_context_ids)
    union select root.id from public.account_contexts root where root.kind='primary'and(root.auth_user_id in(select primary_owner_id from public.residences where p.preview#>'{resources,residences}' ? id::text)
     or root.auth_user_id in(select primary_owner_id from public.stores where p.preview#>'{resources,stores}' ? id::text))
    union select context_id from public.admin_memberships where status='active')targets order by id);
   new.transaction_id:=pg_current_xact_id()::text;new.backend_pid:=pg_backend_pid();new.started_at:=clock_timestamp();
   new.effect_plan:=private.operational_wipe_plan(new,p.preview);
   if jsonb_array_length(new.effect_plan)=0 then raise exception using errcode='42501',message='No reviewed operational effect remains';end if;
  else
   if old.execution_kind<>'operational'or old.state<>'running'or new.state is distinct from 'completed'
    or not private.primary_wipe_actor_current(old)
    or to_jsonb(new)-array['state','completed_at','notification_id']is distinct from to_jsonb(old)-array['state','completed_at','notification_id']
    or not private.operational_wipe_complete(old)
    or new.notification_id is null or not exists(select 1 from public.notifications where id=new.notification_id
     and sender_context_id=old.founder_context_id and category='account_status'and title='Operational portals closed after reviewed system wipe')
    or exists(select 1 from unnest(old.recipient_context_ids)recipient where not exists(select 1 from public.notification_recipients where notification_id=new.notification_id and context_id=recipient))
    or not exists(select 1 from private.audit_events where event_type='operational_wipe_completed'and resource_id=old.id and actor_context_id=old.founder_context_id)then
    raise exception using errcode='42501',message='Atomic exact closure, retained evidence, recipients and audit required';end if;
   new.completed_at:=clock_timestamp();
  end if;return new;
 end if;
 if tg_op='UPDATE'and old.execution_kind is distinct from new.execution_kind then
  raise exception using errcode='42501',message='Execution kind is immutable';end if;
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
$function$;

CREATE OR REPLACE FUNCTION private.guard_officer_invitation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare actor uuid; expected_subject uuid;
begin

 if tg_op='UPDATE'and private.operational_wipe_write_allowed(tg_table_schema,tg_table_name,tg_op,to_jsonb(old),to_jsonb(new))then return new;end if;
 if tg_op='DELETE' then
  if old.kind='officer' then raise exception using errcode='42501',message='Officer invitation history is immutable';end if;return old;
 end if;
 if tg_op='UPDATE' and(new.kind='officer' or old.kind='officer') and new.kind is distinct from old.kind then
  raise exception using errcode='42501',message='Officer invitation kind is immutable';end if;
 if new.kind<>'officer' then return new;end if;
 actor:=private.approval_authorized_context();
 if tg_op='INSERT' then
  select id into expected_subject from auth.users where lower(email)=new.invited_email;
  if actor is null or actor is distinct from new.initiator_context_id or not private.officer_invitation_issuer_valid(new)
   or new.officer_reserved_subject is distinct from expected_subject
   or (select count(*) from auth.users where lower(email)=new.invited_email)>1
   or new.status<>'pending_email' or new.auth_user_id is not null or new.linked_context_id is not null or new.verified_at is not null
   or new.primary_owner_id is not null or new.residence_id is not null or new.room_id is not null
   or new.invited_email<>lower(btrim(new.invited_email)) or length(new.invited_email)>254
   or new.invited_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
   or new.token_digest !~ '^[a-f0-9]{64}$'
   or jsonb_typeof(new.enrollment_fields)<>'object'
   or not(new.enrollment_fields ?& array['fullName','phone','assignedZone'])
   or jsonb_typeof(new.enrollment_fields->'fullName') is distinct from 'string'
   or jsonb_typeof(new.enrollment_fields->'phone') is distinct from 'string'
   or jsonb_typeof(new.enrollment_fields->'assignedZone') is distinct from 'string'
   or (new.enrollment_fields-array['fullName','phone','assignedZone'])<>'{}'::jsonb
   or length(btrim(new.enrollment_fields->>'fullName')) not between 1 and 120
   or length(btrim(new.enrollment_fields->>'phone')) not between 1 and 40
   or length(btrim(new.enrollment_fields->>'assignedZone')) not between 1 and 200
   or exists(select 1 from public.account_contexts c where c.auth_user_id=expected_subject and c.kind<>'primary')
   or exists(select 1 from public.profiles p where p.id=expected_subject and p.primary_owner_id is not null)
   or exists(select 1 from private.account_enrollments e where lower(e.invited_email)=new.invited_email and e.status in('pending_email','pending_review')) then
   raise exception using errcode='42501',message='Administrator-keyed separate officer invitation required';end if;
  new.created_at:=clock_timestamp();new.expires_at:=new.created_at+interval'24 hours';
 else
  if(to_jsonb(new)-array['status','auth_user_id','linked_context_id','verified_at']) is distinct from
   (to_jsonb(old)-array['status','auth_user_id','linked_context_id','verified_at']) then
   raise exception using errcode='42501',message='Officer invitation details are immutable';end if;
  if(new.status,new.auth_user_id,new.linked_context_id,new.verified_at) is not distinct from
   (old.status,old.auth_user_id,old.linked_context_id,old.verified_at) then return new;end if;
  if old.status<>'pending_email' then raise exception using errcode='42501',message='Officer invitation decision is final';end if;
  if new.status='completed' and private.officer_invitation_acceptance_allowed(old,new.linked_context_id)
   and new.auth_user_id=auth.uid() and exists(select 1 from public.account_contexts c
    where c.id=new.linked_context_id and c.auth_user_id=new.auth_user_id and c.kind='officer' and c.status='active' and c.primary_owner_id is null) then
   new.verified_at:=clock_timestamp();
  elsif new.status in('cancelled','expired') and new.auth_user_id is null and new.linked_context_id is null and new.verified_at is null
   and((new.status='expired' and old.expires_at<=clock_timestamp())
    or(new.status='cancelled' and(not private.officer_invitation_issuer_valid(old) or actor is not null)))then null;
  else raise exception using errcode='42501',message='Verified officer invitation acceptance required';end if;
 end if;return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.guard_officer_context()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare invitation private.account_enrollments%rowtype;
begin

 if tg_op='UPDATE'and private.operational_wipe_write_allowed(tg_table_schema,tg_table_name,tg_op,to_jsonb(old),to_jsonb(new))then return new;end if;
 if tg_op='DELETE' then
  if old.kind='officer' then raise exception using errcode='42501',message='Officer identity history must be retained';end if;return old;
 end if;
 if tg_op='UPDATE' and(old.kind='officer' or new.kind='officer') then
  if(to_jsonb(new)-array['status','updated_at']) is distinct from(to_jsonb(old)-array['status','updated_at']) then
   raise exception using errcode='42501',message='Officer identity and ownership are immutable';end if;
  if new.status is distinct from old.status then
   if private.approval_authorized_context() is null or new.status not in('active','suspended','closed') then
    raise exception using errcode='42501',message='Administrator approval key required for officer status';end if;
   if new.status='active' and not exists(select 1 from private.account_enrollments e join auth.users u on u.id=e.auth_user_id
    where e.kind='officer' and e.status='completed' and e.linked_context_id=old.id and e.auth_user_id=old.auth_user_id
     and private.invitation_identity_valid(u.id,e.invited_email) and u.deleted_at is null)then
    raise exception using errcode='42501',message='Verified completed officer invitation required';end if;
   new.updated_at:=clock_timestamp();
   delete from private.account_sessions where active_context_id=old.id;
  else new.updated_at:=old.updated_at;end if;
 elsif new.kind='officer' then
  select * into invitation from private.account_enrollments e where e.id::text=current_setting('pinevela.officer_enrollment_id',true) for update;
  if not found or not private.officer_invitation_acceptance_allowed(invitation,new.id)
   or new.auth_user_id is distinct from auth.uid() or new.primary_owner_id is not null or new.status<>'active' then
   raise exception using errcode='42501',message='Verified separate officer invitation required';end if;
  new.created_at:=clock_timestamp();new.updated_at:=new.created_at;
 end if;return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.guard_residence_change_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=private.current_context_id(); key_version text;
begin

 if tg_op='UPDATE'and private.operational_wipe_write_allowed(tg_table_schema,tg_table_name,tg_op,to_jsonb(old),to_jsonb(new))then return new;end if;
 if tg_op='INSERT' then
  if private.current_kind()<>'manager' or actor is distinct from new.manager_context_id
    or not exists(select 1 from public.manager_assignments a join public.residences h on h.id=a.residence_id
      where a.manager_context_id=actor and a.residence_id=new.residence_id and a.ended_at is null and h.status='approved') then
   raise exception 'Assigned active manager required' using errcode='23514';end if;
  key_version:=current_setting('pinevela.manager_change_key_version',true);
  if not exists(select 1 from private.manager_operation_keys k where k.manager_context_id=actor
    and k.key_hash is not null and k.version::text=key_version and (k.locked_until is null or k.locked_until<=clock_timestamp())) then
   raise exception 'Current manager key grant required' using errcode='23514';end if;
  perform pg_advisory_xact_lock(hashtextextended('residence-change:'||actor::text,0));
  if exists(select 1 from public.residence_change_requests r where r.manager_context_id=actor
    and r.submitted_at>clock_timestamp()-interval '30 days') then
   raise exception 'One residence request per 30 days' using errcode='23514';end if;
  if new.baseline_digest!~'^[a-f0-9]{64}$' or jsonb_typeof(new.before_fields)<>'object'
    or jsonb_typeof(new.after_fields)<>'object' or new.before_fields=new.after_fields then
   raise exception 'Actual immutable residence change required' using errcode='23514';end if;
  new.status:='pending';new.submitted_at:=clock_timestamp();new.decided_at:=null;
  new.decided_by_context_id:=null;new.decision_notes:=null;
 else
  if row(new.id,new.residence_id,new.manager_context_id,new.baseline_digest,new.before_fields,new.after_fields,new.submitted_at)
    is distinct from row(old.id,old.residence_id,old.manager_context_id,old.baseline_digest,old.before_fields,old.after_fields,old.submitted_at) then
   raise exception 'Residence request identity and snapshots are immutable' using errcode='23514';end if;
  if old.status<>'pending' or new.status not in ('approved','rejected','invalidated')
    or private.current_kind()<>'admin' or not exists(select 1 from public.admin_memberships m
      join private.admin_secrets k on k.context_id=m.context_id where m.context_id=actor and m.status='active'
      and k.approval_key_hash is not null and k.approval_key_version::text=current_setting('pinevela.approval_key_version',true)
      and (k.locked_until is null or k.locked_until<=clock_timestamp())) then
   raise exception 'Pending request and current administrator approval grant required' using errcode='23514';end if;
  if new.status='rejected' and (new.decision_notes is null or length(trim(new.decision_notes)) not between 1 and 2000) then
   raise exception 'Rejection reason required' using errcode='23514';end if;
  new.decided_at:=clock_timestamp();new.decided_by_context_id:=actor;
 end if;
 return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.guard_manager_closure_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare actor uuid:=private.current_context_id();kind text:=private.current_kind();
begin

 if tg_op='UPDATE'and private.operational_wipe_write_allowed(tg_table_schema,tg_table_name,tg_op,to_jsonb(old),to_jsonb(new))then return new;end if;
 if tg_op='DELETE' then raise exception using errcode='42501',message='Manager closure request history is retained';end if;
 if tg_op='INSERT' then
  if kind is distinct from 'manager' or actor is distinct from new.manager_context_id or new.state<>'pending'
   or not exists(select 1 from private.manager_operation_keys k where k.manager_context_id=actor
     and k.key_hash is not null and k.version::text=current_setting('pinevela.manager_closure_key_version',true)
     and (k.locked_until is null or k.locked_until<=clock_timestamp())) then
   raise exception using errcode='42501',message='Only a native manager with its own current key may request closure';
  end if;
  return new;
 end if;
 if kind='primary' and private.current_manager_reactivation_allowed(old.manager_context_id) then
  if old.state='pending' and new.state='withdrawn' and new.decided_at is not null
   and to_jsonb(new)-'state'-'decided_at'=to_jsonb(old)-'state'-'decided_at' then return new;end if;
  if old.state='reviewing' and new.state='resolved' and to_jsonb(new)-'state'=to_jsonb(old)-'state'
   and exists(select 1 from public.admin_proposals p where p.id=old.proposal_id and p.status in('executed','rejected','expired','invalidated')
    and (p.kind='account_action' and p.preview->>'action'='close-manager' and p.target_context_id=old.manager_context_id
      or p.kind='residence_deletion' and (p.status<>'executed' or exists(select 1 from private.residence_executions e where e.proposal_id=p.id and e.state='completed')))
    and not exists(select 1 from private.residence_deletion_preparations f where f.proposal_id=p.id and f.state='frozen')) then return new;end if;
 end if;
 if old.state='reviewing' and new.state='resolved' and kind='manager' and actor=old.manager_context_id
  and to_jsonb(new)-'state'=to_jsonb(old)-'state'
  and exists(select 1 from public.admin_proposals p where p.id=old.proposal_id and (p.kind='residence_deletion' or p.kind='account_action' and p.preview->>'action'='close-manager')
   and p.status in('rejected','expired','invalidated')
   and not exists(select 1 from private.residence_deletion_preparations f where f.proposal_id=p.id and f.state='frozen')) then return new;end if;
 if (new.id,new.manager_context_id,new.reason,new.request_waiver,new.created_at)
  is distinct from (old.id,old.manager_context_id,old.reason,old.request_waiver,old.created_at) or old.state<>'pending' then
  raise exception using errcode='42501',message='Saved manager closure requests are immutable';
 end if;
 if kind='manager' and actor=old.manager_context_id and new.state='withdrawn' then return new;end if;
 if kind is distinct from 'admin' or new.decided_by_context_id is distinct from actor
  or not exists(select 1 from public.admin_memberships m join private.admin_secrets s on s.context_id=m.context_id
    where m.context_id=actor and m.status='active' and s.approval_key_hash is not null
      and s.approval_key_version::text=current_setting('pinevela.approval_key_version',true)
      and (s.locked_until is null or s.locked_until<=clock_timestamp())) then
  raise exception using errcode='42501',message='A current administrator own-key grant is required';
 end if;
 if new.state='rejected' then return new;end if;
 if new.state='reviewing' and exists(select 1 from public.admin_proposals p where p.id=new.proposal_id
   and p.kind='account_action' and p.status='pending' and p.proposer_context_id=actor
   and p.preview->>'action'='close-manager' and p.target_context_id=old.manager_context_id
   and p.preview#>>'{closureRequest,id}'=old.id::text and private.unassigned_manager_closable(old.manager_context_id)) then return new;end if;
 if new.state='reviewing' and exists(select 1 from public.admin_proposals p where p.id=new.proposal_id
   and p.kind='residence_deletion' and p.status='pending' and p.proposer_context_id=actor
   and p.preview#>'{options,deleteManager}'='true'::jsonb
   and exists(select 1 from jsonb_array_elements(p.preview->'accounts') a
     where a->>'id'=old.manager_context_id::text and a->>'role'='manager' and a->>'effect'='close-portal')) then return new;end if;
 raise exception using errcode='42501',message='Closure must use its exact independently reviewed account or residence proposal';
end;
$function$;

CREATE OR REPLACE FUNCTION private.check_seller_application()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare owner_id uuid;
begin

 if tg_op='UPDATE'and private.operational_wipe_write_allowed(tg_table_schema,tg_table_name,tg_op,to_jsonb(old),to_jsonb(new))then return new;end if;
  select c.primary_owner_id into owner_id from public.account_contexts c join public.profiles p on p.id = c.auth_user_id
    join auth.users u on u.id = p.id join private.account_enrollments e on e.linked_context_id = c.id
    where c.id = new.seller_context_id and c.kind = 'seller' and c.status = 'pending' and c.seller_generation=new.registration_generation
      and p.primary_owner_id = c.primary_owner_id and u.email_confirmed_at is not null
      and e.id = new.enrollment_id and e.kind = 'seller' and e.primary_owner_id = c.primary_owner_id
      and e.auth_user_id = c.auth_user_id and e.verified_at is not null and e.status in ('pending_review','completed')
      and lower(u.email) = e.invited_email;
  if owner_id is null then raise exception 'A saved verified seller enrollment is required' using errcode = '23514'; end if;
  if new.status in ('submitted','approved') and exists(select 1 from public.registration_bans b
    join public.account_contexts c on c.id = b.account_context_id
    where (c.id = new.seller_context_id or c.auth_user_id = owner_id or c.primary_owner_id = owner_id)
      and b.kind = 'seller_account' and b.until_at > clock_timestamp()) then
    raise exception 'Seller registration is temporarily restricted' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' or (old.status = 'rejected' and new.status = 'submitted') then
    if private.current_kind() is distinct from 'primary' or not exists(select 1 from public.account_contexts c
      where c.id = private.current_context_id() and c.auth_user_id = owner_id and c.kind = 'primary')
      or new.status <> 'submitted' or (tg_op = 'INSERT' and new.submission_version <> 1)
      or (tg_op = 'UPDATE' and new.submission_version <> old.submission_version + 1) then
      raise exception 'Only the saved primary owner may submit a seller application' using errcode = '23514';
    end if;
  else
    if old.status <> 'submitted' or new.status not in ('approved','rejected') or private.current_kind() is distinct from 'admin'
      or new.reviewed_by_context_id is distinct from private.current_context_id()
      or (new.status = 'rejected' and length(btrim(new.review_notes)) = 0) then
      raise exception 'Only an active administrator may decide a pending seller application' using errcode = '23514';
    end if;
    if row(new.campus,new.primary_category,new.student_id,new.proposed_store_name,new.submission_version,new.submitted_at)
      is distinct from row(old.campus,old.primary_category,old.student_id,old.proposed_store_name,old.submission_version,old.submitted_at) then
      raise exception 'Application submission evidence cannot be rewritten during review' using errcode = '23514';
    end if;
  end if;
  if tg_op = 'UPDATE' and row(new.id,new.seller_context_id,new.enrollment_id)
    is distinct from row(old.id,old.seller_context_id,old.enrollment_id) then
    raise exception 'Seller application identity and enrollment are immutable' using errcode = '23514';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.seller_registration_generation_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare generation integer;
begin

 if tg_op='UPDATE'and private.operational_wipe_write_allowed(tg_table_schema,tg_table_name,tg_op,to_jsonb(old),to_jsonb(new))then return new;end if;
 if tg_op='DELETE' then raise exception using errcode='42501',message='Seller registration history is retained';end if;
 select seller_generation into generation from public.account_contexts where id=new.seller_context_id and kind='seller';
 if tg_op='INSERT' then
  if new.registration_generation<>0 and new.registration_generation is distinct from generation then raise exception using errcode='23514',message='Current seller registration required';end if;
  new.registration_generation:=generation;
 elsif new.registration_generation is distinct from old.registration_generation then
  raise exception using errcode='23514',message='Seller registration generation is immutable';
 end if;
 if tg_table_name='seller_applications' and new.registration_generation is distinct from generation then
  raise exception using errcode='23514',message='Historical seller decisions cannot authorize a new registration';
 end if;
 if tg_table_name='stores' then
  if tg_op='INSERT' then
   if new.application_id is null then select id into new.application_id from public.seller_applications
    where seller_context_id=new.seller_context_id and registration_generation=generation and status='approved';end if;
   if not exists(select 1 from public.seller_applications a where a.id=new.application_id and a.seller_context_id=new.seller_context_id
    and a.registration_generation=generation and a.status='approved') then raise exception using errcode='23514',message='Exact current seller approval required';end if;
  elsif new.application_id is distinct from old.application_id then raise exception using errcode='23514',message='Store approval is immutable';
  end if;
  if new.status<>'closed' and new.registration_generation is distinct from generation then
   raise exception using errcode='23514',message='Historical stores stay closed';end if;
 end if;
 return new;
end;$function$;

CREATE OR REPLACE FUNCTION private.guard_manager_registration_generation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare generation integer;
begin

 if tg_op='UPDATE'and private.operational_wipe_write_allowed(tg_table_schema,tg_table_name,tg_op,to_jsonb(old),to_jsonb(new))then return new;end if;
 if tg_op='UPDATE' then
  if new.manager_generation is distinct from old.manager_generation then raise exception using errcode='42501',message='Inspection generation is immutable';end if;
 elsif new.kind='manager_registration' then
  select e.manager_generation into generation from private.account_enrollments e join public.account_contexts c on c.id=e.linked_context_id
   where c.id=new.applicant_context_id and c.kind='manager' and c.status='pending' and e.kind='manager'
    and e.verified_at is not null and e.status='pending_review' and e.primary_owner_id=auth.uid()
    and e.initiator_context_id=private.current_context_id() and private.current_kind()='primary';
  if generation is null then raise exception using errcode='42501',message='Current verified manager enrollment required';end if;
  new.manager_generation:=generation;
 end if;return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.residence_freeze_write_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare before_row jsonb:='{}';after_row jsonb:='{}';item record;fields record;scope jsonb;ids jsonb;table_ids jsonb;
begin
 if tg_op<>'INSERT' then before_row:=to_jsonb(old);end if;
 if tg_op<>'DELETE' then after_row:=to_jsonb(new);end if;
 if tg_op='UPDATE' and before_row=after_row then return new;end if;
 if exists(select 1 from private.primary_wipe_executions where execution_kind='operational'and state='running'
  and transaction_id=pg_current_xact_id()::text and backend_pid=pg_backend_pid())
  and not(tg_table_schema='public'and tg_table_name in('notifications','notification_recipients'))
  and not private.operational_wipe_write_allowed(tg_table_schema,tg_table_name,tg_op,before_row,after_row)then
  raise exception using errcode='42501',message='Operational execution may change only its exact native effect plan';end if;

 -- Notification hooks enforce only immutable retained dependency metadata.
 -- Existing receipt cores still create their own notices atomically.
 if tg_table_schema='public'and tg_table_name in('notifications','notification_recipients')then
  if private.system_wipe_row_paused(tg_table_schema,tg_table_name,before_row,after_row)then
   raise exception using errcode='55000',message='Reviewed delivery notification content is paused';end if;
  return case when tg_op='DELETE'then old else new end;
 end if;
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
$function$;


-- Withdrawal is independent of repairs, inspections and approval evidence.
create function private.wipe_withdrawal_guard()returns trigger language plpgsql set search_path=''as $$
begin
 if tg_op='DELETE'then
  if old.withdrawn_by_wipe_id is not null and not private.residence_execution_write_allowed(tg_table_schema,tg_table_name,tg_op,to_jsonb(old),'{}'::jsonb)then
   raise exception using errcode='42501',message='Withdrawn evidence requires reviewed retained-housing teardown';end if;return old;
 elsif tg_op='INSERT'then
  if new.withdrawn_by_wipe_id is not null then raise exception using errcode='42501',message='A new record cannot claim historical wipe withdrawal';end if;return new;
 end if;
 if old.withdrawn_by_wipe_id is not null then
  if to_jsonb(old)<>to_jsonb(new)then raise exception using errcode='42501',message='Withdrawn evidence is retained history';end if;return new;
 end if;
 if new.withdrawn_by_wipe_id is not null and not private.operational_wipe_write_allowed(tg_table_schema,tg_table_name,tg_op,to_jsonb(old),to_jsonb(new))then
  raise exception using errcode='42501',message='Only native reviewed execution may withdraw unfinished evidence';end if;return new;
end;$$;
do $$declare item text;schema_name text;table_name text;begin
 foreach item in array array['public.maintenance_issues','public.verification_cases','public.verification_inspections','public.seller_applications','private.manager_closure_requests']loop
  schema_name:=split_part(item,'.',1);table_name:=split_part(item,'.',2);
  execute format('create trigger aab_wipe_withdrawal_guard before insert or update or delete on %I.%I for each row execute function private.wipe_withdrawal_guard()',schema_name,table_name);
 end loop;
end;$$;
create trigger aa0_system_wipe_writer_lock before insert or update or delete on private.manager_closure_requests for each statement execute function private.system_wipe_writer_lock();
create trigger aab_system_wipe_write_guard before insert or update or delete on private.manager_closure_requests for each row execute function private.residence_freeze_write_guard();
create trigger zzz_system_wipe_write_guard after insert or update or delete on private.manager_closure_requests for each row execute function private.residence_freeze_write_guard();
-- Bindings can end while paused (e.g. sign-out), which invalidates original scope.
-- Inside admitted execution, deletion is restricted to its exact selected bindings.
create function private.wipe_binding_execution_guard()returns trigger language plpgsql set search_path=''as $$
begin
 if exists(select 1 from private.primary_wipe_executions where execution_kind='operational'and state='running'
  and transaction_id=pg_current_xact_id()::text and backend_pid=pg_backend_pid())then
  if tg_op<>'DELETE'or not private.operational_wipe_write_allowed(tg_table_schema,tg_table_name,tg_op,to_jsonb(old),'{}'::jsonb)then
   raise exception using errcode='42501',message='Only exact selected application bindings may end';end if;
 end if;return case when tg_op='DELETE'then old else new end;
end;$$;
create trigger aab_wipe_binding_execution_guard before insert or update or delete on private.account_sessions for each row execute function private.wipe_binding_execution_guard();

-- Withdrawal also prevents new workflow evidence on the retained record.
create function private.wipe_withdrawn_dependency_guard()returns trigger language plpgsql set search_path=''as $$
begin
 if tg_table_name in('maintenance_events','repair_reviews')then
  if exists(select 1 from public.maintenance_issues where id=new.issue_id and withdrawn_by_wipe_id is not null)then
   raise exception using errcode='42501',message='Withdrawn maintenance evidence cannot be extended';end if;
 elsif tg_table_name='media_assets'then
  if exists(select 1 from public.maintenance_issues where id=new.issue_id and withdrawn_by_wipe_id is not null)
   or exists(select 1 from public.verification_inspections i join public.verification_cases v on v.id=i.case_id
    where i.id=new.inspection_id and(i.withdrawn_by_wipe_id is not null or v.withdrawn_by_wipe_id is not null))then
   raise exception using errcode='42501',message='Withdrawn workflow cannot accept new uploads';end if;
 end if;return new;
end;$$;
revoke all on function private.wipe_withdrawn_dependency_guard()from public,anon,authenticated,pinevela_backend;
create trigger a_wipe_withdrawn_event before insert or update on public.maintenance_events for each row execute function private.wipe_withdrawn_dependency_guard();
create trigger a_wipe_withdrawn_review before insert or update on public.repair_reviews for each row execute function private.wipe_withdrawn_dependency_guard();
create trigger a_wipe_withdrawn_upload before insert on public.media_assets for each row execute function private.wipe_withdrawn_dependency_guard();

-- Preserve the existing private projection's columns, grants and row boundary.
do $$begin
 execute format('create or replace view private.seller_application_details with(security_barrier=true)as select projection.*,original.withdrawn_by_wipe_id from(%s)projection join public.seller_applications original on original.id=projection.id',
  rtrim(pg_get_viewdef('private.seller_application_details'::regclass,true),E';\n\r '));
end;$$;

create function private.run_operational_wipe(consent_id uuid)returns uuid language plpgsql set search_path=''as $$
declare e private.primary_wipe_executions;effect jsonb;assignments text;notice uuid;recipient uuid;
begin
 insert into private.primary_wipe_executions(authorization_id,execution_kind)values(consent_id,'operational')returning * into e;
 for effect in select value from jsonb_array_elements(e.effect_plan)loop
  if effect->>'schema'||'.'||(effect->>'table')not in('public.account_contexts','public.residences','public.stores','public.manager_assignments','public.allocations','public.staff_assignments',
   'public.meetings','public.staff_bargains','public.residence_change_requests','public.maintenance_issues','public.verification_cases','public.verification_inspections','public.seller_applications',
   'public.listings','public.store_subscriptions','private.manager_operation_keys','private.room_activation_keys','private.account_enrollments','private.manager_closure_requests','private.account_sessions')then
   raise exception using errcode='42501',message='Unsupported native effect target';end if;
  if effect->>'operation'='DELETE'then
   if effect->>'table'<>'account_sessions'or effect->>'schema'<>'private'then raise exception using errcode='42501',message='No operational/history deletion is authorized';end if;
   execute format('delete from %I.%I where %I::text=$1',effect->>'schema',effect->>'table',effect->>'key')using effect->>'id';
  else
   select string_agg(format('%I=expected.%I',key,key),',')into assignments from jsonb_object_keys(effect->'values')key;
   execute format('update %I.%I target set %s from jsonb_populate_record(null::%I.%I,$2)expected where target.%I::text=$1 and not(to_jsonb(target) @> $2)',
    effect->>'schema',effect->>'table',assignments,effect->>'schema',effect->>'table',effect->>'key')using effect->>'id',effect->'values';
  end if;
 end loop;
 insert into public.notifications(sender_context_id,category,title,message,link)values(e.founder_context_id,'account_status',
  'Operational portals closed after reviewed system wipe','Five administrators and the founder approved this exact operational closure. Your verified login and history remain. Closed portals, residences and stores are not reactivated. Use verified registration to continue.','/user/dashboard?tab=notifications')returning id into notice;
 insert into public.notification_recipients(notification_id,context_id)select notice,unnest(e.recipient_context_ids);
 for recipient in select unnest(e.recipient_context_ids)loop perform pg_notify('pinevela_notifications',recipient::text);end loop;
 insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id)
  values(e.founder_context_id,'operational_wipe_completed','primary_wipe_execution',e.id);
 update private.primary_wipe_executions set state='completed',notification_id=notice where id=e.id;
 update private.system_wipe_freezes set state='completed'where preparation_id=e.preparation_id;
 update private.system_wipe_preparations set state='completed'where id=e.preparation_id;
 update public.admin_proposals set status='executed'where id=e.proposal_id;
 return e.id;
end;$$;
revoke all on function private.operational_wipe_effect(text,text,text,jsonb,jsonb),private.operational_wipe_plan(private.primary_wipe_executions,jsonb),
 private.operational_wipe_write_allowed(text,text,text,jsonb,jsonb),private.operational_wipe_complete(private.primary_wipe_executions),private.wipe_withdrawal_guard(),
 private.wipe_binding_execution_guard(),private.run_operational_wipe(uuid)from public,anon,authenticated,pinevela_backend;

create or replace function private.system_wipe_preview(scopes jsonb) returns jsonb
language plpgsql stable set search_path='' as $$
declare scope_contexts uuid[]:='{}';scope_homes uuid[]:='{}';scope_stores uuid[]:='{}';scope_roots uuid[]:='{}';scope_blocks uuid[];scope_floors uuid[];scope_rooms uuid[];
 scope_listings uuid[];scope_orders uuid[];scope_cases uuid[];scope_issues uuid[];scope_payments uuid[];scope_subjects uuid[];size_before integer;resources jsonb:='{}';data jsonb:='{}';ids uuid[];entry record;enrollment_scope jsonb;retained jsonb:='{}';
begin
 if not coalesce(private.valid_system_wipe_scopes(scopes),false) then raise exception using errcode='22023',message='Valid distinct system wipe scopes required';end if;
 select coalesce(array_agg(c.id order by c.id),'{}') into scope_contexts from public.account_contexts c
 where c.kind<>'admin' and c.status<>'closed' and (scopes ? 'total' or scopes ? 'users' and c.kind='primary' or scopes ? 'managers' and c.kind='manager' or scopes ? 'residents' and c.kind='resident' or scopes ? 'markets' and c.kind='seller');
 if scopes ? 'total' or scopes ? 'hostels' then select coalesce(array_agg(id order by id),'{}') into scope_homes from public.residences where status<>'closed';end if;
 if scopes ? 'total' or scopes ? 'markets' then select coalesce(array_agg(id order by id),'{}') into scope_stores from public.stores where status<>'closed';end if;
 loop
  size_before:=cardinality(scope_contexts)+cardinality(scope_homes)+cardinality(scope_stores);
  select coalesce(array_agg(auth_user_id order by auth_user_id),'{}') into scope_roots from public.account_contexts where id=any(scope_contexts) and kind='primary';
  select coalesce(array_agg(distinct id order by id),'{}') into scope_homes from public.residences h where h.status<>'closed' and (h.id=any(scope_homes) or h.primary_owner_id=any(scope_roots)
   or exists(select 1 from public.manager_assignments a where a.residence_id=h.id and a.manager_context_id=any(scope_contexts) and a.ended_at is null));
  select coalesce(array_agg(distinct id order by id),'{}') into scope_stores from public.stores s where s.status<>'closed' and (s.id=any(scope_stores) or s.seller_context_id=any(scope_contexts) or s.primary_owner_id=any(scope_roots));
  select coalesce(array_agg(distinct c.id order by c.id),'{}') into scope_contexts from public.account_contexts c where c.kind<>'admin' and c.status<>'closed' and (
   c.id=any(scope_contexts) or c.primary_owner_id=any(scope_roots)
   or c.kind='seller' and exists(select 1 from public.stores s where s.id=any(scope_stores) and s.seller_context_id=c.id)
   or c.kind='staff' and exists(select 1 from public.staff_assignments a where a.staff_context_id=c.id and a.ended_at is null and (a.residence_id=any(scope_homes) or a.created_by_manager_id=any(scope_contexts)))
   or c.kind='resident' and exists(select 1 from public.allocations a join public.rooms r on r.id=a.room_id join public.floors f on f.id=r.floor_id join public.blocks b on b.id=f.block_id
     where a.resident_context_id=c.id and a.ended_at is null and b.residence_id=any(scope_homes)));
  exit when size_before=cardinality(scope_contexts)+cardinality(scope_homes)+cardinality(scope_stores);
 end loop;
 if cardinality(scope_contexts)+cardinality(scope_homes)+cardinality(scope_stores)>50000 then raise exception using errcode='54000',message='Scope requires an operator-reviewed bulk plan';end if;
 select coalesce(array_agg(id order by id),'{}') into scope_blocks from public.blocks where residence_id=any(scope_homes);
 select coalesce(array_agg(id order by id),'{}') into scope_floors from public.floors where block_id=any(scope_blocks);
 select coalesce(array_agg(distinct r.id order by r.id),'{}') into scope_rooms from public.rooms r where r.floor_id=any(scope_floors)
  or exists(select 1 from public.allocations a where a.room_id=r.id and a.resident_context_id=any(scope_contexts) and a.ended_at is null);
 select coalesce(array_agg(id order by id),'{}') into scope_listings from public.listings where store_id=any(scope_stores);
 select coalesce(array_agg(id order by id),'{}') into scope_orders from public.market_orders where store_id=any(scope_stores) or buyer_context_id=any(scope_contexts);
 select coalesce(array_agg(id order by id),'{}') into scope_cases from public.verification_cases where residence_id=any(scope_homes) or applicant_context_id=any(scope_contexts);
 select coalesce(array_agg(id order by id),'{}') into scope_issues from public.maintenance_issues where residence_id=any(scope_homes) or reporter_context_id=any(scope_contexts) or room_id=any(scope_rooms);
 select coalesce(array_agg(id order by id),'{}') into scope_payments from public.payments where residence_id=any(scope_homes) or store_id=any(scope_stores) or actor_context_id=any(scope_contexts);
 select coalesce(array_agg(distinct id order by id),'{}') into scope_subjects from public.profiles where id in(select auth_user_id from public.account_contexts where id=any(scope_contexts))
  or id in(select primary_owner_id from public.residences where id=any(scope_homes)) or id in(select primary_owner_id from public.stores where id=any(scope_stores));
 select coalesce(array_agg(id order by id),'{}') into ids from public.account_contexts where id=any(scope_contexts);
 resources:=resources||jsonb_build_object('account_contexts',to_jsonb(ids));data:=data||jsonb_build_object('account_contexts',private.system_wipe_row_digests('public.account_contexts'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from public.profiles where id=any(scope_subjects);
 resources:=resources||jsonb_build_object('profiles',to_jsonb(ids));data:=data||jsonb_build_object('profiles',private.system_wipe_row_digests('public.profiles'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from public.residences where id=any(scope_homes);
 resources:=resources||jsonb_build_object('residences',to_jsonb(ids));data:=data||jsonb_build_object('residences',private.system_wipe_row_digests('public.residences'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from public.manager_assignments where residence_id=any(scope_homes) or manager_context_id=any(scope_contexts);
 resources:=resources||jsonb_build_object('manager_assignments',to_jsonb(ids));data:=data||jsonb_build_object('manager_assignments',private.system_wipe_row_digests('public.manager_assignments'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from public.blocks where id=any(scope_blocks);
 resources:=resources||jsonb_build_object('blocks',to_jsonb(ids));data:=data||jsonb_build_object('blocks',private.system_wipe_row_digests('public.blocks'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from public.floors where id=any(scope_floors);
 resources:=resources||jsonb_build_object('floors',to_jsonb(ids));data:=data||jsonb_build_object('floors',private.system_wipe_row_digests('public.floors'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from public.rooms where id=any(scope_rooms);
 resources:=resources||jsonb_build_object('rooms',to_jsonb(ids));data:=data||jsonb_build_object('rooms',private.system_wipe_row_digests('public.rooms'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from public.beds where room_id=any(scope_rooms);
 resources:=resources||jsonb_build_object('beds',to_jsonb(ids));data:=data||jsonb_build_object('beds',private.system_wipe_row_digests('public.beds'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from public.allocations where room_id=any(scope_rooms) or resident_context_id=any(scope_contexts);
 resources:=resources||jsonb_build_object('allocations',to_jsonb(ids));data:=data||jsonb_build_object('allocations',private.system_wipe_row_digests('public.allocations'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from public.staff_assignments where residence_id=any(scope_homes) or staff_context_id=any(scope_contexts) or created_by_manager_id=any(scope_contexts);
 resources:=resources||jsonb_build_object('staff_assignments',to_jsonb(ids));data:=data||jsonb_build_object('staff_assignments',private.system_wipe_row_digests('public.staff_assignments'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from public.verification_cases where id=any(scope_cases);
 resources:=resources||jsonb_build_object('verification_cases',to_jsonb(ids));data:=data||jsonb_build_object('verification_cases',private.system_wipe_row_digests('public.verification_cases'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from public.verification_inspections where case_id=any(scope_cases);
 resources:=resources||jsonb_build_object('verification_inspections',to_jsonb(ids));data:=data||jsonb_build_object('verification_inspections',private.system_wipe_row_digests('public.verification_inspections'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from public.residence_change_requests where residence_id=any(scope_homes) or manager_context_id=any(scope_contexts);
 resources:=resources||jsonb_build_object('residence_change_requests',to_jsonb(ids));data:=data||jsonb_build_object('residence_change_requests',private.system_wipe_row_digests('public.residence_change_requests'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from public.maintenance_issues where id=any(scope_issues);
 resources:=resources||jsonb_build_object('maintenance_issues',to_jsonb(ids));data:=data||jsonb_build_object('maintenance_issues',private.system_wipe_row_digests('public.maintenance_issues'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from public.maintenance_events where issue_id=any(scope_issues);
 resources:=resources||jsonb_build_object('maintenance_events',to_jsonb(ids));data:=data||jsonb_build_object('maintenance_events',private.system_wipe_row_digests('public.maintenance_events'::regclass,ids));
 select coalesce(array_agg(issue_id order by issue_id),'{}') into ids from public.repair_reviews where issue_id=any(scope_issues);
 resources:=resources||jsonb_build_object('repair_reviews',to_jsonb(ids));data:=data||jsonb_build_object('repair_reviews',private.system_wipe_row_digests('public.repair_reviews'::regclass,ids,'issue_id'));
 select coalesce(array_agg(id order by id),'{}') into ids from public.staff_reviews where resident_context_id=any(scope_contexts) or allocation_id in(select id from public.allocations where room_id=any(scope_rooms)) or staff_assignment_id in(select id from public.staff_assignments where residence_id=any(scope_homes) or staff_context_id=any(scope_contexts));
 resources:=resources||jsonb_build_object('staff_reviews',to_jsonb(ids));data:=data||jsonb_build_object('staff_reviews',private.system_wipe_row_digests('public.staff_reviews'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from public.meetings where residence_id=any(scope_homes) or participant_context_id=any(scope_contexts)
  or requested_by_context_id=any(scope_contexts) or manager_context_id=any(scope_contexts)
  or allocation_id in(select id from public.allocations where resident_context_id=any(scope_contexts) or room_id=any(scope_rooms))
  or staff_assignment_id in(select id from public.staff_assignments where residence_id=any(scope_homes) or staff_context_id=any(scope_contexts) or created_by_manager_id=any(scope_contexts));
 resources:=resources||jsonb_build_object('meetings',to_jsonb(ids));data:=data||jsonb_build_object('meetings',private.system_wipe_row_digests('public.meetings'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from public.staff_bargains where manager_context_id=any(scope_contexts) or staff_assignment_id in(select id from public.staff_assignments where residence_id=any(scope_homes) or staff_context_id=any(scope_contexts) or created_by_manager_id=any(scope_contexts));
 resources:=resources||jsonb_build_object('staff_bargains',to_jsonb(ids));data:=data||jsonb_build_object('staff_bargains',private.system_wipe_row_digests('public.staff_bargains'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from public.seller_applications where seller_context_id=any(scope_contexts);
 resources:=resources||jsonb_build_object('seller_applications',to_jsonb(ids));data:=data||jsonb_build_object('seller_applications',private.system_wipe_row_digests('public.seller_applications'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from public.stores where id=any(scope_stores);
 resources:=resources||jsonb_build_object('stores',to_jsonb(ids));data:=data||jsonb_build_object('stores',private.system_wipe_row_digests('public.stores'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from public.listings where id=any(scope_listings);
 resources:=resources||jsonb_build_object('listings',to_jsonb(ids));data:=data||jsonb_build_object('listings',private.system_wipe_row_digests('public.listings'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from public.listing_media where listing_id=any(scope_listings);
 resources:=resources||jsonb_build_object('listing_media',to_jsonb(ids));data:=data||jsonb_build_object('listing_media',private.system_wipe_row_digests('public.listing_media'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from public.listing_price_options where listing_id=any(scope_listings);
 resources:=resources||jsonb_build_object('listing_price_options',to_jsonb(ids));data:=data||jsonb_build_object('listing_price_options',private.system_wipe_row_digests('public.listing_price_options'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from public.market_orders where id=any(scope_orders);
 resources:=resources||jsonb_build_object('market_orders',to_jsonb(ids));data:=data||jsonb_build_object('market_orders',private.system_wipe_row_digests('public.market_orders'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from public.market_messages where store_id=any(scope_stores) or buyer_context_id=any(scope_contexts);
 resources:=resources||jsonb_build_object('market_messages',to_jsonb(ids));data:=data||jsonb_build_object('market_messages',private.system_wipe_row_digests('public.market_messages'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from public.market_reviews where order_id=any(scope_orders);
 resources:=resources||jsonb_build_object('market_reviews',to_jsonb(ids));data:=data||jsonb_build_object('market_reviews',private.system_wipe_row_digests('public.market_reviews'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from public.payments where id=any(scope_payments);
 resources:=resources||jsonb_build_object('payments',to_jsonb(ids));data:=data||jsonb_build_object('payments',private.system_wipe_row_digests('public.payments'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from public.store_subscriptions where store_id=any(scope_stores);
 resources:=resources||jsonb_build_object('store_subscriptions',to_jsonb(ids));data:=data||jsonb_build_object('store_subscriptions',private.system_wipe_row_digests('public.store_subscriptions'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from public.store_fee_periods where store_id=any(scope_stores);
 resources:=resources||jsonb_build_object('store_fee_periods',to_jsonb(ids));data:=data||jsonb_build_object('store_fee_periods',private.system_wipe_row_digests('public.store_fee_periods'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from public.media_assets where owner_context_id=any(scope_contexts) or residence_id=any(scope_homes) or issue_id=any(scope_issues) or allocation_id in(select id from public.allocations where room_id=any(scope_rooms) or resident_context_id=any(scope_contexts)) or inspection_id in(select id from public.verification_inspections where case_id=any(scope_cases))
  or '/api/media/'||id::text in(select cover_path from public.residences where id=any(scope_homes)
   union select unnest(gallery_paths) from public.residences where id=any(scope_homes)
   union select logo_path from public.stores where id=any(scope_stores)
   union select cover_path from public.stores where id=any(scope_stores)
   union select avatar_path from public.profiles where id=any(scope_subjects)
   union select image_path from public.listing_price_options where listing_id=any(scope_listings));
 resources:=resources||jsonb_build_object('media_assets',to_jsonb(ids));data:=data||jsonb_build_object('media_assets',private.system_wipe_row_digests('public.media_assets'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from private.room_activation_keys where room_id=any(scope_rooms);
 resources:=resources||jsonb_build_object('room_activation_keys',to_jsonb(ids));data:=data||jsonb_build_object('room_activation_keys',private.system_wipe_row_digests('private.room_activation_keys'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from private.residence_room_key_cycles where residence_id=any(scope_homes);
 resources:=resources||jsonb_build_object('residence_room_key_cycles',to_jsonb(ids));data:=data||jsonb_build_object('residence_room_key_cycles',private.system_wipe_row_digests('private.residence_room_key_cycles'::regclass,ids));

 select coalesce(array_agg(id order by id),'{}')into ids from private.manager_closure_requests where manager_context_id=any(scope_contexts);
 retained:=retained||jsonb_build_object('manager_closure_requests',to_jsonb(ids));
 data:=data||jsonb_build_object('manager_closure_requests',private.system_wipe_row_digests('private.manager_closure_requests'::regclass,ids));
 -- Session tokens and credential hashes never enter a preview.
 data:=data||jsonb_build_object('account_bindings',(select coalesce(jsonb_agg(jsonb_build_object('contextId',active_context_id,'digest',encode(sha256(convert_to(to_jsonb(binding)::text,'UTF8')),'hex')) order by session_id),'[]') from private.account_sessions binding where active_context_id=any(scope_contexts)));
 data:=data||jsonb_build_object('manager_keys',(select coalesce(jsonb_agg(jsonb_build_object('contextId',manager_context_id,'version',version,'issued',issued_at)order by manager_context_id),'[]') from private.manager_operation_keys where manager_context_id=any(scope_contexts)));
 enrollment_scope:=jsonb_build_object('scopes',scopes,'resources',resources,'accounts',
  (select coalesce(jsonb_agg(jsonb_build_object('kind',kind,'authUserId',auth_user_id)),'[]') from public.account_contexts where id=any(scope_contexts)));
 select coalesce(array_agg(id order by id),'{}') into ids from private.account_enrollments e
  where e.status in('pending_email','pending_review') and private.system_wipe_enrollment_selected(e,enrollment_scope);
 resources:=resources||jsonb_build_object('account_enrollments',to_jsonb(ids));
 data:=data||jsonb_build_object('pending_enrollments',(select coalesce(jsonb_agg(jsonb_build_object(
  'id',id,'kind',kind,'status',status,'contextId',linked_context_id,'roomId',room_id,'residenceId',residence_id,'expires',expires_at,
  'digest',encode(sha256(convert_to(to_jsonb(e)::text,'UTF8')),'hex'))order by id),'[]')
  from private.account_enrollments e where private.system_wipe_enrollment_selected(e,enrollment_scope)));
 select coalesce(array_agg(id order by id),'{}') into ids from private.room_key_deliveries
  where actor_context_id=any(scope_contexts) or recipient_context_id=any(scope_contexts) or residence_id=any(scope_homes) or room_id=any(scope_rooms);
 retained:=retained||jsonb_build_object('room_key_deliveries',to_jsonb(ids));
 data:=data||jsonb_build_object('room_key_deliveries',private.system_wipe_row_digests('private.room_key_deliveries'::regclass,ids));
 select coalesce(array_agg(notification_id order by notification_id),'{}') into ids from private.room_key_deliveries where id=any(ids);
 retained:=retained||jsonb_build_object('room_key_delivery_notifications',to_jsonb(ids));
 data:=data||jsonb_build_object('room_key_delivery_notifications',private.system_wipe_row_digests('public.notifications'::regclass,ids));
 data:=data||jsonb_build_object('room_key_delivery_recipients',(select coalesce(jsonb_agg(jsonb_build_object(
  'notificationId',notification_id,'contextId',context_id,'digest',encode(sha256(convert_to(
  jsonb_build_object('notification_id',notification_id,'context_id',context_id)::text,'UTF8')),'hex'))order by notification_id,context_id),'[]')
  from public.notification_recipients where notification_id=any(ids)));

 data:=data||jsonb_build_object('payment_checkouts',(select coalesce(jsonb_agg(jsonb_build_object('paymentId',payment_id,'digest',encode(sha256(convert_to(to_jsonb(e)::text,'UTF8')),'hex')) order by payment_id),'[]') from private.payment_checkouts e where payment_id=any(scope_payments)));
 if(select sum(jsonb_array_length(value))from jsonb_each(data))>50000 then raise exception using errcode='54000',message='Scope requires an operator-reviewed bulk plan';end if;
 return jsonb_build_object('version',1,'resourceRevision',(select revision from private.residence_review_state where singleton),'scopes',scopes,'resources',resources,'retainedDependencies',retained,'rowDigests',data,'roster',private.recovery_roster(),
  'accounts',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'kind',c.kind,'name',p.display_name,'status',c.status,'authUserId',c.auth_user_id,'effect','close-portal')order by c.kind,c.id),'[]') from public.account_contexts c join public.profiles p on p.id=c.auth_user_id where c.id=any(scope_contexts)),
  'residences',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'status',status,'effect','withdraw-and-retain-history')order by id),'[]') from public.residences where id=any(scope_homes)),
  'stores',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'status',status,'effect','close-and-retain-history')order by id),'[]') from public.stores where id=any(scope_stores)),
  'counts',(select jsonb_object_agg(key,jsonb_array_length(value)) from jsonb_each(data)),
  'retention',jsonb_build_object('authIdentities',true,'accountHistory',true,'administrators',true,'governance',true,'payments',true,'notifications',true,'storageBytes',true,'platformSettings',true),
  'obligations',jsonb_build_object('openOrders',(select count(*) from public.market_orders where id=any(scope_orders) and status in('awaiting_seller','pending_meetup')),
    'unsettledPayments',(select count(*) from public.payments where id=any(scope_payments) and status in('initialized','pending')),
    'pausedResidenceReviews',(select count(*) from private.residence_deletion_preparations f join public.admin_proposals p on p.id=f.proposal_id where f.state='frozen' and exists(select 1 from jsonb_array_elements_text(p.preview#>'{resources,residences}') item where item::uuid=any(scope_homes)))),
  'executionAvailable',false);
end;
$$;

create trigger wipe_review_domain_changed after insert or update or delete on private.manager_closure_requests for each row execute function private.residence_review_changed();

CREATE OR REPLACE VIEW private.housing_issue_details WITH (security_barrier=true) AS SELECT projection.*, original.withdrawn_by_wipe_id FROM (SELECT id,
    residence_id,
    room_id,
    reporter_context_id,
    assigned_staff_id,
    title,
    details,
    category,
    urgency,
    photo_paths,
    status,
    created_at,
    updated_at,
    closed_at,
    residence_name,
    room_number,
    block_name,
    reporter_name,
    staff_name,
    allocation_id,
    location_tag,
    visit_window,
    contact_phone,
    contact_method,
    deadline,
    timeframe,
    assigned_at,
    accepted_at,
    declined_at,
    decline_reason,
    reschedule_previous_status,
    requested_deadline,
    requested_timeframe,
    reschedule_reason,
    completion_notes,
    completion_paths,
    completed_at,
    confirmed_at,
    resident_feedback,
    manager_close_notes,
    staff_context_id,
    staff_email,
    staff_phone,
    history_logs,
    repair_rating
   FROM ( SELECT projection_1.id,
            projection_1.residence_id,
            projection_1.room_id,
            projection_1.reporter_context_id,
            projection_1.assigned_staff_id,
            projection_1.title,
            projection_1.details,
            projection_1.category,
            projection_1.urgency,
            projection_1.photo_paths,
            projection_1.status,
            projection_1.created_at,
            projection_1.updated_at,
            projection_1.closed_at,
            projection_1.residence_name,
            projection_1.room_number,
            projection_1.block_name,
            projection_1.reporter_name,
            projection_1.staff_name,
            projection_1.allocation_id,
            projection_1.location_tag,
            projection_1.visit_window,
            projection_1.contact_phone,
            projection_1.contact_method,
            projection_1.deadline,
            projection_1.timeframe,
            projection_1.assigned_at,
            projection_1.accepted_at,
            projection_1.declined_at,
            projection_1.decline_reason,
            projection_1.reschedule_previous_status,
            projection_1.requested_deadline,
            projection_1.requested_timeframe,
            projection_1.reschedule_reason,
            projection_1.completion_notes,
            projection_1.completion_paths,
            projection_1.completed_at,
            projection_1.confirmed_at,
            projection_1.resident_feedback,
            projection_1.manager_close_notes,
            projection_1.staff_context_id,
            projection_1.staff_email,
            projection_1.staff_phone,
            projection_1.history_logs,
            projection_1.repair_rating
           FROM ( SELECT i.id,
                    i.residence_id,
                    i.room_id,
                    i.reporter_context_id,
                    i.assigned_staff_id,
                    i.title,
                    i.details,
                    i.category,
                    i.urgency,
                    i.photo_paths,
                    i.status,
                    i.created_at,
                    i.updated_at,
                    i.closed_at,
                    h.name AS residence_name,
                    r.room_number,
                    b.name AS block_name,
                    p.display_name AS reporter_name,
                    sp.display_name AS staff_name,
                    i.allocation_id,
                    i.location_tag,
                    i.visit_window,
                    i.contact_phone,
                    i.contact_method,
                    i.deadline,
                    i.timeframe,
                    i.assigned_at,
                    i.accepted_at,
                    i.declined_at,
                    i.decline_reason,
                    i.reschedule_previous_status,
                    i.requested_deadline,
                    i.requested_timeframe,
                    i.reschedule_reason,
                    i.completion_notes,
                    i.completion_paths,
                    i.completed_at,
                    i.confirmed_at,
                    i.resident_feedback,
                    i.manager_close_notes,
                    s.staff_context_id,
                    sp.email AS staff_email,
                    sp.phone AS staff_phone,
                    ( SELECT jsonb_agg(jsonb_build_object('action', e.event_type, 'actorId', e.actor_context_id, 'timestamp', e.occurred_at, 'note', e.notes, 'photos', e.photo_paths) ORDER BY e.occurred_at, e.id) AS jsonb_agg
                           FROM maintenance_events e
                          WHERE (e.issue_id = i.id)) AS history_logs,
                    ( SELECT rr.rating
                           FROM repair_reviews rr
                          WHERE (rr.issue_id = i.id)) AS repair_rating
                   FROM (((((((((maintenance_issues i
                     JOIN residences h ON ((h.id = i.residence_id)))
                     JOIN account_contexts c ON ((c.id = i.reporter_context_id)))
                     JOIN profiles p ON ((p.id = c.auth_user_id)))
                     LEFT JOIN rooms r ON ((r.id = i.room_id)))
                     LEFT JOIN floors f ON ((f.id = r.floor_id)))
                     LEFT JOIN blocks b ON ((b.id = f.block_id)))
                     LEFT JOIN staff_assignments s ON ((s.id = i.assigned_staff_id)))
                     LEFT JOIN account_contexts sc ON ((sc.id = s.staff_context_id)))
                     LEFT JOIN profiles sp ON ((sp.id = sc.auth_user_id)))
                  WHERE ((private.current_context_id() IS NOT NULL) AND ((i.reporter_context_id = private.current_context_id()) OR private.can_manage_residence(i.residence_id) OR ((s.staff_context_id = private.current_context_id()) AND (s.status = 'active'::text) AND (s.ended_at IS NULL))))) projection_1
          WHERE private.platform_access_allowed()) projection
  WHERE private.platform_access_allowed())projection JOIN public.maintenance_issues original ON original.id=projection.id;
