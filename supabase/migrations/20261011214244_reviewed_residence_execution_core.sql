-- Native reviewed housing worker. The HTTP execution entry remains disabled.
-- Every admission must finish in its originating transaction; no GUC bypass.
select pg_advisory_xact_lock(hashtextextended('residence-deletion-freeze',0));
select pg_advisory_xact_lock(hashtextextended('platform-settings',0));
create table private.residence_executions (
 id uuid primary key default gen_random_uuid(),
 authorization_id uuid not null unique references private.residence_execution_authorizations(id),
 preparation_id uuid not null unique references private.residence_deletion_preparations(id),
 proposal_id uuid not null unique references public.admin_proposals(id),
 founder_context_id uuid not null references public.admin_memberships(context_id),
 transaction_id text not null,
 backend_pid integer not null,
 resources jsonb not null,
 accounts jsonb not null,
 primary_owners jsonb not null,
 creator_context_id uuid not null references public.account_contexts(id),
 hostel_name text not null,
 delete_manager boolean not null,
 cooldown jsonb,
 state text not null default 'running' check(state in('running','completed')),
 started_at timestamptz not null,
 completed_at timestamptz,
 check((state='completed')=(completed_at is not null))
);
alter table private.residence_executions enable row level security;
revoke all on private.residence_executions from public,anon,authenticated,pinevela_backend;
create table private.residence_storage_cleanup_tasks (
 execution_id uuid not null references private.residence_executions(id),
 asset_id uuid not null unique references public.media_assets(id),
 candidate jsonb not null,
 state text not null default 'pending' check(state='pending'),
 created_at timestamptz not null default clock_timestamp(),
 primary key(execution_id,asset_id)
);
alter table private.residence_storage_cleanup_tasks enable row level security;
revoke all on private.residence_storage_cleanup_tasks from public,anon,authenticated,pinevela_backend;

-- During removal the preview/catalog legitimately changes. Recheck the saved
-- unexpired founder identity/key/session; original scope admission is immutable.
create function private.residence_execution_actor_current(e private.residence_executions) returns boolean
language sql stable set search_path='' as $$
 select coalesce(current_setting('transaction_isolation')='read committed'
  and current_setting('role')='none' and e.transaction_id=pg_current_xact_id()::text and e.backend_pid=pg_backend_pid()
  and e.founder_context_id=private.approval_authorized_context()
  and exists(select 1 from private.residence_execution_authorizations a
   where a.id=e.authorization_id and a.preparation_id=e.preparation_id and a.founder_context_id=e.founder_context_id
    and a.auth_user_id=auth.uid() and a.session_id::text=auth.jwt()->>'session_id'
    and a.approval_key_version::text=current_setting('pinevela.approval_key_version',true)
    and a.created_at<=e.started_at and a.expires_at>clock_timestamp()
    and exists(select 1 from public.admin_memberships m where m.context_id=e.founder_context_id and m.slot=1 and m.status='active')
    and private.account_session_allowed(e.founder_context_id,a.session_id)
    and private.administrator_session_allowed(e.founder_context_id,a.session_id)),false);
$$;
create function private.residence_execution_write_allowed(schema_name text,table_name text,operation text,before_row jsonb,after_row jsonb,preparation uuid default null) returns boolean
language plpgsql stable set search_path='' as $$
declare e private.residence_executions;row_id text;effect jsonb;ban jsonb;
begin
 select * into e from private.residence_executions where state='running' and transaction_id=pg_current_xact_id()::text
  and backend_pid=pg_backend_pid();
 if e.id is null or not private.residence_execution_actor_current(e) or preparation is not null and preparation<>e.preparation_id then return false;end if;
 row_id:=coalesce(before_row->>'id',before_row->>'issue_id');
 if operation='DELETE' and (
  schema_name='public' and table_name=any(array['residences','manager_assignments','blocks','floors','rooms','beds','allocations',
   'staff_assignments','verification_cases','verification_inspections','residence_change_requests','maintenance_issues',
   'maintenance_events','repair_reviews','staff_reviews','meetings','staff_bargains'])
  or schema_name='private' and table_name='room_activation_keys') then
  return coalesce(e.resources->table_name ? row_id,false);
 elsif operation='UPDATE' and schema_name='public' and table_name='account_contexts' then
  select a into effect from jsonb_array_elements(e.accounts) a where a->>'id'=row_id and a->>'effect'<>'retain-sign-in';
  return effect is not null and effect->>'role' in('manager','resident','staff') and before_row->>'kind'=effect->>'role'
   and after_row->>'status'='closed' and before_row-array['status','updated_at']=after_row-array['status','updated_at'];
 elsif operation='UPDATE' and schema_name='private' and table_name='account_enrollments' then
  return coalesce(e.resources->table_name ? row_id,false) and before_row->>'status' in('pending_email','pending_review')
   and after_row->>'status'='cancelled' and before_row-'status'=after_row-'status';
 elsif operation='UPDATE' and schema_name='public' and table_name='media_assets' then
  return before_row->>'state'='ready' and after_row->>'state'='removing' and before_row-'state'=after_row-'state'
   and exists(select 1 from private.residence_storage_cleanup_tasks t where t.execution_id=e.id and t.asset_id::text=row_id);
 elsif operation='INSERT' and schema_name='public' and table_name='registration_bans' then
  ban:=e.cooldown;
  return ban is not null and after_row->>'account_context_id'=ban->>'target' and after_row->>'kind'=ban->>'kind'
   and (after_row->>'until_at')::timestamptz=(ban->>'until')::timestamptz
   and after_row->>'imposed_by_context_id'=e.founder_context_id::text and after_row->>'proposal_id'=e.proposal_id::text
   and (after_row->>'created_at')::timestamptz=e.started_at
   and after_row->>'reason'=(select reason from public.admin_proposals where id=e.proposal_id);
 end if;
 return false;
