/** Idempotent additive update for the existing PineVela project. */
import fs from 'node:fs';
import crypto from 'node:crypto';
const sha=(s:string)=>crypto.createHash('sha256').update(s).digest('hex');
const files=fs.readdirSync('supabase/migrations').filter(n=>/^\d{14}_[a-z0-9_]+\.sql$/.test(n)).sort();
const targets=files.filter(n=>['20261105150000','20261105160000'].includes(n.slice(0,14)));
if(targets.length!==2)throw Error('Review the migration inventory.');
const prerequisites=files.filter(n=>n.slice(0,14)<'20261105150000');
const expected=prerequisites.map(n=>`('${n.slice(0,14)}','${sha(fs.readFileSync('supabase/migrations/'+n,'utf8'))}')`).join(',\n');
const blocks=targets.map(file=>{const version=file.slice(0,14),sql=fs.readFileSync('supabase/migrations/'+file,'utf8'),digest=sha(sql);return `
 if exists(select 1 from private.schema_migrations where version='${version}') then
  if not exists(select 1 from private.schema_migrations where version='${version}' and digest='${digest}') then
   raise exception 'PineVela migration ${version} digest mismatch';
  end if;
 else
${sql}
  insert into private.schema_migrations(version,digest) values('${version}','${digest}');
 end if;`;}).join('\n');
const wrapper=`-- PineVela: resident room PIN, primary email login and catalogue photographs.
-- Existing project bivajljcdeofyxzmplxm. No account, password or image-byte rewrites.
begin;
set local lock_timeout='5s';
set local statement_timeout='45s';
select pg_advisory_xact_lock(hashtextextended('pinevela-schema-migrations',0));
do $pinevela_resident_media$
begin
 if exists(select 1 from(values ${expected}) expected(version,digest)
  left join private.schema_migrations applied using(version) where applied.digest is distinct from expected.digest) then
  raise exception 'Apply all matching PineVela prerequisites first';
 end if;
${blocks}
end;
$pinevela_resident_media$;
commit;
`;
fs.mkdirSync('releases/database',{recursive:true});
fs.writeFileSync('releases/database/pinevela-apply-resident-pin-media-20261105.sql',wrapper);
fs.writeFileSync('/tmp/pinevela-apply-resident-pin-media.sql',wrapper);
console.log(JSON.stringify({migrations:targets.length,prerequisites:prerequisites.length,sqlEditorSha256:sha(wrapper)}));
