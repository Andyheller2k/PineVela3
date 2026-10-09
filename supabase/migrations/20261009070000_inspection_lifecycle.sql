-- One live dispatch per dossier; completed reports retain their original author.
alter table public.verification_inspections
  add column dispatched_by_context_id uuid references public.admin_memberships(context_id),
  add column priority text not null default 'medium' check (priority in ('low','medium','high','urgent')),
  add column dispatch_notes text not null default '',
  add column reviewed_at timestamptz,
  add column reviewed_by_context_id uuid references public.admin_memberships(context_id);
create unique index inspections_live_case_idx on public.verification_inspections(case_id)
  where status in ('assigned','in_progress','submitted');
create function private.check_inspection_lifecycle() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not private.require_context_kind(new.officer_context_id,'officer') then
    raise exception 'Registered officer context required' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and (new.case_id is distinct from old.case_id or
    new.officer_context_id is distinct from old.officer_context_id or
    new.assigned_at is distinct from old.assigned_at or
    new.dispatched_by_context_id is distinct from old.dispatched_by_context_id) then
    raise exception 'Dispatch identity is immutable; create a new assignment' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and old.report is not null and
    (new.report is distinct from old.report or new.submitted_at is distinct from old.submitted_at) then
    raise exception 'Submitted reports are immutable' using errcode = '23514';
  end if;
  if new.status in ('submitted','accepted') and (new.report is null or new.submitted_at is null or
    new.report->>'officerId' is distinct from new.officer_context_id::text) then
    raise exception 'An authored submitted report is required' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.check_inspection_lifecycle() from public,anon,authenticated,pinevela_backend;
create trigger inspection_lifecycle_check before insert or update on public.verification_inspections
  for each row execute function private.check_inspection_lifecycle();
