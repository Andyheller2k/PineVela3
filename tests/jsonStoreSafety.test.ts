import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { JsonStoreWriter, DatabasePersistenceError } from '../jsonStoreSafety.js';

const snapshot = (id: string) => ({ users: [], hostels: [], ratings: [{ id, nested: { retained: true } }] });
const throwsCode = (code: string) => (error: any) => error instanceof DatabasePersistenceError && error.code === code;

test('B09: corrupt, unreadable and malformed stores never initialize defaults or replace a valid backup', async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-b09-'));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const file = path.join(temp, 'pinevela_store.json');
  const writer = new JsonStoreWriter(file); t.after(() => writer.close());
  const backup = Buffer.from(JSON.stringify(snapshot('last-good')));
  await fs.writeFile(writer.backupPath, backup);
  for (const bad of ['truncated {', 'null', '[]', '{}', '{"users":{}}', '{"users":[],"ratings":{}}', '{"users":[],"retiredFeatureRecords":{"housingApplications":{}}}']) {
    await fs.writeFile(file, bad);
    assert.throws(() => writer.load(), throwsCode('INVALID_DATABASE'));
    assert.equal(await fs.readFile(file, 'utf8'), bad);
    assert.deepEqual(await fs.readFile(writer.backupPath), backup);
  }
  const invalidUtf8 = Buffer.concat([Buffer.from('{"users":[],"note":"'), Buffer.from([0xff]), Buffer.from('"}')]);
  await fs.writeFile(file, invalidUtf8);
  assert.throws(() => writer.load(), throwsCode('INVALID_DATABASE'));
  assert.deepEqual(await fs.readFile(file), invalidUtf8);
  await fs.unlink(file); await fs.mkdir(file);
  assert.throws(() => writer.load(), throwsCode('UNREADABLE_DATABASE'));
  assert((await fs.stat(file)).isDirectory()); await fs.rmdir(file);
  assert.throws(() => writer.load(), throwsCode('MISSING_DATABASE'));
  assert.deepEqual(await fs.readFile(writer.backupPath), backup);
  await fs.writeFile(path.join(temp, 'outside.json'), JSON.stringify(snapshot('outside')));
  await fs.symlink(path.join(temp, 'outside.json'), file);
  assert.throws(() => writer.load(), throwsCode('UNREADABLE_DATABASE'));
  assert((await fs.lstat(file)).isSymbolicLink());
  const oversizedFile = path.join(temp, 'oversized.json');
  await fs.writeFile(oversizedFile, 'x'.repeat(2048));
  const limited = new JsonStoreWriter(oversizedFile, 1024); t.after(() => limited.close());
  assert.throws(() => limited.load(), throwsCode('DATABASE_SIZE_LIMIT'));
  assert.equal((await fs.stat(oversizedFile)).size, 2048);
});

test('B10: lease, expected snapshot and bounds protect writes; backup failures retain the original', async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-b10-'));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const file = path.join(temp, 'pinevela_store.json');
  const writer = new JsonStoreWriter(file, 1024); t.after(() => writer.close());
  assert.equal(writer.load(), undefined); writer.save(snapshot('first'));
  assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
  writer.save(snapshot('second'));
  assert.deepEqual(JSON.parse(await fs.readFile(writer.backupPath, 'utf8')), snapshot('first'));
  assert.equal((await fs.stat(writer.backupPath)).mode & 0o777, 0o600);
  const other = new JsonStoreWriter(file); t.after(() => other.close());
  assert.throws(() => other.load(), throwsCode('WRITER_BUSY'));
  assert.throws(() => writer.save({ ...snapshot('too-large'), padding: 'x'.repeat(2048) }), throwsCode('DATABASE_SIZE_LIMIT'));
  assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), snapshot('second'));
  await fs.writeFile(file, JSON.stringify(snapshot('external')));
  assert.throws(() => writer.save(snapshot('stale')), throwsCode('STALE_DATABASE'));
  assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), snapshot('external'));
  writer.load(); await fs.unlink(writer.backupPath); await fs.mkdir(writer.backupPath);
  assert.throws(() => writer.save(snapshot('must-not-commit')), throwsCode('DATABASE_WRITE_FAILED'));
  assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), snapshot('external'));
  await fs.rmdir(writer.backupPath);
  await fs.unlink(`${file}.lock`);
  assert.throws(() => writer.save(snapshot('lost-lease')), throwsCode('LOCK_REPLACED'));
  writer.close(); other.load(); other.save(snapshot('new-owner'));
  assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), snapshot('new-owner'));
});

test('B09/B10: offline restore validates backup, keeps one quarantine and fails safely on invalid recovery', async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-restore-'));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const file = path.join(temp, 'pinevela_store.json');
  const writer = new JsonStoreWriter(file, 1024); t.after(() => writer.close());
  await fs.writeFile(file, 'broken-original'); await fs.writeFile(writer.backupPath, '{broken-backup');
  assert.throws(() => writer.restoreBackup(x => x), throwsCode('INVALID_DATABASE'));
  assert.equal(await fs.readFile(file, 'utf8'), 'broken-original');
  await fs.writeFile(writer.backupPath, JSON.stringify(snapshot('recoverable')));
  writer.restoreBackup(x => x);
  assert.equal(await fs.readFile(writer.quarantinePath, 'utf8'), 'broken-original');
  assert.equal((await fs.stat(writer.quarantinePath)).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), snapshot('recoverable'));
  assert.throws(() => writer.restoreBackup(x => x), throwsCode('QUARANTINE_EXISTS'));
  assert.deepEqual((await fs.readdir(temp)).sort(), ['pinevela_store.json', 'pinevela_store.json.bak', 'pinevela_store.json.lock', 'pinevela_store.json.quarantine']);
});
