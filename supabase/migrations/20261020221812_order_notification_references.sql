-- A nullable, exact relationship; historical text is never guessed/backfilled.
set local lock_timeout = '5s';
alter table public.notifications add column market_order_id uuid references public.market_orders(id) on delete set null;
create index notifications_market_order_idx on public.notifications(market_order_id) where market_order_id is not null;
create function private.check_order_notification_reference() returns trigger language plpgsql security definer set search_path='' as $$
declare n public.notifications; b uuid; s uuid;
begin
  if tg_table_name='notifications' then select * into n from public.notifications where id=new.id;
  else select * into n from public.notifications where id=new.notification_id;end if;
  if n.market_order_id is null then return null;end if;
  select o.buyer_context_id,store.seller_context_id into b,s from public.market_orders o join public.stores store on store.id=o.store_id where o.id=n.market_order_id;
  if b is null or n.category<>'market' or (n.sender_context_id is not null and n.sender_context_id not in (b,s))
    or exists(select 1 from public.notification_recipients r where r.notification_id=n.id and r.context_id not in (b,s)) then
    raise exception 'Order notification requires its saved participants' using errcode='23514';
  end if;return null;
end;$$;
revoke all on function private.check_order_notification_reference() from public,anon,authenticated,pinevela_backend;
create constraint trigger notification_order_reference after insert or update on public.notifications deferrable initially deferred
  for each row execute function private.check_order_notification_reference();
create constraint trigger recipient_order_reference after insert or update on public.notification_recipients deferrable initially deferred
  for each row execute function private.check_order_notification_reference();
