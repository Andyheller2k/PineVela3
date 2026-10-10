-- Personal avatars remain private and belong to the verified Auth identity.
-- A shared student identity shares its picture, never another linked identity's picture.
alter table public.media_assets drop constraint media_assets_purpose_check;
alter table public.media_assets add constraint media_assets_purpose_check
  check (purpose in ('hostel','market','inspection','maintenance','repair','avatar'));
alter table public.profiles add column avatar_asset_id uuid references public.media_assets(id) on delete restrict;
create index profiles_avatar_asset_idx on public.profiles(avatar_asset_id) where avatar_asset_id is not null;
alter table public.profiles add constraint profile_avatar_reference check (
  (avatar_asset_id is not null and avatar_path is not null and avatar_path='/api/media/'||avatar_asset_id::text)
  or (avatar_asset_id is null and (avatar_path is null or avatar_path in (
    'preset:pine-classic','preset:pine-emerald','preset:pine-amber','preset:pine-rose','preset:pine-violet',
    'preset:pine-dark','preset:pine-cyan','preset:pine-golden','preset:pine-crimson','preset:pine-forest'))));
grant update(avatar_asset_id) on public.profiles to pinevela_backend;

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
  if not ((new.purpose = 'avatar' and exists(select 1 from public.account_contexts c where c.id=new.owner_context_id and c.auth_user_id=new.owner_auth_user_id and c.status='active')) or
    (new.purpose = 'hostel' and owner_kind in ('manager','admin')) or
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

-- Shared primary access cannot bypass an active administrator's settings key.
-- Only a boolean about the calling identity is returned; no user IDs are accepted.
create function private.profile_requires_settings_key() returns boolean
language sql stable security definer set search_path='' as $$
  select (select auth.uid()) is not null and exists(select 1 from public.admin_memberships m
    join public.account_contexts c on c.id=m.context_id where c.auth_user_id=(select auth.uid())
      and m.status='active' and c.status='active' and c.kind='admin');
$$;
revoke all on function private.profile_requires_settings_key() from public,anon,authenticated,pinevela_backend;
grant execute on function private.profile_requires_settings_key() to pinevela_backend;

-- Only a live owner reserves or finalizes an avatar. Background failure cleanup
-- can still retire an unfinished reservation without pretending to be a user.
create function private.avatar_upload_guard() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.purpose='avatar' and (tg_op='INSERT' or (new.state='ready' and new.state is distinct from old.state)) then
    if new.owner_context_id is distinct from private.current_context_id() or new.owner_auth_user_id is distinct from (select auth.uid()) then
      raise exception using errcode='42501',message='An avatar upload requires its current verified owner';
    end if;
    if private.profile_requires_settings_key() and (private.current_kind()<>'admin' or private.settings_authorized_context() is null) then
      raise exception using errcode='42501',message='An administrator avatar requires a settings-key grant';
    end if;
  end if;return new;
end;
$$;
create trigger pinevela_avatar_upload_guard before insert or update on public.media_assets
  for each row execute function private.avatar_upload_guard();
revoke all on function private.avatar_upload_guard() from public,anon,authenticated,pinevela_backend;

-- Invoker triggers do not grant browser write privileges or broaden profile RLS.
create function private.profile_avatar_guard() returns trigger
language plpgsql set search_path='' as $$
begin
  if (new.avatar_path,new.avatar_asset_id) is distinct from (old.avatar_path,old.avatar_asset_id) then
    if new.id is distinct from old.id or new.id is distinct from (select auth.uid()) or private.current_context_id() is null then
      raise exception using errcode='42501',message='Only the verified owner may change a profile picture';
    end if;
    if new.avatar_asset_id is not null then
      perform 1 from public.media_assets m where m.id=new.avatar_asset_id and m.owner_auth_user_id=new.id
        and m.purpose='avatar' and m.state='ready' for share;
      if not found then raise exception using errcode='23514',message='Use an owned ready profile image';end if;
    end if;
  end if;
  if new.id=(select auth.uid()) and private.profile_requires_settings_key() and
    (new.display_name,new.phone,new.avatar_path,new.avatar_asset_id) is distinct from (old.display_name,old.phone,old.avatar_path,old.avatar_asset_id) then
    if private.current_kind()<>'admin' then
      raise exception using errcode='42501',message='Use the administrator portal and settings key for this profile';
    end if;
    if private.settings_authorized_context() is null then
      raise exception using errcode='42501',message='Your settings key is required for administrator profile changes';
    end if;
  end if;
  return new;
end;
$$;
create trigger pinevela_profile_avatar_guard before update on public.profiles
  for each row execute function private.profile_avatar_guard();
-- Also guard a non-null image on insert. Trusted Auth initialization never sets it.
create function private.profile_avatar_insert_guard() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.avatar_asset_id is not null or new.avatar_path is not null then
    raise exception using errcode='23514',message='Initialize a profile before attaching its verified photograph';
  end if;return new;
end;
$$;
create trigger pinevela_profile_avatar_insert_guard before insert on public.profiles
  for each row execute function private.profile_avatar_insert_guard();
create function private.avatar_asset_retention_guard() returns trigger
language plpgsql set search_path='' as $$
begin
  if old.purpose='avatar' and (tg_op='DELETE' or new.state is distinct from old.state) and
    exists(select 1 from public.profiles p where p.avatar_asset_id=old.id) then
    raise exception using errcode='23514',message='Detach the profile image before removing its object';
  end if;
  if tg_op='DELETE' then return old;end if;return new;
end;
$$;
create trigger pinevela_avatar_asset_retention_guard before update or delete on public.media_assets
  for each row execute function private.avatar_asset_retention_guard();

-- Narrow boolean read helper: no full profile rows or arbitrary Storage paths.
-- Staff directory portraits use only the same authorized housing relationships
-- as the existing directory; no guest, general admin-person or parent impersonation.
create function private.avatar_asset_readable(asset uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select (select auth.uid()) is not null and private.current_context_id() is not null and exists(
    select 1 from public.media_assets m where m.id=asset and m.purpose='avatar' and m.state='ready' and (
      m.owner_auth_user_id=(select auth.uid()) or exists(
        select 1 from public.profiles p join public.account_contexts c on c.auth_user_id=p.id and c.kind='staff' and c.status='active'
        join public.staff_assignments s on s.staff_context_id=c.id and s.status='active' and s.ended_at is null
        where p.avatar_asset_id=m.id and p.id=m.owner_auth_user_id and (
          private.can_manage_residence(s.residence_id) or
          (private.current_kind()='resident' and private.has_residence_access(s.residence_id))))));
$$;
revoke all on function private.avatar_asset_readable(uuid) from public,anon,authenticated,pinevela_backend;
grant execute on function private.avatar_asset_readable(uuid) to authenticated;
alter policy media_account_read on public.media_assets using (state = 'ready' and purpose <> 'avatar' and (
  owner_context_id = private.current_context_id() or private.current_kind() = 'admin'
  or (purpose = 'inspection' and exists(select 1 from public.verification_inspections i join public.verification_cases v on v.id = i.case_id
    where i.id = inspection_id and (i.officer_context_id = private.current_context_id() or v.applicant_context_id = private.current_context_id())))
  or (purpose in ('maintenance','repair') and exists(select 1 from public.maintenance_issues i where i.residence_id = media_assets.residence_id
    and ('/api/media/' || media_assets.id::text = any(i.photo_paths) or '/api/media/' || media_assets.id::text = any(i.completion_paths)
      or exists(select 1 from public.maintenance_events e where e.issue_id = i.id and '/api/media/' || media_assets.id::text = any(e.photo_paths)))))));
create policy avatar_account_read on public.media_assets for select to authenticated
  using(purpose='avatar' and private.avatar_asset_readable(id));
create policy pinevela_avatar_object_read on storage.objects for select to authenticated
  using(exists(select 1 from public.media_assets m where m.bucket_id=storage.objects.bucket_id
    and m.object_path=storage.objects.name and m.purpose='avatar' and private.avatar_asset_readable(m.id)));
revoke all on function private.profile_avatar_guard(),private.profile_avatar_insert_guard(),
  private.avatar_asset_retention_guard(),private.validate_media_asset() from public,anon,authenticated,pinevela_backend;
