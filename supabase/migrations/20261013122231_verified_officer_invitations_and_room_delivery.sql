-- Verified officer invitation onboarding and in-app delivery of assigned room keys.
-- Domain history is retained independently of physical housing teardown.

select pg_advisory_xact_lock(hashtextextended('residence-deletion-freeze',0));
select pg_advisory_xact_lock(hashtextextended('platform-settings',0));

-- Administrator-keyed invitations add verified officer portals; no Auth users are created.
alter table private.account_enrollments
 add column officer_approval_key_version uuid,
 add column officer_reserved_subject uuid references auth.users(id),
 add constraint officer_enrollment_scope check (
  (kind='officer' and primary_owner_id is null and room_id is null and residence_id is null
   and officer_approval_key_version is not null and status in('pending_email','completed','expired','cancelled'))
  or (kind<>'officer' and officer_approval_key_version is null and officer_reserved_subject is null));

create function private.officer_invitation_issuer_valid(e private.account_enrollments)returns boolean
language sql stable set search_path='' as $$
 select exists(select 1 from public.admin_memberships m join public.account_contexts c on c.id=m.context_id
  join private.admin_secrets k on k.context_id=m.context_id join auth.users u on u.id=c.auth_user_id
  where e.kind='officer' and m.context_id=e.initiator_context_id and m.status='active' and c.kind='admin' and c.status='active'
   and u.email_confirmed_at is not null and not u.is_anonymous and u.deleted_at is null
   and(u.banned_until is null or u.banned_until<=clock_timestamp())
   and k.approval_key_hash is not null and k.approval_key_version=e.officer_approval_key_version);
$$;
create function private.officer_invitation_acceptance_allowed(e private.account_enrollments,target uuid)returns boolean
language sql stable set search_path='' as $$
 select coalesce(e.kind='officer' and e.status='pending_email' and e.expires_at>clock_timestamp()
  and e.id::text=current_setting('pinevela.officer_enrollment_id',true)
  and e.token_digest=current_setting('pinevela.officer_invitation_digest',true)
  and e.auth_user_id is null and e.linked_context_id is null and e.verified_at is null
  and(e.officer_reserved_subject is null or e.officer_reserved_subject=auth.uid())
  and private.officer_invitation_issuer_valid(e) and private.current_kind()='primary'
  and private.invitation_identity_valid(auth.uid(),e.invited_email)
  and exists(select 1 from auth.users u where u.id=auth.uid() and u.deleted_at is null)
  and private.platform_available()
  and private.account_feature_allowed(private.current_context_id(),'subaccounts')
  and not exists(select 1 from public.account_contexts c where c.auth_user_id=auth.uid() and c.kind<>'primary' and c.id<>target),false);
