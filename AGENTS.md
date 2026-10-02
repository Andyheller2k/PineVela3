# PineVela — Agent Instructions

## Project

PineVela is a housing-management SaaS platform.

The long-term product supports:

* Students/residents
* Hostel/housing managers
* Hostel/housing staff
* Sellers
* Administrators

The product is intended to support hostels, hotels, and other housing-management use cases.

---

## Core Architecture

Frontend:

* React
* Vite
* TypeScript

Backend:

* Express
* TypeScript

Database:

* Supabase
* PostgreSQL

Authentication:

* Supabase Auth

Authorization:

* Server-side authorization is mandatory.
* Never trust client-supplied identity or ownership fields.
* RLS must remain part of the security boundary.

See:

* `ARCHITECTURE.md`
* `docs/database.md`
* `docs/auth.md`
* `docs/security.md`
* `docs/product-rules.md`

---

## Security Rules

Treat all client input as untrusted.

Never use client-supplied values such as:

* userId
* profileId
* managerId
* hostelId
* sellerId
* staffId
* roomId
* bedId

as proof of authorization.

Authorization must be derived from the authenticated session and server-side relationships.

Prevent:

* IDOR/BOLA
* privilege escalation
* cross-hostel access
* unauthorized data modification
* unauthorized account creation
* ownership spoofing

Never expose:

* Supabase service-role keys
* API secrets
* private credentials
* server-only environment variables

Do not weaken RLS simply to make a feature work.

---

## Housing Hierarchy

The core housing hierarchy is:

Hostel
→ Block
→ Floor
→ Room
→ Bed

Core allocation rules:

* A student/resident may have at most one active allocation.
* A bed may have at most one active occupant.
* Managers may only manage hostels to which they are assigned.
* Staff belong to and are managed within their manager's authorized hostel.

---

## Staff Rules

Staff creation is not public.

Only an authorized manager may create staff accounts for their own assigned hostel.

Do not reintroduce:

* public staff hiring
* manager job openings
* public staff recruitment
* general staff creation by arbitrary users

Staff authorization must be enforced server-side.

---

## Messaging Rules

The only supported messaging system is:

Buyer ↔ Seller

Seller messaging belongs to the seller experience/account.

Remove and do not reintroduce:

* Manager ↔ Resident chat
* Manager ↔ Staff chat
* Room DMs
* Public/general chat
* Generic chat systems

Do not hide retired chat functionality in the UI while leaving its backend routes or data model active.

---

## Reviews

Supported:

Resident → Staff reviews within an activated room/housing relationship.

Do not reintroduce:

* public staff reviews
* public staff ratings
* unrestricted staff reviews

Maintenance reporting and resident repair ratings are separate features and should be preserved when active.

---

## Development Rules

For non-trivial changes:

1. Inspect the existing implementation.
2. Identify all affected layers.
3. Explain the current behavior.
4. Produce a concise implementation plan.
5. Implement the change.
6. Run relevant tests/checks.
7. Search for residual references.
8. Review the final diff.
9. Report what changed and what was verified.

Do not claim a feature is fixed or removed without verification.

---

## Scope Discipline

Do not modify unrelated functionality.

When removing a feature, search the entire repository for:

* routes
* controllers
* services
* database tables
* migrations
* RLS policies
* types
* hooks
* contexts
* components
* navigation
* notifications
* tests
* seed/demo data
* feature flags
* documentation

Remove obsolete functionality completely rather than merely hiding it from the UI.

---

## Database Migration

The JSON persistence layer may exist during the migration period.

Do not delete or destroy the existing JSON persistence/data until the Supabase implementation has been verified.

When migrating functionality to Supabase:

* preserve business rules
* preserve relationships
* preserve authorization behavior
* preserve important data
* explicitly identify behavior that cannot be represented directly in PostgreSQL

See `docs/migrations/`.

---

## Verification

Before considering a security-sensitive task complete, test both:

### Positive cases

Authorized user can perform the intended action.

### Negative cases

Unauthorized users cannot:

* access the resource
* modify the resource
* impersonate another user
* change ownership
* cross hostel boundaries
* bypass role restrictions

When appropriate, test direct HTTP/API access rather than relying only on the UI.

---

## Documentation

Keep documentation concise and current.

If an architectural or security rule changes, update the relevant documentation.

Do not turn `AGENTS.md` into a complete technical manual. Put detailed information in `ARCHITECTURE.md` or `docs/`.
