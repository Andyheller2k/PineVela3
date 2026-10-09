-- Active registration, residence operations, marketplace, payments and notifications.
-- No legacy rows, credentials, or retired workflows are inserted.
create table public.verification_cases (
  id uuid primary key default gen_random_uuid(),
  applicant_context_id uuid not null references public.account_contexts(id) on delete cascade,
  residence_id uuid references public.residences(id) on delete cascade,
  kind text not null check (kind in ('manager_registration','residence_registration')),
  status text not null default 'submitted' check (status in ('submitted','inspection_pending','under_review','approved','rejected','more_info_required','suspended')),
  submitted_data jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by_context_id uuid references public.account_contexts(id),
  review_notes text
);
create index verification_cases_applicant_idx on public.verification_cases(applicant_context_id, submitted_at desc);
create table public.verification_inspections (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.verification_cases(id) on delete cascade,
  officer_context_id uuid not null references public.account_contexts(id),
  status text not null default 'assigned' check (status in ('assigned','in_progress','submitted','accepted','rejected')),
  report jsonb,
  assigned_at timestamptz not null default now(),
  submitted_at timestamptz
);
create index verification_inspections_officer_idx on public.verification_inspections(officer_context_id, assigned_at desc);
create table public.residence_change_requests (
  id uuid primary key default gen_random_uuid(),
  residence_id uuid not null references public.residences(id) on delete cascade,
  manager_context_id uuid not null references public.account_contexts(id),
  baseline_digest text not null,
  before_fields jsonb not null,
  after_fields jsonb not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','invalidated')),
  submitted_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by_context_id uuid references public.account_contexts(id),
  decision_notes text
);
create index residence_change_requests_manager_idx on public.residence_change_requests(manager_context_id, submitted_at desc);