$$;
create function private.guard_officer_invitation()returns trigger
language plpgsql set search_path='' as $$
declare actor uuid; expected_subject uuid;
begin
 if tg_op='DELETE' then
  if old.kind='officer' then raise exception using errcode='42501',message='Officer invitation history is immutable';end if;return old;
 end if;
 if tg_op='UPDATE' and(new.kind='officer' or old.kind='officer') and new.kind is distinct from old.kind then
  raise exception using errcode='42501',message='Officer invitation kind is immutable';end if;
 if new.kind<>'officer' then return new;end if;
 actor:=private.approval_authorized_context();
 if tg_op='INSERT' then
  select id into expected_subject from auth.users where lower(email)=new.invited_email;
  if actor is null or actor is distinct from new.initiator_context_id or not private.officer_invitation_issuer_valid(new)
   or new.officer_reserved_subject is distinct from expected_subject
   or (select count(*) from auth.users where lower(email)=new.invited_email)>1
   or new.status<>'pending_email' or new.auth_user_id is not null or new.linked_context_id is not null or new.verified_at is not null
   or new.primary_owner_id is not null or new.residence_id is not null or new.room_id is not null
   or new.invited_email<>lower(btrim(new.invited_email)) or length(new.invited_email)>254
   or new.invited_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
   or new.token_digest !~ '^[a-f0-9]{64}$'
   or jsonb_typeof(new.enrollment_fields)<>'object'
   or not(new.enrollment_fields ?& array['fullName','phone','assignedZone'])
   or jsonb_typeof(new.enrollment_fields->'fullName') is distinct from 'string'
   or jsonb_typeof(new.enrollment_fields->'phone') is distinct from 'string'
   or jsonb_typeof(new.enrollment_fields->'assignedZone') is distinct from 'string'
   or (new.enrollment_fields-array['fullName','phone','assignedZone'])<>'{}'::jsonb
   or length(btrim(new.enrollment_fields->>'fullName')) not between 1 and 120
   or length(btrim(new.enrollment_fields->>'phone')) not between 1 and 40
   or length(btrim(new.enrollment_fields->>'assignedZone')) not between 1 and 200
   or exists(select 1 from public.account_contexts c where c.auth_user_id=expected_subject and c.kind<>'primary')
   or exists(select 1 from public.profiles p where p.id=expected_subject and p.primary_owner_id is not null)
   or exists(select 1 from private.account_enrollments e where lower(e.invited_email)=new.invited_email and e.status in('pending_email','pending_review')) then
   raise exception using errcode='42501',message='Administrator-keyed separate officer invitation required';end if;
  new.created_at:=clock_timestamp();new.expires_at:=new.created_at+interval'24 hours';
 else
  if(to_jsonb(new)-array['status','auth_user_id','linked_context_id','verified_at']) is distinct from
   (to_jsonb(old)-array['status','auth_user_id','linked_context_id','verified_at']) then
   raise exception using errcode='42501',message='Officer invitation details are immutable';end if;
  if(new.status,new.auth_user_id,new.linked_context_id,new.verified_at) is not distinct from
   (old.status,old.auth_user_id,old.linked_context_id,old.verified_at) then return new;end if;
  if old.status<>'pending_email' then raise exception using errcode='42501',message='Officer invitation decision is final';end if;
  if new.status='completed' and private.officer_invitation_acceptance_allowed(old,new.linked_context_id)
   and new.auth_user_id=auth.uid() and exists(select 1 from public.account_contexts c
    where c.id=new.linked_context_id and c.auth_user_id=new.auth_user_id and c.kind='officer' and c.status='active' and c.primary_owner_id is null) then
   new.verified_at:=clock_timestamp();
  elsif new.status in('cancelled','expired') and new.auth_user_id is null and new.linked_context_id is null and new.verified_at is null
   and((new.status='expired' and old.expires_at<=clock_timestamp())
    or(new.status='cancelled' and(not private.officer_invitation_issuer_valid(old) or actor is not null)))then null;
  else raise exception using errcode='42501',message='Verified officer invitation acceptance required';end if;
 end if;return new;
end;
$$;
create trigger officer_invitation_guard before insert or update or delete on private.account_enrollments
 for each row execute function private.guard_officer_invitation();
create function private.guard_officer_invitation_truncate()returns trigger
language plpgsql set search_path='' as $$
begin
 if exists(select 1 from private.account_enrollments where kind='officer')then
  raise exception using errcode='42501',message='Officer invitation history cannot be truncated';end if;
 return null;
end;
$$;
create trigger officer_invitation_truncate_guard before truncate on private.account_enrollments
 for each statement execute function private.guard_officer_invitation_truncate();


create function private.guard_officer_context()returns trigger
language plpgsql set search_path='' as $$
declare invitation private.account_enrollments%rowtype;
begin
 if tg_op='DELETE' then
  if old.kind='officer' then raise exception using errcode='42501',message='Officer identity history must be retained';end if;return old;
 end if;
 if tg_op='UPDATE' and(old.kind='officer' or new.kind='officer') then
  if(to_jsonb(new)-array['status','updated_at']) is distinct from(to_jsonb(old)-array['status','updated_at']) then
   raise exception using errcode='42501',message='Officer identity and ownership are immutable';end if;
  if new.status is distinct from old.status then
   if private.approval_authorized_context() is null or new.status not in('active','suspended','closed') then
    raise exception using errcode='42501',message='Administrator approval key required for officer status';end if;
   if new.status='active' and not exists(select 1 from private.account_enrollments e join auth.users u on u.id=e.auth_user_id
    where e.kind='officer' and e.status='completed' and e.linked_context_id=old.id and e.auth_user_id=old.auth_user_id
     and private.invitation_identity_valid(u.id,e.invited_email) and u.deleted_at is null)then
    raise exception using errcode='42501',message='Verified completed officer invitation required';end if;
   new.updated_at:=clock_timestamp();
   delete from private.account_sessions where active_context_id=old.id;
  else new.updated_at:=old.updated_at;end if;
 elsif new.kind='officer' then
  select * into invitation from private.account_enrollments e where e.id::text=current_setting('pinevela.officer_enrollment_id',true) for update;
  if not found or not private.officer_invitation_acceptance_allowed(invitation,new.id)
   or new.auth_user_id is distinct from auth.uid() or new.primary_owner_id is not null or new.status<>'active' then
   raise exception using errcode='42501',message='Verified separate officer invitation required';end if;
  new.created_at:=clock_timestamp();new.updated_at:=new.created_at;
 end if;return new;
