import assert from 'node:assert/strict';
import {test} from 'node:test';
import {EventEmitter} from 'node:events';
import {AttemptBudgets,credentialContext,credentialWork,EventConnections,ResourceLimitError,trustedProxyAddresses,WorkPool} from '../resourceSecurity.js';
import {hashCredentialAsync,verifyCredentialAsync} from '../accountSecurity.js';
test('shared actor/IP budgets reserve atomically, expire and enforce bounded capacity',()=>{
 let now=1000;const budgets=new AttemptBudgets(()=>now,3);
 const actor={scope:'actor',identity:'unit-actor',maximum:2,windowMs:1000},ip={scope:'ip',identity:'127.0.0.1',maximum:1,windowMs:1000};
 budgets.reserve([actor,ip]);assert.throws(()=>budgets.reserve([actor,ip]),ResourceLimitError);
 budgets.reserve([actor]);assert.throws(()=>budgets.reserve([actor]),ResourceLimitError);
 now+=1001;budgets.reserve([actor,ip]);budgets.reserve([{...actor,identity:'second'}]);
 assert.throws(()=>budgets.reserve([{...actor,identity:'overflow'}]),ResourceLimitError);
});
test('S23: work queues are bounded, recover after completion/error, and credential contexts deduplicate and cap work', async () => {
  const pool = new WorkPool(1, 1); let release!: () => void;
  const first = pool.run(() => new Promise<number>(resolve => release = () => resolve(1)));
  const second = pool.run(async () => 2);
  await assert.rejects(pool.run(async () => 3), ResourceLimitError);
  release(); assert.equal(await first, 1); assert.equal(await second, 2);
  await assert.rejects(pool.run(async () => { throw new Error('Expected fixture failure'); }));
  assert.equal(await pool.run(async () => 4), 4);
  credentialContext(() => {
    let executions = 0;
    for (let i = 0; i < 100; i++) assert.equal(credentialWork('same', () => ++executions), 1);
    for (let i = 0; i < 15; i++) credentialWork(String(i), () => 1);
    assert.throws(() => credentialWork('overflow', () => 1), ResourceLimitError);
  });
});

test('native asynchronous secret derivation preserves event-loop progress and in-flight deduplication',async()=>{
 const secret='Local bounded credential work';let finished=false;
 const pending=hashCredentialAsync(secret).then(hash=>{finished=true;return hash;});
 await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(finished,false);
 const hash=await pending;assert.equal(await verifyCredentialAsync(secret,hash),true);assert.equal(await verifyCredentialAsync('wrong',hash),false);
 await new Promise<void>((resolve,reject)=>credentialContext(()=>{Promise.all(Array.from({length:100},()=>verifyCredentialAsync(secret,hash))).then(values=>{assert.ok(values.every(Boolean));resolve();},reject);}));
});
class StreamResponse extends EventEmitter {
  writableLength = 0; destroyed = false; headers: any; chunks: string[] = [];
  set(headers: any) { this.headers = headers; return this; }
  flushHeaders() {}
  write(chunk: string) { this.chunks.push(chunk); return true; }
  end() { this.destroyed = true; this.emit('close'); }
  destroy() { this.end(); }
}
const streamRequest = (ip: string): any => Object.assign(new EventEmitter(), { ip, socket: { remoteAddress: ip } });
test('S23: SSE actor/IP/global caps release on disconnect, backpressure and expiry', async () => {
  const streams = new EventConnections(3, 2, 1, 30);
  const first = new StreamResponse(), second = new StreamResponse(), third = new StreamResponse();
  streams.add(streamRequest('ip-a'), first as any, 'actor-a');
  assert.throws(() => streams.add(streamRequest('ip-b'), new StreamResponse() as any, 'actor-a'), ResourceLimitError);
  streams.add(streamRequest('ip-a'), second as any, 'actor-b');
  assert.throws(() => streams.add(streamRequest('ip-a'), new StreamResponse() as any, ''), ResourceLimitError);
  streams.add(streamRequest('ip-b'), third as any, 'actor-c');
  assert.throws(() => streams.add(streamRequest('ip-c'), new StreamResponse() as any, ''), ResourceLimitError);
  first.writableLength = 70000; streams.broadcast('{"entity":"hostels"}'); assert(first.destroyed);
  const replacement = new StreamResponse(); const req = streamRequest('ip-c'); streams.add(req, replacement as any, 'actor-a');
  req.emit('close'); assert(replacement.destroyed);
  await new Promise(resolve => setTimeout(resolve, 50)); assert(second.destroyed && third.destroyed);
  const fresh = new StreamResponse(); streams.add(streamRequest('ip-a'), fresh as any, 'actor-a'); fresh.end();
});

test('S23: forwarding headers are trusted only behind explicitly configured proxy addresses', () => {
  assert.equal(trustedProxyAddresses(''), false);
  assert.deepEqual(trustedProxyAddresses('127.0.0.1,10.0.0.0/8,::1'), ['127.0.0.1', '10.0.0.0/8', '::1']);
  for (const value of ['true', '1', 'loopback', '10.0.0.0/99', '0.0.0.0/0', '::/0', 'https://proxy.example.test']) assert.throws(() => trustedProxyAddresses(value));
});
