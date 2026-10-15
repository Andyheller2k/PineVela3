-- Reviewed Storage cleanup protocol. No public execution route is enabled.
select pg_advisory_xact_lock(hashtextextended('residence-deletion-freeze',0));
create or replace function private.residence_execution_write_allowed(schema_name text,table_name text,operation text,before_row jsonb,after_row jsonb,preparation uuid default null) returns boolean
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
  return before_row->>'state'='ready' and after_row->>'state'='removing' and before_row-array['state','updated_at']=after_row-array['state','updated_at']
   and ((after_row->>'updated_at')::timestamptz=transaction_timestamp() or after_row->>'updated_at'=before_row->>'updated_at')
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
create table private.residence_storage_cleanup_attempts (
 id uuid primary key default gen_random_uuid(),
 asset_id uuid not null references private.residence_storage_cleanup_tasks(asset_id),
 token uuid not null default gen_random_uuid(),
 state text not null default 'claimed' check(state in('claimed','deleting','completed','failed','expired')),
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null,
 prepared_at timestamptz,
 finished_at timestamptz,
 object_identity jsonb,
 error_code text check(error_code in('verification_failed','storage_unavailable','lease_expired')),
 check((state in('completed','failed','expired'))=(finished_at is not null))
);
create unique index residence_storage_one_live_attempt on private.residence_storage_cleanup_attempts(asset_id) where state in('claimed','deleting');
create unique index residence_storage_one_completion on private.residence_storage_cleanup_attempts(asset_id) where state='completed';
alter table private.residence_storage_cleanup_attempts enable row level security;
revoke all on private.residence_storage_cleanup_attempts from public,anon,authenticated,pinevela_backend;

create function private.residence_cleanup_task_valid(asset uuid) returns boolean
language sql stable set search_path='' as $$
 select exists(select 1 from private.residence_storage_cleanup_tasks t
 join private.residence_executions e on e.id=t.execution_id
 join private.residence_cleanup_plans q on q.preparation_id=e.preparation_id
 join private.residence_recovery_evidence r on r.preparation_id=e.preparation_id
 join private.residence_deletion_preparations f on f.id=e.preparation_id
 join public.admin_proposals p on p.id=e.proposal_id
 join public.media_assets m on m.id=t.asset_id
 where t.asset_id=asset and e.state='completed' and f.state='executed' and p.status='executed'
 and f.executed_execution_id=e.id and q.plan->'items' @> jsonb_build_array(t.candidate)
 and t.candidate->>'decision'='remove' and t.candidate->>'purpose' in('hostel','inspection','maintenance','repair')
 and t.candidate->>'path'=m.object_path and t.candidate->>'ownerContextId'=m.owner_context_id::text
 and t.candidate->>'bucket'=m.bucket_id and t.candidate->>'sha256'=m.sha256
 and (t.candidate->>'bytes')::integer=m.byte_size and m.state='removing');
$$;
create function private.residence_cleanup_unshared(asset uuid) returns boolean
language plpgsql stable set search_path='' as $$
declare m public.media_assets;t private.residence_storage_cleanup_tasks;e private.residence_executions;entry record;found boolean;
begin
 select * into m from public.media_assets where id=asset;
 select * into t from private.residence_storage_cleanup_tasks where asset_id=asset;
 select * into e from private.residence_executions where id=t.execution_id;
 if m.id is null or not private.residence_cleanup_task_valid(asset) then return false;end if;
 if exists(select 1 from pg_catalog.pg_tables x where x.schemaname in('public','private')
  and not(x.schemaname='public' and x.tablename='media_assets')
  and not(x.schemaname='private' and x.tablename in('residence_cleanup_plans','residence_storage_cleanup_tasks','residence_storage_cleanup_attempts'))
  and not exists(select 1 from pg_catalog.pg_trigger g where g.tgrelid=format('%I.%I',x.schemaname,x.tablename)::regclass
   and g.tgname='zz_residence_queued_reference_guard' and g.tgenabled in('O','A'))) then return false;end if;
 -- Unknown typed dependencies require explicit review, even when currently empty.
 if exists(select 1 from pg_catalog.pg_constraint where contype='f' and confrelid='public.media_assets'::regclass
  and conrelid not in('public.profiles'::regclass,'private.residence_storage_cleanup_tasks'::regclass)) then return false;end if;
 if exists(select 1 from public.profiles where avatar_asset_id=asset) then return false;end if;
 for entry in select schemaname,tablename from pg_catalog.pg_tables where schemaname in('public','private')
  and not(schemaname='public' and tablename='media_assets')
  and not(schemaname='private' and tablename in('residence_storage_cleanup_tasks','residence_storage_cleanup_attempts')) loop
  execute format('select exists(select 1 from %I.%I t where (strpos(to_jsonb(t)::text,$1)>0 or strpos(to_jsonb(t)::text,$2)>0)
   and not($3 and to_jsonb(t)->>''preparation_id''=$4))',entry.schemaname,entry.tablename)
   into found using '/api/media/'||asset::text,m.object_path,
    entry.schemaname='private' and entry.tablename='residence_cleanup_plans',e.preparation_id::text;
  if found then return false;end if;
 end loop;return true;