end;
$$;
create trigger officer_context_guard before insert or update or delete on public.account_contexts
 for each row execute function private.guard_officer_context();

create function private.guard_officer_session_binding()returns trigger
language plpgsql set search_path='' as $$
begin
 -- Serialize binding admission with suspension/restoration before checking the
 -- live status, receipt and actual provider-session time.
 perform c.id from public.account_contexts c where c.id=new.active_context_id and c.kind='officer' for share;
 if exists(select 1 from public.account_contexts c where c.id=new.active_context_id and c.kind='officer') and not exists(
  select 1 from public.account_contexts c join auth.sessions s on s.user_id=c.auth_user_id and s.id=new.session_id
  join private.account_enrollments e on e.linked_context_id=c.id and e.auth_user_id=c.auth_user_id and e.kind='officer' and e.status='completed'
  where c.id=new.active_context_id and c.auth_user_id=new.auth_user_id and c.status='active'
   and s.created_at>=c.updated_at and(s.not_after is null or s.not_after>clock_timestamp())
   and private.invitation_identity_valid(c.auth_user_id,e.invited_email)
   and private.account_session_allowed(c.id,s.id))then
  raise exception using errcode='42501',message='Fresh verified officer sign-in required';end if;
 return new;
end;
$$;
create trigger officer_session_binding_guard before insert or update on private.account_sessions
 for each row execute function private.guard_officer_session_binding();

create function private.officer_invitation_recorded()returns trigger
language plpgsql set search_path='' as $$
declare event text;notice uuid;recipient uuid;
begin
 if new.kind<>'officer' then return null;end if;
 if tg_op='INSERT' then event:='created';elsif new.status is distinct from old.status then
  event:=case new.status when 'completed' then 'accepted' else new.status end;else return null;end if;
 insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id)
  values(private.current_context_id(),'officer_invitation_'||event,'officer_invitation',new.id);
 insert into public.notifications(sender_context_id,category,title,message,link)
  values(private.current_context_id(),'verification','Verification officer invitation '||event,
   'A verification officer invitation changed state. Open Field Officers to review it.','verification-officers')returning id into notice;
 insert into public.notification_recipients(notification_id,context_id)select notice,m.context_id from public.admin_memberships m
  join public.account_contexts c on c.id=m.context_id where m.status='active' and c.kind='admin' and c.status='active';
 if event='accepted' then
  insert into public.notification_recipients(notification_id,context_id)select notice,c.id from public.account_contexts c
   where c.auth_user_id=new.auth_user_id and c.kind='primary' and c.status='active' on conflict do nothing;
 end if;
 for recipient in select context_id from public.notification_recipients where notification_id=notice loop
  perform pg_notify('pinevela_notifications',recipient::text);end loop;
 return null;
end;
$$;
create trigger officer_invitation_recorded after insert or update on private.account_enrollments
 for each row execute function private.officer_invitation_recorded();

create function private.officer_invitation_issuer_changed()returns trigger
language plpgsql set search_path='' as $$
begin
 update private.account_enrollments e set status='cancelled'
  where e.kind='officer' and e.status='pending_email' and not private.officer_invitation_issuer_valid(e);
 return null;
end;
$$;
create trigger officer_invitation_issuer_changed after update of approval_key_hash,approval_key_version on private.admin_secrets
 for each row execute function private.officer_invitation_issuer_changed();
create trigger officer_invitation_issuer_changed after update of status,slot,context_id on public.admin_memberships
 for each row execute function private.officer_invitation_issuer_changed();
create trigger officer_invitation_issuer_changed after update of status,kind,auth_user_id on public.account_contexts
 for each row execute function private.officer_invitation_issuer_changed();
revoke all on function private.officer_invitation_issuer_valid(private.account_enrollments),
 private.officer_invitation_acceptance_allowed(private.account_enrollments,uuid),private.guard_officer_invitation(),
 private.guard_officer_context(),private.guard_officer_session_binding(),private.guard_officer_invitation_truncate(),private.officer_invitation_recorded(),
 private.officer_invitation_issuer_changed() from public,anon,authenticated,pinevela_backend;

-- Officer invitations are accepted separately after ordinary verified signup.
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

