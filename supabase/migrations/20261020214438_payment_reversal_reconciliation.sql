-- Provider reconciliation is separate from immutable payment/fulfillment receipts.
create table private.payment_reversals (
 payment_id uuid primary key references public.payments(id),
 provider_status text not null check(provider_status in ('success','reversed')),
 refunded_minor bigint not null check(refunded_minor>=0),
 evidence_digest text not null check(evidence_digest~'^[a-f0-9]{64}$'),
 dispute_state text not null default 'none' check(dispute_state in ('none','open','resolved')),
 manual_access text not null default 'default' check(manual_access in ('default','retain','revoke')),
 review_required boolean not null default true,
 reviewed_by_context_id uuid references public.account_contexts(id),
 reviewed_at timestamptz,
 review_reason text check(length(review_reason) between 3 and 500),
 verified_at timestamptz not null default clock_timestamp(),
 revision bigint not null default 1 check(revision>0),
 check((reviewed_by_context_id is null)=(reviewed_at is null))
);
create table private.payment_reversal_events (
 event_digest text primary key check(event_digest~'^[a-f0-9]{64}$'),
 payment_id uuid not null references public.payments(id),
 event_kind text not null check(event_kind in ('refund.pending','refund.processing','refund.needs-attention','refund.failed','refund.processed',
  'charge.dispute.create','charge.dispute.remind','charge.dispute.resolve','reconcile')),
 status text not null default 'pending' check(status in ('pending','processing','complete')),
 attempts integer not null default 0 check(attempts>=0),
 next_at timestamptz not null default clock_timestamp(),
 lease_id uuid,
 lease_until timestamptz,
 summary jsonb,
 created_at timestamptz not null default clock_timestamp(),
 completed_at timestamptz,
 check((status='processing' and lease_id is not null and lease_until is not null)
  or(status<>'processing' and lease_id is null and lease_until is null)),
 check((status='complete')=(completed_at is not null))
);
create index payment_reversal_pending on private.payment_reversal_events(next_at,created_at) where status='pending';
create unique index one_payment_reconciliation_at_a_time on private.payment_reversal_events(payment_id) where status='processing';
create index payment_reversal_review on private.payment_reversals(verified_at,payment_id) where review_required;
alter table private.payment_reversals enable row level security;
alter table private.payment_reversal_events enable row level security;
revoke all on private.payment_reversals,private.payment_reversal_events from public,anon,authenticated,pinevela_backend,pinevela_catalog;

create function private.check_payment_reversal() returns trigger language plpgsql set search_path='' as $$
declare p public.payments; q private.payment_checkouts;
begin
 select * into p from public.payments where id=new.payment_id;
 select * into q from private.payment_checkouts where payment_id=new.payment_id;
 if p.id is null or q.payment_id is null or p.provider<>'paystack' or p.mode<>'live'
  or q.amount_minor<=0 or new.refunded_minor>q.amount_minor then
  raise exception 'Reconciliation requires the original live payment quote' using errcode='23514';end if;
 if tg_op='UPDATE' and old.payment_id is distinct from new.payment_id then
  raise exception 'Reconciliation ownership is immutable' using errcode='23514';end if;
 if new.reviewed_by_context_id is not null and(tg_op='INSERT' or
  (new.reviewed_by_context_id,new.reviewed_at,new.review_reason) is distinct from(old.reviewed_by_context_id,old.reviewed_at,old.review_reason))
  and not exists(select 1 from public.admin_memberships m
  join public.account_contexts a on a.id=m.context_id where a.id=new.reviewed_by_context_id
  and a.kind='admin' and a.status='active' and m.status='active') then
  raise exception 'An active administrator must review reconciliation' using errcode='23514';end if;
 return new;
end;$$;
create trigger payment_reversal_quote before insert or update on private.payment_reversals for each row execute function private.check_payment_reversal();
revoke all on function private.check_payment_reversal() from public,anon,authenticated,pinevela_backend,pinevela_catalog;

create or replace function private.payment_grants_access(payment uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.payments p join private.payment_checkouts q on q.payment_id=p.id
  where p.id=payment and p.status='fulfilled' and p.mode in ('live','free') and private.payment_receipt_matches(p,q)
  and not exists(select 1 from private.payment_reversals r where r.payment_id=p.id
   and((r.provider_status='reversed' and r.refunded_minor=0) or r.refunded_minor>=q.amount_minor or r.manual_access='revoke')));
$$;
revoke all on function private.payment_grants_access(uuid) from public,anon,authenticated;
grant execute on function private.payment_grants_access(uuid) to pinevela_backend;

-- Renewals cannot inherit time from a reversed receipt; historic intervals stay immutable.
create or replace function private.check_paid_period() returns trigger language plpgsql security definer set search_path='' as $$
declare p public.payments; q private.payment_checkouts; previous timestamptz; expected timestamptz; previous_plan text; months integer;
begin
  if tg_op='UPDATE' and row(new.id,new.store_id,new.payment_id,new.starts_at,new.ends_at) is distinct from row(old.id,old.store_id,old.payment_id,old.starts_at,old.ends_at) then
    raise exception 'Paid access interval is immutable' using errcode='23514'; end if;
  if tg_op='UPDATE' and tg_table_name='store_subscriptions' and to_jsonb(old)->>'status'='active' and to_jsonb(new)->>'status'='cancelled'
    and to_jsonb(new)->>'plan' is not distinct from to_jsonb(old)->>'plan' then return new;end if;
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
      if tg_table_name='store_fee_periods' then select max(ends_at) into previous from public.store_fee_periods where store_id=new.store_id and private.payment_grants_access(payment_id);
      else select ends_at,plan into previous,previous_plan from public.store_subscriptions where store_id=new.store_id and private.payment_grants_access(payment_id) order by period_sequence desc limit 1;
        if previous_plan is distinct from q.plan then previous=null; end if;
      end if;
      previous=greatest(new.starts_at,previous);
      if q.amount_minor=0 then expected=greatest(previous,((new.starts_at at time zone 'UTC')+make_interval(months=>months)) at time zone 'UTC');
      else expected=((previous at time zone 'UTC')+make_interval(months=>months)) at time zone 'UTC'; end if;
    end if;
    if new.ends_at is distinct from expected then raise exception 'Saved fee policy and calendar interval required' using errcode='23514'; end if;
  end if;return new;
end;$$;
revoke all on function private.check_paid_period() from public,anon,authenticated,pinevela_backend;
