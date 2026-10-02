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
