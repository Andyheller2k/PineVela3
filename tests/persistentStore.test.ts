import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import ts from 'typescript';
import type { PersistentStore } from '../persistentDb.js';

test('B01: every declared collection survives repeated load/save; historical records sharing an email are preserved', async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-b01-roundtrip-'));
  const previous = process.env.PINEVELA_DATA_DIR;
  process.env.PINEVELA_DATA_DIR = temp;
  t.after(async () => { if (previous === undefined) delete process.env.PINEVELA_DATA_DIR; else process.env.PINEVELA_DATA_DIR = previous; await fs.rm(temp, { recursive: true, force: true }); });
  const source = await fs.readFile(fileURLToPath(new URL('../persistentDb.ts', import.meta.url)), 'utf8');
  const parsed = ts.createSourceFile('persistentDb.ts', source, ts.ScriptTarget.Latest, true);
  const contract = parsed.statements.find(s => ts.isInterfaceDeclaration(s) && s.name.text === 'PersistentStore') as ts.InterfaceDeclaration;
  assert(contract);
  const collections = contract.members.filter((member): member is ts.PropertySignature => ts.isPropertySignature(member) && Boolean(member.type && ts.isArrayTypeNode(member.type)));
  const seed: any = { credentialExposureVersion: 1, accountSecurityVersion: 1,
    platformSettings: { registrationFee: 50, commission: 5, announcement: '', maintenanceMode: false } };
  for (const member of collections) {
    const key = member.name.getText(parsed);
    const type = member.type as ts.ArrayTypeNode;
    seed[key] = type.elementType.kind === ts.SyntaxKind.StringKeyword ? ['ISOLATED-RETIRED-KEY'] : [{
      id: `${key}-record`, name: `Isolated ${key}`, email: `${key}@example.test`,
      imageUrl: `/uploads/market/${key}.png`, accountId: 'isolated-account', createdAt: '2026-10-03T00:00:00.000Z',
      details: { retained: true, list: ['first', 'second'] }
    }];
  }
  const historical = ['ratings', 'staffBargains', 'digitalMarketServiceReviews', 'onboardingPayments', 'managerProfiles'];
  for (const key of historical) seed[key] = [
    { id: `${key}-first`, email: 'shared-history@example.test', details: { note: 'Original record' } },
    { id: `${key}-second`, email: 'shared-history@example.test', details: { note: 'Separate record from the same person' } }
  ];
  const defaults: PersistentStore = { hostels: [], issueReports: [], activities: [], hostelVerifications: [],
    managerRegistrationRequests: [], verificationAuditLogs: [], users: [], notifications: [], platformSettings: seed.platformSettings };
  const database = path.join(temp, 'pinevela_store.json');
  await fs.writeFile(database, JSON.stringify(seed));
  const { loadPersistentStore, savePersistentStore } = await import('../persistentDb.js');
  const { JSON_COLLECTIONS } = await import('../jsonStoreSafety.js');
  for (const member of collections) assert(JSON_COLLECTIONS.includes(member.name.getText(parsed) as any), 'Every declared collection must be validated before load/save');
  for (let round = 0; round < 3; round++) {
    const loaded = loadPersistentStore(defaults);
    for (const member of collections) {
      const key = member.name.getText(parsed);
      assert.deepEqual(loaded[key], seed[key], `${key} lost or changed records on load ${round}`);
    }
    savePersistentStore(loaded);
    const disk = JSON.parse(await fs.readFile(database, 'utf8'));
    for (const member of collections) {
      const key = member.name.getText(parsed);
      assert.deepEqual(disk[key], seed[key], `${key} lost or changed records on save ${round}`);
    }
  }
  // Missing legacy fields may use defaults. Present malformed collections now fail closed (B09).
  for (const value of [undefined, null, {}, 'invalid', 1, []]) {
    const fixture = { ...seed };
    const fallback: any = { ...defaults };
    for (const key of historical) { fixture[key] = value; fallback[key] = [{ id: `${key}-default` }]; }
    await fs.writeFile(database, JSON.stringify(fixture));
    if (value !== undefined && !Array.isArray(value)) {
      assert.throws(() => loadPersistentStore(fallback), /must be an array/);
      assert.deepEqual(JSON.parse(await fs.readFile(database, 'utf8')), fixture);
    } else {
      const loaded = loadPersistentStore(fallback);
      for (const key of historical) assert.deepEqual(loaded[key], Array.isArray(value) ? [] : fallback[key]);
    }
  }
  await fs.writeFile(database, JSON.stringify(defaults));
  const loaded = loadPersistentStore(defaults);
  for (const key of historical) assert.deepEqual(loaded[key], []);
});
