-- Add access-path indexes only; no rows, ownership or RLS grants are changed.
set local lock_timeout = '5s';
create index market_messages_buyer_history_idx on public.market_messages(buyer_context_id,created_at desc,id desc);
create index market_messages_store_history_idx on public.market_messages(store_id,created_at desc,id desc);
create index market_orders_buyer_history_idx on public.market_orders(buyer_context_id,created_at desc,id desc);
create index market_orders_store_history_idx on public.market_orders(store_id,created_at desc,id desc);
create index market_order_events_history_idx on private.market_order_events(order_id,created_at,id);