end;
$$;
create function private.residence_cleanup_attempt_guard() returns trigger
language plpgsql set search_path='' as $$
declare proof jsonb;
begin
 if tg_op in('DELETE','TRUNCATE') then raise exception using errcode='42501',message='Cleanup attempt history is retained';end if;
 if current_setting('role')<>'none' or current_setting('transaction_isolation')<>'read committed' then
  raise exception using errcode='42501',message='Trusted native cleanup transaction required';end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('residence-deletion-freeze',0));
 perform pg_advisory_xact_lock(hashtextextended('residence-storage:'||new.asset_id::text,0));
 if tg_op='INSERT' then
  if not private.residence_cleanup_unshared(new.asset_id) or new.state<>'claimed' or new.prepared_at is not null
   or new.finished_at is not null or new.object_identity is not null or new.error_code is not null
   or exists(select 1 from private.residence_storage_cleanup_attempts where asset_id=new.asset_id and state='completed') then
   raise exception using errcode='42501',message='Exact completed reviewed scope and unshared queued asset required';end if;
  new.id:=gen_random_uuid();new.token:=gen_random_uuid();new.created_at:=clock_timestamp();new.expires_at:=new.created_at+interval '5 minutes';
 else
  if old.state not in('claimed','deleting') or to_jsonb(new)-array['state','prepared_at','finished_at','object_identity','error_code'] is distinct from
   to_jsonb(old)-array['state','prepared_at','finished_at','object_identity','error_code'] then
   raise exception using errcode='42501',message='Cleanup identity and terminal history are immutable';end if;
  if new.state='expired' and old.expires_at<=clock_timestamp() then
   new.error_code:='lease_expired';new.finished_at:=clock_timestamp();new.prepared_at:=old.prepared_at;new.object_identity:=old.object_identity;
  else
   if old.token::text is distinct from current_setting('pinevela.residence_cleanup_token',true) or old.expires_at<=clock_timestamp() then
    raise exception using errcode='42501',message='Current originating cleanup lease required';end if;
   if new.state='failed' then
    if new.error_code not in('verification_failed','storage_unavailable') or new.error_code is null then
     raise exception using errcode='42501',message='A bounded cleanup failure code is required';end if;
    new.finished_at:=clock_timestamp();new.prepared_at:=old.prepared_at;new.object_identity:=old.object_identity;
   elsif old.state='claimed' and new.state='deleting' then
    proof:=nullif(current_setting('pinevela.residence_cleanup_verified',true),'')::jsonb;
    if not private.residence_cleanup_unshared(old.asset_id) or proof is null or proof->>'attemptId' is distinct from old.id::text
     or proof->'recovery' is distinct from (select to_jsonb(r)-'verified_at' from private.residence_recovery_evidence r
       join private.residence_executions e on e.preparation_id=r.preparation_id join private.residence_storage_cleanup_tasks t on t.execution_id=e.id where t.asset_id=old.asset_id)
     or not(proof ?& array['attemptId','recovery','object']) or new.object_identity is null
     or new.object_identity is distinct from proof->'object' or jsonb_typeof(new.object_identity) not in('object','null') then
     raise exception using errcode='42501',message='Fresh exact archived bytes, provider identity and unshared scope required';end if;
    if new.object_identity<>'null'::jsonb and new.object_identity is distinct from (
      select jsonb_build_object('id',o.id,'version',o.version,'updatedAt',o.updated_at) from storage.objects o
       join public.media_assets m on m.object_path=o.name and m.bucket_id=o.bucket_id where m.id=old.asset_id) then
     raise exception using errcode='42501',message='Provider metadata differs from the saved native object';end if;
    if new.object_identity='null'::jsonb and exists(select 1 from storage.objects o join public.media_assets m on m.object_path=o.name and m.bucket_id=o.bucket_id where m.id=old.asset_id) then
     raise exception using errcode='42501',message='A present object cannot be reported missing';end if;
    new.prepared_at:=clock_timestamp();new.finished_at:=null;new.error_code:=null;
   elsif old.state='deleting' and new.state='completed' then
    if not private.residence_cleanup_unshared(old.asset_id) or current_setting('pinevela.residence_cleanup_missing',true) is distinct from old.id::text
     or exists(select 1 from storage.objects o join public.media_assets m on m.object_path=o.name and m.bucket_id=o.bucket_id where m.id=old.asset_id) then
     raise exception using errcode='42501',message='Fresh provider absence and native catalog absence required';end if;
    new.prepared_at:=old.prepared_at;new.object_identity:=old.object_identity;new.error_code:=null;new.finished_at:=clock_timestamp();
   else raise exception using errcode='42501',message='Unsupported cleanup transition';end if;
  end if;
 end if;return new;
