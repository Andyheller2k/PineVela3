-- Public residence contact names are independent of verified account identity.
alter table public.residences add column manager_contact_name text
  check (manager_contact_name is null or length(trim(manager_contact_name)) between 1 and 160);
create or replace view public.residence_catalog with (security_barrier=true) as
select r.id,r.name,r.location,r.description,r.cover_path,r.gallery_paths,
  r.contact_phone,r.contact_email,r.registered_at,r.latitude,r.longitude,r.landmark,r.city,r.region,r.manager_contact_name
from public.residences r where private.residence_is_public(r.id);

-- The server owns writes; browser/backend RLS continues to protect reads.
create function private.guard_residence_change_request() returns trigger
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.current_context_id(); key_version text;
begin
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
$$;
revoke all on function private.guard_residence_change_request() from public,anon,authenticated,pinevela_backend;
create trigger residence_change_request_guard before insert or update on public.residence_change_requests
for each row execute function private.guard_residence_change_request();
