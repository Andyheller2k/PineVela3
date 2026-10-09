-- Maintenance stays a housing workflow, with repair ratings independent of staff reviews.
alter table public.maintenance_issues
  add column allocation_id uuid references public.allocations(id),
  add column location_tag text not null default '',
  add column visit_window text not null default '',
  add column contact_phone text not null default '',
  add column contact_method text not null default '',
  add column deadline timestamptz,
  add column timeframe text,
  add column assigned_at timestamptz,
  add column accepted_at timestamptz,
  add column declined_at timestamptz,
  add column decline_reason text,
  add column reschedule_previous_status text,
  add column requested_deadline timestamptz,
  add column requested_timeframe text,
  add column reschedule_reason text,
  add column completion_notes text,
  add column completion_paths text[] not null default '{}',
  add column completed_at timestamptz,
  add column confirmed_at timestamptz,
  add column resident_feedback text,
  add column manager_close_notes text;
create unique index maintenance_one_open_resident on public.maintenance_issues(reporter_context_id)
  where allocation_id is not null and status not in ('resident_confirmed','closed');
alter table public.maintenance_issues add constraint maintenance_details_bounded check (
  length(details) <= 10000 and cardinality(photo_paths) <= 10 and cardinality(completion_paths) <= 12
  and length(location_tag) <= 300 and length(visit_window) <= 300 and length(contact_phone) <= 50 and length(contact_method) <= 100
  and (status <> 'reschedule_requested' or (requested_deadline is not null and reschedule_previous_status in ('assigned','accepted','follow_up')))
  and (status not in ('staff_completed','resident_confirmed','closed') or completed_at is not null)
  and (status <> 'resident_confirmed' or confirmed_at is not null));

alter table public.media_assets drop constraint media_assets_purpose_check;
alter table public.media_assets add constraint media_assets_purpose_check check (purpose in ('hostel','market','inspection','maintenance','repair'));
alter table public.media_assets add column residence_id uuid references public.residences(id),
  add column allocation_id uuid references public.allocations(id), add column issue_id uuid references public.maintenance_issues(id);
alter table public.media_assets add constraint maintenance_media_scope check (
  (purpose in ('maintenance','repair')) = (residence_id is not null)
  and (purpose = 'repair') = (issue_id is not null)
  and (allocation_id is null or purpose = 'maintenance'));
create or replace function private.validate_media_asset() returns trigger
language plpgsql security definer set search_path = '' as $$
declare owner_kind text;
begin
  if tg_op = 'UPDATE' and (new.id,new.owner_context_id,new.owner_auth_user_id,new.purpose,new.inspection_id,new.bucket_id,new.object_path,new.byte_size,new.sha256,new.created_at,new.residence_id,new.allocation_id,new.issue_id)
    is distinct from (old.id,old.owner_context_id,old.owner_auth_user_id,old.purpose,old.inspection_id,old.bucket_id,old.object_path,old.byte_size,old.sha256,old.created_at,old.residence_id,old.allocation_id,old.issue_id) then
    raise exception 'Media ownership and original metadata cannot change' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then new.updated_at = now(); return new; end if;
  select kind into owner_kind from public.account_contexts where id = new.owner_context_id;
  if not ((new.purpose = 'hostel' and owner_kind in ('manager','admin')) or
    (new.purpose = 'market' and owner_kind in ('seller','admin')) or
    (new.purpose = 'inspection' and owner_kind = 'officer' and exists (select 1 from public.verification_inspections i where i.id = new.inspection_id and i.officer_context_id = new.owner_context_id)) or
    (new.purpose = 'maintenance' and (
      (owner_kind = 'resident' and exists(select 1 from public.allocations a join public.rooms r on r.id = a.room_id
        join public.floors f on f.id = r.floor_id join public.blocks b on b.id = f.block_id
        where a.id = new.allocation_id and a.resident_context_id = new.owner_context_id and b.residence_id = new.residence_id)) or
      (owner_kind in ('manager','admin') and new.allocation_id is null and (owner_kind = 'admin' or exists(select 1 from public.manager_assignments a
        where a.residence_id = new.residence_id and a.manager_context_id = new.owner_context_id and a.ended_at is null))))) or
    (new.purpose = 'repair' and owner_kind = 'staff' and exists(select 1 from public.maintenance_issues i join public.staff_assignments s on s.id = i.assigned_staff_id
      where i.id = new.issue_id and i.residence_id = new.residence_id and s.staff_context_id = new.owner_context_id and s.status = 'active' and s.ended_at is null))) then
    raise exception 'Media purpose requires its authorized account relationship' using errcode = '23514';
  end if;
  new.updated_at = now(); return new;
