# Operational wipe worker

Migration 67 adds the private durable request handoff for the migration-66 closure
core. Normal wipes retain verified logins, account/history records and Storage
bytes. This worker does not delete housing history or process image-cleanup tasks.

`npm run build:supabase` produces the separate Node binary
`dist-supabase-backend/system-wipe-worker.mjs`. Run from the project directory with
its server-only environment, verified PostgreSQL CA, private recovery archives/keys
and PostgreSQL 18 tools. Local recovery clusters require an unprivileged OS user.

```sh
npm run worker:system-wipe:supabase
npm run worker:system-wipe:supabase -- --watch
```

These commands only preview up to ten pending requests. They do not restore files,
change request state or close accounts. Continuous preview polls every 15 seconds.
SIGTERM/SIGINT stop new jobs, drain the accepted job and close connections.

Both API handoff and worker execution require the exact server-only setting
`PINEVELA_SYSTEM_WIPE_EXECUTION_REQUESTS=true`. Keep it disabled until genuine
acceptance and the reviewed release decision. No browser field or VITE variable
can enable it. With that separately reviewed gate open, an operator may explicitly
select execution using `npm run worker:system-wipe:supabase -- --watch --execute`.
Do not run that command as a live acceptance test.

The founder first completes the exact five-key review, paused-scope recovery and
fresh final consent. The UI then requires a separate own-key request and the text
`CLOSE REVIEWED OPERATIONAL PORTALS`. The API queues it atomically with administrator
notifications and audit; a queued response does not mean closure has completed.
Client paths, identities and effect lists are rejected.

The worker derives authority and archive UUIDs from the private immutable request
and saved recovery receipt, restores the database, authenticates/reconstructs the
actual encrypted Storage archive, then rechecks live consent and native scope in
the closure transaction. The request cannot extend its five-minute consent.
Per-request advisory locks prevent duplicate workers. Closure and request completion
commit together; a lost reply is reconciled from the completed receipt. Completed
or invalidated requests cannot be reused or edited. Failed file verification leaves
the request pending and closes no portal; private diagnostics explain the failure.

Stale consent is terminally invalidated with a notice/audit. It never silently
releases the durable scope pause. The founder can explicitly cancel preparation to
resume writes, or complete a newly reviewed consent/recovery cycle. Preview mode
does not perform these state changes.

Native verification uses isolated PostgreSQL and genuine archived Google Auth
subjects/sessions. Production-binary checks use real process signals and read-only
database state. They do not prove genuine provider/browser acceptance, enable the
release gate, authorize a live wipe or replace final database/Storage backups.
