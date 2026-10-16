# Residence worker operation

`npm run build:supabase` builds the web server and separate
`dist-supabase-backend/residence-worker.mjs`. The production worker uses Node and
runtime dependencies; it does not need `tsx`. Its bundle and source map are outside
the public frontend and explicitly denied by the web server.

Run from the project directory with its private `.env`, trusted PostgreSQL CA,
recovery archives/keys and PostgreSQL 18 tools available. Use an unprivileged OS
account: local recovery clusters cannot run as root. The required native schema
is migration 50. No schema migration is introduced by the runner.

Fresh recovery preparation after the keyed founder pause uses
`npm run db:prepare-residence-backup -- <proposal UUID>`. Its full PostgreSQL dump
has a 20-minute deadline, with 21 minutes allowed by the parent for each recovery
subprocess. Remote schema extraction performs many metadata round trips and can
exceed the earlier five-minute limit. These bounds preserve the full schema,
privileges, RLS policies and encrypted archive; they do not replace the matching
Storage byte backup or successful restore rehearsal required before execution.

```sh
npm run worker:supabase
npm run worker:supabase -- --watch
```

Both commands are read-only. The first previews one batch and exits; the second
polls every 15 seconds. Execution requires explicit `--execute`:

```sh
npm run worker:supabase -- --watch --execute
```

Each cycle handles at most ten saved keyed requests, then twenty eligible image
cleanup tasks. Current unexpired image leases are skipped so they cannot block
other eligible tasks at the front of a batch. The underlying native workers
recheck authority, scope, archives, provider identity and absence; polling never
supplies new authority. Errors are kept in private files and stdout exposes only
aggregate counts. Interrupted work reconciles durable receipts, without replaying
completed deletion. Provider failures remain failures rather than missing objects.

SIGTERM/SIGINT stop admission of new jobs, let the current job finish, and close
database connections. An idle wait is interruptible. Supervision must allow the
current archive verification or provider operation to drain before forced kill.

[The service definition](pinevela-residence-worker.service) uses this workstation's
actual user, working directory and Node binary. It starts continuous **preview**,
uses private temporary files and a 15-minute stop deadline. It is prepared and
validated, not installed or enabled. Deployment to another host must use that
host's actual paths and recovery files. Only after genuine authenticated/live
worker acceptance should an operator enable execution and the public request
gate; installing a preview service does not enable deletion.

`npm run db:verify-worker-build` checks the actual built binary, genuine database
state, default preview, real signals and restart without cloud mutations.
`db:verify-residence-execution` checks queued stop/preview/resume and real execution
using isolated restores with genuine saved identities and actual recovery files.
These checks do not replace positive provider-authenticated browser journeys or
live queued-object acceptance. JSON remains intact until all cutover gates pass.
