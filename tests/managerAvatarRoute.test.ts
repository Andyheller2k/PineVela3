import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import express from 'express';
import { installProfiles } from '../supabase/profiles';

test('manager avatar API saves only the signed-in picture and rejects forged profile changes', async t => {
  const actor = { authUserId: '00000000-0000-4000-8000-000000000001',
    contextId: '00000000-0000-4000-8000-000000000002', kind: 'manager' };
  const profile = { id: actor.authUserId, email: 'manager@example.test',
    display_name: 'Manager', phone: '+233200000000', avatar_path: null, avatar_asset_id: null };
  let updates = 0;
  const client = { query: async (sql:string, values:unknown[] = []) => {
    if (sql.startsWith('select * from public.profiles')) {
      assert.equal(values[0], actor.authUserId);
      return { rows: [profile], rowCount: 1 };
    }
    if (sql.includes('select 1 from public.admin_memberships')) return { rows: [], rowCount: 0 };
    if (sql.startsWith('update public.profiles set')) {
      assert.equal(values[0], actor.authUserId);
      assert.match(sql, /avatar_path/);
      assert.doesNotMatch(sql, /display_name|phone=/);
      profile.avatar_path = values[1] as null;
      updates++;
      return { rows: [], rowCount: 1 };
    }
    if (sql.startsWith('insert into private.audit_events')) return { rows: [], rowCount: 1 };
    assert.fail(`Unexpected profile query: ${sql}`);
  } };
  const auth:any = {
    require: (kinds?:string[]) => (req:any,res:any,next:any) => {
      const kind = req.get('X-Test-Role') || 'manager';
      if (kinds && !kinds.includes(kind)) return res.status(403).json({ error:'Account role denied' });
      req.actor = { ...actor, kind };
      next();
    },
    db: { authorizedSystem: async (_actor:unknown,_kinds:unknown,run:(client:any)=>Promise<unknown>) => run(client) },
    projection: async () => ({ name:profile.display_name, phone:profile.phone, avatar:profile.avatar_path })
  };
  const app = express(); app.use(express.json()); installProfiles(app,auth);
  app.use((error:any,_req:any,res:any,_next:any) => res.status(error.status || 500).json({ error:error.message }));
  const server = app.listen(0,'127.0.0.1'); await once(server,'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/auth/profile/avatar`;
  const request = (body:unknown,headers:Record<string,string> = {}) => fetch(url,{method:'PUT',
    headers:{'Content-Type':'application/json','X-PineVela-Profile-Context':actor.contextId,...headers},body:JSON.stringify(body)});
  const good = await request({photo:'preset:pine-classic'});
  assert.equal(good.status,200); assert.equal((await good.json()).user.avatar,'preset:pine-classic'); assert.equal(updates,1);
  for (const body of [{photo:'preset:pine-rose',name:'Forged'},
    {photo:'preset:pine-rose',profileId:'00000000-0000-4000-8000-000000000003'}]) {
    const denied = await request(body); assert.equal(denied.status,400);
  }
  assert.equal((await request({photo:'preset:pine-rose'},{'X-PineVela-Profile-Context':'00000000-0000-4000-8000-000000000003'})).status,409);
  assert.equal((await request({photo:'preset:pine-rose'},{'X-Test-Role':'resident'})).status,403);
  assert.equal(updates,1);
});