end;
$$;

create function private.validate_maintenance_issue() returns trigger
language plpgsql security definer set search_path = '' as $$
declare reporter_kind text; photo text;
begin
  if tg_op = 'UPDATE' and (new.id,new.residence_id,new.room_id,new.reporter_context_id,new.allocation_id,new.created_at)
    is distinct from (old.id,old.residence_id,old.room_id,old.reporter_context_id,old.allocation_id,old.created_at) then
    raise exception 'Maintenance origin cannot change' using errcode = '23514';
  end if;
  if new.room_id is not null and not exists(select 1 from public.rooms r join public.floors f on f.id=r.floor_id
    join public.blocks b on b.id=f.block_id where r.id=new.room_id and b.residence_id=new.residence_id) then
    raise exception 'Issue room belongs to another residence' using errcode = '23514'; end if;
  if new.assigned_staff_id is not null and not exists(select 1 from public.staff_assignments a where a.id=new.assigned_staff_id
    and a.residence_id=new.residence_id and (tg_op='UPDATE' and new.assigned_staff_id is not distinct from old.assigned_staff_id or a.status='active' and a.ended_at is null)) then
    raise exception 'Assign active staff from the same residence' using errcode = '23514'; end if;
  select kind into reporter_kind from public.account_contexts where id = new.reporter_context_id;
  if reporter_kind = 'resident' then
    if not exists(select 1 from public.allocations a where a.id = new.allocation_id and a.resident_context_id = new.reporter_context_id and a.room_id = new.room_id and (tg_op = 'UPDATE' or a.ended_at is null)) then
      raise exception 'Reporting resident allocation required' using errcode = '23514'; end if;
  elsif reporter_kind not in ('manager','admin') or new.allocation_id is not null then
    raise exception 'Housing reporter required' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' and reporter_kind = 'manager' and not exists(select 1 from public.manager_assignments m
    where m.manager_context_id = new.reporter_context_id and m.residence_id = new.residence_id and m.ended_at is null) then
    raise exception 'Reporter must manage this residence' using errcode = '23514'; end if;
  foreach photo in array new.photo_paths loop
    if not exists(select 1 from public.media_assets m where '/api/media/' || m.id::text = photo and m.state = 'ready'
      and m.purpose = 'maintenance' and m.owner_context_id = new.reporter_context_id and m.residence_id = new.residence_id
      and m.allocation_id is not distinct from new.allocation_id) then
      raise exception 'Report photographs belong to the reporting housing account' using errcode = '23514'; end if;
  end loop;
  -- Completion evidence from previous assignments remains historical evidence on reassignment.
  if tg_op = 'INSERT' or new.completion_paths is distinct from old.completion_paths then
    foreach photo in array new.completion_paths loop
      if not exists(select 1 from public.media_assets m join public.staff_assignments s on s.id = new.assigned_staff_id
        where '/api/media/' || m.id::text = photo and m.state = 'ready' and m.purpose = 'repair'
          and m.issue_id = new.id and m.owner_context_id = s.staff_context_id) then
        raise exception 'Repair evidence belongs to the assigned staff and issue' using errcode = '23514'; end if;
    end loop;
  end if;
  return new;
end;
$$;
drop trigger pinevela_relationships on public.maintenance_issues;
create trigger pinevela_maintenance_origin before insert or update on public.maintenance_issues for each row execute function private.validate_maintenance_issue();
revoke all on function private.validate_maintenance_issue() from public,anon,authenticated,pinevela_backend;

-- Exact active assignment is required for staff to read tickets, events and photos.
alter policy maintenance_related_read on public.maintenance_issues using (
  reporter_context_id = private.current_context_id() or private.can_manage_residence(residence_id)
  or exists(select 1 from public.staff_assignments s where s.id = assigned_staff_id and s.staff_context_id = private.current_context_id() and s.status = 'active' and s.ended_at is null));
alter policy media_account_read on public.media_assets using (state = 'ready' and (
  owner_context_id = private.current_context_id() or private.current_kind() = 'admin'
  or (purpose = 'inspection' and exists(select 1 from public.verification_inspections i join public.verification_cases v on v.id = i.case_id
    where i.id = inspection_id and (i.officer_context_id = private.current_context_id() or v.applicant_context_id = private.current_context_id())))
  or (purpose in ('maintenance','repair') and exists(select 1 from public.maintenance_issues i where i.residence_id = media_assets.residence_id
    and ('/api/media/' || media_assets.id::text = any(i.photo_paths) or '/api/media/' || media_assets.id::text = any(i.completion_paths)
      or exists(select 1 from public.maintenance_events e where e.issue_id = i.id and '/api/media/' || media_assets.id::text = any(e.photo_paths)))))));
