# PineVela Database Model

## Database

Target database:

PostgreSQL through Supabase.

---

## Core Identity

```text
profiles
manager_profiles
staff_profiles
```

Supabase Auth owns authentication.

Application tables store application-specific identity and relationships.

---

## Housing Hierarchy

```text
hostels
    ↓
blocks
    ↓
floors
    ↓
rooms
    ↓
beds
```

---

## Hostel

A hostel/residence contains:

* identity
* location
* address
* facilities
* policies
* images
* managers
* fee structures

---

## Managers

A manager-hostel relationship determines which hostels a manager can manage.

Managers must not automatically gain access to every hostel.

---

## Staff

Staff belong to the appropriate hostel/manager context.

Staff creation must be restricted to authorized managers.

---

## Allocation

Conceptually:

```text
Resident
   ↓
Allocation
   ↓
Bed
   ↓
Room
   ↓
Floor
   ↓
Block
   ↓
Hostel
```

Constraints:

* resident: maximum one active allocation
* bed: maximum one active occupant

These rules should be enforced as strongly as practical at the database/application level.

---

## Applications

Applications represent a resident's housing application.

Applications must belong to the appropriate resident and housing context.

---

## Payments

Financial records should be auditable.

Payments should not simply overwrite historical financial state.

Payment records should preserve:

* amount
* currency
* payment method
* relevant references
* timestamps
* status
* associated user/application/charge

---

## Messaging

Only buyer-seller messaging remains active.

Do not create generic messaging tables for retired chat systems.

---

## Reviews

Resident-to-staff reviews are permitted only within the appropriate activated room/housing relationship.

Public staff review systems are not part of the target schema.

---

## Migration Principle

The legacy JSON database may be used as a migration/reference source.

Do not delete the JSON data until:

1. schema is verified
2. relationships are verified
3. data migration succeeds
4. critical workflows pass
5. authorization tests pass
6. rollback is possible

---

## Important

Do not invent database relationships merely because they appear convenient.

Before changing schema:

* inspect the existing application
* identify actual data relationships
* identify business invariants
* identify authorization boundaries
* identify legacy fields that contain implicit relationships
