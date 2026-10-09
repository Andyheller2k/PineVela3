-- Active staff retention and private resident reviews. No counteroffer engine,
-- payroll subsystem, public staff ratings or maintenance-generated staff reviews.
alter table public.staff_bargains
  drop constraint staff_bargains_status_check,
  add constraint staff_bargains_status_check check (status in ('proposed','accepted','declined','stay_confirmed','quit_confirmed','cancelled')),
  add column reason_to_quit text not null check (length(btrim(reason_to_quit)) between 5 and 2000),
  add column original_role text not null,
  add column original_shift text not null,
  add column original_block_id uuid references public.blocks(id),
  add column response_note text not null default '' check (length(response_note) <= 3000),
  add column decision_fields jsonb not null default '{}'::jsonb check (jsonb_typeof(decision_fields) = 'object'),
  add column decided_at timestamptz,
  add column staff_decided_at timestamptz,
  add constraint staff_bargain_decision_time check (decided_at is null or decided_at >= created_at),
  add constraint staff_bargain_final_time check (staff_decided_at is null or (decided_at is not null and staff_decided_at >= decided_at)),
  add constraint staff_bargain_decision_state check (
    (status not in ('accepted','declined','stay_confirmed','quit_confirmed') or decided_at is not null)
    and (status not in ('stay_confirmed','quit_confirmed') or staff_decided_at is not null)
    and (status <> 'proposed' or (decided_at is null and staff_decided_at is null and response_note = '' and decision_fields = '{}'::jsonb))
    and (status not in ('declined','stay_confirmed','quit_confirmed') or (length(btrim(response_note)) > 0 and decision_fields = '{}'::jsonb))
    and (status in ('stay_confirmed','quit_confirmed') or staff_decided_at is null));
create unique index staff_bargain_unresolved_idx on public.staff_bargains(staff_assignment_id) where status in ('proposed','declined');

