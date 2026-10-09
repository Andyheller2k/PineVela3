-- Seller registration uses a saved, verified enrollment, never submitted ownership
-- or credentials. Retain one application and an audited resubmission version.
do $$ begin
  if exists(select 1 from public.seller_applications) then
    raise exception 'Reconcile existing seller applications before changing their enrollment model' using errcode = '23514';
  end if;
end $$;
alter table public.seller_applications
  alter column student_id set not null,
  add column enrollment_id uuid not null unique references private.account_enrollments(id),
  add column proposed_store_name text not null check (length(btrim(proposed_store_name)) between 1 and 200),
  add column review_notes text not null default '' check (length(review_notes) <= 3000),
  add column submission_version integer not null default 1 check (submission_version > 0),
  add constraint seller_application_fields check (length(btrim(campus)) between 1 and 250
    and length(btrim(primary_category)) between 1 and 200 and student_id ~ '^[A-Z0-9][A-Z0-9/-]{3,31}$'),
  add constraint seller_application_decision check ((status = 'submitted' and reviewed_at is null and reviewed_by_context_id is null and review_notes = '')
    or (status in ('approved','rejected','suspended') and reviewed_at is not null and reviewed_by_context_id is not null));

create function private.check_seller_application() returns trigger
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid;
begin
  select c.primary_owner_id into owner_id from public.account_contexts c join public.profiles p on p.id = c.auth_user_id
    join auth.users u on u.id = p.id join private.account_enrollments e on e.linked_context_id = c.id
    where c.id = new.seller_context_id and c.kind = 'seller' and c.status = 'pending'
      and p.primary_owner_id = c.primary_owner_id and u.email_confirmed_at is not null
      and e.id = new.enrollment_id and e.kind = 'seller' and e.primary_owner_id = c.primary_owner_id
      and e.auth_user_id = c.auth_user_id and e.verified_at is not null and e.status in ('pending_review','completed')
      and lower(u.email) = e.invited_email;
  if owner_id is null then raise exception 'A saved verified seller enrollment is required' using errcode = '23514'; end if;
  if new.status in ('submitted','approved') and exists(select 1 from public.registration_bans b
    join public.account_contexts c on c.id = b.account_context_id
    where (c.id = new.seller_context_id or c.auth_user_id = owner_id or c.primary_owner_id = owner_id)
      and b.kind = 'seller_account' and b.until_at > clock_timestamp()) then
    raise exception 'Seller registration is temporarily restricted' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' or (old.status = 'rejected' and new.status = 'submitted') then
    if private.current_kind() is distinct from 'primary' or not exists(select 1 from public.account_contexts c
      where c.id = private.current_context_id() and c.auth_user_id = owner_id and c.kind = 'primary')
      or new.status <> 'submitted' or (tg_op = 'INSERT' and new.submission_version <> 1)
      or (tg_op = 'UPDATE' and new.submission_version <> old.submission_version + 1) then
      raise exception 'Only the saved primary owner may submit a seller application' using errcode = '23514';
    end if;
  else
    if old.status <> 'submitted' or new.status not in ('approved','rejected') or private.current_kind() is distinct from 'admin'
      or new.reviewed_by_context_id is distinct from private.current_context_id()
      or (new.status = 'rejected' and length(btrim(new.review_notes)) = 0) then
      raise exception 'Only an active administrator may decide a pending seller application' using errcode = '23514';
    end if;
    if row(new.campus,new.primary_category,new.student_id,new.proposed_store_name,new.submission_version,new.submitted_at)
      is distinct from row(old.campus,old.primary_category,old.student_id,old.proposed_store_name,old.submission_version,old.submitted_at) then
      raise exception 'Application submission evidence cannot be rewritten during review' using errcode = '23514';
    end if;
  end if;
  if tg_op = 'UPDATE' and row(new.id,new.seller_context_id,new.enrollment_id)
    is distinct from row(old.id,old.seller_context_id,old.enrollment_id) then
    raise exception 'Seller application identity and enrollment are immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger seller_application_relationships before insert or update on public.seller_applications
for each row execute function private.check_seller_application();
create view public.seller_application_details with (security_barrier = true) as
select a.*,c.primary_owner_id,c.status as account_status,p.display_name,p.email,p.phone,
  e.verified_at
from public.seller_applications a join public.account_contexts c on c.id = a.seller_context_id
join public.profiles p on p.id = c.auth_user_id join private.account_enrollments e on e.id = a.enrollment_id
where private.current_kind() = 'admin' or c.id = private.current_context_id()
  or (private.current_kind() = 'primary' and c.primary_owner_id = (select x.auth_user_id from public.account_contexts x where x.id = private.current_context_id()));
revoke all on public.seller_application_details from public,anon;
grant select on public.seller_application_details to authenticated,pinevela_backend;
revoke all on function private.check_seller_application() from public,anon,authenticated,pinevela_backend;
