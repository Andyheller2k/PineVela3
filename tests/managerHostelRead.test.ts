import assert from 'node:assert/strict';
import test from 'node:test';
import { installHousing } from '../supabase/housing';

const actor = { authUserId: 'signed-in-user', sessionId: 'live-session', contextId: 'assigned-manager', kind: 'manager' };
const home = { id: 'assigned-residence', name: 'Pine Vela Premium', setup_submitted_at: '2026-11-03', operational: true };

function routeHarness(visible: boolean, assigned: boolean) {
  let handler: any;
  let authorizedReads = 0;
  const app = { get(path: string, ...handlers: any[]) {
    if (path === '/api/manager/my-hostel') handler = handlers.at(-1);
  }, post() {} };
  const db = {
    readActor: async (verified: unknown, work: (client: any) => Promise<any>) => {
      assert.equal(verified, actor);
      return work({ query: async () => ({ rows: visible ? [home] : [] }) });
    },
    authorizedRead: async (verified: unknown, roles: string[], work: (client: any) => Promise<any>) => {
      authorizedReads++;
      assert.equal(verified, actor);
      assert.deepEqual(roles, ['manager']);
      return work({ query: async (sql: string, params: unknown[]) => {
        if (sql.includes('select h.id,h.status')) {
          assert.deepEqual(params, [home.id, 'manager', actor.contextId]);
          return { rows: assigned ? [{ id: home.id, status: 'approved' }] : [] };
        }
        assert.equal(params[0], home.id);
        return { rows: [{ id: 'block-1', name: 'Main', floors: 1,
          roomTypes: [{ typeName: '2 in 1 Room', totalRooms: 2, bedsPerRoom: 2 }] }] };
      } });
    },
  };
  installHousing(app as any, { db, require: () => (_req: unknown, _res: unknown, next: () => void) => next() } as any);
  const invoke = () => new Promise<{ body?: any; error?: any }>(resolve => {
    handler({ actor }, { json: (body: any) => { resolve({ body }); return body; } },
      (error: any) => resolve({ error }));
  });
  return { invoke, authorizedReads: () => authorizedReads };
}

test('manager property read keeps RLS ownership lookup and returns authorized room summary', async () => {
  const route = routeHarness(true, true);
  const result = await route.invoke();
  assert.equal(result.body?.hostel.id, home.id);
  assert.equal(result.body?.hostel.totalRooms, 2);
  assert.equal(result.body?.hostel.totalCapacity, 4);
  assert.equal(route.authorizedReads(), 1);
});

test('manager property read never summarizes a residence hidden by RLS', async () => {
  const route = routeHarness(false, true);
  assert.equal((await route.invoke()).body?.hostel, null);
  assert.equal(route.authorizedReads(), 0);
});

test('manager property read denies a changed or foreign assignment before returning structure', async () => {
  const route = routeHarness(true, false);
  const result = await route.invoke();
  assert.equal(result.body, undefined);
  assert.equal(result.error?.status, 404);
});
