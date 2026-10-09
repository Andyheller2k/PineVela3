-- Actual uploaded media, independently owned by the authenticated account portal.
-- Object bytes are written/deleted through Storage APIs, never storage.objects SQL.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('pinevela-media','pinevela-media',false,6291456,array['image/png']);

create table public.media_assets (
  id uuid primary key,
  owner_context_id uuid not null,
  owner_auth_user_id uuid not null,
  purpose text not null check (purpose in ('hostel','market','inspection')),
  inspection_id uuid references public.verification_inspections(id),
  bucket_id text not null default 'pinevela-media' check (bucket_id = 'pinevela-media'),
  object_path text not null unique,
  byte_size integer not null check (byte_size between 1 and 6291456),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  state text not null default 'reserved' check (state in ('reserved','ready','removing','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (owner_context_id,owner_auth_user_id) references public.account_contexts(id,auth_user_id),
  check ((purpose = 'inspection') = (inspection_id is not null)),
  check (object_path = 'contexts/' || owner_context_id::text || '/' || id::text || '.png')
);
create index media_assets_owner_idx on public.media_assets(owner_context_id,created_at);
create index media_assets_created_idx on public.media_assets(created_at);
create function private.validate_media_asset() returns trigger
language plpgsql security definer set search_path = '' as $$
declare owner_kind text;
begin
  if tg_op = 'UPDATE' and (new.id,new.owner_context_id,new.owner_auth_user_id,new.purpose,new.inspection_id,new.bucket_id,new.object_path,new.byte_size,new.sha256,new.created_at)
    is distinct from (old.id,old.owner_context_id,old.owner_auth_user_id,old.purpose,old.inspection_id,old.bucket_id,old.object_path,old.byte_size,old.sha256,old.created_at) then
    raise exception 'Media ownership and original metadata cannot change' using errcode = '23514';
  end if;
  select kind into owner_kind from public.account_contexts where id = new.owner_context_id;
  if not ((new.purpose = 'hostel' and owner_kind in ('manager','admin')) or
    (new.purpose = 'market' and owner_kind in ('seller','admin')) or
    (new.purpose = 'inspection' and owner_kind = 'officer' and exists (
      select 1 from public.verification_inspections i where i.id = new.inspection_id and i.officer_context_id = new.owner_context_id))) then
    raise exception 'Media purpose requires its authorized account relationship' using errcode = '23514';
  end if;
  new.updated_at = now();
  return new;
end;
$$;
create trigger pinevela_media_metadata before insert or update on public.media_assets
for each row execute function private.validate_media_asset();
alter table public.media_assets enable row level security;
revoke all on public.media_assets from public,anon,authenticated,pinevela_backend;
grant select on public.media_assets to authenticated,pinevela_backend;
create policy media_account_read on public.media_assets for select to authenticated
using (state = 'ready' and (owner_context_id = private.current_context_id() or private.current_kind() = 'admin'
  or (purpose = 'inspection' and exists (select 1 from public.verification_inspections i
      join public.verification_cases v on v.id = i.case_id where i.id = inspection_id
        and (i.officer_context_id = private.current_context_id() or v.applicant_context_id = private.current_context_id())))));

create function private.media_asset_is_public(asset uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.media_assets m where m.id = asset and m.state = 'ready' and (
    (m.purpose = 'hostel' and exists(select 1 from public.residences r where r.status = 'approved'
      and (r.cover_path = '/api/media/' || m.id::text or '/api/media/' || m.id::text = any(r.gallery_paths)))) or
    (m.purpose = 'market' and (
      exists(select 1 from public.listing_media lm join public.listings l on l.id = lm.listing_id
        where lm.storage_path = '/api/media/' || m.id::text and l.is_published and private.store_is_public(l.store_id)) or
      exists(select 1 from public.listing_price_options o join public.listings l on l.id = o.listing_id
        where o.image_path = '/api/media/' || m.id::text and l.is_published and private.store_is_public(l.store_id)) or
      exists(select 1 from public.store_catalog s where s.logo_path = '/api/media/' || m.id::text or s.cover_path = '/api/media/' || m.id::text)
    ))));
$$;
-- Storage reads require a live, server-bound portal; direct browser writes are
-- not granted. Public display goes through the API's current-publication check.
create policy pinevela_owned_object_read on storage.objects for select to authenticated
using (bucket_id = 'pinevela-media' and exists(select 1 from public.media_assets m
  where m.bucket_id = storage.objects.bucket_id and m.object_path = storage.objects.name and m.state = 'ready'
    and m.owner_context_id = private.current_context_id()));
revoke all on function private.validate_media_asset(),private.media_asset_is_public(uuid) from public,anon,authenticated,pinevela_backend;

create function private.require_owned_media(media_url text,portal uuid,purpose_name text,inspection uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if media_url is null or media_url !~ '^/api/media/[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' or not exists (
    select 1 from public.media_assets m where '/api/media/' || m.id::text = media_url and m.state = 'ready'
      and m.owner_context_id = portal and m.purpose = purpose_name and m.inspection_id is not distinct from inspection
    for share) then
    raise exception 'Use a ready photograph uploaded by the authorized account' using errcode = '23514';
  end if;
end;
$$;
create function private.validate_listing_media() returns trigger
language plpgsql security definer set search_path = '' as $$
declare portal uuid; media_url text;
begin
  select s.seller_context_id into portal from public.listings l join public.stores s on s.id = l.store_id where l.id = new.listing_id;
  media_url = case when tg_table_name = 'listing_media' then to_jsonb(new)->>'storage_path' else to_jsonb(new)->>'image_path' end;
  if media_url is not null then perform private.require_owned_media(media_url,portal,'market'); end if;
  return new;
end;
$$;
create trigger pinevela_listing_media_owner before insert or update on public.listing_media
for each row execute function private.validate_listing_media();
create trigger pinevela_listing_option_media_owner before insert or update on public.listing_price_options
for each row execute function private.validate_listing_media();

create function private.validate_store_media() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.logo_path is not null and new.logo_path <> '/store-covers/pinevela-logo.svg' then
    perform private.require_owned_media(new.logo_path,new.seller_context_id,'market');
  end if;
  if new.cover_path is not null and new.cover_path not in ('/store-covers/campus-blue.svg','/store-covers/golden-pine.svg','/store-covers/forest-glass.svg','/store-covers/midnight-campus.svg') then
    perform private.require_owned_media(new.cover_path,new.seller_context_id,'market');
  end if;
  return new;
end;
$$;
create trigger pinevela_store_media_owner before insert or update of logo_path,cover_path,seller_context_id on public.stores
for each row execute function private.validate_store_media();

create function private.validate_residence_media() returns trigger
language plpgsql security definer set search_path = '' as $$
declare media_url text; media_owner uuid;
begin
  if cardinality(new.gallery_paths) > 3 then raise exception 'At most three residence gallery photographs' using errcode = '23514'; end if;
  foreach media_url in array array_prepend(new.cover_path,new.gallery_paths) loop
    if media_url is null then continue; end if;
    select m.owner_context_id into media_owner from public.media_assets m join public.account_contexts c on c.id = m.owner_context_id
    where '/api/media/' || m.id::text = media_url and m.state = 'ready' and m.purpose = 'hostel'
      and (c.kind = 'admin' or exists(select 1 from public.manager_assignments a where a.residence_id = new.id
        and a.manager_context_id = m.owner_context_id and a.ended_at is null)) for share of m;
    if media_owner is null then raise exception 'Residence photographs require an assigned manager upload' using errcode = '23514'; end if;
  end loop;
  return new;
end;
$$;
create trigger pinevela_residence_media_owner before insert or update of cover_path,gallery_paths on public.residences
for each row execute function private.validate_residence_media();

create function private.validate_inspection_media() returns trigger
language plpgsql security definer set search_path = '' as $$
declare photo jsonb;
begin
  if new.report is not null then
    if jsonb_typeof(coalesce(new.report->'photos','[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(new.report->'photos','[]'::jsonb)) > 12 then
      raise exception 'Use at most twelve inspection photographs' using errcode = '23514';
    end if;
    for photo in select value from jsonb_array_elements(coalesce(new.report->'photos','[]'::jsonb)) loop
      perform private.require_owned_media(photo->>'url',new.officer_context_id,'inspection',new.id);
    end loop;
  end if;
  return new;
end;
$$;
create trigger pinevela_inspection_media_owner before insert or update of report on public.verification_inspections
for each row execute function private.validate_inspection_media();
revoke all on function private.require_owned_media(text,uuid,text,uuid),private.validate_listing_media(),
  private.validate_store_media(),private.validate_residence_media(),private.validate_inspection_media() from public,anon,authenticated,pinevela_backend;
