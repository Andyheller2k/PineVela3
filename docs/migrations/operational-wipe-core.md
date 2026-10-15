# Reviewed operational wipe core

Migration `20261014002629_reviewed_operational_wipe_core.sql` extends the retained
primary-wipe ledger to operational portals. It does not enable the HTTP wipe
endpoint, a CLI executor, the final migration reset, or JSON removal.
Migration 67 separately implements the gated durable handoff and built operator
worker; see [operation](../operations/system-wipe-worker.md). Its live gate stays off.

The founder needs the exact current five-key review, a paused scope, restored
post-pause database and Storage recovery evidence, a current own-key grant and
fresh final execution consent. The private native core derives its effects from
that review. Browser roles and `pinevela_backend` cannot call it or create receipts.
Client-supplied IDs, effect lists and copied recovery JSON are not authority.

One transaction closes the selected portals, properties and stores, releases
their own active allocations/employment, revokes manager and room grants, ends
subscriptions and cancels unfinished meetings, retention discussions and change
requests. Only selected application session bindings are deleted. Independent
administrator portals and bindings remain usable.

Unfinished repairs, inspections and seller applications receive a receipt-linked
withdrawal marker. Original reports, decisions, completion/signoff times and paid
intervals are preserved. New actions and uploads against withdrawn work are
rejected. Completed approvals, payment/fee/order/message/review/delivery history,
profiles, verified Auth identities, provider sessions and Storage bytes remain.
An own-manager closure request resolves through the exact same wipe receipt.

Every effect seals its before-row digest and immutable fields. Native before/after
guards admit only those changes in the executing transaction. Deferred checks
require completed effects, affected-account notices and audit, then complete the
scope pause, preparation and proposal atomically. A failed notice rolls back all
effects. Old consent cannot be replayed; an ambiguous commit must be reconciled
from its receipt, never automatically retried.

`db:verify-operational-wipe` covers resident-only, market, manager/staff and mixed
total closures in isolated PostgreSQL. It uses genuine archived Google subjects
and provider sessions, actual native zero-fee registration and activated-room
reviews, real encrypted dumps/restores and read-only downloads of existing Storage
objects. `db:verify-operational-officer-wipe` additionally exercises native keyed
officer invitation, dispatch and retained withdrawal. Archived sessions cannot
stand in for a fresh officer login; that guard remains enforced.

These native tests do not replace genuine provider/browser acceptance or the
reviewed final reset. Keep execution routes and JSON removal disabled until those
separate prerequisites pass. The read-only planner's operational blockers remain
conservative while the live execution workflow is gated.
