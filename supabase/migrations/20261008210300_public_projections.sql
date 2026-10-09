-- Explicit public projections. Base housing/store/order/review rows contain private IDs
-- and capacities, so an ordinary visitor may query only these vetted catalogs.
create view public.residence_catalog with (security_barrier = true) as
select r.id, r.name, r.location, r.description, r.cover_path, r.gallery_paths,
       r.contact_phone, r.contact_email, r.registered_at
from public.residences r where r.status = 'approved';

create view public.store_catalog with (security_barrier = true) as
select s.id, s.name, s.campus, s.primary_category, s.delivery_mode, s.description,
       s.primary_phone, s.logo_path, s.cover_path, s.activated_at
from public.stores s where private.store_is_public(s.id);

create view public.listing_catalog with (security_barrier = true) as
select l.id, l.store_id, l.kind, l.title, l.description, l.category, l.price,
       l.currency, l.service_location_mode, l.latitude, l.longitude, l.created_at,
       (l.kind = 'service' or l.stock_quantity > 0) as is_available
from public.listings l
where l.is_published and private.store_is_public(l.store_id);

create view public.market_reviews_public with (security_barrier = true) as
select r.id, r.store_id, o.listing_id, r.rating, r.review, r.created_at
from public.market_reviews r
join public.market_orders o on o.id = r.order_id
join public.account_contexts buyer on buyer.id = o.buyer_context_id
join public.stores s on s.id = r.store_id
where o.status = 'completed' and buyer.auth_user_id <> s.primary_owner_id
  and private.store_is_public(s.id);

revoke all on public.residences, public.blocks, public.floors, public.rooms,
  public.beds, public.stores, public.listings, public.market_reviews
  from anon, authenticated;
revoke all on public.residences, public.blocks, public.floors, public.rooms,
  public.beds, public.stores, public.listings, public.market_reviews
  from public;
grant select on public.residence_catalog, public.store_catalog,
  public.listing_catalog, public.market_reviews_public to anon, authenticated;

-- The server can read base records after authenticating and checking ownership.
-- Browser clients use only the safe catalog views for public content.

create function private.verify_market_review() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  buyer_user uuid;
  owner_user uuid;
  order_status text;
begin
  select b.auth_user_id, s.primary_owner_id, o.status
    into buyer_user, owner_user, order_status
  from public.market_orders o
  join public.account_contexts b on b.id = o.buyer_context_id
  join public.stores s on s.id = o.store_id
  where o.id = new.order_id and o.buyer_context_id = new.buyer_context_id
    and o.store_id = new.store_id;
  if buyer_user is null or order_status <> 'completed' or buyer_user = owner_user then
    raise exception 'Review requires an eligible completed purchase';
  end if;
  return new;
end;
$$;
create trigger pinevela_market_review_eligible before insert or update of order_id, buyer_context_id, store_id
on public.market_reviews for each row execute function private.verify_market_review();
