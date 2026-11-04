# Pine Vela Premium public manager contact repair — 4 November 2026

The approved legacy registration for residence `44da2ff2-ed07-4708-a791-cf18138aa300` had no `manager_contact_name` in the property record or submitted registration. The operator supplied the exact public display name “PineVela Inc.” The private account profile was not used as a source.

The one-time script `scripts/repair-pine-vela-public-manager-contact-20261104.ts` checked the exact residence name and ID, approved residence and registration status, active manager assignment, absence of a pending property-change request, and a null current public name. It then updated only `manager_contact_name` and `updated_at` inside one transaction and inserted a private audit event with no falsely attributed account actor. The script is idempotent and refuses to overwrite any other non-null name.

Verification: the database record now has a public contact name; the live `/api/hostels` response returns `managerName: "PineVela Inc"`; the public residence card visibly shows “PineVela Inc” and no “Manager not provided” text. No schema or RLS policy changed.
