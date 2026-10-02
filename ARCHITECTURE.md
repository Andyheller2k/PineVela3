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

## Current Persistence Migration

The project may contain legacy JSON persistence during migration.

Legacy architecture:

```text
Express
 ↓
Repository
 ↓
JSON persistence
 ↓
pinevela_store.json
```

Target architecture:

```text
Express
 ↓
Repository / service layer
 ↓
Supabase
 ↓
PostgreSQL
```

During migration, preserve the legacy system as a rollback/reference source until the replacement is verified.

See:

`docs/migrations/`

---

## Architectural Principle

The system should have clear separation between:

1. Authentication
2. Authorization
3. Business logic
4. Persistence
5. Presentation

Security decisions must not depend on frontend behavior.
