# PineVela Authentication and Authorization

## Migration status (2026-10-09)

The running `server.ts` still uses transitional local credentials and sessions.
The separate `supabase-server.ts` backend implements Supabase password/Google login,
confirmed signup, HttpOnly access/refresh cookies, session refresh/revocation and
subject-bound account selection. It is not yet the default backend. Resident,
manager and seller accounts retain verified student/work identities linked to the
primary owner through authorized enrollment. Resident and seller may share the same
student identity with one Supabase password and distinct portal access PINs; managers
use their separate verified work email. The replacement enrollment API and room claim
transactions exist; enrollment forms and complete authenticated flows remain to be verified.
Primary-user sign-in must never select a child's account without that account's own
verified Auth session. The legacy-provider description below documents the running
transition implementation, not the final target. See [migration status](migrations/supabase-implementation-status.md).

In the replacement backend, an active administrator enrolls a separate settings key
within five minutes of an actual Google or verified-email sign-in. A refresh token does
not create a fresh enrollment window, and no local password is required for Google-only
accounts. The key is displayed once and its salted, context-bound hash stays private.
Public signup never grants administrator membership. Lost-key governance recovery and
an actual fresh administrator enrollment remain migration acceptance gates.

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

In the Supabase replacement, staff enrollment starts from the assigned manager portal
and requires the current manager operation key and approved residence setup. The manager
receives a private invitation link; only its SHA-256 digest is stored. Links expire after
24 hours and can be renewed or cancelled by the initiating assigned manager. Renewing
revokes the previous link. No staff credentials or verified flags come from the manager.

Staff choose their own password through the invitation page. The Auth signup trigger
accepts only the saved invitation nonce, mailbox and still-authorized manager relationship.
The account stays pending until a live provider-verified session proves the invited subject
and confirmed work email. Confirmation does not switch the manager's cookie; staff sign
in separately. Email confirmation must remain enabled. See [Supabase signup behavior](https://supabase.com/docs/reference/javascript/auth-signup).

Existing registered addresses cannot be adopted through email equality. Rehiring an
existing closed staff identity and verified email changes remain explicit migration gates.
Self-profile edits currently allow display name and phone only. Suspension, removal and
resignation revoke staff portal bindings. Ended employment is retained with maintenance
history; restoration after suspension requires a fresh verified sign-in.


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

Public catalog handoff: guest room activation and market orders carry an allowlisted
`next` selection through password login, verified signup, and the server-held Google
PKCE flow. Only `/user/dashboard` with a single residence, market item or store selection
is accepted; external redirects, secondary roles, and identity fields are rejected.
The authenticated dashboard reloads the actual catalog and opens the existing form.
Selecting a residence never claims a room: room-key authorization remains server-side.
Ordinary login keeps the existing default destination for the authenticated role.

Staff retention submission/final choices use the actual active staff portal. Manager
responses require its saved proposal recipient, current residence grant and operation
key. A final resignation closes employment and invalidates staff portal bindings; the
frontend signs out. Resident staff reviews require the resident portal’s current room
allocation, regardless of shared primary email or identity in another portal.

Meeting appointments belong to the saved assigned manager and exact internal housing
participant. Manager writes require a current residence grant and operation key;
participants may request for themselves or cancel their own appointment. Primary
portals, shared-email portals and uninvited staff gain no access. External contact
emails never create or select a portal identity. Suspended staff and released residents
lose access to their old appointment history through the housing portal.

Seller application submission uses a completed email-verification enrollment owned by
the primary session. Name and student email come from its confirmed Auth subject.
The application API rejects submitted passwords, owner IDs and identity aliases. Admin
review activates only the saved seller portal; store setup and verified payment remain
separate. Same-email resident/seller identities retain their separate portal PINs.
