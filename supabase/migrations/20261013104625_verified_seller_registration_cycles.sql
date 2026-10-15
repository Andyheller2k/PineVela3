-- Retained seller identity; each registration has separate approval/store/payment history.
alter table public.account_contexts add column seller_generation integer not null default 0
 check(seller_generation>=0 and (kind='seller' or seller_generation=0));
alter table public.seller_applications add column registration_generation integer not null default 0 check(registration_generation>=0);
alter table public.stores add column application_id uuid references public.seller_applications(id),
 add column registration_generation integer not null default 0 check(registration_generation>=0);
update public.stores s set application_id=a.id from public.seller_applications a where a.seller_context_id=s.seller_context_id;
alter table public.stores alter column application_id set not null;
alter table public.seller_applications drop constraint seller_applications_seller_context_id_key,
 drop constraint seller_applications_enrollment_id_key,
 add unique(seller_context_id,registration_generation),add unique(enrollment_id,registration_generation);
alter table public.stores drop constraint stores_seller_context_id_key,
 add unique(seller_context_id,registration_generation),add unique(application_id);
create unique index stores_one_open_registration on public.stores(seller_context_id)where status<>'closed';

create function private.seller_registration_generation_guard()returns trigger language plpgsql set search_path=''as $$
declare generation integer;
begin
 if tg_op='DELETE' then raise exception using errcode='42501',message='Seller registration history is retained';end if;
 select seller_generation into generation from public.account_contexts where id=new.seller_context_id and kind='seller';
 if tg_op='INSERT' then
  if new.registration_generation<>0 and new.registration_generation is distinct from generation then raise exception using errcode='23514',message='Current seller registration required';end if;
  new.registration_generation:=generation;
 elsif new.registration_generation is distinct from old.registration_generation then
  raise exception using errcode='23514',message='Seller registration generation is immutable';
 end if;
 if tg_table_name='seller_applications' and new.registration_generation is distinct from generation then
  raise exception using errcode='23514',message='Historical seller decisions cannot authorize a new registration';
 end if;
 if tg_table_name='stores' then
  if tg_op='INSERT' then
   if new.application_id is null then select id into new.application_id from public.seller_applications
    where seller_context_id=new.seller_context_id and registration_generation=generation and status='approved';end if;
   if not exists(select 1 from public.seller_applications a where a.id=new.application_id and a.seller_context_id=new.seller_context_id
    and a.registration_generation=generation and a.status='approved') then raise exception using errcode='23514',message='Exact current seller approval required';end if;
  elsif new.application_id is distinct from old.application_id then raise exception using errcode='23514',message='Store approval is immutable';
  end if;
  if new.status<>'closed' and new.registration_generation is distinct from generation then
   raise exception using errcode='23514',message='Historical stores stay closed';end if;
 end if;
 return new;
end;$$;
create trigger a_seller_registration_generation before insert or update or delete on public.seller_applications
 for each row execute function private.seller_registration_generation_guard();
create trigger a_store_registration_generation before insert or update or delete on public.stores
 for each row execute function private.seller_registration_generation_guard();

create function private.guard_seller_reactivation()returns trigger language plpgsql set search_path=''as $$
declare proof text:=current_setting('pinevela.seller_reactivation_session',true);enrollment text:=current_setting('pinevela.seller_reactivation_enrollment',true);
begin
 if tg_op='INSERT' then
  if new.seller_generation<>0 then raise exception using errcode='42501',message='Seller registration starts at generation zero';end if;return new;
 end if;
 if old.kind<>'seller' then return new;end if;
 if old.status='closed' and new.status<>'closed' then
  if new.status<>'pending' or new.seller_generation<>old.seller_generation+1
   or (new.id,new.kind,new.auth_user_id,new.primary_owner_id) is distinct from (old.id,old.kind,old.auth_user_id,old.primary_owner_id)
   or private.current_kind() is distinct from 'primary' or old.primary_owner_id is distinct from auth.uid()
   or not private.platform_available() or not private.account_feature_allowed(old.id,'subaccounts')
   or not exists(select 1 from public.profiles p join auth.users u on u.id=p.id join auth.sessions s on s.user_id=u.id
    join private.account_enrollments e on e.auth_user_id=u.id
    where p.id=old.auth_user_id and p.primary_owner_id=old.primary_owner_id and not u.is_anonymous
     and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp()) and u.email_confirmed_at is not null
     and s.id::text=proof and (s.not_after is null or s.not_after>clock_timestamp())
     and e.id::text=enrollment and e.linked_context_id=old.id and e.kind='seller' and e.verified_at is not null
     and e.status in('completed','cancelled','expired') and e.primary_owner_id=auth.uid()
     and e.initiator_context_id=private.current_context_id() and e.invited_email=lower(u.email)
     and not exists(select 1 from private.account_access_epochs epoch where epoch.context_id=any(private.account_lineage(old.id)) and s.created_at<=epoch.valid_after))
   or exists(select 1 from private.portal_access_keys k where k.context_id=old.id and
     (k.version::text is distinct from current_setting('pinevela.seller_reactivation_pin_version',true)
      or k.locked_until>clock_timestamp()))
   or exists(select 1 from public.registration_bans b join public.account_contexts x on x.id=b.account_context_id
    where b.kind='seller_account' and b.until_at>clock_timestamp() and (x.id=old.id or x.auth_user_id=old.primary_owner_id or x.primary_owner_id=old.primary_owner_id))
   or exists(select 1 from public.stores where seller_context_id=old.id and status<>'closed')
   or exists(select 1 from public.market_orders o join public.stores s on s.id=o.store_id where s.seller_context_id=old.id and o.status in('awaiting_seller','pending_meetup'))
   or exists(select 1 from public.payments where actor_context_id=old.id and status in('initialized','pending'))
   or exists(select 1 from public.account_contexts x where x.primary_owner_id=old.primary_owner_id and x.kind='seller' and x.id<>old.id and x.status<>'closed')
   or exists(select 1 from private.account_enrollments e where e.primary_owner_id=old.primary_owner_id and e.kind='seller' and e.id::text<>enrollment and e.status in('pending_email','pending_review'))
  then raise exception using errcode='42501',message='Own verified seller identity, current PIN and closed registration required';end if;
 elsif new.seller_generation is distinct from old.seller_generation then
  raise exception using errcode='42501',message='Seller generation changes only during verified re-registration';
 end if;
 return new;
