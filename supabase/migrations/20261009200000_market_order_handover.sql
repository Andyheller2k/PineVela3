-- Actual marketplace orders and private handover evidence; no account/data import.
alter table public.market_orders add column request_id uuid not null,
  add column request_fingerprint text not null check(request_fingerprint ~ '^[0-9a-f]{64}$'),
  add column snapshot jsonb not null check(jsonb_typeof(snapshot)='object' and snapshot ?& array['productTitle','productImage','buyerName','buyerEmail','buyerPhone','storeName','sellerEmail']),
  add column meeting_latitude numeric(9,6),add column meeting_longitude numeric(9,6),
  add column service_location_option text check(service_location_option in ('buyer-location','seller-location')),
  add column handover_verified_at timestamptz,
  add constraint order_request_unique unique(buyer_context_id,request_id),
  add constraint order_coordinates check((meeting_latitude is null)=(meeting_longitude is null) and (meeting_latitude is null or meeting_latitude between -90 and 90 and meeting_longitude between -180 and 180));
alter table private.market_order_pins add column key_id text not null check(key_id ~ '^[0-9a-f]{64}$'),
  add constraint order_pin_cipher check(octet_length(nonce)=12 and octet_length(encrypted_pin)=22 and expires_at>issued_at);

create table private.market_order_events(
  id uuid primary key default gen_random_uuid(),order_id uuid not null references public.market_orders(id),
  actor_context_id uuid not null references public.account_contexts(id),
  action text not null check(action in ('created','confirmed','rejected','cancelled','completed','pin_renewed')),
  status text not null,notes text not null default '' check(length(notes)<=2000),created_at timestamptz not null default clock_timestamp()
);
alter table private.market_order_events enable row level security;
revoke all on private.market_order_events from public,anon,authenticated,pinevela_backend;
create function private.check_market_order_event() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op<>'INSERT' then raise exception 'Handover history is immutable' using errcode='23514'; end if;
  if not exists(select 1 from public.market_orders o join public.stores s on s.id=o.store_id where o.id=new.order_id
    and new.actor_context_id in (o.buyer_context_id,s.seller_context_id) and o.status=new.status) then
    raise exception 'Saved order participant and current state required' using errcode='23514';
  end if;return new;
end;$$;
create trigger market_event_evidence before insert or update or delete on private.market_order_events for each row execute function private.check_market_order_event();

create function private.check_market_order_lifecycle() returns trigger language plpgsql security definer set search_path='' as $$
declare s public.stores; l public.listings; reserved bigint; b public.profiles; option public.listing_price_options; expected_price numeric; expected_image text; expected_title text;
begin
  select * into s from public.stores where id=new.store_id for update;
  select * into l from public.listings where id=new.listing_id and store_id=new.store_id for update;
  if s.id is null or l.id is null then raise exception 'Saved store and listing required' using errcode='23514'; end if;
  if tg_op='UPDATE' then
    if row(new.id,new.buyer_context_id,new.store_id,new.listing_id,new.quantity,new.unit_price,new.total_amount,new.currency,new.snapshot,new.request_id,new.request_fingerprint,new.meeting_location,new.meeting_latitude,new.meeting_longitude,new.service_location_option,new.created_at)
      is distinct from row(old.id,old.buyer_context_id,old.store_id,old.listing_id,old.quantity,old.unit_price,old.total_amount,old.currency,old.snapshot,old.request_id,old.request_fingerprint,old.meeting_location,old.meeting_latitude,old.meeting_longitude,old.service_location_option,old.created_at) then
      raise exception 'Order participants and purchase snapshot are immutable' using errcode='23514';
    end if;
    if old.status in ('completed','cancelled','rejected','expired') then
      if new is distinct from old then raise exception 'Terminal order evidence is immutable' using errcode='23514'; end if;return old;
    end if;
    if new.status<>old.status and not ((old.status='awaiting_seller' and new.status in ('pending_meetup','rejected','cancelled','expired'))
      or (old.status='pending_meetup' and new.status in ('completed','cancelled','expired'))) then raise exception 'Invalid order transition' using errcode='23514'; end if;
    if new.seller_confirmed_at is distinct from old.seller_confirmed_at and not(old.status='awaiting_seller' and new.status='pending_meetup') then raise exception 'Meetup agreement is immutable' using errcode='23514'; end if;
    if new.handover_verified_at is distinct from old.handover_verified_at and new.status<>'completed' then raise exception 'Handover requires completion' using errcode='23514'; end if;
  else
    if new.status<>'awaiting_seller' or new.seller_confirmed_at is not null or new.handover_verified_at is not null
      or l.retired_at is not null or not l.is_published or not private.store_is_public(s.id) then raise exception 'New order requires eligible published store/listing' using errcode='23514'; end if;
    select p.* into b from public.profiles p join public.account_contexts x on x.auth_user_id=p.id where x.id=new.buyer_context_id and x.kind='primary' and x.status='active' and p.primary_owner_id is null;
    if b.id is null or b.id=s.primary_owner_id then raise exception 'Eligible separate primary buyer required' using errcode='23514'; end if;
    expected_price=l.price;expected_title=l.title;
    select storage_path into expected_image from public.listing_media where listing_id=l.id and sort_order=0;
    if new.snapshot->>'priceCategoryId' is not null then
      select * into option from public.listing_price_options where id=(new.snapshot->>'priceCategoryId')::uuid and listing_id=l.id;
      if option.id is null or l.kind<>'service' or new.snapshot->>'priceCategory' is distinct from option.label then raise exception 'Actual service option required' using errcode='23514'; end if;
      expected_price=option.price;expected_title=l.title||' ('||option.label||')';expected_image=coalesce(option.image_path,expected_image);
    end if;
    if new.unit_price<>expected_price or new.snapshot->>'productTitle' is distinct from expected_title or expected_image is null or new.snapshot->>'productImage' is distinct from expected_image
      or new.snapshot->>'buyerEmail' is distinct from b.email or new.snapshot->>'buyerName' is distinct from b.display_name
      or new.snapshot->>'storeName' is distinct from s.name or coalesce(new.snapshot->>'buyerPhone','') !~ '^\+[1-9][0-9]{6,14}$' then raise exception 'Actual purchase snapshot required' using errcode='23514'; end if;
  end if;
  if new.total_amount<>new.unit_price*new.quantity or new.currency<>'GHS' then raise exception 'Order pricing is inconsistent' using errcode='23514'; end if;
  if new.status in ('awaiting_seller','pending_meetup') and new.reserved_until is null then raise exception 'Order reservation required' using errcode='23514'; end if;
  if tg_op='INSERT' or (tg_op='UPDATE' and new.reserved_until is distinct from old.reserved_until) then
    if new.status not in ('awaiting_seller','pending_meetup') or new.reserved_until<=clock_timestamp() or l.retired_at is not null or not l.is_published or not private.store_is_public(s.id) then raise exception 'Reservation requires current catalog eligibility' using errcode='23514'; end if;
    select coalesce(sum(quantity),0) into reserved from public.market_orders o where o.listing_id=l.id and o.id<>new.id
      and o.status in ('awaiting_seller','pending_meetup') and o.reserved_until>clock_timestamp();
    if l.kind='product' and l.stock_quantity<reserved+new.quantity then raise exception 'Insufficient unreserved stock' using errcode='23514'; end if;
  end if;
  if new.status='pending_meetup' and new.seller_confirmed_at is null then raise exception 'Seller agreement required' using errcode='23514'; end if;
  if tg_op='UPDATE' and new.status in ('pending_meetup','completed') and new.status<>old.status and new.reserved_until<=clock_timestamp() then raise exception 'Active reservation required' using errcode='23514'; end if;
  if new.status='completed' and (new.handover_verified_at is null or new.handover_verified_at>clock_timestamp() or not exists(select 1 from private.market_order_pins p
    where p.order_id=new.id and p.attempts<5 and p.expires_at>clock_timestamp() and p.expires_at=new.reserved_until)) then raise exception 'Current private handover verification required' using errcode='23514'; end if;
  new.updated_at=clock_timestamp();return new;
