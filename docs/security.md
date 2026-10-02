# PineVela Security

## Security Boundary

The browser is untrusted.

Never assume that:

* a hidden button prevents access
* a disabled form prevents access
* a client-provided role is correct
* a client-provided user ID is correct
* a client-provided hostel ID is authorized

All sensitive operations require server-side authorization.

---

## Authentication

Authentication establishes identity.

Authentication does not automatically establish authorization.

After authentication, the server must determine what the authenticated user is permitted to access.

---

## Authorization

Authorization should use server-side relationships.

Example:

```text
session user
    ↓
profile
    ↓
manager assignment
    ↓
hostel
```

Do not trust:

```text
request.body.managerId
request.body.hostelId
request.body.userId
```

as authorization evidence.

---

## IDOR / BOLA

Every endpoint accepting an object identifier must verify that the authenticated user is authorized to access that specific object.

Example:

```text
GET /api/hostels/:hostelId
```

must not simply check:

```text
user is authenticated
```

It must determine whether that user is authorized to access the specified hostel.

---

## Privilege Escalation

Prevent users from changing their own:

* role
* ownership
* manager assignment
* hostel assignment
* staff assignment
* payment ownership
* allocation ownership

through client-controlled fields.

---

## Cross-Hostel Isolation

A manager assigned to Hostel A must not be able to:

* read Hostel B's private management data
* create staff for Hostel B
* modify Hostel B's rooms
* modify Hostel B's allocations
* access Hostel B's private records

---

## Database Security

Supabase Row Level Security should enforce appropriate data boundaries.

Do not disable RLS simply because an application query is inconvenient.

If privileged server-side access is necessary, document why and ensure the server performs the required authorization checks first.

---

## Sensitive Credentials

Never commit:

* service-role keys
* API keys
* SMTP credentials
* payment secrets
* private signing keys
* production passwords

Use environment variables or the appropriate secret-management mechanism.

---

## Security Testing

Security-sensitive endpoints should test:

1. Unauthenticated access
2. Authenticated unauthorized user
3. Authorized user
4. Cross-user access
5. Cross-hostel access
6. Identifier spoofing
7. Role manipulation
8. Ownership manipulation

Passing the UI flow is not sufficient evidence of authorization correctness.
