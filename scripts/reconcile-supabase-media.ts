/** Reconcile interrupted uploads through Storage's API. Never remove ready or
 * published media. Default is a read-only count; --execute handles stale work. */
import dotenv from 'dotenv';
import { SupabaseDatabase } from '../supabase/db.js';
import { SupabaseStorage } from '../supabase/storage.js';
dotenv.config({quiet:true});
if (process.argv.length > 3 || (process.argv[2] && process.argv[2] !== '--execute')) throw new Error('Only --execute is supported; otherwise this command is read-only.');
const execute = process.argv[2] === '--execute',db = new SupabaseDatabase(),storage = new SupabaseStorage();
let removed = 0,failed = 0;
try {
  if (!execute) {
    const count = (await db.pool.query("select count(*) as count from public.media_assets where state <> 'ready' and updated_at < now() - interval '15 minutes'")).rows[0].count;
    console.log(JSON.stringify({staleIncompleteUploads:Number(count),readOnly:true}));
  } else {
    const pending = await db.system(async client => (await client.query(`update public.media_assets set state = 'removing' where id in
      (select id from public.media_assets where state <> 'ready' and updated_at < now() - interval '15 minutes'
        order by updated_at limit 100 for update skip locked) returning id,object_path`)).rows);
    for (const asset of pending) {
      try {
        await storage.remove(asset.object_path);
        await db.system(async client => {await client.query("delete from public.media_assets where id = $1 and state = 'removing'",[asset.id]);});
        removed++;
      } catch {
        await db.system(async client => {await client.query("update public.media_assets set state = 'failed' where id = $1 and state = 'removing'",[asset.id]);});
        failed++;
      }
    }
    console.log(JSON.stringify({staleIncompleteUploads:pending.length,removed,failed,readyAssetsRemoved:0}));
  }
} finally {await db.close();}
