-- Housing appointments are separate from retired chat and accommodation bookings.
-- Internal participants are saved allocation/employment relationships; external
-- contacts are entered details and never acquire account access through an email.
do $$ begin
  if exists(select 1 from public.meetings) then
    raise exception 'Reconcile existing appointments before changing their participant model' using errcode = '23514';
  end if;
end $$;
drop policy meetings_related_read on public.meetings;
alter table public.meetings drop column staff_context_id,
  add column participant_context_id uuid references public.account_contexts(id),
  add column allocation_id uuid references public.allocations(id),
  add column staff_assignment_id uuid references public.staff_assignments(id),
  add column requester_type text not null check (requester_type in ('resident','staff','external')),
  add column contact_name text not null check (length(btrim(contact_name)) between 1 and 120),
  add column contact_email text not null default '' check (length(contact_email) <= 254),
  add column contact_phone text not null default '' check (length(contact_phone) <= 40),
  add column room_label text not null default '' check (length(room_label) <= 200),
  add column topic text not null check (length(btrim(topic)) between 1 and 200),
  add column category text not null check (category in ('Room / Accommodation','Maintenance Follow-up','Payment / Billing','Staff Operational Shift','Disciplinary / Grievance','General Consultation')),
  add column mode text not null check (mode in ('In-Person (Admin Office)','Google Meet / Video','Phone Call')),
  add column response_notes text not null default '' check (length(response_notes) <= 3000),
  add column updated_at timestamptz not null default now(),
  add column decided_at timestamptz,
  add column completed_at timestamptz,
  add column removed_at timestamptz,
  add constraint meeting_participant_model check (
    (requester_type = 'external' and participant_context_id is null and allocation_id is null and staff_assignment_id is null and requested_by_context_id = manager_context_id)
    or (requester_type = 'resident' and participant_context_id is not null and allocation_id is not null and staff_assignment_id is null)
    or (requester_type = 'staff' and participant_context_id is not null and allocation_id is null and staff_assignment_id is not null)),
  add constraint meeting_agenda_length check (length(notes) <= 3000),
  add constraint meeting_location_length check (length(location) <= 2000),
  add constraint meeting_decision_state check (
    (status not in ('accepted','declined','completed') or decided_at is not null)
    and ((status = 'completed') = (completed_at is not null))
    and (completed_at is null or completed_at >= starts_at)
    and (removed_at is null or status in ('declined','cancelled','completed')));
create index meetings_manager_schedule_idx on public.meetings(manager_context_id,starts_at) where removed_at is null;
create index meetings_participant_idx on public.meetings(participant_context_id,starts_at);

create function private.check_meeting_appointment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'requested' or new.removed_at is not null or new.decided_at is not null or new.completed_at is not null
      or not exists(select 1 from public.manager_assignments m join public.account_contexts c on c.id = m.manager_context_id
        where m.manager_context_id = new.manager_context_id and m.residence_id = new.residence_id and m.ended_at is null
          and c.kind = 'manager' and c.status = 'active')
      or new.requested_by_context_id not in (new.manager_context_id,coalesce(new.participant_context_id,new.manager_context_id)) then
      raise exception 'Appointment requires an active assigned manager and saved creator' using errcode = '23514';
    end if;
    if new.requester_type = 'resident' and not exists(select 1 from public.allocations a
      join public.rooms r on r.id = a.room_id join public.floors f on f.id = r.floor_id join public.blocks b on b.id = f.block_id
      join public.account_contexts c on c.id = a.resident_context_id join public.profiles p on p.id = c.auth_user_id
      where a.id = new.allocation_id and a.resident_context_id = new.participant_context_id and a.ended_at is null
        and b.residence_id = new.residence_id and c.kind = 'resident' and c.status = 'active'
        and row(new.contact_name,new.contact_email,new.contact_phone,new.room_label) = row(p.display_name,p.email,coalesce(p.phone,''),r.room_number)) then
      raise exception 'Appointment resident must hold an active room in this residence' using errcode = '23514';
    elsif new.requester_type = 'staff' and not exists(select 1 from public.staff_assignments s
      join public.account_contexts c on c.id = s.staff_context_id join public.profiles p on p.id = c.auth_user_id where s.id = new.staff_assignment_id
        and s.staff_context_id = new.participant_context_id and s.residence_id = new.residence_id
        and s.status = 'active' and s.ended_at is null and c.kind = 'staff' and c.status = 'active'
        and row(new.contact_name,new.contact_email,new.contact_phone,new.room_label) = row(p.display_name,p.email,coalesce(p.phone,''),s.job_role)) then
      raise exception 'Appointment staff must have active employment in this residence' using errcode = '23514';
    end if;
  else
    if old.decided_at is not null and new.decided_at is distinct from old.decided_at then
      raise exception 'Original appointment decision time is immutable' using errcode = '23514';
    end if;
    if row(new.id,new.residence_id,new.manager_context_id,new.requested_by_context_id,new.participant_context_id,new.allocation_id,new.staff_assignment_id,new.requester_type,new.contact_name,new.contact_email,new.contact_phone,new.room_label,new.topic,new.category,new.notes,new.created_at)
      is distinct from row(old.id,old.residence_id,old.manager_context_id,old.requested_by_context_id,old.participant_context_id,old.allocation_id,old.staff_assignment_id,old.requester_type,old.contact_name,old.contact_email,old.contact_phone,old.room_label,old.topic,old.category,old.notes,old.created_at) then
      raise exception 'Appointment ownership, contact snapshots and original agenda are immutable' using errcode = '23514';
    end if;
    if old.removed_at is not null or old.status in ('declined','cancelled','completed') then
      if row(new.status,new.starts_at,new.ends_at,new.mode,new.location,new.response_notes,new.decided_at,new.completed_at)
        is distinct from row(old.status,old.starts_at,old.ends_at,old.mode,old.location,old.response_notes,old.decided_at,old.completed_at) then
        raise exception 'Final appointment evidence cannot be edited' using errcode = '23514';
      end if;
    end if;
    if new.status <> old.status and not ((old.status = 'requested' and new.status in ('accepted','declined','cancelled'))
      or (old.status = 'accepted' and new.status in ('completed','cancelled'))) then
      raise exception 'Invalid appointment transition' using errcode = '23514';
    end if;
    if new.status <> old.status and new.status in ('accepted','declined','completed') and not exists (
      select 1 from public.manager_assignments m join public.account_contexts c on c.id = m.manager_context_id
      where m.manager_context_id = new.manager_context_id and m.residence_id = new.residence_id
        and m.ended_at is null and c.kind = 'manager' and c.status = 'active') then
      raise exception 'Appointment decision requires its active assigned manager' using errcode = '23514';
    end if;
    if old.removed_at is not null and new.removed_at is distinct from old.removed_at then
      raise exception 'Removed appointment cannot be restored or rewritten' using errcode = '23514';
    end if;
    if new.status = 'accepted' and (old.status <> 'accepted' or row(new.starts_at,new.ends_at,new.mode) is distinct from row(old.starts_at,old.ends_at,old.mode)) then
      if new.requester_type = 'resident' and not exists(select 1 from public.allocations a join public.account_contexts c on c.id = a.resident_context_id
        where a.id = new.allocation_id and a.resident_context_id = new.participant_context_id and a.ended_at is null and c.status = 'active')
        or new.requester_type = 'staff' and not exists(select 1 from public.staff_assignments s join public.account_contexts c on c.id = s.staff_context_id
          where s.id = new.staff_assignment_id and s.staff_context_id = new.participant_context_id and s.status = 'active' and s.ended_at is null and c.status = 'active') then
        raise exception 'Approval or rescheduling requires the original active housing participant' using errcode = '23514';
      end if;
    end if;
  end if;
  return new;
