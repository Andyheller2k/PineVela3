-- Server quotes, provider receipts and access periods; no legacy payment import.
alter table public.payments drop constraint payments_mode_check,
  add constraint payments_mode_check check(mode in ('live','test','free')),
  add constraint payment_target check((purpose='residence_onboarding' and residence_id is not null and store_id is null)
    or (purpose<>'residence_onboarding' and store_id is not null and residence_id is null));
create table private.payment_checkouts (
  payment_id uuid primary key references public.payments(id),
  actor_context_id uuid not null references public.account_contexts(id),
  request_id uuid not null,
  request_fingerprint text not null check(request_fingerprint ~ '^[a-f0-9]{64}$'),
  payer_email text not null check(length(payer_email) between 3 and 254),
  plan text check(plan in ('default','pine_star','pine_pro')),
  amount_minor bigint not null check(amount_minor between 0 and 300000000),
  lines jsonb not null check(jsonb_typeof(lines)='array' and jsonb_array_length(lines) between 1 and 3),
  callback_origin text,
  settlement_code text check(settlement_code ~ '^ACCT_[A-Za-z0-9]{1,80}$'),
  mobile_money jsonb,
  initialization_state text not null default 'reserved' check(initialization_state in ('reserved','ready','uncertain')),
  authorization_url text,
  provider_status text,
  review_required text,
  unique(actor_context_id,request_id)
);
alter table private.payment_checkouts enable row level security;
revoke all on private.payment_checkouts from public,anon,authenticated,pinevela_backend;
create table public.store_fee_periods (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  payment_id uuid not null unique references public.payments(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  check(ends_at>starts_at)
);
alter table public.store_subscriptions drop constraint store_subscriptions_store_id_starts_at_key,
  add column period_sequence bigint generated always as identity;
alter table public.store_fee_periods enable row level security;
create policy store_fee_periods_read on public.store_fee_periods for select to authenticated using(private.can_manage_store(store_id));
grant select on public.store_fee_periods to authenticated,pinevela_backend;
revoke insert,update,delete on public.payments,public.store_subscriptions,public.store_fee_periods from public,anon,authenticated,pinevela_backend;
revoke select on public.payments from public,anon,authenticated,pinevela_backend;
grant select(id,actor_context_id,residence_id,store_id,provider,provider_reference,purpose,status,amount,currency,mode,created_at,fulfilled_at)
  on public.payments to authenticated,pinevela_backend;

create function private.payment_receipt_matches(p public.payments,q private.payment_checkouts) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce(p.provider_receipt->>'status'='success' and p.provider_receipt->>'reference'=p.provider_reference
    and p.provider_receipt->>'currency'='GHS' and p.provider_receipt->>'domain'=p.mode
    and p.provider_receipt->>'amount'=q.amount_minor::text and p.provider_receipt->>'email'=q.payer_email
    and (q.settlement_code is null or p.provider_receipt->>'settlementCode'=q.settlement_code)
    and ((p.mode='free' and p.provider='platform' and q.amount_minor=0 and p.provider_receipt->>'source'='platform_zero_fee')
      or (p.mode in ('live','test') and p.provider='paystack' and q.amount_minor>0 and p.provider_receipt->>'source'='paystack_verify')),false);
$$;
create function private.payment_grants_access(payment uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.payments p join private.payment_checkouts q on q.payment_id=p.id
    where p.id=payment and p.status='fulfilled' and p.mode in ('live','free') and private.payment_receipt_matches(p,q));
$$;
create function private.check_payment_evidence() returns trigger language plpgsql security definer set search_path='' as $$
declare q private.payment_checkouts;
begin
  if tg_op='DELETE' then raise exception 'Payment history is immutable' using errcode='23514'; end if;
  if tg_op='UPDATE' and row(new.id,new.actor_context_id,new.store_id,new.residence_id,new.provider,new.provider_reference,new.purpose,new.amount,new.currency,new.mode,new.created_at)
    is distinct from row(old.id,old.actor_context_id,old.store_id,old.residence_id,old.provider,old.provider_reference,old.purpose,old.amount,old.currency,old.mode,old.created_at) then
    raise exception 'Payment quote and ownership are immutable' using errcode='23514'; end if;
  if new.currency<>'GHS' or (tg_op='INSERT' and ((new.store_id is not null and not exists(select 1 from public.stores s where s.id=new.store_id and s.seller_context_id=new.actor_context_id))
    or (new.residence_id is not null and not exists(select 1 from public.manager_assignments m where m.residence_id=new.residence_id and m.manager_context_id=new.actor_context_id and m.ended_at is null)))) then
    raise exception 'Saved payment target and account required' using errcode='23514'; end if;
  if tg_op='UPDATE' and old.status='fulfilled' and row(new.status,new.fulfilled_at,new.provider_receipt) is distinct from row(old.status,old.fulfilled_at,old.provider_receipt) then
    raise exception 'Fulfilled receipt is immutable; refunds require a separate reviewed workflow' using errcode='23514'; end if;
  if new.status='fulfilled' then
    select * into q from private.payment_checkouts where payment_id=new.id;
    if q.payment_id is null or new.fulfilled_at is null or not private.payment_receipt_matches(new,q) then raise exception 'Verified matching receipt required' using errcode='23514'; end if;
  elsif new.fulfilled_at is not null then raise exception 'Unfulfilled payment cannot attest fulfillment' using errcode='23514'; end if;
  return new;
end;$$;
create trigger payment_evidence before insert or update or delete on public.payments for each row execute function private.check_payment_evidence();
create function private.check_payment_quote() returns trigger language plpgsql security definer set search_path='' as $$
declare p public.payments; total bigint;
begin
  if tg_op='UPDATE' and row(new.payment_id,new.actor_context_id,new.request_id,new.request_fingerprint,new.payer_email,new.plan,new.amount_minor,new.lines,new.callback_origin,new.settlement_code,new.mobile_money)
    is distinct from row(old.payment_id,old.actor_context_id,old.request_id,old.request_fingerprint,old.payer_email,old.plan,old.amount_minor,old.lines,old.callback_origin,old.settlement_code,old.mobile_money) then
    raise exception 'Checkout quote is immutable' using errcode='23514'; end if;
  select * into p from public.payments where id=new.payment_id;
  select sum((line->>'amountMinor')::bigint) into total from jsonb_array_elements(new.lines) line;
  if p.actor_context_id is distinct from new.actor_context_id or p.amount*100<>new.amount_minor or total is distinct from new.amount_minor
    or not exists(select 1 from public.account_contexts c join public.profiles profile on profile.id=c.auth_user_id where c.id=new.actor_context_id and profile.email=new.payer_email)
    or (p.store_id is not null and new.plan is null) or (p.residence_id is not null and new.plan is not null)
    or (p.purpose='store_activation' and (new.plan<>'default' or jsonb_array_length(new.lines)<>1 or new.lines->0->>'kind'<>'registration')) then
    raise exception 'Actual immutable account and quote totals required' using errcode='23514'; end if;
  return new;
end;$$;
create trigger payment_quote_evidence before insert or update on private.payment_checkouts for each row execute function private.check_payment_quote();
create function private.require_payment_quote() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from private.payment_checkouts where payment_id=new.id) then raise exception 'Checkout quote required' using errcode='23514'; end if;return null;
end;$$;
create constraint trigger payment_quote_required after insert on public.payments deferrable initially deferred for each row execute function private.require_payment_quote();
create function private.check_paid_period() returns trigger language plpgsql security definer set search_path='' as $$
declare p public.payments; q private.payment_checkouts; previous timestamptz; expected timestamptz; previous_plan text; months integer;
begin
  if tg_op='UPDATE' and row(new.id,new.store_id,new.payment_id,new.starts_at,new.ends_at) is distinct from row(old.id,old.store_id,old.payment_id,old.starts_at,old.ends_at) then
    raise exception 'Paid access interval is immutable' using errcode='23514'; end if;
  select * into p from public.payments where id=new.payment_id;select * into q from private.payment_checkouts where payment_id=p.id;
  if p.store_id is distinct from new.store_id or not private.payment_grants_access(p.id)
    or (tg_table_name='store_fee_periods' and p.purpose not in ('store_activation','semester'))
    or (tg_table_name='store_subscriptions' and (p.purpose not in ('store_activation','subscription') or to_jsonb(new)->>'plan' is distinct from q.plan)) then
    raise exception 'Verified payment for this store and period required' using errcode='23514'; end if;
  if tg_op='INSERT' then
    if new.starts_at is distinct from p.fulfilled_at then raise exception 'Access must start at the saved fulfillment time' using errcode='23514'; end if;
    if p.purpose='store_activation' then expected=((new.starts_at at time zone 'UTC')+interval '2 months') at time zone 'UTC';
    else
      months=case when tg_table_name='store_fee_periods' then 2 else 1 end;
      if tg_table_name='store_fee_periods' then select max(ends_at) into previous from public.store_fee_periods where store_id=new.store_id;
      else select ends_at,plan into previous,previous_plan from public.store_subscriptions where store_id=new.store_id order by period_sequence desc limit 1;
        if previous_plan is distinct from q.plan then previous=null; end if;
      end if;
      previous=greatest(new.starts_at,previous);
      if q.amount_minor=0 then expected=greatest(previous,((new.starts_at at time zone 'UTC')+make_interval(months=>months)) at time zone 'UTC');
      else expected=((previous at time zone 'UTC')+make_interval(months=>months)) at time zone 'UTC'; end if;
    end if;
    if new.ends_at is distinct from expected then raise exception 'Saved fee policy and calendar interval required' using errcode='23514'; end if;
  end if;return new;
