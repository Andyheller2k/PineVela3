-- Existing verified identities and role/ownership/RLS boundaries stay intact.
-- Only explicit private Google manager reservations defer automatic initialization.
select pg_advisory_xact_lock(hashtextextended('residence-deletion-freeze',0));
create or replace function private.initialize_auth_profile(subject uuid, signup_token text) returns void
language plpgsql security definer set search_path = '' as $$
declare person auth.users%rowtype; enrollment private.account_enrollments%rowtype; context_id uuid;
begin
  select * into strict person from auth.users where id = subject;
  if person.email is null or trim(person.email) = '' or person.is_anonymous then
    raise exception 'A permanent email identity is required' using errcode = '23514';
  end if;
  select * into enrollment from private.account_enrollments
    where invited_email = lower(trim(person.email)) and status = 'pending_email' and kind <> 'officer'
      and expires_at > clock_timestamp() for update;
  if found then
    -- Google account creation has no client enrollment nonce. Defer all app
    -- profile/role creation until the server completes its owned PKCE flow.
    -- This branch grants no role, context, verification or session binding.
    if enrollment.kind = 'manager' and enrollment.enrollment_fields->>'authentication' = 'google'
      and enrollment.auth_user_id is null and signup_token is null then
      return;
    end if;
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
