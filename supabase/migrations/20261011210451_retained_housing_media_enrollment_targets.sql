-- Retained housing identifiers for media/enrollment history only.
-- No residence deletion, portal revocation or Storage cleanup is enabled.
-- Serialize with normal housing writers before taking native table locks. Keep
-- direct native writes from racing the backfill and trigger/FK installation.
select pg_advisory_xact_lock(hashtextextended('residence-deletion-freeze',0));
lock table public.residences,public.blocks,public.floors,public.rooms,
 public.allocations,public.verification_cases,public.verification_inspections,
 public.maintenance_issues,public.media_assets,private.account_enrollments
 in share row exclusive mode;
create table private.housing_reference_targets (
 id uuid primary key,
 kind text not null check(kind in('room','allocation','verification_case','inspection','maintenance_issue')),
 residence_id uuid references private.residence_history_targets(residence_id),
 parent_id uuid references private.housing_reference_targets(id),
 captured_at timestamptz not null default clock_timestamp(),
 check(kind in('verification_case','inspection') or residence_id is not null),
 check((kind in('allocation','inspection') and parent_id is not null)
  or (kind in('room','verification_case') and parent_id is null) or kind='maintenance_issue')
);
alter table private.housing_reference_targets enable row level security;
revoke all on private.housing_reference_targets from public,anon,authenticated,pinevela_backend;

-- Resolve actual current native relationships; retained identifiers never prove access.
create function private.housing_reference_source(kind_name text,source_id uuid) returns jsonb
language plpgsql set search_path='' as $$
declare source jsonb;
begin
 case kind_name
 when 'room' then
  select jsonb_build_object('residenceId',b.residence_id,'parentId',null) into source
   from public.rooms r join public.floors f on f.id=r.floor_id join public.blocks b on b.id=f.block_id
   where r.id=source_id for key share of r,f,b;
 when 'allocation' then
  select jsonb_build_object('residenceId',b.residence_id,'parentId',a.room_id) into source
   from public.allocations a join public.rooms r on r.id=a.room_id join public.floors f on f.id=r.floor_id
   join public.blocks b on b.id=f.block_id where a.id=source_id for key share of a,r,f,b;
 when 'verification_case' then
  select jsonb_build_object('residenceId',v.residence_id,'parentId',null) into source
   from public.verification_cases v where v.id=source_id for key share;
 when 'inspection' then
  select jsonb_build_object('residenceId',v.residence_id,'parentId',i.case_id) into source
   from public.verification_inspections i join public.verification_cases v on v.id=i.case_id
   where i.id=source_id for key share of i,v;
 when 'maintenance_issue' then
  select jsonb_build_object('residenceId',i.residence_id,'parentId',i.allocation_id) into source
   from public.maintenance_issues i where i.id=source_id for key share;
 else raise exception using errcode='42501',message='Unsupported retained housing identifier';
 end case;
 return source;
end;
$$;
create function private.housing_reference_target_guard() returns trigger
language plpgsql set search_path='' as $$
declare source jsonb;parent_kind text;
begin
 if tg_op<>'INSERT' then raise exception using errcode='42501',message='Retained housing identifiers are immutable';end if;
 source:=private.housing_reference_source(new.kind,new.id);
 if source is null or new.residence_id is distinct from (source->>'residenceId')::uuid
  or new.parent_id is distinct from (source->>'parentId')::uuid then
  raise exception using errcode='42501',message='An actual saved housing identifier and exact original relationships are required';end if;
 if new.parent_id is not null then
  select kind into parent_kind from private.housing_reference_targets where id=new.parent_id for key share;
  if parent_kind is distinct from (case new.kind when 'allocation' then 'room'
   when 'inspection' then 'verification_case' when 'maintenance_issue' then 'allocation' else null end) then
   raise exception using errcode='42501',message='The actual retained housing parent type is required';end if;
 end if;
 new.captured_at:=clock_timestamp();return new;
end;
$$;
create trigger housing_reference_target_guard before insert or update or delete on private.housing_reference_targets
 for each row execute function private.housing_reference_target_guard();
create trigger housing_reference_target_truncate_guard before truncate on private.housing_reference_targets
 for each statement execute function private.housing_reference_target_guard();

-- Parent identities precede their real children. Nullable case residences stay nullable.
insert into private.housing_reference_targets(id,kind,residence_id,parent_id)
 select r.id,'room',b.residence_id,null from public.rooms r join public.floors f on f.id=r.floor_id join public.blocks b on b.id=f.block_id;
insert into private.housing_reference_targets(id,kind,residence_id,parent_id)
 select id,'verification_case',residence_id,null from public.verification_cases;
insert into private.housing_reference_targets(id,kind,residence_id,parent_id)
 select a.id,'allocation',b.residence_id,a.room_id from public.allocations a join public.rooms r on r.id=a.room_id
 join public.floors f on f.id=r.floor_id join public.blocks b on b.id=f.block_id;
insert into private.housing_reference_targets(id,kind,residence_id,parent_id)
 select i.id,'inspection',v.residence_id,i.case_id from public.verification_inspections i join public.verification_cases v on v.id=i.case_id;
insert into private.housing_reference_targets(id,kind,residence_id,parent_id)
 select id,'maintenance_issue',residence_id,allocation_id from public.maintenance_issues;

