-- System expiry is distinct from a buyer/seller cancellation. Preserve every
-- receipt and event; allow a null actor only for a verified expiry transition.
set local lock_timeout = '5s';
alter table private.market_order_events alter column actor_context_id drop not null;
alter table private.market_order_events drop constraint market_order_events_action_check;
alter table private.market_order_events add constraint market_order_events_action_check
  check(action in ('created','confirmed','rejected','cancelled','completed','pin_renewed','expired'));
create or replace function private.check_market_order_event() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op<>'INSERT' then raise exception 'Handover history is immutable' using errcode='23514'; end if;
  if new.action='expired' then
    if new.actor_context_id is not null or new.status<>'expired' or not exists(
      select 1 from public.market_orders o where o.id=new.order_id and o.status='expired' and o.reserved_until<=clock_timestamp()) then
      raise exception 'Saved expired reservation required' using errcode='23514';
    end if;
  elsif new.actor_context_id is null or not exists(select 1 from public.market_orders o join public.stores s on s.id=o.store_id where o.id=new.order_id
    and new.actor_context_id in (o.buyer_context_id,s.seller_context_id) and o.status=new.status) then
    raise exception 'Saved order participant and current state required' using errcode='23514';
  end if;return new;
end;$$;
revoke all on function private.check_market_order_event() from public,anon,authenticated,pinevela_backend;
create index market_orders_expiration_idx on public.market_orders(reserved_until,id) where status in ('awaiting_seller','pending_meetup');
