-- Property identity uses its saved street address and verified map pin.
-- Keep historical dossier JSON and immutable migration/backup history intact.
-- RESTRICT is intentional: an unexpected dependency must fail the migration.
select pg_advisory_xact_lock(hashtextextended('residence-deletion-freeze',0));
alter table public.residences drop column digital_address restrict;
