-- Current seller inventory and historical order references; no demo listings.
alter table public.listings add column retired_at timestamptz,
  add column service_category text,
  add constraint listing_retired_visibility check(retired_at is null or not is_published),
  add constraint listing_text_limits check(length(description)<=4000 and length(category)<=200 and length(coalesce(service_category,''))<=200 and length(coalesce(meeting_location,''))<=600);
create function private.check_listing_lifecycle() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and row(new.id,new.store_id,new.kind,new.created_at) is distinct from row(old.id,old.store_id,old.kind,old.created_at) then
    raise exception 'Listing identity and store are immutable' using errcode='23514';
  end if;
  if tg_op='UPDATE' and old.retired_at is not null and new is distinct from old then
    raise exception 'Removed listing evidence is immutable' using errcode='23514';
  end if;
  if new.retired_at>clock_timestamp() then raise exception 'Invalid listing retirement time' using errcode='23514'; end if;
  if new.is_published and (tg_op='INSERT' or not old.is_published) and not private.store_is_public(new.store_id) then
    raise exception 'Publishing requires an active verified paid store' using errcode='23514';
  end if;
  if tg_op='UPDATE' and ((new.stock_quantity is distinct from old.stock_quantity and new.kind='product') or (old.retired_at is null and new.retired_at is not null)) then
    if exists(select 1 from public.market_orders o where o.listing_id=new.id and o.status in ('awaiting_seller','pending_meetup') and o.reserved_until>now()
      group by o.listing_id having new.retired_at is not null or sum(o.quantity)>new.stock_quantity) then
      raise exception 'Listing changes cannot invalidate active reservations' using errcode='23514';
    end if;
  end if;
  new.updated_at=now();return new;
end;$$;
create trigger listing_lifecycle before insert or update on public.listings for each row execute function private.check_listing_lifecycle();

create function private.check_listing_attachment() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and row(new.id,new.listing_id) is distinct from row(old.id,old.listing_id) then
    raise exception 'Listing attachment identity is immutable' using errcode='23514';
  end if;
  if not exists(select 1 from public.listings l where l.id=new.listing_id and l.retired_at is null
    and (tg_table_name='listing_media' or l.kind='service')) then
    raise exception 'Use an active matching listing attachment' using errcode='23514';
  end if;
  return new;
end;$$;
create trigger listing_media_relationship before insert or update on public.listing_media for each row execute function private.check_listing_attachment();
create trigger listing_option_relationship before insert or update on public.listing_price_options for each row execute function private.check_listing_attachment();
revoke all on function private.check_listing_attachment() from public,anon,authenticated,pinevela_backend;

create function private.check_listing_cover() returns trigger
language plpgsql security definer set search_path='' as $$
declare listing uuid;
begin
  listing=(case when tg_table_name='listings' then to_jsonb(new)->>'id' when tg_op='DELETE' then to_jsonb(old)->>'listing_id' else to_jsonb(new)->>'listing_id' end)::uuid;
  if exists(select 1 from public.listings l where l.id=listing and l.is_published and l.retired_at is null)
    and not exists(select 1 from public.listing_media m where m.listing_id=listing and m.sort_order=0) then
    raise exception 'Published listing requires its owned cover photograph' using errcode='23514';
  end if;
  return null;
end;$$;
create constraint trigger listing_owned_cover after insert or update on public.listings deferrable initially deferred for each row execute function private.check_listing_cover();
create constraint trigger listing_media_cover after insert or update or delete on public.listing_media deferrable initially deferred for each row execute function private.check_listing_cover();
revoke all on function private.check_listing_lifecycle(),private.check_listing_cover() from public,anon,authenticated,pinevela_backend;

create or replace view public.listing_catalog with (security_barrier=true) as
select l.id,l.store_id,l.kind,l.title,l.description,l.category,l.price,l.currency,l.service_location_mode,l.latitude,l.longitude,l.created_at,
  (l.kind='service' or l.stock_quantity>reserved.quantity) as is_available,
  case when l.kind='service' then null else greatest(0,l.stock_quantity-reserved.quantity) end as stock_quantity,
  l.condition,l.meeting_location,l.call_line,l.working_days,l.opening_time,l.closing_time,l.is_open_247,l.service_category
from public.listings l cross join lateral(select coalesce(sum(o.quantity),0)::integer as quantity from public.market_orders o
  where o.listing_id=l.id and o.status in ('awaiting_seller','pending_meetup') and o.reserved_until>now()) reserved
where l.retired_at is null and l.is_published and private.store_is_public(l.store_id);
