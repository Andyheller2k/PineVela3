-- Durable preparation only. No deletion, cooldown or Storage cleanup is enabled.
create table private.residence_deletion_preparations (
 id uuid primary key default gen_random_uuid(),
 proposal_id uuid not null unique references public.admin_proposals(id),
 founder_context_id uuid not null references public.admin_memberships(context_id),
 preview_digest text not null check(preview_digest ~ '^[a-f0-9]{64}$'),
 state text not null default 'frozen' check(state in('frozen','cancelled')),
 created_at timestamptz not null default clock_timestamp(),
 cancelled_at timestamptz,
 cancelled_by uuid references public.admin_memberships(context_id),
 cancellation_reason text,
 check((state='cancelled')=(cancelled_at is not null)),
 check((state='cancelled')=(cancelled_by is not null)),
 check((state='cancelled')=(cancellation_reason is not null))
);
alter table private.residence_deletion_preparations enable row level security;
revoke all on private.residence_deletion_preparations from public,anon,authenticated,pinevela_backend;

alter function private.residence_review_preview(jsonb) rename to residence_review_preview_v40;
create function private.residence_review_preview(options jsonb) returns jsonb
language plpgsql stable set search_path='' as $$
declare p jsonb;review jsonb;homes uuid[];managers uuid[];contexts uuid[];
begin
 p:=private.residence_review_preview_v40(options);if p is null then return null;end if;
 select array_agg(value::uuid) into homes from jsonb_array_elements_text(p#>'{resources,residences}');
 select array_agg((a->>'id')::uuid) into managers from jsonb_array_elements(p->'accounts') a where a->>'role'='manager';
 select array_agg(value::uuid) into contexts from jsonb_array_elements_text(p#>'{resources,account_contexts}');
 if (options->>'deleteManager')::boolean and exists(select 1 from public.staff_assignments s
  where s.created_by_manager_id=any(managers) and s.status='active' and s.ended_at is null and not s.residence_id=any(homes)) then
  p:=jsonb_set(p,'{blockers}',p->'blockers'||jsonb_build_array('Active staff outside the reviewed residences require a separate ownership review.'));end if;
 if exists(select 1 from public.payments where residence_id=any(homes) and status in('initialized','pending')) then
  p:=jsonb_set(p,'{blockers}',p->'blockers'||jsonb_build_array('Resolve pending residence payments before freezing this review.'));end if;
 if exists(select 1 from public.media_assets where state in('reserved','removing') and (
  owner_context_id=any(contexts) or id::text in(select jsonb_array_elements_text(p#>'{resources,media_assets}')))) then
  p:=jsonb_set(p,'{blockers}',p->'blockers'||jsonb_build_array('Finish or reconcile in-flight photographs before freezing this review.'));end if;
 review:=p-array['fingerprint','rosterRevision','lifecycleRevision'];
 review:=jsonb_set(review,'{version}','2');
 review:=jsonb_set(review,'{preparationAvailable}','true');
 review:=jsonb_set(review,'{notes}',(review->'notes')-'Execution awaits a verified encrypted backup and Storage byte cleanup workflow. That execution protocol will require a fresh preview and consent.'||
  jsonb_build_array('The founder can pause reviewed housing records for backup preparation. This does not delete anything.',
   'Deletion remains disabled. Preparation requires fresh consent, an explicit confirmation and the founder approval key.'));
 return review||jsonb_build_object('fingerprint',encode(sha256(convert_to(jsonb_build_object(
  'review',review,'rosterRevision',p->'rosterRevision','lifecycleRevision',p->'lifecycleRevision')::text,'UTF8')),'hex'),
  'rosterRevision',p->'rosterRevision','lifecycleRevision',p->'lifecycleRevision');
end;
$$;
alter function private.residence_review_current(public.admin_proposals) rename to residence_review_current_v40;
create function private.residence_review_current(p public.admin_proposals) returns boolean
language sql stable set search_path='' as $$
 select private.residence_review_current_v40(p) and not exists(select 1 from private.residence_deletion_preparations
  where proposal_id=p.id and state='cancelled');
$$;
-- A review advertising unavailable preparation cannot authorize the new pause.
update public.admin_proposals set status='invalidated' where kind='residence_deletion' and status in('pending','approved');

create function private.residence_preparation_guard() returns trigger
language plpgsql set search_path='' as $$
declare actor uuid;p public.admin_proposals;
begin
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
   or p.preview->>'version' is distinct from '2' or p.preview->'preparationAvailable' is distinct from 'true'::jsonb
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
create trigger residence_preparation_guard before insert or update or delete on private.residence_deletion_preparations
 for each row execute function private.residence_preparation_guard();
create function private.residence_preparation_cancelled() returns trigger
language plpgsql set search_path='' as $$
begin
 if old.state='frozen' and new.state='cancelled' then
  update public.admin_proposals set status=case when expires_at<=clock_timestamp() then 'expired' else 'invalidated' end
   where id=new.proposal_id and status in('pending','approved');end if;return new;
end;
$$;
create trigger residence_preparation_cancelled after update on private.residence_deletion_preparations
 for each row execute function private.residence_preparation_cancelled();

-- Take the lock BEFORE any other row triggers. Guard before cascades and check the final
-- row, including changes made by existing validation/timestamp triggers.
create function private.residence_freeze_writer_lock() returns trigger
language plpgsql set search_path='' as $$
begin
 perform pg_advisory_xact_lock_shared(hashtextextended('residence-deletion-freeze',0));
 return case when tg_op='DELETE' then old else new end;
end;
$$;
create function private.residence_freeze_write_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare before_row jsonb:='{}';after_row jsonb:='{}';item record;fields record;scope jsonb;ids jsonb;table_ids jsonb;
begin
 if tg_op<>'INSERT' then before_row:=to_jsonb(old);end if;
 if tg_op<>'DELETE' then after_row:=to_jsonb(new);end if;
 if tg_op='UPDATE' and before_row=after_row then return new;end if;
 for item in select p.preview from private.residence_deletion_preparations f
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
    raise exception using errcode='55000',message='Reviewed housing records are paused for backup preparation';end if;
  end loop;
 end loop;
 return case when tg_op='DELETE' then old else new end;
end;
$$;
create function private.residence_freeze_truncate_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock_shared(hashtextextended('residence-deletion-freeze',0));
 if tg_table_name='residence_deletion_preparations' then
  raise exception using errcode='42501',message='Residence preparation history is immutable';end if;
 if exists(select 1 from private.residence_deletion_preparations where state='frozen') then
  raise exception using errcode='55000',message='Reviewed housing records are paused for backup preparation';end if;
 return null;
end;
$$;
create trigger residence_preparation_truncate_guard before truncate on private.residence_deletion_preparations
 for each statement execute function private.residence_freeze_truncate_guard();
do $$ declare entry text;schema_name text;table_name text;
begin
 foreach entry in array array['public.residences','public.manager_assignments','public.blocks','public.floors','public.rooms','public.beds',
  'public.allocations','public.staff_assignments','public.verification_cases','public.verification_inspections','public.residence_change_requests',
  'public.maintenance_issues','public.maintenance_events','public.repair_reviews','public.staff_reviews','public.meetings','public.staff_bargains',
  'public.payments','public.account_contexts','public.profiles','private.room_activation_keys','private.account_enrollments',
  'public.registration_bans','private.account_policies','public.media_assets','private.manager_settings'] loop
  schema_name:=split_part(entry,'.',1);table_name:=split_part(entry,'.',2);
  execute format('create trigger aaa_residence_freeze_writer_lock before insert or update or delete on %I.%I for each row execute function private.residence_freeze_writer_lock()',schema_name,table_name);
  execute format('create trigger aab_residence_freeze_write_guard before insert or update or delete on %I.%I for each row execute function private.residence_freeze_write_guard()',schema_name,table_name);
  execute format('create trigger residence_freeze_truncate_guard before truncate on %I.%I for each statement execute function private.residence_freeze_truncate_guard()',schema_name,table_name);
  execute format('create trigger zzz_residence_freeze_write_guard after insert or update or delete on %I.%I for each row execute function private.residence_freeze_write_guard()',schema_name,table_name);
 end loop;
end;$$;
revoke all on function private.residence_review_preview_v40(jsonb),private.residence_review_preview(jsonb),
 private.residence_review_current_v40(public.admin_proposals),private.residence_review_current(public.admin_proposals),
 private.residence_preparation_guard(),private.residence_preparation_cancelled(),private.residence_freeze_writer_lock(),private.residence_freeze_write_guard(),private.residence_freeze_truncate_guard()
 from public,anon,authenticated,pinevela_backend;
