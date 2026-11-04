import dotenv from 'dotenv';
import { SupabaseDatabase } from '../supabase/db.js';

// One-time, owner-requested repair for an approved legacy registration that
// omitted its separate public contact name. Never derive this from the private
// manager profile or accept an HTTP/client-supplied identity here.
const residenceId = '44da2ff2-ed07-4708-a791-cf18138aa300';
const residenceName = 'Pine Vela Premium';
const publicContactName = 'PineVela Inc';
const apply = process.argv.slice(2).includes('--apply');
if (process.argv.slice(2).some(arg => arg !== '--apply')) throw new Error('Only --apply is supported.');

dotenv.config({ quiet: true });
const db = new SupabaseDatabase();
try {
  const result = await db.system(async client => {
    const residence = (await client.query(`select id,name,status,manager_contact_name
      from public.residences where id=$1 for update`, [residenceId])).rows[0];
    if (!residence || residence.name !== residenceName || residence.status !== 'approved')
      throw new Error('The exact approved residence was not found.');
    if (residence.manager_contact_name === publicContactName) return { state: 'already-set', residenceId };
    if (residence.manager_contact_name !== null)
      throw new Error('A public manager contact name already exists; no correction was made.');

    const registration = (await client.query(`select status from public.verification_cases
      where residence_id=$1 and kind='residence_registration'`, [residenceId])).rows[0];
    if (registration?.status !== 'approved') throw new Error('The registration is not approved.');
    const active = (await client.query(`select count(*)::integer as count from public.manager_assignments
      where residence_id=$1 and ended_at is null`, [residenceId])).rows[0].count;
    if (active < 1) throw new Error('No active assigned manager exists.');
    const pending = (await client.query(`select count(*)::integer as count from public.residence_change_requests
      where residence_id=$1 and status='pending'`, [residenceId])).rows[0].count;
    if (pending) throw new Error('A residence change request is already pending.');
    if (!apply) return { state: 'ready', residenceId, publicContactName };

    const updated = await client.query(`update public.residences
      set manager_contact_name=$2,updated_at=now()
      where id=$1 and manager_contact_name is null returning id`, [residenceId, publicContactName]);
    if (updated.rowCount !== 1) throw new Error('The contact name changed concurrently; no correction was made.');
    await client.query(`insert into private.audit_events
      (actor_context_id,event_type,resource_type,resource_id,event_data)
      values (null,'legacy_public_manager_contact_repaired','residence',$1,$2::jsonb)`,
      [residenceId, JSON.stringify({ before: null, after: publicContactName, reason: 'Owner-requested correction of an omitted legacy public contact name', requestedOn: '2026-11-04' })]);
    return { state: 'applied', residenceId, publicContactName };
  });
  console.log(JSON.stringify(result));
} finally {
  await db.pool.end();
}
