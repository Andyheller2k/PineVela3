-- Express is the sole product data API. Preserve the reviewed row/column
-- projections while removing owner-executed views from exposed public.
-- No base-table grants, RLS policies or account/housing data are relaxed.
do $$ begin
 if not exists(select 1 from pg_roles where rolname='pinevela_catalog') then
  create role pinevela_catalog nologin noinherit nobypassrls;
 end if;
end $$;
alter role pinevela_catalog nologin noinherit nobypassrls;
grant pinevela_catalog to postgres;
grant usage on schema private to pinevela_catalog;

do $$
declare relation text; definition text; published boolean;
begin
 foreach relation in array array[
  'residence_catalog','store_catalog','listing_catalog','market_reviews_public',
  'listing_media_public','listing_price_options_public','housing_staff_directory',
  'housing_issue_details','housing_bargain_details','account_activity_feed',
  'housing_staff_reviews','housing_meeting_details','housing_meeting_participants',
  'seller_application_details'] loop
  if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relname=relation and c.relkind='v'
    and 'security_barrier=true'=any(c.reloptions)) then
   raise exception 'Expected reviewed public projection is missing: %',relation;
  end if;
  execute format('alter view public.%I set schema private',relation);
  definition:=regexp_replace(pg_get_viewdef(('private.'||relation)::regclass,true),'[;[:space:]]+$','');
  execute format('create or replace view private.%I with (security_barrier=true) as select * from (%s) projection where private.platform_access_allowed()',relation,definition);
  execute format('revoke all on private.%I from public,anon,authenticated,pinevela_backend,pinevela_catalog',relation);
  execute format('grant select on private.%I to pinevela_backend',relation);
  published:=relation=any(array['residence_catalog','store_catalog','listing_catalog',
   'market_reviews_public','listing_media_public','listing_price_options_public']);
  if published then execute format('grant select on private.%I to pinevela_catalog',relation);end if;
 end loop;
end;
$$;
-- Legacy trigger functions need no direct client EXECUTE grant. Triggers keep
-- running; revoke their default PUBLIC permission from the new narrow role too.
revoke all on function private.check_context_owner(),private.check_primary_owner(),
 private.set_allocation_owner() from public,anon,authenticated,pinevela_backend,pinevela_catalog;

-- Anonymous browser roles receive neither private-schema usage nor view grants.
-- This non-login server role has only the four boolean publication checks and six
-- reviewed catalog reads. Base operational tables remain inaccessible.
grant execute on function private.platform_access_allowed(),
 private.residence_has_reviewed_setup(uuid),private.residence_is_public(uuid),
 private.store_is_public(uuid) to pinevela_catalog;

-- Quoted SQL function bodies are not rewritten by ALTER VIEW SET SCHEMA.
create or replace function private.media_asset_is_public(asset uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.media_assets m where m.id=asset and m.state='ready' and (
  (m.purpose='hostel' and exists(select 1 from private.residence_catalog r
   where r.cover_path='/api/media/'||m.id::text or '/api/media/'||m.id::text=any(r.gallery_paths))) or
  (m.purpose='market' and (
   exists(select 1 from public.listing_media lm join public.listings l on l.id=lm.listing_id
    where lm.storage_path='/api/media/'||m.id::text and l.is_published and private.store_is_public(l.store_id)) or
   exists(select 1 from public.listing_price_options o join public.listings l on l.id=o.listing_id
    where o.image_path='/api/media/'||m.id::text and l.is_published and private.store_is_public(l.store_id)) or
   exists(select 1 from private.store_catalog s where s.logo_path='/api/media/'||m.id::text or s.cover_path='/api/media/'||m.id::text)
  ))));
$$;
notify pgrst,'reload schema';
