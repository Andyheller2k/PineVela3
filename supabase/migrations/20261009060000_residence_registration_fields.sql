-- Current residence registration uses an actual map pin and GhanaPost address.
-- Retired amenities, house rules, booking and public recruitment stay absent.
alter table public.residences add column latitude numeric(9,6);
alter table public.residences add column longitude numeric(9,6);
alter table public.residences add column digital_address text;
alter table public.residences add column landmark text not null default '';
alter table public.residences add column city text not null default '';
alter table public.residences add column region text not null default '';
alter table public.residences add column knust_accredited_confirmed boolean not null default false;
alter table public.residences add constraint residence_coordinates_valid check (
  (latitude is null and longitude is null) or
  (latitude is not null and longitude is not null and latitude between -90 and 90 and longitude between -180 and 180)
);
alter table public.residences add constraint residence_digital_address_valid check (
  digital_address is null or digital_address ~ '^[A-Z]{2}-[0-9]{3}-[0-9]{4}$'
);
create unique index verification_cases_open_applicant_kind_idx on public.verification_cases(applicant_context_id,kind)
  where status in ('submitted','inspection_pending','under_review','more_info_required');

create or replace view public.residence_catalog with (security_barrier = true) as
select r.id,r.name,r.location,r.description,r.cover_path,r.gallery_paths,
  r.contact_phone,r.contact_email,r.registered_at,r.latitude,r.longitude,r.landmark,r.city,r.region
from public.residences r where r.status = 'approved';
