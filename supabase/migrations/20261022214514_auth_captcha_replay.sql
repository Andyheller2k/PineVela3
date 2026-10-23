-- Server-only, short-lived fingerprints. No raw CAPTCHA tokens, credentials,
-- account identifiers or IP addresses. No browser policies or callable RPCs.
create table private.auth_captcha_proofs (
 proof_hash text primary key check(proof_hash~'^[a-f0-9]{64}$'),
 claimed_at timestamptz not null default now() check(isfinite(claimed_at)),
 expires_at timestamptz not null default(now()+interval '10 minutes') check(isfinite(expires_at)),
 check(expires_at=claimed_at+interval '10 minutes')
);
create index auth_captcha_proof_expiry on private.auth_captcha_proofs(expires_at);
alter table private.auth_captcha_proofs enable row level security;
revoke all on private.auth_captcha_proofs from public,anon,authenticated,pinevela_backend,pinevela_catalog;
