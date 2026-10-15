-- Reviewed residence dependencies and independent keyed consent. No operational deletion.
create table private.residence_review_state (
 singleton boolean primary key default true check(singleton), revision bigint not null default 0 check(revision>=0)
);
insert into private.residence_review_state(singleton) values(true);
create table private.residence_review_events (
 revision bigint primary key check(revision>0), resource_ids uuid[] not null
);
alter table private.residence_review_state enable row level security;
alter table private.residence_review_events enable row level security;
revoke all on private.residence_review_state,private.residence_review_events from public,anon,authenticated,pinevela_backend;
create function private.residence_review_evidence_guard() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_table_name='residence_review_state' then
  if tg_op<>'UPDATE' or pg_trigger_depth()<2 or new.singleton is distinct from old.singleton
    or new.revision<>old.revision+1 then raise exception using errcode='42501',message='Residence revision is domain controlled';end if;
 else
  if tg_op<>'INSERT' or pg_trigger_depth()<2 or new.revision is distinct from
    (select revision from private.residence_review_state where singleton) then
    raise exception using errcode='42501',message='Residence lifecycle evidence is append-only';end if;
 end if;return new;
end;
$$;
create trigger residence_review_evidence_guard before insert or update or delete on private.residence_review_state
 for each row execute function private.residence_review_evidence_guard();
create trigger residence_review_evidence_guard before insert or update or delete on private.residence_review_events
 for each row execute function private.residence_review_evidence_guard();
create function private.residence_review_changed() returns trigger
language plpgsql security definer set search_path='' as $$
declare before_row jsonb:='{}';after_row jsonb:='{}';ids uuid[];seq bigint;
begin
 if tg_op<>'INSERT' then before_row:=to_jsonb(old);end if;
 if tg_op<>'DELETE' then after_row:=to_jsonb(new);end if;
 if before_row=after_row then return new;end if;
 select coalesce(array_agg(distinct fields.value::uuid),'{}') into ids from (
  select key,value from jsonb_each_text(before_row) union select key,value from jsonb_each_text(after_row)
 ) fields where key in ('id','context_id','auth_user_id','primary_owner_id','owner_context_id','owner_auth_user_id',
  'residence_id','block_id','floor_id','room_id','bed_id','resident_context_id','staff_context_id','manager_context_id',
  'created_by_manager_id','staff_assignment_id','assigned_staff_id','allocation_id','issue_id','case_id','inspection_id',
  'initiator_context_id','linked_context_id','account_context_id') and value ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$';
 update private.residence_review_state set revision=revision+1 where singleton returning revision into seq;
 insert into private.residence_review_events(revision,resource_ids) values(seq,ids);
 return case when tg_op='DELETE' then old else new end;
end;
$$;
-- Metadata only: the private trigger never grants authorization to its outer write.
create trigger residence_review_changed after insert or update or delete on public.residences
 for each row execute function private.residence_review_changed();
create trigger residence_review_changed after insert or update or delete on public.manager_assignments
 for each row execute function private.residence_review_changed();
create trigger residence_review_changed after insert or update or delete on public.blocks
 for each row execute function private.residence_review_changed();
create trigger residence_review_changed after insert or update or delete on public.floors
 for each row execute function private.residence_review_changed();
create trigger residence_review_changed after insert or update or delete on public.rooms
 for each row execute function private.residence_review_changed();
create trigger residence_review_changed after insert or update or delete on public.beds
 for each row execute function private.residence_review_changed();
create trigger residence_review_changed after insert or update or delete on public.allocations
 for each row execute function private.residence_review_changed();
create trigger residence_review_changed after insert or update or delete on public.staff_assignments
 for each row execute function private.residence_review_changed();
create trigger residence_review_changed after insert or update or delete on public.verification_cases
 for each row execute function private.residence_review_changed();
create trigger residence_review_changed after insert or update or delete on public.verification_inspections
 for each row execute function private.residence_review_changed();
create trigger residence_review_changed after insert or update or delete on public.residence_change_requests
 for each row execute function private.residence_review_changed();
