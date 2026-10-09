-- Manager-authorized staff enrollment; no public hiring or credential seeding.
alter table public.staff_assignments
  add column job_role text not null default '' check (length(job_role) <= 200),
  add column shift text not null default '' check (length(shift) <= 200),
  add column end_reason text check (length(end_reason) between 5 and 2000),
  add constraint staff_assignment_end_time check (ended_at is null or ended_at >= created_at),
  add constraint staff_assignment_ended_status check ((status in ('removed','resigned')) = (ended_at is not null));
alter table private.account_enrollments add constraint staff_enrollment_scope check
  (kind <> 'staff' or (primary_owner_id is null and residence_id is not null));

create function private.staff_invitation_authorized(enrollment_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from private.account_enrollments e
    join public.account_contexts c on c.id = e.initiator_context_id
    join auth.users u on u.id = c.auth_user_id
    join public.manager_assignments m on m.manager_context_id = c.id and m.residence_id = e.residence_id
    where e.id = enrollment_id and e.kind = 'staff' and c.kind = 'manager' and c.status = 'active'
      and u.email_confirmed_at is not null and m.ended_at is null
      and private.residence_has_reviewed_setup(e.residence_id)
      and (nullif(e.enrollment_fields->>'assignedBlockId','') is null or exists(select 1 from public.blocks b
        where b.id::text = e.enrollment_fields->>'assignedBlockId' and b.residence_id = e.residence_id)));
$$;
revoke all on function private.staff_invitation_authorized(uuid) from public,anon,authenticated,pinevela_backend;

-- Employment identity and historical residence are immutable. Ending employment
-- remains possible after its creating manager leaves; active grants are rechecked by the backend.
create function private.check_staff_assignment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if row(new.id,new.staff_context_id,new.residence_id,new.created_by_manager_id,new.created_at)
      is distinct from row(old.id,old.staff_context_id,old.residence_id,old.created_by_manager_id,old.created_at)
      or (old.ended_at is not null and row(new.status,new.ended_at,new.assigned_block_id,new.job_role,new.shift,new.end_reason)
        is distinct from row(old.status,old.ended_at,old.assigned_block_id,old.job_role,old.shift,old.end_reason)) then
      raise exception 'Historical employment cannot be reassigned or reopened' using errcode = '23514';
    end if;
  elsif not private.require_context_kind(new.staff_context_id,'staff') or not exists(
    select 1 from public.manager_assignments m join public.account_contexts c on c.id = m.manager_context_id
    where m.manager_context_id = new.created_by_manager_id and m.residence_id = new.residence_id
      and m.ended_at is null and c.kind = 'manager' and c.status = 'active') then
    raise exception 'Authorized staff and manager relationship required' using errcode = '23514';
  end if;
  if new.assigned_block_id is not null and not exists(select 1 from public.blocks b
    where b.id = new.assigned_block_id and b.residence_id = new.residence_id) then
    raise exception 'Staff block belongs to another residence' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.check_staff_assignment() from public,anon,authenticated,pinevela_backend;
drop trigger pinevela_relationships on public.staff_assignments;
create trigger pinevela_staff_relationships before insert or update on public.staff_assignments
for each row execute function private.check_staff_assignment();

create or replace function private.initialize_auth_profile(subject uuid, signup_token text) returns void
language plpgsql security definer set search_path = '' as $$
declare person auth.users%rowtype; enrollment private.account_enrollments%rowtype; context_id uuid;
begin
  select * into strict person from auth.users where id = subject;
  if person.email is null or trim(person.email) = '' or person.is_anonymous then
    raise exception 'A permanent email identity is required' using errcode = '23514';
  end if;
  select * into enrollment from private.account_enrollments
    where invited_email = lower(trim(person.email)) and status = 'pending_email'
      and expires_at > clock_timestamp() for update;
  if found then
    if enrollment.auth_user_id is not null or enrollment.kind not in ('resident','manager','seller','staff')
      or signup_token is null or length(signup_token) <> 64
      or pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(signup_token,'UTF8')),'hex') <> enrollment.token_digest
      or not (
        (enrollment.kind in ('resident','manager','seller') and exists (
          select 1 from public.account_contexts c join public.profiles p on p.id = c.auth_user_id
          join auth.users u on u.id = p.id
          where c.id = enrollment.initiator_context_id and c.auth_user_id = enrollment.primary_owner_id
            and c.kind = 'primary' and c.status = 'active' and p.primary_owner_id is null
            and u.email_confirmed_at is not null
        )) or (enrollment.kind = 'staff' and private.staff_invitation_authorized(enrollment.id))
      ) then raise exception 'Signup does not match the authorized enrollment' using errcode = '23514'; end if;
    insert into public.profiles(id,display_name,email,phone,primary_owner_id)
      values(subject,enrollment.enrollment_fields->>'displayName',lower(trim(person.email)),
        nullif(enrollment.enrollment_fields->>'phone',''),enrollment.primary_owner_id);
    insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status)
      values(subject,enrollment.primary_owner_id,enrollment.kind,'pending') returning id into context_id;
    update private.account_enrollments set auth_user_id = subject, linked_context_id = context_id where id = enrollment.id;
  else
    -- A stale enrollment nonce must never fall back to an ordinary primary signup.
    if signup_token is not null then raise exception 'Enrollment expired or cancelled' using errcode = '23514'; end if;
    insert into public.profiles(id,display_name,email)
      values(subject,coalesce(person.raw_user_meta_data->>'name',person.raw_user_meta_data->>'full_name',''),lower(trim(person.email)));
    insert into public.account_contexts(auth_user_id,kind,status) values(subject,'primary','active');
  end if;
end;
$$;
revoke all on function private.initialize_auth_profile(uuid,text) from public,anon,authenticated,pinevela_backend;


create or replace view public.housing_staff_directory with (security_barrier = true) as
select s.id,s.staff_context_id,s.residence_id,s.assigned_block_id,s.status,s.created_at,s.ended_at,
  p.display_name,p.email,p.phone,p.avatar_path,h.name as residence_name,b.name as block_name,
  s.job_role,s.shift,s.end_reason
from public.staff_assignments s join public.account_contexts c on c.id = s.staff_context_id
join public.profiles p on p.id = c.auth_user_id join public.residences h on h.id = s.residence_id
left join public.blocks b on b.id = s.assigned_block_id
where private.current_context_id() is not null and (
  private.can_manage_residence(s.residence_id) or s.staff_context_id = private.current_context_id() or
  (private.current_kind() = 'resident' and s.status = 'active' and s.ended_at is null and private.has_residence_access(s.residence_id)));