create function private.check_staff_bargain() returns trigger
language plpgsql security definer set search_path = '' as $$
declare s public.staff_assignments;
begin
  select * into s from public.staff_assignments where id = new.staff_assignment_id;
  if tg_op = 'INSERT' then
    if s.id is null or s.status <> 'active' or s.ended_at is not null or not exists (
      select 1 from public.manager_assignments m join public.account_contexts c on c.id = m.manager_context_id
      where m.residence_id = s.residence_id and m.manager_context_id = new.manager_context_id
        and m.ended_at is null and c.kind = 'manager' and c.status = 'active')
      or not exists(select 1 from public.account_contexts c where c.id = s.staff_context_id and c.kind = 'staff' and c.status = 'active')
      or new.status <> 'proposed' then
      raise exception 'Active staff and assigned manager required' using errcode = '23514';
    end if;
    if row(new.original_role,new.original_shift,new.original_block_id) is distinct from row(s.job_role,s.shift,s.assigned_block_id) then
      raise exception 'Proposal snapshot must match saved employment' using errcode = '23514';
    end if;
  else
    if row(new.id,new.staff_assignment_id,new.manager_context_id,new.proposed_terms,new.reason_to_quit,new.original_role,new.original_shift,new.original_block_id,new.created_at)
      is distinct from row(old.id,old.staff_assignment_id,old.manager_context_id,old.proposed_terms,old.reason_to_quit,old.original_role,old.original_shift,old.original_block_id,old.created_at) then
      raise exception 'Proposal identity and original terms are immutable' using errcode = '23514';
    end if;
    if new.status <> old.status and not (
      (old.status = 'proposed' and new.status in ('accepted','declined','cancelled')) or
      (old.status = 'declined' and new.status in ('stay_confirmed','quit_confirmed','cancelled'))) then
      raise exception 'Invalid retention transition' using errcode = '23514';
    end if;
    if old.status <> 'proposed' and row(new.response_note,new.decision_fields,new.decided_at) is distinct from row(old.response_note,old.decision_fields,old.decided_at)
      or old.status not in ('proposed','declined') and row(new.status,new.staff_decided_at) is distinct from row(old.status,old.staff_decided_at) then
      raise exception 'Saved decisions are immutable' using errcode = '23514';
    end if;
    if new.status in ('accepted','declined','stay_confirmed','quit_confirmed') and (s.ended_at is not null or s.status <> 'active') then
      raise exception 'Active employment required for a retention decision' using errcode = '23514';
    end if;
    if old.status = 'proposed' and new.status in ('accepted','declined') and not exists (
      select 1 from public.manager_assignments m join public.account_contexts c on c.id = m.manager_context_id
      where m.manager_context_id = new.manager_context_id and m.residence_id = s.residence_id
        and m.ended_at is null and c.status = 'active' and c.kind = 'manager') then
      raise exception 'Proposal manager no longer assigned' using errcode = '23514';
    end if;
  end if;
  if (new.decision_fields - array['updatedShift','updatedBlock']) <> '{}'::jsonb or exists (
    select 1 from pg_catalog.jsonb_each(new.decision_fields) d where jsonb_typeof(d.value) <> 'string' or length(btrim(d.value #>> '{}')) not between 1 and 200) then
    raise exception 'Invalid employment decision fields' using errcode = '23514';
  end if;
  if jsonb_typeof(new.proposed_terms) <> 'object' or
    not (new.proposed_terms ?& array['type','title','proposedTerms','notes']) or
    (new.proposed_terms - array['type','title','proposedTerms','notes']) <> '{}'::jsonb or
    jsonb_typeof(new.proposed_terms->'type') <> 'string' or
    new.proposed_terms->>'type' not in ('salary','shift','wing','workload','custom') or
    jsonb_typeof(new.proposed_terms->'title') <> 'string' or length(btrim(new.proposed_terms->>'title')) not between 1 and 200 or
    jsonb_typeof(new.proposed_terms->'proposedTerms') <> 'string' or length(btrim(new.proposed_terms->>'proposedTerms')) not between 3 and 8000 or
    jsonb_typeof(new.proposed_terms->'notes') <> 'string' or length(new.proposed_terms->>'notes') > 3000 then
    raise exception 'Actual typed proposal terms required' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger staff_bargain_relationships before insert or update on public.staff_bargains for each row execute function private.check_staff_bargain();

create function private.cancel_ended_staff_bargains() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.ended_at is null and new.ended_at is not null then
    update public.staff_bargains set status = 'cancelled',updated_at = now()
      where staff_assignment_id = new.id and status in ('proposed','declined');
  end if;
  return new;
end;
$$;
create trigger staff_bargains_employment_end after update on public.staff_assignments for each row execute function private.cancel_ended_staff_bargains();

drop policy staff_bargains_related_read on public.staff_bargains;
create policy staff_bargains_related_read on public.staff_bargains for select to authenticated using (
  exists(select 1 from public.staff_assignments s where s.id = staff_assignment_id and (
    (manager_context_id = private.current_context_id() and private.can_manage_residence(s.residence_id))
    or (s.staff_context_id = private.current_context_id() and s.status = 'active' and s.ended_at is null)))
  or private.current_kind() = 'admin');
create or replace view public.housing_bargain_details with (security_barrier = true) as
select v.id,v.staff_assignment_id,v.manager_context_id,v.proposed_terms,v.status,v.created_at,v.updated_at,
  s.staff_context_id,s.residence_id,p.display_name as staff_name,p.email as staff_email,p.phone as staff_phone,
  h.name as residence_name,b.name as block_name,
  v.reason_to_quit,v.original_role,v.original_shift,v.original_block_id,ob.name as original_block_name,
  v.response_note,v.decision_fields,v.decided_at,v.staff_decided_at
from public.staff_bargains v join public.staff_assignments s on s.id = v.staff_assignment_id
join public.account_contexts c on c.id = s.staff_context_id join public.profiles p on p.id = c.auth_user_id
join public.residences h on h.id = s.residence_id left join public.blocks b on b.id = s.assigned_block_id
left join public.blocks ob on ob.id = v.original_block_id
where private.current_context_id() is not null and (private.current_kind() = 'admin'
  or (v.manager_context_id = private.current_context_id() and private.can_manage_residence(s.residence_id))
  or (s.staff_context_id = private.current_context_id() and s.status = 'active' and s.ended_at is null));

-- Refuse to discard unexpected review evidence. Repair ratings belong solely to
-- repair_reviews; the unused cross-link is removed from the current schema.
do $$ begin
  if exists(select 1 from public.staff_reviews where issue_id is not null) then
    raise exception 'Reconcile legacy review links before removing them' using errcode = '23514';
  end if;
end $$;
alter table public.staff_reviews drop column issue_id,
  add constraint staff_review_comment_length check (length(comment) <= 3000);
create function private.check_staff_review() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new is distinct from old then raise exception 'Staff review evidence is immutable' using errcode = '23514'; end if;
    return new;
  end if;
  if not exists(select 1 from public.allocations a
    join public.rooms r on r.id = a.room_id join public.floors f on f.id = r.floor_id join public.blocks b on b.id = f.block_id
    join public.staff_assignments s on s.residence_id = b.residence_id
    join public.account_contexts rc on rc.id = a.resident_context_id join public.account_contexts sc on sc.id = s.staff_context_id
    where a.id = new.allocation_id and a.resident_context_id = new.resident_context_id and a.ended_at is null
      and rc.kind = 'resident' and rc.status = 'active' and s.id = new.staff_assignment_id
      and s.status = 'active' and s.ended_at is null and sc.kind = 'staff' and sc.status = 'active') then
    raise exception 'Review requires an active allocation and staff of the same residence' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger staff_review_relationships before insert or update on public.staff_reviews for each row execute function private.check_staff_review();

create function private.can_read_staff_review(assignment_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.current_context_id() is not null and exists(select 1 from public.staff_assignments s where s.id = assignment_id and (
    private.can_manage_residence(s.residence_id)
    or (s.staff_context_id = private.current_context_id() and s.status = 'active' and s.ended_at is null)
    or (private.current_kind() = 'resident' and s.status = 'active' and s.ended_at is null and private.has_residence_access(s.residence_id))));
$$;
drop policy staff_reviews_related_read on public.staff_reviews;
create policy staff_reviews_related_read on public.staff_reviews for select to authenticated using (private.can_read_staff_review(staff_assignment_id));
create view public.housing_staff_reviews with (security_barrier = true) as
select v.id,v.allocation_id,v.staff_assignment_id,v.resident_context_id,v.rating,v.comment,v.created_at,
  s.residence_id,p.display_name as reviewer_name
from public.staff_reviews v join public.staff_assignments s on s.id = v.staff_assignment_id
join public.account_contexts c on c.id = v.resident_context_id join public.profiles p on p.id = c.auth_user_id
where private.can_read_staff_review(v.staff_assignment_id);
revoke all on public.housing_staff_reviews from public,anon;
grant select on public.housing_staff_reviews to authenticated,pinevela_backend;
revoke all on function private.check_staff_bargain(),private.cancel_ended_staff_bargains(),private.check_staff_review(),private.can_read_staff_review(uuid) from public,anon,authenticated,pinevela_backend;
grant execute on function private.can_read_staff_review(uuid) to authenticated,pinevela_backend;