-- Genuine in-app room-key delivery. No email/SMS provider and no allocation/reservation change.
create table private.room_key_deliveries (
 id uuid primary key default gen_random_uuid(),
 -- Historical UUID snapshots: native INSERT validates their live relationship.
 -- Reviewed physical key/housing removal retains this receipt; snapshots never authorize access.
 key_id uuid not null,
 residence_id uuid not null,
 room_id uuid not null,
 actor_context_id uuid not null references public.account_contexts(id),
 manager_key_version bigint not null check(manager_key_version>0),
 recipient_context_id uuid not null references public.account_contexts(id),
 recipient_email text not null check(length(recipient_email)<=254 and recipient_email=lower(btrim(recipient_email))),
 custom_note text not null default '' check(length(custom_note)<=1000),
 request_id uuid not null,
 payload_digest text not null check(payload_digest ~ '^[a-f0-9]{64}$'),
 notification_id uuid not null unique references public.notifications(id),
 created_at timestamptz not null default clock_timestamp(),
 unique(actor_context_id,request_id)
);
alter table private.room_key_deliveries enable row level security;
revoke all on private.room_key_deliveries from public,anon,authenticated,pinevela_backend;
create index room_key_deliveries_key_latest on private.room_key_deliveries(key_id,created_at desc,id);

-- An address is a lookup selector, never ownership proof. A student mailbox resolves
-- only through its saved verified resident enrollment and original primary owner.
create function private.room_key_delivery_recipient(address text) returns table(context_id uuid,auth_user_id uuid)
language sql stable set search_path='' as $$
 select distinct root.id,root.auth_user_id from public.account_contexts root
 join public.profiles owner on owner.id=root.auth_user_id and owner.primary_owner_id is null
 join auth.users verified_owner on verified_owner.id=owner.id and verified_owner.email_confirmed_at is not null and not verified_owner.is_anonymous
  and verified_owner.deleted_at is null and (verified_owner.banned_until is null or verified_owner.banned_until<=clock_timestamp())
 where root.kind='primary' and root.status='active' and not(private.account_access(root.id)->>'banned')::boolean
 and (lower(verified_owner.email)=address or exists (
  select 1 from private.account_enrollments e
  join public.account_contexts resident on resident.id=e.linked_context_id and resident.kind='resident'
    and resident.auth_user_id=e.auth_user_id and resident.primary_owner_id=root.auth_user_id
  join public.profiles student on student.id=resident.auth_user_id and student.primary_owner_id=root.auth_user_id
  join auth.users u on u.id=student.id and u.email_confirmed_at is not null and not u.is_anonymous
    and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp())
  where e.kind='resident' and e.primary_owner_id=root.auth_user_id and e.initiator_context_id=root.id
   and e.verified_at is not null and e.status in('pending_review','completed')
   and e.invited_email=address and lower(u.email)=address));
$$;

