# PineVela Architecture

## Overview

PineVela is a housing-management SaaS platform.

The application consists of:

```text
React/Vite Frontend
        ↓
Express REST API
        ↓
Application / Repository Layer
        ↓
Supabase PostgreSQL
```

Supabase Auth provides authentication.

PostgreSQL and Row Level Security provide database-level isolation.

The backend uses Express for product data access. Reviewed catalog
and account projections live in the unexposed `private` schema. Public catalog
transactions use the non-login `pinevela_catalog` role, which can read only six
filtered projections and invoke four publication predicates. Authenticated account
reads use the existing session-bound `pinevela_backend` role. Browser roles have
no projection grants. Base-table permissions and RLS remain separate boundaries.

---

## Frontend

Primary technologies:

* React
* TypeScript
* Vite

The frontend is responsible for:

* UI
* client-side state
* navigation
* forms
* displaying API responses
* requesting authenticated operations

The frontend must not be treated as a trusted security boundary.

---

## Backend

Primary technologies:

* Node.js
* Express
* TypeScript

The backend is responsible for:

* API endpoints
* authentication/session validation
* authorization
* business rules
* validation
* database operations
* security-sensitive decisions

The server must derive authorization from the authenticated identity and server-side relationships.

---

## Authentication

Authentication is handled by Supabase Auth.

Conceptually:

```text
User
 ↓
Supabase Auth
 ↓
Authenticated session
 ↓
Backend authorization
 ↓
Database/RLS
```

See:

`docs/auth.md`

---

## Authorization

Authorization should be based on relationships rather than client-supplied IDs.

Example:

```text
Authenticated User
       ↓
Profile
       ↓
Manager Assignment
       ↓
Authorized Hostel
       ↓
Blocks / Floors / Rooms / Beds
```

A request containing:

```json
{
  "hostelId": "..."
}
```

does not prove that the authenticated user is authorized to operate on that hostel.

The server must verify the relationship.

---

## Housing Model

```text
Hostel
 ├── Blocks
 │    ├── Floors
 │    │    ├── Rooms
 │    │    │    └── Beds
```

Residents/students may receive allocations to beds.

Managers operate only on their assigned hostels.

Staff operate within their assigned hostel context.

---

## Messaging

Only buyer-seller messaging is part of the active product.

```text
Buyer
  ↕
Seller
```

Seller messages belong to the seller experience.

Retired messaging systems must not be reintroduced.

---

## Persistence and recovery

Supabase is the sole runtime datastore. Default `npm run dev`, `npm run build` and
`npm start` run the native Express/Supabase application and frontend. Supabase Auth,
server-derived account bindings, PostgreSQL transactions and RLS remain the security
boundaries. Private Storage and its owned-media registry replace local upload serving.

Forty legacy JSON/custom-session modules are removed. The owner authorized archiving
all legacy development data: 29 original data/upload files and the old build are in
private recovery storage with verified hashes. Seven existing hosted Auth subjects,
six profiles and ten contexts retained their exact UUID sets; no legacy account or
business record was imported. Recovery material is not a runtime dependency.

See [database](docs/database.md), [native retention](docs/migrations/native-account-retention.md)
and [isolated workflow acceptance](docs/migrations/isolated-workflow-acceptance.md).
The recorded automated scope does not claim every nested form, external provider
journey or physical inspection has passed human acceptance.

---

## Architectural Principle

The system should have clear separation between:

1. Authentication
2. Authorization
3. Business logic
4. Persistence
5. Presentation

Security decisions must not depend on frontend behavior.