end;$$;
create trigger subscription_payment_evidence before insert or update on public.store_subscriptions for each row execute function private.check_paid_period();
create trigger fee_payment_evidence before insert or update on public.store_fee_periods for each row execute function private.check_paid_period();
create unique index store_subscription_payment_unique on public.store_subscriptions(payment_id) where payment_id is not null;
create unique index store_one_active_subscription on public.store_subscriptions(store_id) where status='active';
create unique index store_one_activation_receipt on public.payments(store_id) where purpose='store_activation' and status='fulfilled' and mode in ('live','free');
create unique index residence_one_onboarding_receipt on public.payments(residence_id) where purpose='residence_onboarding' and status='fulfilled' and mode in ('live','free');

-- Extend the previously reviewed setup guard without changing its identity rules.
create function private.check_store_payment_access() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status='active' and (tg_op='INSERT' or old.status<>'active') and not exists(
    select 1 from public.payments p where p.store_id=new.id and p.purpose='store_activation' and private.payment_grants_access(p.id)) then
    raise exception 'Operational verified registration payment required' using errcode='23514'; end if;return new;
end;$$;
create trigger store_payment_access before insert or update on public.stores for each row execute function private.check_store_payment_access();
-- Existing setup trigger checks live mode; genuine zero-fee policy is also supported.
create or replace function private.check_store_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and row(new.id,new.seller_context_id,new.primary_owner_id,new.campus,new.created_at) is distinct from row(old.id,old.seller_context_id,old.primary_owner_id,old.campus,old.created_at) then raise exception 'Store identity, primary owner and verified campus are immutable' using errcode='23514'; end if;
  if tg_op='UPDATE' and old.setup_completed_at is not null and new.setup_completed_at is distinct from old.setup_completed_at then raise exception 'Original store setup time is immutable' using errcode='23514'; end if;
  if new.setup_completed_at>clock_timestamp() then raise exception 'Store setup cannot be dated in the future' using errcode='23514'; end if;
  if tg_op='INSERT' and not exists(select 1 from public.seller_applications a join public.account_contexts c on c.id=a.seller_context_id where a.seller_context_id=new.seller_context_id and a.status='approved' and c.primary_owner_id=new.primary_owner_id and a.campus=new.campus and c.kind='seller' and c.status in ('pending','active')) then raise exception 'Approved saved seller application required' using errcode='23514'; end if;
  if new.status='active' and (tg_op='INSERT' or old.status<>'active') and (new.setup_completed_at is null or new.activated_at is null
    or not exists(select 1 from public.payments p where p.store_id=new.id and p.purpose='store_activation' and private.payment_grants_access(p.id))
    or not exists(select 1 from public.store_subscriptions s where s.store_id=new.id and s.status='active' and s.starts_at<=now() and s.ends_at>now())
    or not exists(select 1 from public.store_fee_periods f where f.store_id=new.id and f.starts_at<=now() and f.ends_at>now())) then raise exception 'Setup and verified registration/access periods required' using errcode='23514'; end if;
  return new;
