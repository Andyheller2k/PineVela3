-- Fields used by the active product/service cards. No retired housing pricing,
-- staff recruitment, generic messaging, or account rows are introduced.
alter table public.listings add column condition text;
alter table public.listings add column meeting_location text;
alter table public.listings add column call_line text;
alter table public.listings add column working_days text[] not null default '{}';
alter table public.listings add column opening_time time;
alter table public.listings add column closing_time time;
alter table public.listings add column is_open_247 boolean not null default false;
alter table public.listings add constraint service_location_consistent check (
  (kind = 'product' and service_location_mode is null) or
  (kind = 'service' and service_location_mode in ('flexible','fixed','hybrid') and
    ((service_location_mode = 'flexible' and latitude is null and longitude is null) or
      (service_location_mode in ('fixed','hybrid') and latitude is not null and longitude is not null)))
);

create or replace view public.store_catalog with (security_barrier = true) as
select s.id, s.name, s.campus, s.primary_category, s.delivery_mode, s.description,
       s.primary_phone,
       case when plan.plan in ('pine_star','pine_pro') then coalesce(s.logo_path,'/store-covers/pinevela-logo.svg')
            else '/store-covers/pinevela-logo.svg' end as logo_path,
       case when plan.plan in ('pine_star','pine_pro') then coalesce(s.cover_path,'/store-covers/campus-blue.svg')
            when s.cover_path in ('/store-covers/campus-blue.svg','/store-covers/golden-pine.svg','/store-covers/forest-glass.svg','/store-covers/midnight-campus.svg') then s.cover_path
            else '/store-covers/campus-blue.svg' end as cover_path,
       s.activated_at, plan.plan
from public.stores s
join lateral (select sub.plan from public.store_subscriptions sub where sub.store_id = s.id
  and sub.status = 'active' and sub.starts_at <= now() and sub.ends_at > now()
  order by sub.starts_at desc limit 1) plan on true
where private.store_is_public(s.id);

create or replace view public.listing_catalog with (security_barrier = true) as
select l.id, l.store_id, l.kind, l.title, l.description, l.category, l.price,
       l.currency, l.service_location_mode, l.latitude, l.longitude, l.created_at,
       (l.kind = 'service' or l.stock_quantity > reserved.quantity) as is_available,
       case when l.kind = 'service' then null else greatest(0,l.stock_quantity-reserved.quantity) end as stock_quantity,
       l.condition, l.meeting_location, l.call_line, l.working_days, l.opening_time, l.closing_time, l.is_open_247
from public.listings l
cross join lateral (select coalesce(sum(o.quantity),0)::integer as quantity from public.market_orders o
  where o.listing_id = l.id and o.status in ('awaiting_seller','pending_meetup') and o.reserved_until > now()) reserved
where l.is_published and private.store_is_public(l.store_id);

-- Replacing the views retains their original, explicit SELECT-only grants.
