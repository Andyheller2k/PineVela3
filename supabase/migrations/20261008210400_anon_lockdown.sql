-- Anonymous clients receive only inspected public projections.
-- Other application tables stay behind authenticated RLS or server authorization.
create view public.listing_media_public with (security_barrier = true) as
select m.id, m.listing_id, m.sort_order, m.storage_path
from public.listing_media m join public.listings l on l.id = m.listing_id
where l.is_published and private.store_is_public(l.store_id);
create view public.listing_price_options_public with (security_barrier = true) as
select o.id, o.listing_id, o.sort_order, o.label, o.price, o.image_path
from public.listing_price_options o join public.listings l on l.id = o.listing_id
where l.is_published and private.store_is_public(l.store_id);
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from public;
grant select on public.residence_catalog, public.store_catalog,
  public.listing_catalog, public.market_reviews_public,
  public.listing_media_public, public.listing_price_options_public to anon, authenticated;
