/** Real local HTTP deadlines, cancellation and malformed/unavailable transport.
 * No accounts, tokens, business records or successful API replies are invented;
 * successful native directory projections are covered by the workflow browser. */
import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import net from 'node:net';
import { test } from 'node:test';
import { readAdministratorDirectories } from '../src/lib/adminDirectories.js';

async function transport(
  handler: http.RequestListener,
  run: (origin: string) => Promise<void>,
): Promise<void> {
  const server = http.createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address === 'object');
  try { await run(`http://127.0.0.1:${address.port}`); }
  finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

test('the directory deadline cancels an actual stalled HTTP connection with readable feedback', { timeout: 5000 }, async () => {
  let accepted = 0, disconnected!: () => void;
  const closed = new Promise<void>(resolve => { disconnected = resolve; });
  await transport((_request, response) => {
    accepted++;
    response.once('close', disconnected);
  }, async origin => {
    await assert.rejects(readAdministratorDirectories(new AbortController().signal,
      signal => fetch(origin, { signal }), 500), error => {
      assert(error instanceof Error);
      assert.equal(error.message, 'Administrator directories took too long to load. Please retry.');
      assert.notEqual(error.name, 'AbortError');
      return true;
    });
    assert.equal(accepted, 1, 'One stalled bulk read does not fan out into eight directory requests');
    await closed;
  });
});

test('the same deadline covers an actual response body after headers arrive', { timeout: 5000 }, async () => {
  let disconnected!: () => void;
  const closed = new Promise<void>(resolve => { disconnected = resolve; });
  await transport((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.write('{');
    response.once('close', disconnected);
  }, async origin => {
    await assert.rejects(readAdministratorDirectories(new AbortController().signal,
      signal => fetch(origin, { signal }), 500), /Administrator directories took too long to load\. Please retry\./);
    await closed;
  });
});

test('an account/query abort retains its exact cancellation reason and closes its pending body', { timeout: 5000 }, async () => {
  const owner = new AbortController();
  let opened!: () => void, disconnected!: () => void;
  const accepted = new Promise<void>(resolve => { opened = resolve; });
  const closed = new Promise<void>(resolve => { disconnected = resolve; });
  await transport((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.write('{');
    response.once('close', disconnected);
    opened();
  }, async origin => {
    const pending = readAdministratorDirectories(owner.signal, signal => fetch(origin, { signal }), 2000);
    await accepted;
    const reason = new DOMException('The administrator account changed.', 'AbortError');
    owner.abort(reason);
    await assert.rejects(pending, error => error === reason);
    await closed;
  });
});

test('already-cancelled account reads never dispatch a network request', async () => {
  const owner = new AbortController(), reason = new DOMException('Query superseded.', 'AbortError');
  let called = false;
  owner.abort(reason);
  await assert.rejects(readAdministratorDirectories(owner.signal, () => {
    called = true;
    throw new Error('A superseded query must not request a directory.');
  }), error => error === reason);
  assert.equal(called, false);
});

test('actual non-success statuses retain safe session, ownership and availability feedback', async () => {
  await transport((request, response) => {
    response.writeHead(Number(request.url!.slice(1)));
    response.end();
  }, async origin => {
    for (const [status, message] of [
      [401, 'Your administrator session ended. Sign in again to load the directories.'],
      [403, 'This account cannot access administrator directories.'],
      [409, 'Your account context changed. Refresh the page to reload administrator directories.'],
      [429, 'Administrator directories are receiving too many requests. Please retry shortly.'],
      [503, 'Administrator directory service is temporarily unavailable. Please retry.'],
    ] as const) {
      await assert.rejects(readAdministratorDirectories(new AbortController().signal,
        signal => fetch(`${origin}/${status}`, { signal })), error => {
        assert(error instanceof Error);
        assert.equal(error.message, message);
        return true;
      });
    }
  });
});

test('malformed and missing directory bodies cannot masquerade as empty directories', async () => {
  await transport((request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(request.url === '/incomplete' ? 'null' : '{');
  }, async origin => {
    await assert.rejects(readAdministratorDirectories(new AbortController().signal,
      signal => fetch(`${origin}/incomplete`, { signal })), /Administrator directory information was incomplete/);
    await assert.rejects(readAdministratorDirectories(new AbortController().signal,
      signal => fetch(`${origin}/malformed`, { signal })), /Administrator directory information could not be read/);
  });
});

test('an actual refused local connection receives a readable retry message', async () => {
  const listener = net.createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const address = listener.address();
  assert(address && typeof address === 'object');
  await new Promise<void>(resolve => listener.close(() => resolve()));
  await assert.rejects(readAdministratorDirectories(new AbortController().signal,
    signal => fetch(`http://127.0.0.1:${address.port}`, { signal })), /Administrator directories could not load\. Please retry\./);
});