end;$$;
create trigger order_lifecycle before insert or update on public.market_orders for each row execute function private.check_market_order_lifecycle();
create function private.consume_market_order_stock() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status='completed' and old.status<>'completed' then
    update public.listings set stock_quantity=stock_quantity-new.quantity,is_published=is_published and stock_quantity-new.quantity>0
      where id=new.listing_id and kind='product' and retired_at is null and stock_quantity>=new.quantity;
    if not found and exists(select 1 from public.listings where id=new.listing_id and kind='product') then raise exception 'Handover stock is unavailable' using errcode='23514'; end if;
  end if;return null;
end;$$;
create trigger order_stock_completion after update on public.market_orders for each row execute function private.consume_market_order_stock();
create function private.check_market_order_pin() returns trigger language plpgsql security definer set search_path='' as $$
declare order_uuid uuid;
begin
  order_uuid=(case when tg_table_name='market_orders' then to_jsonb(new)->>'id' when tg_op='DELETE' then to_jsonb(old)->>'order_id' else to_jsonb(new)->>'order_id' end)::uuid;
  if exists(select 1 from public.market_orders o where o.id=order_uuid and o.status in ('awaiting_seller','pending_meetup')
    and not exists(select 1 from private.market_order_pins p where p.order_id=o.id and p.expires_at=o.reserved_until))
    or exists(select 1 from private.market_order_pins p join public.market_orders o on o.id=p.order_id where o.id=order_uuid and o.status not in ('awaiting_seller','pending_meetup')) then
    raise exception 'Order challenge and reservation must agree' using errcode='23514';
  end if;return null;
end;$$;
create constraint trigger order_pin_consistency after insert or update on public.market_orders deferrable initially deferred for each row execute function private.check_market_order_pin();
create constraint trigger order_pin_reservation after insert or update or delete on private.market_order_pins deferrable initially deferred for each row execute function private.check_market_order_pin();
create function private.order_buyer_media(asset uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.media_assets m join public.market_orders o on o.snapshot->>'productImage'='/api/media/'||m.id::text
    join public.stores s on s.id=o.store_id where m.id=asset and m.state='ready' and m.purpose='market' and m.owner_context_id=s.seller_context_id
    and o.buyer_context_id=private.current_context_id() and private.current_kind()='primary');
$$;
create policy media_order_buyer_read on public.media_assets for select to authenticated using(private.order_buyer_media(id));
revoke all on function private.check_market_order_event(),private.check_market_order_lifecycle(),private.consume_market_order_stock(),private.check_market_order_pin(),private.order_buyer_media(uuid) from public,anon,authenticated,pinevela_backend;
grant execute on function private.order_buyer_media(uuid) to authenticated,pinevela_backend;