create function private.capture_housing_reference_target() returns trigger
language plpgsql set search_path='' as $$
declare kind_name text;source jsonb;
begin
 kind_name:=case tg_table_name when 'rooms' then 'room' when 'allocations' then 'allocation'
  when 'verification_cases' then 'verification_case' when 'verification_inspections' then 'inspection'
  when 'maintenance_issues' then 'maintenance_issue' end;
 source:=private.housing_reference_source(kind_name,new.id);
 insert into private.housing_reference_targets(id,kind,residence_id,parent_id)
  values(new.id,kind_name,(source->>'residenceId')::uuid,(source->>'parentId')::uuid);
 return null;
end;
$$;

-- Preserve the original restrictive behavior for currently bound media/enrollments.
-- Ordinary unbound room/issue cleanup can retain its historical identifier.
-- A later worker must explicitly replace this guard with exact scoped admission.
create function private.housing_reference_identity_guard() returns trigger
language plpgsql set search_path='' as $$
declare bound boolean:=false;
begin
 if tg_op='UPDATE' and new.id is distinct from old.id then
  raise exception using errcode='42501',message='Housing identity is immutable';end if;
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
  if bound then raise exception using errcode='42501',message='Verified housing deletion worker is not enabled';end if;
  return old;
 end if;
 return new;
end;
$$;
create function private.housing_reference_truncate_guard() returns trigger
language plpgsql set search_path='' as $$
declare bound boolean:=false;
begin
 case tg_table_name
 when 'rooms' then select exists(select 1 from private.account_enrollments where room_id is not null) into bound;
 when 'allocations' then select exists(select 1 from public.media_assets where allocation_id is not null) into bound;
 when 'verification_inspections' then select exists(select 1 from public.media_assets where inspection_id is not null) into bound;
 when 'maintenance_issues' then select exists(select 1 from public.media_assets where issue_id is not null) into bound;
 else null;
 end case;
 if bound then raise exception using errcode='42501',message='Verified housing deletion worker is not enabled';end if;
 return null;
end;
$$;
do $$ declare table_name text;
begin
 foreach table_name in array array['rooms','allocations','verification_cases','verification_inspections','maintenance_issues'] loop
  execute format('create trigger aac_housing_reference_identity_guard before insert or update or delete on public.%I for each row execute function private.housing_reference_identity_guard()',table_name);
  execute format('create trigger "AA_capture_housing_reference_target" after insert on public.%I for each row execute function private.capture_housing_reference_target()',table_name);
  execute format('create trigger housing_reference_truncate_guard before truncate on public.%I for each statement execute function private.housing_reference_truncate_guard()',table_name);
 end loop;
end;
$$;

-- New/changed bindings still require real live source rows, independently of history.
create function private.housing_media_live_target_guard() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='INSERT' then
  if new.residence_id is not null then
   perform id from public.residences where id=new.residence_id for key share;
   if not found then raise exception using errcode='42501',message='New housing media requires a live residence';end if;end if;
  if new.allocation_id is not null and private.housing_reference_source('allocation',new.allocation_id) is null then
   raise exception using errcode='42501',message='New housing media requires a live allocation';end if;
  if new.inspection_id is not null and private.housing_reference_source('inspection',new.inspection_id) is null then
   raise exception using errcode='42501',message='New housing media requires a live inspection';end if;
  if new.issue_id is not null and private.housing_reference_source('maintenance_issue',new.issue_id) is null then
   raise exception using errcode='42501',message='New housing media requires a live issue';end if;
 end if;
 return new;
end;
$$;
create trigger housing_media_live_target_guard before insert on public.media_assets
 for each row execute function private.housing_media_live_target_guard();
create function private.enrollment_live_housing_target_guard() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.room_id is not null and (tg_op='INSERT' or new.room_id is distinct from old.room_id) then
  if private.housing_reference_source('room',new.room_id) is null then
   raise exception using errcode='42501',message='A new enrollment binding requires a live room';end if;end if;
 if new.residence_id is not null and (tg_op='INSERT' or new.residence_id is distinct from old.residence_id) then
  perform id from public.residences where id=new.residence_id for key share;
  if not found then raise exception using errcode='42501',message='A new enrollment binding requires a live residence';end if;end if;
 return new;
end;
$$;
create trigger enrollment_live_housing_target_guard before insert or update of room_id,residence_id on private.account_enrollments
 for each row execute function private.enrollment_live_housing_target_guard();

alter table public.media_assets drop constraint media_assets_residence_id_fkey,
 drop constraint media_assets_allocation_id_fkey,drop constraint media_assets_inspection_id_fkey,drop constraint media_assets_issue_id_fkey;
alter table public.media_assets add constraint media_residence_history_target_fkey
 foreign key(residence_id) references private.residence_history_targets(residence_id),
 add constraint media_allocation_history_target_fkey foreign key(allocation_id) references private.housing_reference_targets(id),
 add constraint media_inspection_history_target_fkey foreign key(inspection_id) references private.housing_reference_targets(id),
 add constraint media_issue_history_target_fkey foreign key(issue_id) references private.housing_reference_targets(id);
alter table private.account_enrollments drop constraint account_enrollments_residence_id_fkey,drop constraint account_enrollments_room_id_fkey;
alter table private.account_enrollments add constraint enrollment_residence_history_target_fkey
 foreign key(residence_id) references private.residence_history_targets(residence_id),
 add constraint enrollment_room_history_target_fkey foreign key(room_id) references private.housing_reference_targets(id);
revoke all on function private.housing_reference_source(text,uuid),private.housing_reference_target_guard(),
 private.capture_housing_reference_target(),private.housing_reference_identity_guard(),
 private.housing_reference_truncate_guard(),private.housing_media_live_target_guard(),private.enrollment_live_housing_target_guard()
 from public,anon,authenticated,pinevela_backend;
