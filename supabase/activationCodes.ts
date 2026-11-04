import { randomInt } from 'node:crypto';
import type { PoolClient } from 'pg';
import { ApiError } from './db.js';

export const managerAuthorizationCode = () => String(randomInt(100000, 1000000));
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** The prefix comes from the saved housing structure, never an activation request. */
export function roomCodePrefix(prefix: string, blockName: string) {
  const saved = prefix.toUpperCase().replace(/[^A-Z0-9-]/g, '').replace(/^-+|-+$/g, '').slice(0, 12);
  return saved || blockName.normalize('NFKD').split(/[^A-Za-z0-9]+/).filter(Boolean)
    .map(word => word[0]).join('').toUpperCase().slice(0, 12) || 'PV';
}

export function roomActivationCode(prefix: string) {
  let suffix: string;
  do { suffix = Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join(''); }
  while (!/[A-Z]/.test(suffix) || !/[2-9]/.test(suffix));
  return `${prefix}-${suffix}`;
}

/** Caller authorizes housing access and holds the room/lifecycle locks. Unique
 * conflicts retry without aborting PostgreSQL's transaction or reusing old codes. */
export async function insertRoomActivationKeys(client: PoolClient, roomIds: string[], cycleId?: string | null) {
  if (!roomIds.length) return;
  const rooms = (await client.query(`select r.id,b.room_prefix,b.name as block_name,
    (select id from private.residence_room_key_cycles where residence_id=b.residence_id order by academic_year desc limit 1) as cycle_id
    from public.rooms r join public.floors f on f.id=r.floor_id join public.blocks b on b.id=f.block_id
    where r.id=any($1::uuid[]) order by r.id`, [roomIds])).rows;
  if (rooms.length !== new Set(roomIds).size) throw new ApiError(409, 'The room structure changed. Refresh before generating keys.');
  let pending = rooms;
  for (let attempt = 0; pending.length && attempt < 32; attempt++) {
    const inserted = (await client.query(`insert into private.room_activation_keys(room_id,code,cycle_id)
      select room_id,code,cycle_id from unnest($1::uuid[],$2::text[],$3::uuid[]) as k(room_id,code,cycle_id)
      on conflict (code) do nothing returning room_id`, [pending.map(room => room.id),
      pending.map(room => roomActivationCode(roomCodePrefix(room.room_prefix, room.block_name))),
      pending.map(room => cycleId === undefined ? room.cycle_id : cycleId)])).rows;
    const completed = new Set(inserted.map(row => row.room_id));
    pending = pending.filter(room => !completed.has(room.id));
  }
  if (pending.length) throw new ApiError(503, 'Room codes are busy. Please retry generating keys.');
}