end;$$;
create or replace function private.store_is_public(store uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.stores s join public.account_contexts c on c.id=s.seller_context_id join public.seller_applications a on a.seller_context_id=c.id
    where s.id=store and s.status='active' and s.setup_completed_at is not null and s.activated_at is not null and c.kind='seller' and c.status='active' and a.status='approved'
      and exists(select 1 from public.payments p where p.store_id=s.id and p.purpose='store_activation' and private.payment_grants_access(p.id))
      and exists(select 1 from public.store_subscriptions sub where sub.store_id=s.id and sub.status='active' and sub.starts_at<=now() and sub.ends_at>now() and private.payment_grants_access(sub.payment_id))
      and exists(select 1 from public.store_fee_periods f where f.store_id=s.id and f.starts_at<=now() and f.ends_at>now() and private.payment_grants_access(f.payment_id)));
$$;
revoke all on function private.payment_receipt_matches(public.payments,private.payment_checkouts),private.check_payment_evidence(),private.check_payment_quote(),private.require_payment_quote(),private.check_paid_period(),private.check_store_payment_access() from public,anon,authenticated,pinevela_backend;
revoke all on function private.payment_grants_access(uuid) from public,anon,authenticated;
grant execute on function private.payment_grants_access(uuid) to pinevela_backend;