end;$$;
create trigger seller_reactivation_guard before insert or update on public.account_contexts for each row execute function private.guard_seller_reactivation();
revoke all on function private.guard_seller_reactivation(),private.seller_registration_generation_guard() from public,anon,authenticated,pinevela_backend;
create or replace function private.check_seller_application() returns trigger
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid;
begin
  select c.primary_owner_id into owner_id from public.account_contexts c join public.profiles p on p.id = c.auth_user_id
    join auth.users u on u.id = p.id join private.account_enrollments e on e.linked_context_id = c.id
    where c.id = new.seller_context_id and c.kind = 'seller' and c.status = 'pending' and c.seller_generation=new.registration_generation
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
create or replace function private.check_store_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and row(new.id,new.seller_context_id,new.primary_owner_id,new.campus,new.created_at) is distinct from row(old.id,old.seller_context_id,old.primary_owner_id,old.campus,old.created_at) then raise exception 'Store identity, primary owner and verified campus are immutable' using errcode='23514'; end if;
  if tg_op='UPDATE' and old.setup_completed_at is not null and new.setup_completed_at is distinct from old.setup_completed_at then raise exception 'Original store setup time is immutable' using errcode='23514'; end if;
  if new.setup_completed_at>clock_timestamp() then raise exception 'Store setup cannot be dated in the future' using errcode='23514'; end if;
  if tg_op='INSERT' and not exists(select 1 from public.seller_applications a join public.account_contexts c on c.id=a.seller_context_id where a.id=new.application_id and a.seller_context_id=new.seller_context_id and a.registration_generation=new.registration_generation and a.registration_generation=c.seller_generation and a.status='approved' and c.primary_owner_id=new.primary_owner_id and a.campus=new.campus and c.kind='seller' and c.status in ('pending','active')) then raise exception 'Approved saved seller application required' using errcode='23514'; end if;
  if new.status='active' and (tg_op='INSERT' or old.status<>'active') and (new.setup_completed_at is null or new.activated_at is null
    or not exists(select 1 from public.payments p where p.store_id=new.id and p.purpose='store_activation' and private.payment_grants_access(p.id))
    or not exists(select 1 from public.store_subscriptions s where s.store_id=new.id and s.status='active' and s.starts_at<=now() and s.ends_at>now())
    or not exists(select 1 from public.store_fee_periods f where f.store_id=new.id and f.starts_at<=now() and f.ends_at>now())) then raise exception 'Setup and verified registration/access periods required' using errcode='23514'; end if;
  return new;
end;$$;
create or replace function private.store_is_public(store uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.stores s join public.account_contexts c on c.id=s.seller_context_id join public.seller_applications a on a.seller_context_id=c.id and a.id=s.application_id and a.registration_generation=c.seller_generation and s.registration_generation=c.seller_generation
    where s.id=store and s.status='active' and s.setup_completed_at is not null and s.activated_at is not null and c.kind='seller' and c.status='active' and a.status='approved' and not (private.account_access(c.id)->>'banned')::boolean
      and exists(select 1 from public.payments p where p.store_id=s.id and p.purpose='store_activation' and private.payment_grants_access(p.id))
      and exists(select 1 from public.store_subscriptions sub where sub.store_id=s.id and sub.status='active' and sub.starts_at<=now() and sub.ends_at>now() and private.payment_grants_access(sub.payment_id))
      and exists(select 1 from public.store_fee_periods f where f.store_id=s.id and f.starts_at<=now() and f.ends_at>now() and private.payment_grants_access(f.payment_id)));
$$;

create or replace view private.seller_application_details with(security_barrier=true)as
select a.id,a.seller_context_id,a.campus,a.primary_category,a.student_id,a.status,a.submitted_at,a.reviewed_at,a.reviewed_by_context_id,
 a.enrollment_id,a.proposed_store_name,a.review_notes,a.submission_version,
 c.primary_owner_id,c.status as account_status,p.display_name,p.email,p.phone,e.verified_at,
 a.registration_generation,(a.registration_generation=c.seller_generation)as is_current
from public.seller_applications a join public.account_contexts c on c.id=a.seller_context_id
join public.profiles p on p.id=c.auth_user_id join private.account_enrollments e on e.id=a.enrollment_id
where private.current_kind()='admin' or c.id=private.current_context_id()
 or(private.current_kind()='primary' and c.primary_owner_id=(select x.auth_user_id from public.account_contexts x where x.id=private.current_context_id()));
