# Street and map residence identity

The latest user instruction retires GhanaPost entirely, superseding the earlier
request to restore its field. Manager registration, inspection details, residence
setup, public details, shared types, validators and both persistence adapters no
longer collect, validate, display or return the retired address field.

Migration 68, `20261014131638_remove_ghanapost_address.sql`, removes the unused
`public.residences.digital_address` column with RESTRICT. Historical migration files,
dossier JSON, JSON persistence and encrypted backups are preserved. Retired input
aliases are filtered from saved drafts and rejected by the full residence parser.
No RLS/grant, account ownership, geographic or physical approval rule was relaxed.
Full residence setup must still match the inspected property name and exact map pin.
Map dispatch uses saved coordinates, falling back to the saved street address.

The live pre-change impact was zero residences and zero stored address values.
Encrypted pre-change archive `e216fb51-25e4-410c-be6b-e459b7a91ef0` passed an actual
isolated restore, including private PIN recovery and RLS/grants. A lock timeout on
the initial dry run rolled back; after the preview drained, dry run and application
both passed. Migration SHA-256:
`7310f7e173bc3d114027e37c8c03832c522757b86fc36f892b3fc1a68e7a03c2`.
Post-change encrypted archive `a9319d64-ecdb-4369-a60d-63b7e18ba479` (1525193 bytes)
also passed an actual isolated restore with all 68 versions, PIN recovery and
RLS/grants. Both archives are continuation checkpoints, not final cutover backups.

The new isolated manager/residence verifier passed 70 assertions through all 68
migrations. The user explicitly authorized Pine Premium Hills / KNUST Main Library
as fictional development data. Those records and simulated inspection evidence
existed only in a disposable Unix-socket database. The requested primary Google
identity was present in the genuine archive; Auth users, identities and provider
sessions remained byte exact. Cases include pending-portal denial, foreign ownership,
inspection/approval gates, idempotency, primary notification delivery, full residence
layouts and review, and publication/media gates. Native advisors found zero issues.
The existing manager re-enrollment regression passed another 47 native assertions
after the parser change, without Auth changes, cloud writes or mocked provider replies.

No work mailbox was invented, no email was delivered, no provider reply was mocked,
and no fictional property was inserted into live Supabase. Genuine work-email
verification and the positive manager browser journey remain pending. The existing
work-domain rule remains enforced. Private evidence:
`manager-residence-setup-native.json`, `manager-residence-setup-advisors.json`,
and `address-retirement-live.json` under `.security/migration-reset/`.
