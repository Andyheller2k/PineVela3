-- Five-hour allowance replaces daily admission. Preserve the original daily
-- ledger unchanged; existing chat history, preferences and grants are untouched.
create table private.companion_usage_windows (
  bucket text not null check(bucket='global' or bucket ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  window_start timestamptz not null check(
    isfinite(window_start) and window_start=date_bin(interval '5 hours',window_start,timestamptz '1970-01-01 00:00:00+00')
  ),
  requests integer not null check(requests between 0 and 100000),
  tokens integer not null check(tokens>=0),
  primary key(bucket,window_start)
);
alter table private.companion_usage_windows enable row level security;
revoke all on private.companion_usage_windows from public,anon,authenticated,pinevela_catalog,pinevela_backend;
-- No client policies or RPC. Only a live, primary-account-authorized server
-- transaction can reserve or settle quota; profile switching cannot reset it.
