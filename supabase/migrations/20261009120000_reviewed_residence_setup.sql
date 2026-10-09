-- Active four-step registration fields; no prices, amenities or retired policies.
alter table public.residences
  add column property_type text,
  add column property_category text check (property_category in ('Hostel','Inn','Hotel','Estate')),
  add column gender_category text check (gender_category in ('Male','Female','Mixed')),
  add column year_established integer check (year_established between 1000 and 9999),
  add column alternative_phone text,
  add column website text,
  add column address_line1 text,
  add column address_line2 text,
  add column district text,
  add column country text,
  add column postal_code text,
  add column campus_proximity text,
  add column campus_proximity_details text,
  add column payment_frequency text,
  add column setup_submitted_at timestamptz;
create unique index residence_setup_case_idx on public.verification_cases(residence_id)
  where kind = 'residence_registration';

-- Manager-account approval permits access to the portal, not publication of
-- an incomplete property shell. Registration review is a separate decision.
create function private.residence_has_reviewed_setup(residence uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.residences r where r.id = residence
    and r.status = 'approved' and r.setup_submitted_at is not null
    and exists(select 1 from public.verification_cases v where v.residence_id = r.id
      and v.kind = 'residence_registration' and v.status = 'approved'));
$$;
create function private.residence_is_public(residence uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.residence_has_reviewed_setup(residence) and exists(select 1 from public.residences r where r.id = residence
    and exists(select 1 from public.manager_assignments a join public.account_contexts c on c.id = a.manager_context_id
      where a.residence_id = r.id and a.ended_at is null and c.kind = 'manager' and c.status = 'active'));
$$;
revoke all on function private.residence_has_reviewed_setup(uuid) from public,anon,authenticated,pinevela_backend;
grant execute on function private.residence_has_reviewed_setup(uuid) to anon,authenticated,pinevela_backend;
revoke all on function private.residence_is_public(uuid) from public,anon,authenticated,pinevela_backend;
-- A boolean publication predicate exposes no private identity or dossier data;
-- catalog readers need execution permission through the stored view.
grant execute on function private.residence_is_public(uuid) to anon,authenticated,pinevela_backend;
create or replace view public.residence_catalog with (security_barrier = true) as
select r.id,r.name,r.location,r.description,r.cover_path,r.gallery_paths,
  r.contact_phone,r.contact_email,r.registered_at,r.latitude,r.longitude,r.landmark,r.city,r.region
from public.residences r where private.residence_is_public(r.id);
create or replace function private.media_asset_is_public(asset uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.media_assets m where m.id = asset and m.state = 'ready' and (
    (m.purpose = 'hostel' and exists(select 1 from public.residence_catalog r
      where r.cover_path = '/api/media/' || m.id::text or '/api/media/' || m.id::text = any(r.gallery_paths))) or
    (m.purpose = 'market' and (
      exists(select 1 from public.listing_media lm join public.listings l on l.id = lm.listing_id
        where lm.storage_path = '/api/media/' || m.id::text and l.is_published and private.store_is_public(l.store_id)) or
      exists(select 1 from public.listing_price_options o join public.listings l on l.id = o.listing_id
        where o.image_path = '/api/media/' || m.id::text and l.is_published and private.store_is_public(l.store_id)) or
      exists(select 1 from public.store_catalog s where s.logo_path = '/api/media/' || m.id::text or s.cover_path = '/api/media/' || m.id::text)
    ))));
$$;