create table public.maintenance_issues (
  id uuid primary key default gen_random_uuid(),
  residence_id uuid not null references public.residences(id) on delete cascade,
  room_id uuid references public.rooms(id),
  reporter_context_id uuid not null references public.account_contexts(id),
  assigned_staff_id uuid references public.staff_assignments(id),
  title text not null check (length(trim(title)) between 1 and 200),
  details text not null default '',
  category text,
  urgency text,
  photo_paths text[] not null default '{}',
  status text not null default 'reported' check (status in ('reported','assigned','accepted','reschedule_requested','staff_completed','resident_confirmed','follow_up','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);
create index maintenance_issues_residence_idx on public.maintenance_issues(residence_id, created_at desc);
create table public.maintenance_events (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.maintenance_issues(id) on delete cascade,
  actor_context_id uuid not null references public.account_contexts(id),
  event_type text not null,
  notes text,
  photo_paths text[] not null default '{}',
  occurred_at timestamptz not null default now()
);
create table public.repair_reviews (
  issue_id uuid primary key references public.maintenance_issues(id) on delete cascade,
  resident_context_id uuid not null references public.account_contexts(id),
  rating smallint not null check (rating between 1 and 5),
  comment text not null default '',
  created_at timestamptz not null default now()
);
create table public.staff_reviews (
  id uuid primary key default gen_random_uuid(),
  allocation_id uuid not null references public.allocations(id),
  staff_assignment_id uuid not null references public.staff_assignments(id),
  resident_context_id uuid not null references public.account_contexts(id),
  issue_id uuid references public.maintenance_issues(id),
  rating smallint not null check (rating between 1 and 5),
  comment text not null default '',
  created_at timestamptz not null default now()
);
create unique index staff_reviews_issue_idx on public.staff_reviews(issue_id) where issue_id is not null;
create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  residence_id uuid not null references public.residences(id) on delete cascade,
  requested_by_context_id uuid not null references public.account_contexts(id),
  manager_context_id uuid not null references public.account_contexts(id),
  staff_context_id uuid references public.account_contexts(id),
  status text not null default 'requested' check (status in ('requested','accepted','declined','cancelled','completed')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text,
  notes text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create table public.staff_bargains (
  id uuid primary key default gen_random_uuid(),
  staff_assignment_id uuid not null references public.staff_assignments(id),
  manager_context_id uuid not null references public.account_contexts(id),
  proposed_terms jsonb not null,
  status text not null default 'proposed' check (status in ('proposed','countered','accepted','declined','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.seller_applications (
  id uuid primary key default gen_random_uuid(),
  seller_context_id uuid not null unique references public.account_contexts(id) on delete cascade,
  campus text not null,
  primary_category text not null,
  student_id text,
  status text not null default 'submitted' check (status in ('submitted','approved','rejected','suspended')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by_context_id uuid references public.account_contexts(id)
);
create table public.stores (
  id uuid primary key default gen_random_uuid(),
  seller_context_id uuid not null unique references public.account_contexts(id) on delete cascade,
  primary_owner_id uuid not null references public.profiles(id),
  name text not null check (length(trim(name)) between 1 and 200),
  campus text not null default '',
  primary_category text not null default '',
  delivery_mode text,
  description text not null default '',
  primary_phone text,
  logo_path text,
  cover_path text,
  status text not null default 'pending' check (status in ('pending','active','suspended','banned','closed')),
  created_at timestamptz not null default now(),
  activated_at timestamptz
);
create table public.listings (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  kind text not null check (kind in ('product','service')),
  title text not null check (length(trim(title)) between 1 and 200),
  description text not null default '',
  category text not null default '',
  price numeric(12,2) not null check (price >= 0),
  currency text not null default 'GHS' check (length(currency) = 3),
  stock_quantity integer check (stock_quantity >= 0),
  is_published boolean not null default false,
  service_location_mode text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id, store_id),
  check ((kind = 'service' and stock_quantity is null) or (kind = 'product' and stock_quantity is not null)),
  check (latitude between -90 and 90 or latitude is null),
  check (longitude between -180 and 180 or longitude is null)
);
create index listings_store_published_idx on public.listings(store_id, created_at desc) where is_published;
create table public.listing_media (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  sort_order smallint not null check (sort_order between 0 and 3),
  storage_path text not null,
  unique(listing_id, sort_order)
);
create table public.listing_price_options (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  sort_order smallint not null check (sort_order between 0 and 3),
  label text not null check (length(trim(label)) between 1 and 120),
  price numeric(12,2) not null check (price >= 0),
  image_path text,
  unique(listing_id, sort_order)
);
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  actor_context_id uuid not null references public.account_contexts(id),
  residence_id uuid references public.residences(id),
  store_id uuid references public.stores(id),
  provider text not null,
  provider_reference text not null,
  purpose text not null check (purpose in ('residence_onboarding','store_activation','semester','subscription')),
  status text not null check (status in ('initialized','pending','fulfilled','failed','refunded')),
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null check (length(currency) = 3),
  mode text not null check (mode in ('live','test')),
  provider_receipt jsonb,
  created_at timestamptz not null default now(),
  fulfilled_at timestamptz,
  unique(provider, provider_reference)
);
create table public.store_subscriptions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  payment_id uuid references public.payments(id),
  plan text not null check (plan in ('default','pine_star','pine_pro')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'active' check (status in ('active','cancelled','expired')),
  unique(store_id, starts_at),
  check (ends_at > starts_at)
);
create function private.store_is_public(store uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.stores s
    where s.id = store and s.status = 'active'
      and exists (select 1 from public.payments p where p.store_id = s.id and p.purpose = 'store_activation'
        and p.status = 'fulfilled' and p.mode = 'live')
      and exists (select 1 from public.store_subscriptions sub where sub.store_id = s.id
        and sub.status = 'active' and sub.starts_at <= now() and sub.ends_at > now())
  );
$$;
create function private.can_manage_store(store uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.current_kind() = 'admin' or exists (
    select 1 from public.stores s where s.id = store
      and s.seller_context_id = private.current_context_id() and private.current_kind() = 'seller'
  );
$$;
grant execute on function private.store_is_public(uuid) to anon, authenticated;
grant execute on function private.can_manage_store(uuid) to authenticated;

create table public.market_orders (
  id uuid primary key default gen_random_uuid(),
  buyer_context_id uuid not null references public.account_contexts(id),
  store_id uuid not null references public.stores(id),
  listing_id uuid not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  total_amount numeric(12,2) not null check (total_amount >= 0),
  currency text not null check (length(currency) = 3),
  status text not null default 'awaiting_seller' check (status in ('awaiting_seller','pending_meetup','completed','cancelled','rejected','expired')),
  meeting_location text,
  seller_confirmed_at timestamptz,
  reserved_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (listing_id, store_id) references public.listings(id, store_id),
  unique(id, buyer_context_id, store_id)
);
create index market_orders_active_reservations_idx on public.market_orders(listing_id, reserved_until)
  where status in ('awaiting_seller','pending_meetup');
create table private.market_order_pins (
  order_id uuid primary key references public.market_orders(id) on delete cascade,
  encrypted_pin bytea not null,
  nonce bytea not null,
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  attempts smallint not null default 0 check (attempts between 0 and 5),
  version integer not null default 1 check (version > 0)
);
alter table private.market_order_pins enable row level security;
revoke all on private.market_order_pins from anon, authenticated;
create table public.market_messages (
  id uuid primary key default gen_random_uuid(),
  buyer_context_id uuid not null references public.account_contexts(id),
  store_id uuid not null references public.stores(id),
  order_id uuid,
  sender_context_id uuid not null references public.account_contexts(id),
  body text not null check (length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  foreign key (order_id, buyer_context_id, store_id)
    references public.market_orders(id, buyer_context_id, store_id)
);
create index market_messages_conversation_idx on public.market_messages(store_id, buyer_context_id, created_at desc);
create table public.market_reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.market_orders(id),
  buyer_context_id uuid not null references public.account_contexts(id),
  store_id uuid not null references public.stores(id),
  rating smallint not null check (rating between 1 and 5),
  review text not null default '' check (length(review) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (order_id, buyer_context_id, store_id)
    references public.market_orders(id, buyer_context_id, store_id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  sender_context_id uuid references public.account_contexts(id),
  category text not null,
  title text not null,
  message text not null,
  link text,
  created_at timestamptz not null default now()
);
create table public.notification_recipients (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  context_id uuid not null references public.account_contexts(id) on delete cascade,
  read_at timestamptz,
  popup_acknowledged_at timestamptz,
  primary key(notification_id, context_id)
);
create index notification_recipients_context_idx on public.notification_recipients(context_id, notification_id);

alter table public.verification_cases enable row level security;
create policy verification_cases_related_read on public.verification_cases for select to authenticated
  using (applicant_context_id = private.current_context_id() or private.current_kind() = 'admin');
alter table public.verification_inspections enable row level security;
create policy verification_inspections_related_read on public.verification_inspections for select to authenticated
  using (officer_context_id = private.current_context_id() or private.current_kind() = 'admin');
alter table public.residence_change_requests enable row level security;
create policy residence_changes_related_read on public.residence_change_requests for select to authenticated
  using (manager_context_id = private.current_context_id() or private.current_kind() = 'admin');
alter table public.maintenance_issues enable row level security;
create policy maintenance_related_read on public.maintenance_issues for select to authenticated
  using (reporter_context_id = private.current_context_id() or private.can_manage_residence(residence_id)
    or exists (select 1 from public.staff_assignments s where s.id = assigned_staff_id and s.staff_context_id = private.current_context_id()));
alter table public.maintenance_events enable row level security;
create policy maintenance_events_related_read on public.maintenance_events for select to authenticated
  using (exists (select 1 from public.maintenance_issues i where i.id = issue_id));
alter table public.repair_reviews enable row level security;
create policy repair_reviews_related_read on public.repair_reviews for select to authenticated
  using (resident_context_id = private.current_context_id() or exists (select 1 from public.maintenance_issues i where i.id = issue_id));
alter table public.staff_reviews enable row level security;
create policy staff_reviews_related_read on public.staff_reviews for select to authenticated
  using (resident_context_id = private.current_context_id() or exists (
    select 1 from public.staff_assignments s where s.id = staff_assignment_id and
      (s.staff_context_id = private.current_context_id() or private.can_manage_residence(s.residence_id))));
alter table public.meetings enable row level security;
create policy meetings_related_read on public.meetings for select to authenticated
  using (requested_by_context_id = private.current_context_id() or manager_context_id = private.current_context_id()
    or staff_context_id = private.current_context_id() or private.current_kind() = 'admin');
alter table public.staff_bargains enable row level security;
create policy staff_bargains_related_read on public.staff_bargains for select to authenticated
  using (manager_context_id = private.current_context_id() or exists (
    select 1 from public.staff_assignments s where s.id = staff_assignment_id and s.staff_context_id = private.current_context_id()));
alter table public.seller_applications enable row level security;
create policy seller_applications_related_read on public.seller_applications for select to authenticated
  using (seller_context_id = private.current_context_id() or private.current_kind() = 'admin');
alter table public.stores enable row level security;
create policy stores_public_or_owner_read on public.stores for select to anon, authenticated
  using (private.store_is_public(id) or private.can_manage_store(id));
alter table public.listings enable row level security;
create policy listings_public_or_owner_read on public.listings for select to anon, authenticated
  using ((is_published and private.store_is_public(store_id)) or private.can_manage_store(store_id));
alter table public.listing_media enable row level security;
create policy listing_media_related_read on public.listing_media for select to anon, authenticated
  using (exists (select 1 from public.listings l where l.id = listing_id));
alter table public.listing_price_options enable row level security;
create policy listing_price_options_related_read on public.listing_price_options for select to anon, authenticated
  using (exists (select 1 from public.listings l where l.id = listing_id));
alter table public.payments enable row level security;
create policy payments_related_read on public.payments for select to authenticated
  using (actor_context_id = private.current_context_id() or private.current_kind() = 'admin');
alter table public.store_subscriptions enable row level security;
create policy subscriptions_related_read on public.store_subscriptions for select to authenticated
  using (private.can_manage_store(store_id));
alter table public.market_orders enable row level security;
create policy market_orders_related_read on public.market_orders for select to authenticated
  using (buyer_context_id = private.current_context_id() or private.can_manage_store(store_id));
alter table public.market_messages enable row level security;
create policy market_messages_related_read on public.market_messages for select to authenticated
  using (buyer_context_id = private.current_context_id() or private.can_manage_store(store_id));
alter table public.market_reviews enable row level security;
create policy market_reviews_public_read on public.market_reviews for select to anon, authenticated
  using (exists (select 1 from public.market_orders o where o.id = order_id and o.status = 'completed')
    and private.store_is_public(store_id));
alter table public.notifications enable row level security;
create policy notifications_recipient_read on public.notifications for select to authenticated
  using (exists (select 1 from public.notification_recipients r
    where r.notification_id = id and r.context_id = private.current_context_id()));
alter table public.notification_recipients enable row level security;
create policy notification_recipients_self_read on public.notification_recipients for select to authenticated
  using (context_id = private.current_context_id());

-- Browser roles have no direct writes to workflow tables. Server transactions enforce
-- relationship checks, state transitions, payment idempotency and inventory locks.