-- The subqueries above use RLS on issues/events; parent portals and unrelated staff get no access.
create or replace view public.housing_issue_details with (security_barrier = true) as
select i.id,i.residence_id,i.room_id,i.reporter_context_id,i.assigned_staff_id,i.title,i.details,i.category,i.urgency,i.photo_paths,i.status,i.created_at,i.updated_at,i.closed_at,
  h.name as residence_name,r.room_number,b.name as block_name,p.display_name as reporter_name,sp.display_name as staff_name,
  i.allocation_id,i.location_tag,i.visit_window,i.contact_phone,i.contact_method,i.deadline,i.timeframe,i.assigned_at,i.accepted_at,i.declined_at,i.decline_reason,
  i.reschedule_previous_status,i.requested_deadline,i.requested_timeframe,i.reschedule_reason,i.completion_notes,i.completion_paths,i.completed_at,i.confirmed_at,i.resident_feedback,i.manager_close_notes,
  s.staff_context_id,sp.email as staff_email,sp.phone as staff_phone,
  (select jsonb_agg(jsonb_build_object('action',e.event_type,'actorId',e.actor_context_id,'timestamp',e.occurred_at,'note',e.notes,'photos',e.photo_paths) order by e.occurred_at,e.id)
    from public.maintenance_events e where e.issue_id = i.id) as history_logs,
  (select rating from public.repair_reviews rr where rr.issue_id = i.id) as repair_rating
from public.maintenance_issues i join public.residences h on h.id = i.residence_id
join public.account_contexts c on c.id = i.reporter_context_id join public.profiles p on p.id = c.auth_user_id
left join public.rooms r on r.id = i.room_id left join public.floors f on f.id = r.floor_id left join public.blocks b on b.id = f.block_id
left join public.staff_assignments s on s.id = i.assigned_staff_id left join public.account_contexts sc on sc.id = s.staff_context_id left join public.profiles sp on sp.id = sc.auth_user_id
where private.current_context_id() is not null and (i.reporter_context_id = private.current_context_id() or private.can_manage_residence(i.residence_id)
  or (s.staff_context_id = private.current_context_id() and s.status = 'active' and s.ended_at is null));

create function private.validate_maintenance_evidence() returns trigger
language plpgsql security definer set search_path = '' as $$
declare photo text; issue public.maintenance_issues;
begin
  select * into issue from public.maintenance_issues where id = new.issue_id;
  if tg_table_name = 'maintenance_events' then
    foreach photo in array new.photo_paths loop
      if not exists(select 1 from public.media_assets m where '/api/media/' || m.id::text = photo and m.state = 'ready'
        and m.owner_context_id = new.actor_context_id and m.residence_id = issue.residence_id
        and ((m.purpose = 'repair' and m.issue_id = issue.id) or (m.purpose = 'maintenance' and m.owner_context_id = issue.reporter_context_id and m.allocation_id is not distinct from issue.allocation_id))) then
        raise exception 'Ticket evidence must belong to its author and housing relationship' using errcode = '23514'; end if;
    end loop;
  elsif issue.reporter_context_id <> new.resident_context_id or issue.status <> 'staff_completed' or not exists (
    select 1 from public.allocations a where a.id = issue.allocation_id and a.resident_context_id = new.resident_context_id and a.ended_at is null) then
    raise exception 'Repair rating requires the reporting resident active allocation' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger pinevela_maintenance_evidence before insert on public.maintenance_events for each row execute function private.validate_maintenance_evidence();
create trigger pinevela_repair_rating before insert on public.repair_reviews for each row execute function private.validate_maintenance_evidence();
revoke all on function private.validate_maintenance_evidence() from public,anon,authenticated,pinevela_backend;

alter table public.maintenance_issues add constraint maintenance_state_relationships check (
  (status = 'reported' or assigned_staff_id is not null)
  and (status not in ('accepted','follow_up') or accepted_at is not null)
  and (status <> 'closed' or allocation_id is null or confirmed_at is not null)
  and ((status = 'closed') = (closed_at is not null)));
alter table public.maintenance_events add constraint maintenance_event_bounded check (length(coalesce(notes,'')) <= 5000 and cardinality(photo_paths) <= 12);