end;
$$;
create function private.residence_execution_guard() returns trigger
language plpgsql set search_path='' as $$
declare a private.residence_execution_authorizations;f private.residence_deletion_preparations;p public.admin_proposals;
 r private.residence_recovery_evidence;creator uuid;manager uuid;duration numeric;entry text;schema_name text;table_name text;remaining boolean;
begin
 if tg_op in('DELETE','TRUNCATE') then raise exception using errcode='42501',message='Residence execution history is immutable';end if;
 if current_setting('transaction_isolation')<>'read committed' or current_setting('role')<>'none' then
  raise exception using errcode='42501',message='Residence execution requires a trusted READ COMMITTED transaction';end if;
 perform pg_advisory_xact_lock(hashtextextended('residence-deletion-freeze',0));
 perform pg_advisory_xact_lock(hashtextextended('platform-settings',0));
 if tg_op='INSERT' then
  -- The worker understands only this reviewed operational graph. A new child
  -- relation must be reviewed explicitly instead of silently cascading through it.
  lock table public.residences,public.manager_assignments,public.blocks,public.floors,public.rooms,public.beds,
   public.allocations,public.staff_assignments,public.verification_cases,public.verification_inspections,
   public.residence_change_requests,public.maintenance_issues,public.maintenance_events,public.repair_reviews,
   public.staff_reviews,public.meetings,public.staff_bargains,private.room_activation_keys in share row exclusive mode;
  if exists(select 1 from pg_catalog.pg_constraint k where k.contype='f'
   and k.confrelid=any(array['public.residences'::regclass,'public.manager_assignments'::regclass,'public.blocks'::regclass,
    'public.floors'::regclass,'public.rooms'::regclass,'public.beds'::regclass,'public.allocations'::regclass,
    'public.staff_assignments'::regclass,'public.verification_cases'::regclass,'public.verification_inspections'::regclass,
    'public.residence_change_requests'::regclass,'public.maintenance_issues'::regclass,'public.maintenance_events'::regclass,
    'public.repair_reviews'::regclass,'public.staff_reviews'::regclass,'public.meetings'::regclass,'public.staff_bargains'::regclass])
   and not k.conrelid=any(array['public.residences'::regclass,'public.manager_assignments'::regclass,'public.blocks'::regclass,
    'public.floors'::regclass,'public.rooms'::regclass,'public.beds'::regclass,'public.allocations'::regclass,
    'public.staff_assignments'::regclass,'public.verification_cases'::regclass,'public.verification_inspections'::regclass,
    'public.residence_change_requests'::regclass,'public.maintenance_issues'::regclass,'public.maintenance_events'::regclass,
    'public.repair_reviews'::regclass,'public.staff_reviews'::regclass,'public.meetings'::regclass,'public.staff_bargains'::regclass,
    'private.room_activation_keys'::regclass])) then
   raise exception using errcode='42501',message='Unreviewed operational foreign keys block residence execution';end if;
  select * into a from private.residence_execution_authorizations where id=new.authorization_id for share;
  select * into f from private.residence_deletion_preparations where id=a.preparation_id for update;
  select * into p from public.admin_proposals where id=f.proposal_id for update;
  select * into r from private.residence_recovery_evidence where preparation_id=f.id;
  if a.id is null or not private.residence_execution_authorization_current(a)
   or a.founder_context_id is distinct from private.approval_authorized_context()
   or a.auth_user_id is distinct from auth.uid() or a.session_id::text is distinct from auth.jwt()->>'session_id'
   or a.approval_key_version::text is distinct from current_setting('pinevela.approval_key_version',true)
   or p.preview->>'version' is distinct from '3'
   or current_setting('pinevela.residence_execution_confirmation',true) is distinct from 'DELETE APPROVED HOSTEL'
   or current_setting('pinevela.residence_execution_recovery_checked',true) is distinct from (to_jsonb(r)-'verified_at')::text
   or new.state is distinct from 'running' or new.completed_at is not null then
   raise exception using errcode='42501',message='Current own-key founder consent and freshly verified exact recovery archives are required';end if;
  select root.id into creator from public.residences h join public.account_contexts root
   on root.auth_user_id=h.primary_owner_id and root.kind='primary' where h.id=p.target_residence_id;
  if creator is null then raise exception using errcode='42501',message='The saved residence creator must exist';end if;
  new.preparation_id:=f.id;new.proposal_id:=p.id;new.founder_context_id:=a.founder_context_id;
  new.transaction_id:=pg_current_xact_id()::text;new.backend_pid:=pg_backend_pid();
  new.resources:=p.preview->'resources';new.accounts:=p.preview->'accounts';new.primary_owners:=p.preview->'primaryOwners';
  new.creator_context_id:=creator;new.hostel_name:=p.preview->>'hostelName';
  new.delete_manager:=(p.preview#>>'{options,deleteManager}')::boolean;
  new.started_at:=clock_timestamp();new.cooldown:=null;
  duration:=(p.preview#>>'{options,ban,amount}')::numeric*(case p.preview#>>'{options,ban,unit}'
   when 'hours' then 3600 when 'days' then 86400 when 'weeks' then 604800 when 'months' then 2592000 when 'years' then 31536000 end);
  if duration>0 then
   select (x->>'id')::uuid into manager from jsonb_array_elements(new.accounts) x where x->>'role'='manager';
   if manager is null or (select count(*) from jsonb_array_elements(new.accounts) x where x->>'role'='manager')<>1 then
    raise exception using errcode='42501',message='Cooldown requires the exact saved manager';end if;
   new.cooldown:=jsonb_build_object('target',case when new.delete_manager then creator else manager end,
    'kind',case when new.delete_manager then 'manager_account' else 'residence' end,
    'until',new.started_at+duration*interval '1 second');
  end if;
 else
  if old.state<>'running' or new.state is distinct from 'completed' or not private.residence_execution_actor_current(old)
   or to_jsonb(new)-array['state','completed_at'] is distinct from to_jsonb(old)-array['state','completed_at'] then
   raise exception using errcode='42501',message='Only the originating current founder transaction can finish execution';end if;
  foreach entry in array array['public.residences','public.manager_assignments','public.blocks','public.floors','public.rooms','public.beds',
   'public.allocations','public.staff_assignments','public.verification_cases','public.verification_inspections','public.residence_change_requests',
   'public.maintenance_issues','public.maintenance_events','public.repair_reviews','public.staff_reviews','public.meetings','public.staff_bargains','private.room_activation_keys'] loop
   schema_name:=split_part(entry,'.',1);table_name:=split_part(entry,'.',2);
   execute format('select exists(select 1 from %I.%I t where $1 ? coalesce(to_jsonb(t)->>''id'',to_jsonb(t)->>''issue_id'',''''))',schema_name,table_name)
    into remaining using old.resources->table_name;
   if remaining then raise exception using errcode='42501',message='Every reviewed operational housing row must be removed atomically';end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(old.accounts) x join public.account_contexts c on c.id=(x->>'id')::uuid
    where x->>'effect'<>'retain-sign-in' and (c.status<>'closed' or exists(select 1 from private.account_sessions s where s.active_context_id=c.id)))
   or exists(select 1 from private.account_enrollments t where old.resources->'account_enrollments' ? t.id::text and t.status in('pending_email','pending_review'))
   or old.cooldown is not null and (select count(*) from public.registration_bans b where b.proposal_id=old.proposal_id
    and b.account_context_id=(old.cooldown->>'target')::uuid and b.kind=old.cooldown->>'kind' and b.until_at=(old.cooldown->>'until')::timestamptz)<>1
   or old.cooldown is null and exists(select 1 from public.registration_bans where proposal_id=old.proposal_id) then
   raise exception using errcode='42501',message='Exact portal revocation, enrollment closure and reviewed cooldown are required';end if;
  if (select count(*) from private.residence_storage_cleanup_tasks where execution_id=old.id)<>
    (select (plan->>'removeCount')::integer from private.residence_cleanup_plans where preparation_id=old.preparation_id)
   or exists(select 1 from private.residence_storage_cleanup_tasks t join public.media_assets m on m.id=t.asset_id where t.execution_id=old.id and m.state<>'removing') then
   raise exception using errcode='42501',message='Every approved exclusive image must have a durable cleanup task';end if;
  new.completed_at:=clock_timestamp();
 end if;return new;
end;
$$;
create trigger residence_execution_guard before insert or update or delete on private.residence_executions
 for each row execute function private.residence_execution_guard();
create trigger residence_execution_truncate_guard before truncate on private.residence_executions
 for each statement execute function private.residence_execution_guard();
create function private.residence_execution_commit_guard() returns trigger
language plpgsql set search_path='' as $$
begin
 if not exists(select 1 from private.residence_executions where id=new.id and state='completed') then
  raise exception using errcode='42501',message='Unfinished housing admission cannot commit';end if;return null;
end;
$$;
create constraint trigger residence_execution_commit_guard after insert or update on private.residence_executions
 deferrable initially deferred for each row execute function private.residence_execution_commit_guard();
create function private.residence_cleanup_task_guard() returns trigger
language plpgsql set search_path='' as $$
declare e private.residence_executions;candidate jsonb;m public.media_assets;
begin
 if tg_op<>'INSERT' then raise exception using errcode='42501',message='Approved cleanup tasks cannot be rewritten or erased';end if;
 select * into e from private.residence_executions where id=new.execution_id and state='running';
 select x into candidate from private.residence_cleanup_plans q,lateral jsonb_array_elements(q.plan->'items') x
  where q.preparation_id=e.preparation_id and x->>'assetId'=new.asset_id::text and x->>'decision'='remove';
 select * into m from public.media_assets where id=new.asset_id for update;
 if e.id is null or not private.residence_execution_actor_current(e) or candidate is null or new.candidate is distinct from candidate
  or new.state is distinct from 'pending' or m.state<>'ready' or candidate->>'path' is distinct from m.object_path
  or candidate->>'sha256' is distinct from m.sha256 or (candidate->>'bytes')::bigint is distinct from m.byte_size
  or candidate->>'ownerContextId' is distinct from m.owner_context_id::text then
  raise exception using errcode='42501',message='Only exact approved exclusive housing bytes may enter the cleanup queue';end if;
 new.created_at:=clock_timestamp();return new;
end;
$$;
create trigger residence_cleanup_task_guard before insert or update or delete on private.residence_storage_cleanup_tasks
 for each row execute function private.residence_cleanup_task_guard();
create trigger residence_cleanup_task_truncate_guard before truncate on private.residence_storage_cleanup_tasks
 for each statement execute function private.residence_cleanup_task_guard();

-- Freeze exemptions are per originating transaction, exact row and operation.
-- Unrelated profiles, portals, marketplace and retained data are never exempted.
create or replace function private.residence_freeze_write_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare before_row jsonb:='{}';after_row jsonb:='{}';item record;fields record;scope jsonb;ids jsonb;table_ids jsonb;
begin
 if tg_op<>'INSERT' then before_row:=to_jsonb(old);end if;
 if tg_op<>'DELETE' then after_row:=to_jsonb(new);end if;
 if tg_op='UPDATE' and before_row=after_row then return new;end if;
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
-- Always block TRUNCATE. Ordinary non-execution source behavior stays as in 46–47.
create or replace function private.residence_history_identity_guard() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='TRUNCATE' or tg_op='DELETE' and not private.residence_execution_write_allowed(tg_table_schema,tg_table_name,tg_op,to_jsonb(old),'{}') then
  raise exception using errcode='42501',message='Exact reviewed native residence execution is required';end if;
 if tg_op='DELETE' then return old;end if;
 if tg_op='UPDATE' and new.id is distinct from old.id then raise exception using errcode='42501',message='Residence identity is immutable';end if;
 if tg_op='INSERT' and exists(select 1 from private.residence_history_targets where residence_id=new.id) then
  raise exception using errcode='23505',message='A historical residence identity cannot be reused';end if;
 return new;
end;
$$;
create or replace function private.housing_reference_identity_guard() returns trigger
language plpgsql set search_path='' as $$
declare bound boolean:=false;
begin
 if tg_op='UPDATE' and new.id is distinct from old.id then raise exception using errcode='42501',message='Housing identity is immutable';end if;
 if tg_op='INSERT' and exists(select 1 from private.housing_reference_targets where id=new.id) then
  raise exception using errcode='23505',message='A retained housing identity cannot be reused';end if;
 if tg_op='DELETE' then
  case tg_table_name
   when 'rooms' then select exists(select 1 from private.account_enrollments where room_id=old.id) into bound;
   when 'allocations' then select exists(select 1 from public.media_assets where allocation_id=old.id) into bound;
   when 'verification_inspections' then select exists(select 1 from public.media_assets where inspection_id=old.id) into bound;
   when 'maintenance_issues' then select exists(select 1 from public.media_assets where issue_id=old.id) into bound;
   else null;
  end case;
  if bound and not private.residence_execution_write_allowed(tg_table_schema,tg_table_name,tg_op,to_jsonb(old),'{}') then
   raise exception using errcode='42501',message='Exact reviewed native housing execution is required';end if;return old;
 end if;return new;
end;
$$;

-- Read-only inventory helpers and admission remain private; no browser RPC.
revoke all on function private.residence_execution_actor_current(private.residence_executions),
 private.residence_execution_write_allowed(text,text,text,jsonb,jsonb,uuid),private.residence_execution_guard(),
 private.residence_execution_commit_guard(),private.residence_cleanup_task_guard()
 from public,anon,authenticated,pinevela_backend;

-- A fresh protocol invalidates earlier previews without silently releasing pauses.
alter function private.residence_review_preview(jsonb) rename to residence_review_preview_v41;
create function private.residence_review_preview(options jsonb) returns jsonb
language plpgsql stable set search_path='' as $$
declare p jsonb;review jsonb;
begin
 p:=private.residence_review_preview_v41(options);if p is null then return null;end if;
 review:=p-array['fingerprint','rosterRevision','lifecycleRevision'];
 review:=jsonb_set(review,'{version}','3');
 review:=jsonb_set(review,'{notes}',review->'notes'||jsonb_build_array(
  'The native worker uses exact transaction admission, portal closure and durable exclusive-image cleanup tasks.',
  'The public execution action remains unavailable until Storage execution acceptance is complete.'));
 return review||jsonb_build_object('fingerprint',encode(sha256(convert_to(jsonb_build_object(
  'review',review,'rosterRevision',p->'rosterRevision','lifecycleRevision',p->'lifecycleRevision')::text,'UTF8')),'hex'),
  'rosterRevision',p->'rosterRevision','lifecycleRevision',p->'lifecycleRevision');
end;
$$;
update public.admin_proposals set status='invalidated' where kind='residence_deletion' and status in('pending','approved');
alter table private.residence_deletion_preparations drop constraint residence_deletion_preparations_state_check,
 add constraint residence_deletion_preparations_state_check check(state in('frozen','cancelled','executed')),
 add column executed_execution_id uuid references private.residence_executions(id),add column executed_at timestamptz,
 add constraint residence_preparation_execution_fields check((state='executed')=(executed_execution_id is not null) and (state='executed')=(executed_at is not null));
create or replace function private.residence_preparation_guard() returns trigger
language plpgsql set search_path='' as $$
declare actor uuid;p public.admin_proposals;
begin
 if tg_op='UPDATE' and new.state='executed' then
  if old.state<>'frozen' or to_jsonb(new)-array['state','executed_execution_id','executed_at'] is distinct from
   to_jsonb(old)-array['state','executed_execution_id','executed_at'] or not exists(
    select 1 from private.residence_executions e where e.id=new.executed_execution_id and e.preparation_id=old.id
     and e.proposal_id=old.proposal_id and e.state='completed' and private.residence_execution_actor_current(e)) then
   raise exception using errcode='42501',message='Only the completed native worker can release an executed pause';end if;
  select completed_at into new.executed_at from private.residence_executions where id=new.executed_execution_id;
  return new;
 end if;
 if tg_op='INSERT' and (new.executed_execution_id is not null or new.executed_at is not null) then
  raise exception using errcode='42501',message='Preparation cannot invent completed execution';end if;
 if tg_op='DELETE' then raise exception using errcode='42501',message='Residence preparation history is immutable';end if;
 perform pg_advisory_xact_lock(hashtextextended('residence-deletion-freeze',0));
 perform pg_advisory_xact_lock(hashtextextended('platform-settings',0));
 actor:=private.approval_authorized_context();
 if actor is null or not exists(select 1 from public.admin_memberships where context_id=actor and slot=1 and status='active') then
  raise exception using errcode='42501',message='The current keyed founder is required for residence preparation';end if;
 if tg_op='INSERT' then
  select * into p from public.admin_proposals where id=new.proposal_id for update;
  if p.kind is distinct from 'residence_deletion' or p.status is distinct from 'approved'
   or not private.residence_review_current(p) or not private.residence_review_quorum(p.id)
   or p.preview->>'version' is distinct from '3' or p.preview->'preparationAvailable' is distinct from 'true'::jsonb
   or new.founder_context_id is distinct from actor or new.preview_digest is distinct from p.baseline_digest
   or new.state<>'frozen' or new.cancelled_at is not null or new.cancelled_by is not null or new.cancellation_reason is not null
   or current_setting('pinevela.residence_preparation_confirmation',true) is distinct from 'FREEZE APPROVED HOSTEL'
   or not exists(select 1 from public.admin_votes where proposal_id=p.id and administrator_context_id=actor and decision='approved') then
   raise exception using errcode='42501',message='Current reviewed quorum, founder consent and explicit freeze confirmation are required';end if;
  if (select count(*) from private.residence_deletion_preparations where state='frozen')>=10 or exists(
   select 1 from private.residence_deletion_preparations f join public.admin_proposals other on other.id=f.proposal_id
   where f.state='frozen' and other.preview->'resourceIds' ?| array(select jsonb_array_elements_text(p.preview->'resourceIds'))) then
   raise exception using errcode='42501',message='Resume overlapping or excess preparation pauses before starting another';end if;
  new.created_at:=clock_timestamp();
 else
  if old.state<>'frozen' or new.state is distinct from 'cancelled' or length(btrim(new.cancellation_reason)) not between 3 and 1000
   or new.cancellation_reason is null or to_jsonb(new)-array['state','cancelled_at','cancelled_by','cancellation_reason'] is distinct from
    to_jsonb(old)-array['state','cancelled_at','cancelled_by','cancellation_reason'] then
   raise exception using errcode='42501',message='Only a keyed founder cancellation can release the reviewed pause';end if;
  new.cancelled_at:=clock_timestamp();new.cancelled_by:=actor;
 end if;return new;
end;
$$;
create or replace function private.residence_review_proposal_guard() returns trigger
language plpgsql set search_path='' as $$
declare actor uuid;live jsonb;allowed boolean:=false;
begin
 if tg_op='UPDATE' and old.kind='residence_deletion' and new.status='executed' then
  if old.status<>'approved' or to_jsonb(new)-array['status','executed_at','executed_by_context_id'] is distinct from
   to_jsonb(old)-array['status','executed_at','executed_by_context_id'] or not exists(
    select 1 from private.residence_executions e where e.proposal_id=old.id and e.state='completed'
     and private.residence_execution_actor_current(e)) then
   raise exception using errcode='42501',message='Only completed native execution can finalize residence approval';end if;
  select completed_at,founder_context_id into new.executed_at,new.executed_by_context_id
   from private.residence_executions where proposal_id=old.id;
  return new;
 end if;
 if tg_op='DELETE' then
  if old.kind='residence_deletion' then raise exception using errcode='42501',message='Residence review history is immutable';end if;return old;end if;
 if tg_op='UPDATE' and new.kind is distinct from old.kind and (old.kind='residence_deletion' or new.kind='residence_deletion') then
  raise exception using errcode='42501',message='Residence review kind is immutable';end if;
 if new.kind<>'residence_deletion' then return new;end if;
 perform pg_advisory_xact_lock(hashtextextended('platform-settings',0));
 perform revision from private.residence_review_state where singleton for share;
 actor:=private.approval_authorized_context();
 if tg_op='INSERT' then
  live:=private.residence_review_preview(new.preview->'options');
  if actor is null or actor is distinct from new.proposer_context_id or live is null or new.preview is distinct from live
   or live->'blockers'<>'[]'::jsonb or new.target_residence_id is distinct from (live#>>'{options,hostelId}')::uuid
   or new.target_context_id is not null or new.quorum<>2 or new.status<>'pending'
   or new.residence_roster_revision is distinct from (live->>'rosterRevision')::bigint
   or new.residence_lifecycle_revision is distinct from (live->>'lifecycleRevision')::bigint
   or new.baseline_digest is distinct from live->>'fingerprint' or length(btrim(new.reason)) not between 3 and 1000
   or new.executed_at is not null or new.executed_by_context_id is not null or new.decided_at is not null
   or new.residence_final_reason is not null or new.residence_final_by is not null or new.residence_final_at is not null then
   raise exception using errcode='42501',message='Current keyed administrator and exact residence preview are required';end if;
  if exists(select 1 from public.admin_proposals where kind='residence_deletion' and status in('pending','approved')
   and preview->'resourceIds' ?| array(select jsonb_array_elements_text(live->'resourceIds'))) then
   raise exception using errcode='23505',message='An overlapping residence review is already open';end if;
  if (select count(*) from public.admin_proposals where kind='residence_deletion' and status in('pending','approved'))>=10 then
   raise exception using errcode='54000',message='Too many open residence reviews';end if;
  new.created_at:=clock_timestamp();new.expires_at:=new.created_at+interval '24 hours';
 else
  if to_jsonb(new)-array['status','decided_at','residence_final_reason','residence_final_by','residence_final_at'] is distinct from
   to_jsonb(old)-array['status','decided_at','residence_final_reason','residence_final_by','residence_final_at'] then
   raise exception using errcode='42501',message='Reviewed residence metadata is immutable';end if;
  if new.status is distinct from old.status then
   if old.status not in('pending','approved') then raise exception using errcode='42501',message='Residence review is final';end if;
   if new.status='expired' and old.expires_at<=clock_timestamp() then allowed:=true;
   elsif new.status='invalidated' and not private.residence_review_current(old) then allowed:=true;
   elsif actor is not null and private.residence_review_current(old) then
    if new.status='approved' and old.status='pending' and private.residence_review_quorum(old.id) then allowed:=true;
    elsif new.status='rejected' then
     if exists(select 1 from public.admin_votes where proposal_id=old.id and administrator_context_id=actor and decision='rejected') then allowed:=true;
     elsif exists(select 1 from public.admin_memberships where context_id=actor and slot=1 and status='active')
      and length(btrim(new.residence_final_reason)) between 3 and 1000 then
      allowed:=true;new.residence_final_by:=actor;new.residence_final_at:=clock_timestamp();end if;
    end if;
   end if;
   if not allowed then raise exception using errcode='42501',message='Residence execution is disabled; current keyed consent is required';end if;
   new.decided_at:=clock_timestamp();
  elsif new.decided_at is distinct from old.decided_at then raise exception using errcode='42501',message='Decision timestamp is server controlled';end if;
  if (new.residence_final_reason,new.residence_final_by,new.residence_final_at) is distinct from
   (old.residence_final_reason,old.residence_final_by,old.residence_final_at) and not coalesce(
    new.status='rejected' and old.status in('pending','approved') and new.residence_final_by=actor and
    exists(select 1 from public.admin_memberships where context_id=actor and slot=1 and status='active'),false) then
   raise exception using errcode='42501',message='Final residence decision is founder controlled';end if;
 end if;return new;
end;
$$;
revoke all on function private.residence_review_preview_v41(jsonb),private.residence_review_preview(jsonb)
 from public,anon,authenticated,pinevela_backend;

create function private.residence_execution_recorded() returns trigger
language plpgsql set search_path='' as $$
declare notice uuid;recipients uuid[];message text;
begin
 if old.state<>'running' or new.state<>'completed' then return null;end if;
 if not private.residence_execution_actor_current(new) then
  raise exception using errcode='42501',message='Execution completion requires the original founder transaction';end if;
 update private.residence_deletion_preparations set state='executed',executed_execution_id=new.id where id=new.preparation_id;
 update public.admin_proposals set status='executed',executed_at=new.completed_at,executed_by_context_id=new.founder_context_id where id=new.proposal_id;
 message:=new.hostel_name||case when new.delete_manager then
  ': the reviewed residence has been deleted and your manager portal is closed. You can no longer operate that manager account.'
  when exists(select 1 from jsonb_array_elements(new.accounts) a where a->>'role'='manager' and a->>'effect'='retain-sign-in') then
  ': the reviewed residence has been deleted. Your manager portal remains available, but you can no longer manage this deleted residence.' else
  ': the reviewed residence has been deleted. Your primary account remains available.' end;
 if new.cooldown is not null then message:=message||' New registration is restricted until '||(new.cooldown->>'until')||'.';end if;
 select array_agg(distinct id) into recipients from (
  select new.creator_context_id as id union select (a->>'id')::uuid from jsonb_array_elements(new.accounts) a
   where a->>'role'='manager' and a->>'effect'='retain-sign-in') x;
 insert into public.notifications(sender_context_id,category,title,message)
  values(new.founder_context_id,'account_access','Residence deleted',message) returning id into notice;
 insert into public.notification_recipients(notification_id,context_id) select notice,unnest(recipients);
 perform pg_notify('pinevela_notifications',id::text) from unnest(recipients) id;
 select array_agg(value::uuid) into recipients from jsonb_array_elements_text(new.primary_owners) where value<>new.creator_context_id::text;
 if cardinality(recipients)>0 then
  insert into public.notifications(sender_context_id,category,title,message)
   values(new.founder_context_id,'account_access','Housing access ended',new.hostel_name||': the reviewed residence has been deleted and its housing access has ended.') returning id into notice;
  insert into public.notification_recipients(notification_id,context_id) select notice,unnest(recipients);
  perform pg_notify('pinevela_notifications',id::text) from unnest(recipients) id;
 end if;
 select array_agg(m.context_id) into recipients from public.admin_memberships m join public.account_contexts c on c.id=m.context_id
  where m.status='active' and c.status='active';
 insert into public.notifications(sender_context_id,category,title,message,link)
  values(new.founder_context_id,'admin_governance','Reviewed residence deletion completed',
   new.hostel_name||': reviewed operational housing removal completed. Exclusive image cleanup tasks are recorded for verified Storage processing.','governance') returning id into notice;
 insert into public.notification_recipients(notification_id,context_id) select notice,unnest(recipients);
 perform pg_notify('pinevela_notifications',id::text) from unnest(recipients) id;
 insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id,event_data)
  values(new.founder_context_id,'residence_deleted','residence_execution',new.id,jsonb_build_object(
   'proposalId',new.proposal_id,'preparationId',new.preparation_id,'residences',new.resources->'residences',
   'deleteManager',new.delete_manager,'cooldown',new.cooldown));
 return null;
end;
$$;
create trigger residence_execution_recorded after update on private.residence_executions
 for each row execute function private.residence_execution_recorded();

-- Invoker-only worker: caller must first freshly restore/reconstruct exact archives
-- and check its genuine founder session and own key. No filesystem/provider I/O here.
create function private.run_residence_execution(consent_id uuid) returns uuid
language plpgsql set search_path='' as $$
declare e private.residence_executions;entry text;schema_name text;table_name text;
begin
 insert into private.residence_executions(authorization_id) values(consent_id) returning * into e;
 insert into private.residence_storage_cleanup_tasks(execution_id,asset_id,candidate)
  select e.id,(x->>'assetId')::uuid,x from private.residence_cleanup_plans q,lateral jsonb_array_elements(q.plan->'items') x
   where q.preparation_id=e.preparation_id and x->>'decision'='remove';
 update public.media_assets m set state='removing' where exists(select 1 from private.residence_storage_cleanup_tasks t where t.execution_id=e.id and t.asset_id=m.id);
 update private.account_enrollments t set status='cancelled' where e.resources->'account_enrollments' ? t.id::text and t.status in('pending_email','pending_review');
 update public.account_contexts c set status='closed',updated_at=clock_timestamp()
  where exists(select 1 from jsonb_array_elements(e.accounts) x where x->>'id'=c.id::text and x->>'effect'<>'retain-sign-in');
 delete from private.account_sessions s where exists(select 1 from jsonb_array_elements(e.accounts) x
  where x->>'id'=s.active_context_id::text and x->>'effect'<>'retain-sign-in');
 foreach entry in array array['private.room_activation_keys','public.staff_reviews','public.repair_reviews','public.maintenance_events',
  'public.meetings','public.staff_bargains','public.residence_change_requests','public.verification_inspections','public.verification_cases',
  'public.maintenance_issues','public.allocations','public.staff_assignments','public.manager_assignments','public.beds','public.rooms',
  'public.floors','public.blocks','public.residences'] loop
  schema_name:=split_part(entry,'.',1);table_name:=split_part(entry,'.',2);
  execute format('delete from %I.%I t where $1 ? coalesce(to_jsonb(t)->>''id'',to_jsonb(t)->>''issue_id'','''')',schema_name,table_name)
   using e.resources->table_name;
 end loop;
 if e.cooldown is not null then
  insert into public.registration_bans(account_context_id,kind,until_at,reason,imposed_by_context_id,proposal_id,created_at)
   select (e.cooldown->>'target')::uuid,e.cooldown->>'kind',(e.cooldown->>'until')::timestamptz,p.reason,e.founder_context_id,p.id,e.started_at
   from public.admin_proposals p where p.id=e.proposal_id;
 end if;
 update private.residence_executions set state='completed' where id=e.id;
 return e.id;
end;
$$;
revoke all on function private.residence_execution_recorded(),private.run_residence_execution(uuid)
 from public,anon,authenticated,pinevela_backend;
