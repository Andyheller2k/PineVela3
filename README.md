# PineVela

Housing management and buyer–seller marketplace built with React, Vite,
TypeScript, Express, Supabase Auth, PostgreSQL with RLS, and private Storage.
Supabase is the sole application persistence layer. JSON persistence is retired.

## Run locally

Use Node.js and install dependencies with npm install. Copy .env.example to a
private .env and fill it from the existing Supabase project configuration.
The database URL must use that project's Session pooler and its verified CA file.
Restore the matching private delivery-PIN encryption key when using existing data.
Never put server secrets in frontend environment variables.

Run npm run dev, then open http://127.0.0.1:3001.
For a production build, run npm run build followed by npm run start.
The dev:supabase, build:supabase and start:supabase names remain aliases.

Only apply missing, reviewed migrations with npm run db:migrate. Server startup
fails if the current schema or delivery-PIN key is missing. Configure Google,
confirmation email and redirect URLs in Supabase Auth; existing identities remain.

## Checks and recovery

Run npm run lint, npm test, npm run build and npm run check:private-data.
Native workflow/browser commands require explicit owned local stack metadata;
they never default to the configured hosted project. See
[isolated acceptance](docs/migrations/isolated-workflow-acceptance.md).

The owner classified the older JSON records as development data and authorized
archival. Private verified recovery artifacts are preserved separately; the
application never reads them. Database and Storage backups are separate. Restore
both and the matching private keys. See [database documentation](docs/database.md),
[security rules](docs/security.md) and [continuation](SUPABASE_CONTINUATION.md).
