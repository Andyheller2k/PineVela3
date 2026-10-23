-- Private, bounded-lived admission state only. Never store passwords, OTPs,
-- session tokens, raw email addresses or IP addresses. No browser policies/RPCs.
create table private.auth_email_delivery_limits (
 bucket_key text primary key check(bucket_key~'^[a-f0-9]{64}$'),
 send_count integer not null check(send_count between 1 and 5),
 next_allowed_at timestamptz not null check(isfinite(next_allowed_at)),
 last_requested_at timestamptz not null check(isfinite(last_requested_at)),
 check(next_allowed_at>=last_requested_at)
);
create index auth_email_delivery_expiry on private.auth_email_delivery_limits(last_requested_at);
create table private.auth_login_attempts (
 bucket_key text primary key check(bucket_key~'^[a-f0-9]{64}$'),
 failures integer not null check(failures between 0 and 30),
 window_started_at timestamptz not null check(isfinite(window_started_at)),
 blocked_until timestamptz check(isfinite(blocked_until)),
 updated_at timestamptz not null check(isfinite(updated_at)),
 recent_failures timestamptz[] not null default '{}' check(cardinality(recent_failures)<=30)
);
create index auth_login_attempts_expiry on private.auth_login_attempts(updated_at);
alter table private.auth_email_delivery_limits enable row level security;
alter table private.auth_login_attempts enable row level security;
revoke all on private.auth_email_delivery_limits,private.auth_login_attempts from public,anon,authenticated,pinevela_backend,pinevela_catalog;
