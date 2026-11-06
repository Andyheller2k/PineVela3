/** Repeatable SQL Editor wrapper, pinned to every prerequisite source digest. */
import fs from 'node:fs';
import crypto from 'node:crypto';
const target='20261105110000',file='supabase/migrations/'+target+'_device_push_delivery.sql';
const sql=fs.readFileSync(file,'utf8'),sha=(s:string)=>crypto.createHash('sha256').update(s).digest('hex');
const prerequisites=fs.readdirSync('supabase/migrations').filter(n=>/^\d{14}_[a-z0-9_]+\.sql$/.test(n)&&n.slice(0,14)<target).sort();
const values=prerequisites.map(n=>`('${n.slice(0,14)}','${sha(fs.readFileSync('supabase/migrations/'+n,'utf8'))}')`).join(',\n');
const wrapped=`-- PineVela device push. Existing project: bivajljcdeofyxzmplxm.
-- Additive private delivery tables only; no users are subscribed automatically.
begin;
set local lock_timeout='5s';
set local statement_timeout='45s';
select pg_advisory_xact_lock(hashtextextended('pinevela-schema-migrations',0));
do $pinevela_push_migration$
begin
 if exists(select 1 from(values ${values}) expected(version,digest)
   left join private.schema_migrations applied using(version)
   where applied.digest is distinct from expected.digest) then
   raise exception 'Apply all matching PineVela prerequisite migrations first';
 end if;
 if exists(select 1 from private.schema_migrations where version='${target}') then
   if not exists(select 1 from private.schema_migrations where version='${target}' and digest='${sha(sql)}') then
     raise exception 'PineVela push migration digest mismatch';
   end if;
 else
${sql}
 insert into private.schema_migrations(version,digest) values('${target}','${sha(sql)}');
 end if;
end;
$pinevela_push_migration$;
commit;
`;
fs.mkdirSync('releases/database',{recursive:true});
fs.writeFileSync('releases/database/pinevela-apply-device-push-20261105.sql',wrapped);
fs.writeFileSync('/tmp/pinevela-apply-device-push.sql',wrapped);
console.log(JSON.stringify({prerequisites:prerequisites.length,migrationSha256:sha(sql),sqlEditorSha256:sha(wrapped)}));
