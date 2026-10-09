-- Only buyer/seller inquiries and purchase-bound feedback; no generic chat import.
alter table public.market_messages drop constraint market_messages_body_check,
  add constraint market_messages_body_check check(length(trim(body)) between 1 and 5000),
  add column listing_id uuid,
  add column product_title text not null default '' check(length(product_title)<=400),
  add column request_id uuid not null,
  add column request_fingerprint text not null check(request_fingerprint ~ '^[0-9a-f]{64}$'),
  add constraint message_listing_store foreign key(listing_id,store_id) references public.listings(id,store_id),
  add constraint message_request_unique unique(sender_context_id,request_id);
alter table public.market_messages alter column created_at set default clock_timestamp();
create function private.check_purchase_message() returns trigger language plpgsql security definer set search_path='' as $$
declare s public.stores; o public.market_orders; l public.listings; buyer_user uuid;
begin
  if tg_op<>'INSERT' then raise exception 'Message history is immutable' using errcode='23514'; end if;
  select * into s from public.stores where id=new.store_id for update;
  select x.auth_user_id into buyer_user from public.account_contexts x join public.profiles p on p.id=x.auth_user_id
    where x.id=new.buyer_context_id and x.kind='primary' and x.status='active' and p.primary_owner_id is null;
  if buyer_user is null or buyer_user=s.primary_owner_id or s.status<>'active' or not exists(
    select 1 from public.account_contexts x join public.seller_applications a on a.seller_context_id=x.id
    where x.id=s.seller_context_id and x.status='active' and a.status='approved') then raise exception 'Eligible buyer and seller required' using errcode='23514'; end if;
  if new.sender_context_id not in(new.buyer_context_id,s.seller_context_id) then raise exception 'Saved conversation participant required' using errcode='23514'; end if;
  if new.order_id is not null then
    select * into o from public.market_orders where id=new.order_id and buyer_context_id=new.buyer_context_id and store_id=s.id;
    if o.id is null or new.listing_id is distinct from o.listing_id or new.product_title is distinct from o.snapshot->>'productTitle' then raise exception 'Actual purchase context required' using errcode='23514'; end if;
  elsif new.listing_id is not null then
    select * into l from public.listings where id=new.listing_id and store_id=s.id;
    if l.id is null or new.product_title is distinct from l.title then raise exception 'Actual listing context required' using errcode='23514'; end if;
  elsif new.product_title<>'' then raise exception 'Store inquiry has no listing title' using errcode='23514'; end if;
  if new.order_id is null and not exists(select 1 from public.market_messages where store_id=s.id and buyer_context_id=new.buyer_context_id) then
    if new.sender_context_id<>new.buyer_context_id or not private.store_is_public(s.id)
      or (new.listing_id is not null and (l.retired_at is not null or not l.is_published)) then raise exception 'Buyer must initiate an eligible inquiry' using errcode='23514'; end if;
  end if;
  return new;
end;$$;
create trigger purchase_message_evidence before insert or update or delete on public.market_messages for each row execute function private.check_purchase_message();
drop policy market_messages_related_read on public.market_messages;
create policy market_messages_related_read on public.market_messages for select to authenticated using(
  (private.current_kind()='primary' and buyer_context_id=private.current_context_id()) or
  (private.current_kind()='seller' and exists(select 1 from public.stores s where s.id=store_id and s.seller_context_id=private.current_context_id())));
revoke insert,update,delete on public.market_messages,public.market_reviews from public,anon,authenticated,pinevela_backend;

create function private.check_purchase_review() returns trigger language plpgsql security definer set search_path='' as $$
declare o public.market_orders;
begin
  if tg_op='UPDATE' and row(new.id,new.order_id,new.buyer_context_id,new.store_id,new.created_at)
    is distinct from row(old.id,old.order_id,old.buyer_context_id,old.store_id,old.created_at) then raise exception 'Purchase review receipt is immutable' using errcode='23514'; end if;
  select * into o from public.market_orders where id=new.order_id and buyer_context_id=new.buyer_context_id and store_id=new.store_id;
  if o.status is distinct from 'completed' or o.handover_verified_at is null then raise exception 'Verified purchase handover required' using errcode='23514'; end if;
  new.review=trim(new.review);
  if tg_op='UPDATE' then
    if new.rating=old.rating and new.review=old.review then return old; end if;
    new.updated_at=clock_timestamp();
  end if;return new;
end;$$;
create trigger purchase_review_evidence before insert or update on public.market_reviews for each row execute function private.check_purchase_review();
create or replace view public.market_reviews_public with(security_barrier=true) as
select r.id,r.store_id,o.listing_id,r.rating,r.review,r.created_at,r.updated_at,o.snapshot->>'buyerName' as buyer_name
from public.market_reviews r join public.market_orders o on o.id=r.order_id
join public.account_contexts b on b.id=o.buyer_context_id join public.profiles p on p.id=b.auth_user_id join public.stores s on s.id=r.store_id
where o.status='completed' and o.handover_verified_at is not null and coalesce(p.primary_owner_id,p.id)<>s.primary_owner_id and private.store_is_public(s.id);
alter table public.notifications add column market_message_id uuid references public.market_messages(id),
  add column market_review_id uuid references public.market_reviews(id);
revoke all on function private.check_purchase_message(),private.check_purchase_review() from public,anon,authenticated,pinevela_backend;