end;
$$;
create trigger meeting_appointment_relationships before insert or update on public.meetings for each row execute function private.check_meeting_appointment();

create function private.can_read_meeting(appointment_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.current_context_id() is not null and exists(select 1 from public.meetings v where v.id = appointment_id and (
    private.current_kind() = 'admin'
    or (v.manager_context_id = private.current_context_id() and private.can_manage_residence(v.residence_id))
    or (v.participant_context_id = private.current_context_id() and (
      (private.current_kind() = 'resident' and exists(select 1 from public.allocations a where a.id = v.allocation_id and a.resident_context_id = v.participant_context_id and a.ended_at is null))
      or (private.current_kind() = 'staff' and exists(select 1 from public.staff_assignments s where s.id = v.staff_assignment_id and s.staff_context_id = v.participant_context_id and s.status = 'active' and s.ended_at is null))))));
$$;
create policy meetings_related_read on public.meetings for select to authenticated using (private.can_read_meeting(id));
create view public.housing_meeting_details with (security_barrier = true) as
select v.*,h.name as residence_name,p.display_name as manager_name
from public.meetings v join public.residences h on h.id = v.residence_id
join public.account_contexts c on c.id = v.manager_context_id join public.profiles p on p.id = c.auth_user_id
where private.can_read_meeting(v.id);
create view public.housing_meeting_participants with (security_barrier = true) as
select a.resident_context_id as context_id,b.residence_id,'resident'::text as kind,p.display_name,p.email,p.phone,
  r.room_number as room_label,a.id as allocation_id,null::uuid as staff_assignment_id
from public.allocations a join public.rooms r on r.id = a.room_id join public.floors f on f.id = r.floor_id join public.blocks b on b.id = f.block_id
join public.account_contexts c on c.id = a.resident_context_id join public.profiles p on p.id = c.auth_user_id
where a.ended_at is null and c.status = 'active' and private.current_kind() = 'manager' and private.can_manage_residence(b.residence_id)
union all
select s.staff_context_id,s.residence_id,'staff'::text,p.display_name,p.email,p.phone,s.job_role,null::uuid,s.id
from public.staff_assignments s join public.account_contexts c on c.id = s.staff_context_id join public.profiles p on p.id = c.auth_user_id
where s.status = 'active' and s.ended_at is null and c.status = 'active' and private.current_kind() = 'manager' and private.can_manage_residence(s.residence_id);
revoke all on public.housing_meeting_details,public.housing_meeting_participants from public,anon;
grant select on public.housing_meeting_details,public.housing_meeting_participants to authenticated,pinevela_backend;
revoke all on function private.check_meeting_appointment(),private.can_read_meeting(uuid) from public,anon,authenticated,pinevela_backend;
grant execute on function private.can_read_meeting(uuid) to authenticated,pinevela_backend;
