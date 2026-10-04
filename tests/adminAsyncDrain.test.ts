import assert from 'node:assert/strict';
import { test } from 'node:test';
import { guardAsyncRoutes } from '../resourceSecurity.js';

test('Wipe drain tracks unfinished async handlers independently of response close/timeout', async () => {
  const handlers: any[] = [], app: any = { locals: {} };
  for (const method of ['use', 'get', 'post', 'put', 'patch', 'delete', 'all']) app[method] = (...args: any[]) => handlers.push(args.at(-1));
  guardAsyncRoutes(app);
  let finish!: () => void, changed = false;
  const suspended = new Promise<void>(resolve => finish = resolve);
  app.post('/isolated-delayed-write', async (_req: any, _res: any) => { await suspended; changed = true; });
  const response = { destroyed: true, headersSent: true }; // Client already disconnected.
  handlers[0]({}, response, (error: any) => { throw error; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.locals.activeAsyncHandlers, 1, 'Execution remains blocked until handler finishes');
  assert.equal(changed, false); finish(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(changed, true); assert.equal(app.locals.activeAsyncHandlers, 0);
  let forwarded: any;
  app.post('/isolated-failure', async () => { throw new Error('Isolated handler failure'); });
  handlers[1]({}, {}, (error: any) => forwarded = error);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(forwarded.message, 'Isolated handler failure'); assert.equal(app.locals.activeAsyncHandlers, 0);
});
