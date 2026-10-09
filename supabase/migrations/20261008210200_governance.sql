-- Active administrator governance, private settings and auditable decisions.
-- The founder is provisioned later by a private verified-identity operation.
create table public.admin_memberships (
  context_id uuid primary key references public.account_contexts(id) on delete cascade,
  slot smallint not null unique check (slot between 1 and 5),
  status text not null default 'active' check (status in ('active','suspended','removed')),
  joined_at timestamptz not null default now(),
  changed_at timestamptz not null default now()
);
create table private.admin_secrets (
  context_id uuid primary key references public.admin_memberships(context_id) on delete cascade,
  approval_key_hash text,
  settings_key_hash text,
  approval_enrolled_at timestamptz,
  settings_enrolled_at timestamptz,
  failed_attempts smallint not null default 0 check (failed_attempts between 0 and 5),
  locked_until timestamptz
);
alter table private.admin_secrets enable row level security;
revoke all on private.admin_secrets from anon, authenticated;

-- An administrator context is effective only while its membership is active.
create or replace function private.current_kind() returns text
language sql stable security definer set search_path = '' as $$
  select case when c.kind = 'admin' and not exists (
    select 1 from public.admin_memberships m where m.context_id = c.id and m.status = 'active'
  ) then null else c.kind end
  from public.account_contexts c where c.id = private.current_context_id();
$$;

create table private.admin_invitations (
  id uuid primary key default gen_random_uuid(),
  invited_email text not null,
  reserved_slot smallint not null check (reserved_slot between 2 and 5),
  invitation_digest text not null unique,
  created_by_context_id uuid not null references public.admin_memberships(context_id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  cancelled_at timestamptz,
  check (expires_at > created_at)
);
create unique index admin_invitations_open_slot_idx on private.admin_invitations(reserved_slot)
  where accepted_at is null and cancelled_at is null;
alter table private.admin_invitations enable row level security;
revoke all on private.admin_invitations from anon, authenticated;

create table public.admin_proposals (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('system_wipe','account_action','residence_deletion','pricing','administrator_removal','administrator_key_reset')),
  proposer_context_id uuid not null references public.admin_memberships(context_id),
  target_context_id uuid references public.account_contexts(id) on delete set null,
  target_residence_id uuid references public.residences(id) on delete set null,
  preview jsonb not null,
  baseline_digest text not null,
  reason text not null check (length(trim(reason)) > 0),
  status text not null default 'pending' check (status in ('pending','approved','rejected','invalidated','executed','expired')),
  quorum smallint not null check (quorum between 2 and 5),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  decided_at timestamptz,
  executed_at timestamptz,
  executed_by_context_id uuid references public.admin_memberships(context_id),
  check (expires_at > created_at)
);
create table public.admin_votes (
  proposal_id uuid not null references public.admin_proposals(id) on delete cascade,
  administrator_context_id uuid not null references public.admin_memberships(context_id),
  decision text not null check (decision in ('approved','rejected')),
  decided_at timestamptz not null default now(),
  primary key(proposal_id, administrator_context_id)
);
create table public.registration_bans (
  id uuid primary key default gen_random_uuid(),
  account_context_id uuid not null references public.account_contexts(id) on delete cascade,
  kind text not null check (kind in ('manager_account','residence','seller_account')),
  until_at timestamptz not null,
  reason text not null,
  imposed_by_context_id uuid not null references public.admin_memberships(context_id),
  proposal_id uuid references public.admin_proposals(id),
  created_at timestamptz not null default now()
);
create table private.manager_operation_keys (
  manager_context_id uuid primary key references public.account_contexts(id) on delete cascade,
  key_hash text,
  issued_at timestamptz,
  failed_attempts smallint not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz
);
create table private.platform_settings (
  key text primary key,
  value jsonb not null,
  updated_by_context_id uuid references public.admin_memberships(context_id),
  updated_at timestamptz not null default now()
);
create table private.manager_settings (
  manager_context_id uuid primary key references public.account_contexts(id) on delete cascade,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
create table private.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_context_id uuid references public.account_contexts(id),
  event_type text not null,
  resource_type text,
  resource_id uuid,
  event_data jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
alter table private.manager_operation_keys enable row level security;
alter table private.platform_settings enable row level security;
alter table private.manager_settings enable row level security;
alter table private.audit_events enable row level security;
revoke all on private.manager_operation_keys, private.platform_settings, private.manager_settings, private.audit_events from anon, authenticated;

alter table public.admin_memberships enable row level security;
create policy admin_memberships_roster_read on public.admin_memberships for select to authenticated
  using (private.current_kind() = 'admin');
alter table public.admin_proposals enable row level security;
create policy admin_proposals_roster_read on public.admin_proposals for select to authenticated
  using (private.current_kind() = 'admin');
alter table public.admin_votes enable row level security;
create policy admin_votes_roster_read on public.admin_votes for select to authenticated
  using (private.current_kind() = 'admin');
alter table public.registration_bans enable row level security;
create policy registration_bans_owner_or_admin_read on public.registration_bans for select to authenticated
  using (account_context_id = private.current_context_id() or private.current_kind() = 'admin');

-- The server verifies each private key, distinct voter, immutable preview, current
-- membership, applicable quorum, and administrator #1 final action in one transaction.
