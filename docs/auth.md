# PineVela Authentication and Authorization

## Authentication Provider

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