create trigger residence_review_changed after insert or update or delete on public.maintenance_issues
 for each row execute function private.residence_review_changed();
create trigger residence_review_changed after insert or update or delete on public.maintenance_events
 for each row execute function private.residence_review_changed();
create trigger residence_review_changed after insert or update or delete on public.repair_reviews
 for each row execute function private.residence_review_changed();
create trigger residence_review_changed after insert or update or delete on public.staff_reviews
 for each row execute function private.residence_review_changed();
create trigger residence_review_changed after insert or update or delete on public.meetings
 for each row execute function private.residence_review_changed();
create trigger residence_review_changed after insert or update or delete on public.staff_bargains
 for each row execute function private.residence_review_changed();
create trigger residence_review_changed after insert or update or delete on public.payments
 for each row execute function private.residence_review_changed();
create trigger residence_review_changed after insert or update or delete on public.account_contexts
 for each row execute function private.residence_review_changed();
create trigger residence_review_changed after insert or update or delete on public.profiles
 for each row execute function private.residence_review_changed();
create trigger residence_review_changed after insert or update or delete on private.room_activation_keys
 for each row execute function private.residence_review_changed();
create trigger residence_review_changed after insert or update or delete on private.account_enrollments
 for each row execute function private.residence_review_changed();
create trigger residence_review_changed after insert or update or delete on public.registration_bans
 for each row execute function private.residence_review_changed();
create trigger residence_review_changed after insert or update or delete on private.account_policies
 for each row execute function private.residence_review_changed();
create trigger residence_review_changed after insert or update or delete on public.media_assets
 for each row execute function private.residence_review_changed();

