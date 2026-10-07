# PineVela Authentication and Authorization

Manager password changes and self-deletion require that manager's authenticated account.
Primary accounts may view their linked registration status but cannot reset or delete the
manager identity through the registered-account endpoints. Self-deletion rejects ambiguous
same-email manager identities because the transitional purge still uses manager email.

## Authentication Provider

Google login/signup uses Supabase's Google provider with a server-owned, five-minute,
single-use PKCE flow and an HttpOnly SameSite=Lax callback cookie. Enable Google in
Supabase, configure its Google client credentials there, and allow
`https://YOUR_PUBLIC_ORIGIN/api/auth/google/callback**` as a Supabase redirect URL
(including the callback's state query). Set `PINEVELA_PUBLIC_ORIGIN` for deployed
environments. A blank value also supports testing the built app with
`NODE_ENV=production npm run start` on localhost: the fallback accepts only a
loopback Host and an actual loopback socket peer, never forwarded host headers.
Allow `http://localhost:3000/api/auth/google/callback**` in Supabase Redirect URLs
(and the equivalent `127.0.0.1` URL if using that address). A deployed site still
requires its configured HTTPS origin and matching Supabase redirect allowlist.
See [Supabase Google setup](https://supabase.com/docs/guides/auth/social-login/auth-google).

The server exchanges the code and reads the verified identity from Supabase `/user`.
It matches an existing primary account only by persisted Supabase ID and verified
email. Shared-email secondary accounts are never selected or implicitly linked.
Login cannot create a local account; Google signup creates only the primary `user`
role. Existing primary accounts created without a Supabase identity continue using
their credentials. Governed/legacy bans and maintenance remain enforced.
Google-only signups receive an unguessable local credential, and sign in through
Google. Provider tokens never reach the browser or the JSON store; the callback
issues the same existing PineVela session cookie used by password login.

Provider errors after consent are distinguished from a user denying access. An
`Unable to exchange external code` return is a Supabase-to-Google exchange failure;
check Supabase Auth logs and the Google provider's matching Web OAuth client ID/secret
and callback configuration. PineVela displays a provider failure, never a cancellation
for these errors. Callback query strings and error descriptions are excluded from
request logs; diagnostics contain only fixed failure categories.

Supabase Auth is the source of truth for authentication.

The application should not create a competing authentication authority.

---

## Identity

Authenticated users are represented through Supabase Auth.

Application-specific identity and profile information belongs in the application's profile system.

Conceptually:

```text
Supabase Auth User
        ↓
public.profiles
        ↓
Application role/profile
```

---

## Roles

Roles must not be trusted simply because they were supplied by the browser.

The server must obtain authoritative identity/authorization information from trusted sources.

---

## Authorization

Authentication answers:

> Who is this user?

Authorization answers:

> What is this user allowed to do?

These are separate concerns.

---

## Manager Authorization

Manager operations should follow:

```text
Authenticated session
        ↓
Manager profile
        ↓
Manager-hostel assignment
        ↓
Authorized operation
```

The client must not be able to select an arbitrary hostel and thereby gain access to it.

---

## Staff Creation

Only an authorized manager may create staff for their own authorized hostel.

The server must derive the manager identity from the authenticated session.

The server must verify the manager's hostel assignment.

The request body must not be the authority for manager identity or hostel authorization.

---

## Session Security

Sensitive operations must require a valid authenticated session.

Session revocation, expiration, and invalid sessions must be rejected.

### Current session bridge during migration

The existing JSON login paths now share expiring server sessions while full Supabase
Auth/database migration remains pending. A record stores only a SHA-256 token hash,
issuance time and absolute expiry. The default lifetime is one day; configure
`PINEVELA_SESSION_TTL_SECONDS` from 60 to 604800 seconds. Reads do not extend it.
Historical raw sessions without expiry require a fresh login. Account data and passwords
are preserved; password changes/recovery, room release and logout revoke sessions.

The browser uses `pv_auth_token`, an HttpOnly, SameSite=Strict cookie with Secure enabled
in production. Same-origin API requests use cookies and do not retain session tokens in
localStorage, sessionStorage or cached officer/user profiles. Reload resolves identity
through `/api/auth/me`, which never returns token material. Non-browser API clients may
still receive a raw token once at successful login; bearer and cookie authentication use
the same hash/expiry checks. Invalid explicit bearer credentials never fall back to cookies.

`POST /api/auth/logout` persists revocation of the presented session across all account
copies before clearing the cookie. It is idempotent and accepts no body-supplied identity
or token as authority. UI sign-out awaits confirmation and preserves the session screen
when the request fails. Cookie-authenticated writes require a same-origin browser signal;
set `PINEVELA_PUBLIC_ORIGIN` to the public HTTPS origin behind a production proxy.

Supabase migration must preserve expiry, explicit session revocation and profile/account
isolation, including immediate denial after logout. This local bridge does not replace
Supabase Auth or RLS in the target architecture.

---

## Security Principle

Never treat:

```text
frontend role
frontend userId
frontend hostelId
frontend managerId
```

as authoritative security information.
