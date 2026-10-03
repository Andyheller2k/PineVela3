# S21 remediation — 2026-10-02

## Session policy

`sessionSecurity.ts` centralizes random token issuance, SHA-256 hash comparison, absolute
expiry, cookie handling and revocation. Persistent account records store only the hash,
issuance time and expiry under `session`. The default lifetime is 24 hours; configuration
accepts 60–604800 seconds. Every lookup checks expiry, including officer assignment checks,
legacy list filters and account-creation middleware. Reads never extend the lifetime.
New logins rotate the account's previous session. Missing/malformed/future/expired metadata
and supplied hash values fail closed.

General login, seller login, officer login, verified signup and room activation use the
same policy. Creating/bootstraping an account does not issue an undisclosed session.
Historical raw bearer fields are revoked on load rather than converted into new sessions;
raw token aliases are also removed before every write. Existing accounts, passwords,
housing allocations, purchases and JSON data remain intact. Fresh login is required for
previous indefinite sessions.

## Browser authentication and logout

The browser uses an HttpOnly, SameSite=Strict cookie, Secure in production, with a matching
maximum age. A shared fetch boundary sends same-origin cookie requests and prevents old
JavaScript bearer headers from selecting a stale account. Browser login responses contain
no token; `/api/auth/me` never returns token material for either transport. Legacy token and
officer/user credential caches are cleared from localStorage and sessionStorage. Avatar
preferences remain supported. Cookie-authenticated mutation requests enforce same origin;
explicit invalid bearer credentials cannot fall back to an unrelated cookie session.

`POST /api/auth/logout` revokes the presented hash from memory and persistence, including
duplicate user/officer/merchant records, then clears the cookie. Revocation is idempotent,
also works for expired/pending sessions and ignores body-supplied account/token targets.
An unrelated account's session remains valid. Password changes/recovery and room release
continue to revoke their respective account access using the new representation.

All sign-out controls await server confirmation before navigating. A failed request leaves
the user informed and allows retry. Successful logout clears the current identity/query
cache and signals other tabs; server 401 responses clear expired browser identity. Officer
profiles restore only through the authenticated context rather than cached role claims.
Room activation from the login flow explicitly switches cookies; activation within the
primary dashboard preserves its existing primary-account context.

## Verification

- Complete security suite: 60 tests passed, zero failures.
- Focused S21 tests cover live expiry without restarting, non-sliding lifetime, legacy/raw
  rejection, hash-as-token rejection, login rotation, general/manager/admin/seller/officer
  sessions, cookie flags, token-free profile responses, server logout, foreign-origin denial,
  unrelated-session preservation and revocation/valid-session behavior after restart.
- Existing signup, room allocation/release, staff/account isolation, maintenance and
  marketplace regression coverage passed with hashed temporary fixture sessions.
- Final focused S21 rerun: 3 tests passed. Cookie and bearer requests returned the same
  authorized manager records, excluded another manager's records, and ignored a forged
  registered-account selector. The production browser check passed real login, reload,
  logout/replay rejection, and layout at 375, 768 and 1440 pixels with no runtime errors.
- TypeScript check, production build, and private-data check passed. The full 60-test suite
  ran before the last cookie parity adaptation; that adaptation passed the focused rerun.

All API/browser checks use disposable temporary databases and generated test credentials;
operational credentials and accounts are not used. Test fixtures are not application data.

## Deployment and migration

Set `PINEVELA_PUBLIC_ORIGIN` to the actual public HTTPS origin when deploying behind a proxy.
Use HTTPS in production; Secure cookies are enforced there. The current single-process
JSON backend remains the transitional persistence layer. Supabase migration must retain
explicit expiry, logout revocation and account/RLS boundaries; this change does not perform
that migration or assert that unreviewed production infrastructure is verified.

No commit, push or deployment was performed. Original audit evidence remains historical.