create function private.valid_residence_review(options jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare amount numeric;multiplier numeric;
begin
 if jsonb_typeof(options) is distinct from 'object' or (select count(*) from jsonb_object_keys(options))<>4
  or not options ?& array['hostelId','deleteHostel','deleteManager','ban'] or options->'deleteHostel' is distinct from 'true'::jsonb
  or jsonb_typeof(options->'deleteManager') is distinct from 'boolean'
  or coalesce(options->>'hostelId','') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
  or jsonb_typeof(options->'ban') is distinct from 'object'
  or (select count(*) from jsonb_object_keys(options->'ban'))<>2
  or not (options->'ban') ?& array['amount','unit'] or jsonb_typeof(options#>'{ban,amount}') is distinct from 'number' then return false;end if;
 amount:=(options#>>'{ban,amount}')::numeric;
 multiplier:=case options#>>'{ban,unit}' when 'hours' then 3600000 when 'days' then 86400000
  when 'weeks' then 604800000 when 'months' then 2592000000 when 'years' then 31536000000 else null end;
 return multiplier is not null and amount>=0 and amount=trunc(amount) and amount*multiplier<=3153600000000;
end;
$$;
create function private.residence_review_preview(options jsonb) returns jsonb
language plpgsql stable set search_path='' as $$
declare selected public.residences;remove_manager boolean;scope_managers uuid[];scope_homes uuid[];scope_blocks uuid[];scope_floors uuid[];scope_rooms uuid[];
 scope_allocations uuid[];scope_staff uuid[];scope_contexts uuid[];scope_owners uuid[];scope_cases uuid[];scope_inspections uuid[];scope_issues uuid[];
 snapshot jsonb:='{}';rows jsonb;counts jsonb:='{}';resources jsonb:='{}';resource_ids uuid[];blockers jsonb:='[]';
 roster jsonb;seq bigint;roster_seq bigint;review jsonb;photos jsonb;
begin
 if not coalesce(private.valid_residence_review(options),false) then return null;end if;
 select * into selected from public.residences where id=(options->>'hostelId')::uuid and status<>'closed';
 if not found then return null;end if;
 remove_manager:=(options->>'deleteManager')::boolean;
 select coalesce(array_agg(distinct manager_context_id),'{}') into scope_managers from public.manager_assignments
  where residence_id=selected.id and ended_at is null;
 if (remove_manager or (options#>>'{ban,amount}')::numeric>0) and cardinality(scope_managers)<>1 then
  blockers:=blockers||jsonb_build_array('Exactly one saved current manager is required for manager removal or a registration cooldown.');end if;
 select array_agg(id order by id) into scope_homes from public.residences r where r.id=selected.id or (remove_manager and (
  exists(select 1 from public.manager_assignments m where m.residence_id=r.id and m.manager_context_id=any(scope_managers) and m.ended_at is null)
  or exists(select 1 from public.verification_cases v where v.residence_id=r.id and v.applicant_context_id=any(scope_managers))));
 if remove_manager and (exists(select 1 from public.residences where id=any(scope_homes) and primary_owner_id<>selected.primary_owner_id)
  or exists(select 1 from public.manager_assignments where residence_id=any(scope_homes) and ended_at is null and not manager_context_id=any(scope_managers))
  or exists(select 1 from public.account_contexts where id=any(scope_managers) and (kind<>'manager' or primary_owner_id is distinct from selected.primary_owner_id))) then
  blockers:=blockers||jsonb_build_array('Shared or inconsistent property management needs a separate ownership review.');end if;
 select coalesce(array_agg(id),'{}') into scope_blocks from public.blocks where residence_id=any(scope_homes);
 select coalesce(array_agg(id),'{}') into scope_floors from public.floors where block_id=any(scope_blocks);
 select coalesce(array_agg(id),'{}') into scope_rooms from public.rooms where floor_id=any(scope_floors);
 select coalesce(array_agg(id),'{}') into scope_allocations from public.allocations where room_id=any(scope_rooms);
 select coalesce(array_agg(id),'{}') into scope_staff from public.staff_assignments where residence_id=any(scope_homes);
 select array_agg(distinct id) into scope_contexts from (
  select unnest(scope_managers) as id union select resident_context_id from public.allocations where id=any(scope_allocations) and ended_at is null
  union select staff_context_id from public.staff_assignments where id=any(scope_staff) and ended_at is null
 ) linked;
 select coalesce(array_agg(distinct root.id),'{}') into scope_owners from public.account_contexts root where root.kind='primary' and (
  root.auth_user_id in(select primary_owner_id from public.residences where id=any(scope_homes))
  or root.auth_user_id in(select coalesce(primary_owner_id,auth_user_id) from public.account_contexts where id=any(scope_contexts)));
 if not exists(select 1 from public.account_contexts where id=any(scope_owners) and auth_user_id=selected.primary_owner_id) then
  blockers:=blockers||jsonb_build_array('A saved primary owner is required for deletion notices and manager-registration cooldowns.');end if;
 select coalesce(array_agg(id),'{}') into scope_cases from public.verification_cases where residence_id=any(scope_homes) or (remove_manager and applicant_context_id=any(scope_managers));
 select coalesce(array_agg(id),'{}') into scope_inspections from public.verification_inspections where case_id=any(scope_cases);
 select coalesce(array_agg(id),'{}') into scope_issues from public.maintenance_issues where residence_id=any(scope_homes);
 select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') into rows from public.residences t where id=any(scope_homes);
 snapshot:=snapshot||jsonb_build_object('residences',rows);
 select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') into rows from public.manager_assignments t where residence_id=any(scope_homes);
 snapshot:=snapshot||jsonb_build_object('manager_assignments',rows);
 select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') into rows from public.blocks t where residence_id=any(scope_homes);
 snapshot:=snapshot||jsonb_build_object('blocks',rows);
 select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') into rows from public.floors t where block_id=any(scope_blocks);
 snapshot:=snapshot||jsonb_build_object('floors',rows);
 select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') into rows from public.rooms t where floor_id=any(scope_floors);
 snapshot:=snapshot||jsonb_build_object('rooms',rows);
 select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') into rows from public.beds t where room_id=any(scope_rooms);
 snapshot:=snapshot||jsonb_build_object('beds',rows);
 select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') into rows from public.allocations t where room_id=any(scope_rooms);
 snapshot:=snapshot||jsonb_build_object('allocations',rows);
 select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') into rows from public.staff_assignments t where residence_id=any(scope_homes);
 snapshot:=snapshot||jsonb_build_object('staff_assignments',rows);
 select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') into rows from public.verification_cases t where residence_id=any(scope_homes) or (remove_manager and applicant_context_id=any(scope_managers));
 snapshot:=snapshot||jsonb_build_object('verification_cases',rows);
 select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') into rows from public.verification_inspections t where case_id=any(scope_cases);
 snapshot:=snapshot||jsonb_build_object('verification_inspections',rows);
 select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') into rows from public.residence_change_requests t where residence_id=any(scope_homes);
 snapshot:=snapshot||jsonb_build_object('residence_change_requests',rows);
 select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') into rows from public.maintenance_issues t where residence_id=any(scope_homes);
 snapshot:=snapshot||jsonb_build_object('maintenance_issues',rows);
 select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') into rows from public.maintenance_events t where issue_id=any(scope_issues);
 snapshot:=snapshot||jsonb_build_object('maintenance_events',rows);
 select coalesce(jsonb_agg(to_jsonb(t) order by t.issue_id),'[]') into rows from public.repair_reviews t where issue_id=any(scope_issues);
 snapshot:=snapshot||jsonb_build_object('repair_reviews',rows);
 select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') into rows from public.staff_reviews t where allocation_id=any(scope_allocations) or staff_assignment_id=any(scope_staff);
 snapshot:=snapshot||jsonb_build_object('staff_reviews',rows);
 select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') into rows from public.meetings t where residence_id=any(scope_homes);
 snapshot:=snapshot||jsonb_build_object('meetings',rows);
 select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') into rows from public.staff_bargains t where staff_assignment_id=any(scope_staff);
 snapshot:=snapshot||jsonb_build_object('staff_bargains',rows);
 select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') into rows from public.payments t where residence_id=any(scope_homes);
 snapshot:=snapshot||jsonb_build_object('payments',rows);
 select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') into rows from public.account_contexts t where id=any(scope_contexts) or id=any(scope_owners);
 snapshot:=snapshot||jsonb_build_object('account_contexts',rows);
 select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') into rows from public.profiles t where id in (select auth_user_id from public.account_contexts where id=any(scope_contexts) or id=any(scope_owners));
 snapshot:=snapshot||jsonb_build_object('profiles',rows);
 select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') into rows from private.room_activation_keys t where room_id=any(scope_rooms);
 snapshot:=snapshot||jsonb_build_object('room_activation_keys',rows);
 select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') into rows from private.account_enrollments t where residence_id=any(scope_homes) or room_id=any(scope_rooms) or linked_context_id=any(scope_contexts) or (remove_manager and initiator_context_id=any(scope_managers));
 snapshot:=snapshot||jsonb_build_object('account_enrollments',rows);
 select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') into rows from public.registration_bans t where account_context_id=any(scope_contexts) or account_context_id=any(scope_owners);
 snapshot:=snapshot||jsonb_build_object('registration_bans',rows);
 select coalesce(jsonb_agg(to_jsonb(t) order by t.context_id),'[]') into rows from private.account_policies t where context_id=any(scope_contexts) or context_id=any(scope_owners);
 snapshot:=snapshot||jsonb_build_object('account_policies',rows);
 select coalesce(jsonb_agg(to_jsonb(m) order by m.id),'[]') into rows from public.media_assets m
  where m.residence_id=any(scope_homes) or m.inspection_id=any(scope_inspections)
   or strpos(snapshot::text,'/api/media/'||m.id::text)>0
   or (remove_manager and m.owner_context_id=any(scope_managers) and m.purpose='hostel');
 snapshot:=snapshot||jsonb_build_object('media_assets',rows);
 -- Raw rows, activation keys and private enrollment challenges never leave this helper.
 select coalesce(array_agg(distinct fields.value::uuid),'{}') into resource_ids from jsonb_each(snapshot) tables,
  lateral jsonb_array_elements(tables.value) records,lateral jsonb_each_text(records.value) fields
  where fields.key in ('id','context_id','auth_user_id','primary_owner_id','residence_id','block_id','floor_id','room_id','bed_id',
   'resident_context_id','staff_context_id','manager_context_id','created_by_manager_id','allocation_id','staff_assignment_id',
   'issue_id','case_id','inspection_id','account_context_id','linked_context_id')
   and fields.value ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$';
 select jsonb_object_agg(key,jsonb_array_length(value)) into counts from jsonb_each(snapshot);
 select jsonb_object_agg(key,coalesce((select jsonb_agg(coalesce(r->'id',r->'context_id',r->'issue_id')) from jsonb_array_elements(value) r),'[]'))
  into resources from jsonb_each(snapshot);
 select coalesce(jsonb_agg(jsonb_build_object('id',m->'id','state',m->'state','bytes',m->'byte_size','sha256',m->'sha256') order by m->>'id'),'[]')
  into photos from jsonb_array_elements(snapshot->'media_assets') m;
 roster:=private.recovery_roster();
 if jsonb_array_length(roster)<2 or not exists(select 1 from jsonb_array_elements(roster) r where r->>'slot'='1') then
  blockers:=blockers||jsonb_build_array('At least two administrators, including the founder, need enrolled approval keys.');end if;
 select revision into seq from private.residence_review_state where singleton;
 select roster_revision into roster_seq from private.admin_pricing_state where singleton;
 review:=jsonb_build_object('version',1,'options',options,'hostelName',selected.name,'roster',roster,'counts',counts,'resources',resources,
  'resourceIds',to_jsonb(resource_ids),'dependenciesDigest',encode(sha256(convert_to(snapshot::text,'UTF8')),'hex'),
  'residences',(select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name) order by r.id) from public.residences r where id=any(scope_homes)),
  'accounts',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'role',c.kind,'name',p.display_name,
   'effect',case when c.kind='manager' and not remove_manager then 'retain-sign-in' when c.kind='manager' then 'close-portal' else 'end-housing-access' end) order by c.id),'[]')
   from public.account_contexts c join public.profiles p on p.id=c.auth_user_id where c.id=any(scope_contexts)),
  'primaryOwners',to_jsonb(scope_owners),'uploads',photos,'blockers',blockers,'executionAvailable',false,
  'notes',jsonb_build_array('No account or residence changes when a review is proposed or approved.',
   'The founder must give their own approval key for the final action, even after two other approvals.',
   'Verified identities, other portals, governance and financial evidence remain protected.',
   'Execution awaits a verified encrypted backup and Storage byte cleanup workflow. That execution protocol will require a fresh preview and consent.'));
 return review||jsonb_build_object('fingerprint',encode(sha256(convert_to(jsonb_build_object(
  'review',review,'rosterRevision',roster_seq,'lifecycleRevision',seq)::text,'UTF8')),'hex'),
  'rosterRevision',roster_seq,'lifecycleRevision',seq);