end;
$$;
create trigger residence_cleanup_attempt_guard before insert or update or delete on private.residence_storage_cleanup_attempts for each row execute function private.residence_cleanup_attempt_guard();
create trigger residence_cleanup_attempt_truncate before truncate on private.residence_storage_cleanup_attempts for each statement execute function private.residence_cleanup_attempt_guard();
create function private.claim_residence_storage_cleanup(asset uuid) returns private.residence_storage_cleanup_attempts
language plpgsql set search_path='' as $$
declare result private.residence_storage_cleanup_attempts;
begin
 perform pg_advisory_xact_lock_shared(hashtextextended('residence-deletion-freeze',0));
 perform pg_advisory_xact_lock(hashtextextended('residence-storage:'||asset::text,0));
 update private.residence_storage_cleanup_attempts set state='expired' where asset_id=asset and state in('claimed','deleting') and expires_at<=clock_timestamp();
 if exists(select 1 from private.residence_storage_cleanup_attempts where asset_id=asset and state in('claimed','deleting','completed')) then return null;end if;
 insert into private.residence_storage_cleanup_attempts(asset_id,expires_at) values(asset,clock_timestamp()) returning * into result;return result;
end;
$$;
-- Deny-only guards need private queue lookup when normal callers cannot read it.
-- They expose no data or positive authority and have no EXECUTE grants/RPC entry.
create function private.residence_queued_media_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='TRUNCATE' then
  if exists(select 1 from private.residence_storage_cleanup_tasks) then raise exception using errcode='42501',message='Queued media history cannot be truncated';end if;return null;
 end if;
 if exists(select 1 from private.residence_storage_cleanup_tasks where asset_id=old.id) then
  if tg_op='UPDATE' and private.residence_execution_write_allowed('public','media_assets','UPDATE',to_jsonb(old),to_jsonb(new)) then return new;end if;
  raise exception using errcode='42501',message='Reviewed cleanup media is retained and immutable';end if;
 return case when tg_op='DELETE' then old else new end;
end;
$$;
create trigger zz_residence_queued_media_guard before update or delete on public.media_assets for each row execute function private.residence_queued_media_guard();
create trigger residence_queued_media_truncate before truncate on public.media_assets for each statement execute function private.residence_queued_media_guard();
create function private.residence_queued_reference_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare text_row text:=to_jsonb(new)::text;old_text text:=case when tg_op='UPDATE' then to_jsonb(old)::text else '' end;t record;
begin
 if tg_op='UPDATE' and to_jsonb(new)=to_jsonb(old) then return new;end if;
 for t in select asset_id,candidate->>'path' as path from private.residence_storage_cleanup_tasks loop
  if (strpos(text_row,'/api/media/'||t.asset_id::text)>0 and strpos(old_text,'/api/media/'||t.asset_id::text)=0)
   or (strpos(text_row,t.path)>0 and strpos(old_text,t.path)=0) then
   raise exception using errcode='42501',message='Queued residence images cannot acquire new references';end if;
 end loop;return new;
end;
$$;
do $$ declare t record;begin
 for t in select schemaname,tablename from pg_tables where schemaname in('public','private')
  and not(schemaname='public' and tablename='media_assets')
  and not(schemaname='private' and tablename in('residence_cleanup_plans','residence_storage_cleanup_tasks','residence_storage_cleanup_attempts')) loop
  execute format('create trigger zz_residence_queued_reference_guard before insert or update on %I.%I for each row execute function private.residence_queued_reference_guard()',t.schemaname,t.tablename);
 end loop;
end;$$;
create function private.residence_queued_storage_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare row_data jsonb;asset uuid;
begin
 if tg_op='TRUNCATE' then
  if exists(select 1 from private.residence_storage_cleanup_tasks) then raise exception using errcode='42501',message='Queued Storage catalog cannot be truncated';end if;return null;
 end if;
 row_data:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 select t.asset_id into asset from private.residence_storage_cleanup_tasks t where t.candidate->>'path'=row_data->>'name' and t.candidate->>'bucket'=row_data->>'bucket_id';
 if asset is not null then
  if tg_op='DELETE' and private.residence_cleanup_unshared(asset) and exists(select 1 from private.residence_storage_cleanup_attempts a where a.asset_id=asset and a.state='deleting' and a.expires_at>clock_timestamp()
   and a.object_identity=jsonb_build_object('id',old.id,'version',old.version,'updatedAt',old.updated_at)) then return old;end if;
  raise exception using errcode='42501',message='Queued object paths are reserved for current reviewed cleanup';end if;
 if tg_op='UPDATE' and exists(select 1 from private.residence_storage_cleanup_tasks t where t.candidate->>'path'=old.name and t.candidate->>'bucket'=old.bucket_id) then
  raise exception using errcode='42501',message='Queued object identity cannot change';end if;
 return case when tg_op='DELETE' then old else new end;
end;
$$;
create trigger zz_residence_queued_storage_guard before insert or update or delete on storage.objects for each row execute function private.residence_queued_storage_guard();
create trigger residence_queued_storage_truncate before truncate on storage.objects for each statement execute function private.residence_queued_storage_guard();
revoke all on function private.residence_cleanup_task_valid(uuid),private.residence_cleanup_unshared(uuid),private.residence_cleanup_attempt_guard(),
 private.claim_residence_storage_cleanup(uuid),private.residence_queued_media_guard(),private.residence_queued_reference_guard(),private.residence_queued_storage_guard()
 from public,anon,authenticated,pinevela_backend;