create function private.guard_room_key_delivery() returns trigger language plpgsql set search_path='' as $$
declare actor uuid;key_row record;recipient record;notice public.notifications;proof_version text;
begin
 if tg_op<>'INSERT' then raise exception using errcode='42501',message='Room-key delivery history is immutable';end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception using errcode='42501',message='Room-key delivery requires READ COMMITTED';end if;
 actor:=private.current_context_id();proof_version:=current_setting('pinevela.room_key_delivery_version',true);
 if actor is null or actor is distinct from new.actor_context_id or private.current_kind() is distinct from 'manager'
  or proof_version is distinct from new.manager_key_version::text or not private.account_feature_allowed(actor,'rooms')
  or not private.account_session_allowed(actor,(auth.jwt()->>'session_id')::uuid)
  or not private.platform_access_allowed() then
  raise exception using errcode='42501',message='Current assigned manager session and own operation key required';end if;
 if not exists(select 1 from private.manager_operation_keys m where m.manager_context_id=actor and m.version=new.manager_key_version
  and m.key_hash is not null and(m.locked_until is null or m.locked_until<=clock_timestamp())) then
  raise exception using errcode='42501',message='Current manager operation key required';end if;
 -- Lock current relationships in the same order as claim/release; guard direct trusted inserts too.
 perform id from public.account_contexts where id=actor and kind='manager'and status='active'for share;
 if not found then raise exception using errcode='42501',message='Current assigned manager session required';end if;
 perform manager_context_id from private.manager_operation_keys where manager_context_id=actor and version=new.manager_key_version
  and key_hash is not null and(locked_until is null or locked_until<=clock_timestamp())for share;
 if not found then raise exception using errcode='42501',message='Current manager operation key required';end if;
 perform id from public.residences where id=new.residence_id and status='approved'for update;
 if not found then raise exception using errcode='42501',message='Current approved residence required';end if;
 perform id from public.manager_assignments where manager_context_id=actor and residence_id=new.residence_id and ended_at is null for share;
 if not found then raise exception using errcode='42501',message='Current residence assignment required';end if;
 select k.*,b.residence_id,r.room_number,b.name as block_name,h.name as residence_name into key_row from private.room_activation_keys k join public.rooms r on r.id=k.room_id
  join public.floors f on f.id=r.floor_id join public.blocks b on b.id=f.block_id join public.residences h on h.id=b.residence_id where k.id=new.key_id for update of k,r;
 if key_row.id is null or key_row.revoked_at is not null or key_row.room_id is distinct from new.room_id
  or key_row.residence_id is distinct from new.residence_id or not private.residence_has_reviewed_setup(new.residence_id)
  or not exists(select 1 from public.residences where id=new.residence_id and status='approved')
  or not exists(select 1 from public.manager_assignments where manager_context_id=actor and residence_id=new.residence_id and ended_at is null) then
  raise exception using errcode='42501',message='Current key for assigned approved residence required';end if;
 perform id from public.account_contexts where id=new.recipient_context_id and kind='primary'and status='active'for share;
 if not found then raise exception using errcode='42501',message='Active verified primary recipient required';end if;
 select * into recipient from private.room_key_delivery_recipient(new.recipient_email);
 if recipient.context_id is null or recipient.context_id is distinct from new.recipient_context_id
  or(select count(*)from private.room_key_delivery_recipient(new.recipient_email))<>1 then
  raise exception using errcode='42501',message='One verified recipient with active primary account required';end if;
 if (key_row.claimed_by is null) is distinct from (key_row.claimed_at is null)
  or exists(select 1 from public.allocations where room_id=new.room_id and ended_at is null and primary_owner_id is distinct from recipient.auth_user_id)
  or key_row.claimed_by is not null and not exists(select 1 from public.allocations where room_id=new.room_id and ended_at is null
     and resident_context_id=key_row.claimed_by and primary_owner_id=recipient.auth_user_id)
  or key_row.claimed_by is null and exists(select 1 from public.allocations where room_id=new.room_id and ended_at is null) then
  raise exception using errcode='42501',message='Occupied room key belongs only to its current resident owner';end if;
 if private.system_wipe_row_paused('private','room_key_deliveries','{}'::jsonb,jsonb_build_object(
  'residence_id',new.residence_id,'room_id',new.room_id,'actor_context_id',actor,'context_id',new.recipient_context_id)) then
  raise exception using errcode='55000',message='Reviewed wipe records are paused for recovery verification';end if;
 select * into notice from public.notifications where id=new.notification_id;
 if notice.id is null or notice.sender_context_id is distinct from actor or notice.category is distinct from 'verification'
  or notice.title is distinct from 'Room activation key received' or notice.admin_message_type is not null
  or notice.link is distinct from '/user/dashboard?tab=login-room'
  or notice.message is distinct from ('Room '||key_row.room_number||' at "'||key_row.residence_name||'" ('||key_row.block_name||'). Your activation key is '||key_row.code||'. Use it when activating your separately verified resident account.'||case when new.custom_note=''then ''else E'\n\n'||new.custom_note end)
  or new.payload_digest is distinct from encode(sha256(convert_to(jsonb_build_array(new.key_id,new.recipient_email,new.custom_note)::text,'UTF8')),'hex')
  or (select count(*)from public.notification_recipients where notification_id=notice.id)<>1
  or not exists(select 1 from public.notification_recipients where notification_id=notice.id and context_id=new.recipient_context_id)
  or notice.created_at<transaction_timestamp() then
  raise exception using errcode='42501',message='Exact new recipient notification required';end if;
 new.created_at:=clock_timestamp();return new;
end;
$$;
create trigger aa0_room_key_delivery_writer_lock before insert or update or delete on private.room_key_deliveries for each statement execute function private.system_wipe_writer_lock();
create trigger aab_room_key_delivery_pause_guard before insert or update or delete on private.room_key_deliveries for each row execute function private.residence_freeze_write_guard();
create trigger room_key_delivery_guard before insert or update or delete on private.room_key_deliveries for each row execute function private.guard_room_key_delivery();
create trigger room_key_delivery_truncate_guard before truncate on private.room_key_deliveries for each statement execute function private.guard_room_key_delivery();
revoke all on function private.room_key_delivery_recipient(text),private.guard_room_key_delivery() from public,anon,authenticated,pinevela_backend;
-- Existing Storage cleanup admission requires this guard on every new domain table.
create trigger zz_residence_queued_reference_guard before insert or update on private.room_key_deliveries for each row execute function private.residence_queued_reference_guard();