end;
$$;
alter table public.admin_proposals add column residence_roster_revision bigint,
 add column residence_lifecycle_revision bigint,add column residence_final_reason text,
 add column residence_final_by uuid references public.admin_memberships(context_id),add column residence_final_at timestamptz;
-- JSON-era consent never authorizes a new reviewed protocol.
update public.admin_proposals set status='invalidated' where kind='residence_deletion' and status in('pending','approved');
create function private.residence_review_current(p public.admin_proposals) returns boolean
language plpgsql stable set search_path='' as $$
declare live jsonb;
begin
 if p.kind<>'residence_deletion' or p.expires_at<=clock_timestamp() or p.residence_lifecycle_revision is null then return false;end if;
 live:=private.residence_review_preview(p.preview->'options');
 return coalesce(live is not null and live->'blockers'='[]'::jsonb and p.target_residence_id=(live#>>'{options,hostelId}')::uuid
  and p.residence_roster_revision=(live->>'rosterRevision')::bigint
  and p.residence_lifecycle_revision<=(live->>'lifecycleRevision')::bigint
  and p.preview-array['fingerprint','lifecycleRevision']=live-array['fingerprint','lifecycleRevision']
  and p.baseline_digest=p.preview->>'fingerprint'
  and not exists(select 1 from private.residence_review_events e where e.revision>p.residence_lifecycle_revision
   and e.resource_ids && array(select jsonb_array_elements_text(p.preview->'resourceIds')::uuid)),false);
end;
$$;
create function private.residence_review_quorum(proposal uuid) returns boolean
language sql stable set search_path='' as $$
 select count(*)>=2 and coalesce(bool_and(v.decision='approved' and exists(
  select 1 from jsonb_array_elements(p.preview->'roster') r where r->>'id'=v.administrator_context_id::text)),false)
 from public.admin_votes v join public.admin_proposals p on p.id=v.proposal_id where p.id=proposal;
$$;
create function private.residence_review_proposal_guard() returns trigger
language plpgsql set search_path='' as $$
declare actor uuid;live jsonb;allowed boolean:=false;
begin
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
create trigger residence_review_proposal_guard before insert or update or delete on public.admin_proposals
 for each row execute function private.residence_review_proposal_guard();
create function private.residence_review_vote_guard() returns trigger
language plpgsql set search_path='' as $$
declare p public.admin_proposals;actor uuid;
begin
 if tg_op='UPDATE' and exists(select 1 from public.admin_proposals where id=old.proposal_id and kind='residence_deletion') then
  raise exception using errcode='42501',message='Residence votes are immutable';end if;
 select * into p from public.admin_proposals where id=case when tg_op='DELETE' then old.proposal_id else new.proposal_id end for update;
 if p.kind is distinct from 'residence_deletion' then return case when tg_op='DELETE' then old else new end;end if;
 if tg_op<>'INSERT' then raise exception using errcode='42501',message='Residence votes are immutable';end if;
 perform pg_advisory_xact_lock(hashtextextended('platform-settings',0));
 perform revision from private.residence_review_state where singleton for share;
 actor:=private.approval_authorized_context();
 if actor is null or actor is distinct from new.administrator_context_id or p.status not in('pending','approved')
  or not private.residence_review_current(p) or not exists(select 1 from jsonb_array_elements(p.preview->'roster') r where r->>'id'=actor::text)
  or exists(select 1 from public.admin_votes where proposal_id=p.id and administrator_context_id=actor)
  or actor=p.proposer_context_id and new.decision<>'approved'
  or actor<>p.proposer_context_id and not exists(select 1 from public.admin_votes where proposal_id=p.id and administrator_context_id=p.proposer_context_id and decision='approved') then
  raise exception using errcode='42501',message='One current own-key vote per reviewed administrator is required';end if;
 new.decided_at:=clock_timestamp();return new;
end;
$$;
create trigger residence_review_vote_guard before insert or update or delete on public.admin_votes
 for each row execute function private.residence_review_vote_guard();
create function private.residence_review_vote_recorded() returns trigger
language plpgsql set search_path='' as $$
begin
 if exists(select 1 from public.admin_proposals where id=new.proposal_id and kind='residence_deletion' and status in('pending','approved')) then
  if new.decision='rejected' then update public.admin_proposals set status='rejected' where id=new.proposal_id;
  elsif private.residence_review_quorum(new.proposal_id) then update public.admin_proposals set status='approved' where id=new.proposal_id and status='pending';end if;
 end if;return new;
end;
$$;
create trigger residence_review_vote_recorded after insert on public.admin_votes
 for each row execute function private.residence_review_vote_recorded();
revoke all on function private.residence_review_evidence_guard(),private.residence_review_changed(),private.valid_residence_review(jsonb),
 private.residence_review_preview(jsonb),private.residence_review_current(public.admin_proposals),private.residence_review_quorum(uuid),
 private.residence_review_proposal_guard(),private.residence_review_vote_guard(),private.residence_review_vote_recorded()
 from public,anon,authenticated,pinevela_backend;
