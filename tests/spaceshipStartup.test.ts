import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const secret = 'PRIVATE_STARTUP_REDACTION_SENTINEL';
const prefix = '[PineVela] Startup failed. ';

async function hostingProcess(entry: string, options: {
  configure?: (directory: string) => Promise<NodeJS.ProcessEnv | void>;
  mode?: string;
  passengerRequire?: boolean;
} = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-startup-security-'));
  try {
    await fs.copyFile(path.resolve('deploy/spaceship/app.cjs'), path.join(directory, 'app.cjs'));
    await fs.mkdir(path.join(directory, 'dist-supabase-backend'));
    await fs.writeFile(path.join(directory, 'dist-supabase-backend/supabase-server.mjs'), entry);
    const extra = await options.configure?.(directory);
    const env = {PATH: process.env.PATH, NODE_ENV: options.mode || 'production', ...extra};
    const args = options.passengerRequire
      ? ['-e', 'require(process.argv[1])', path.join(directory, 'app.cjs')]
      : [path.join(directory, 'app.cjs')];
    const result = spawnSync(process.execPath, args, {cwd: os.tmpdir(), env, encoding: 'utf8', timeout: 5000});
    assert.ifError(result.error);
    assert.doesNotMatch(result.stdout + result.stderr, new RegExp(secret));
    return result;
  } finally {
    await fs.rm(directory, {recursive: true, force: true});
  }
}

function failureEntry(code?: string, message = secret) {
  return `throw Object.assign(new Error(${JSON.stringify(message)}), ${JSON.stringify({
    code, detail: secret, stack: secret, cause: {password: secret},
  })});`;
}

function diagnostic(result: ReturnType<typeof spawnSync>) {
  assert.equal(result.status, 1);
  const line = String(result.stderr).split('\n').find(line => line.startsWith(prefix));
  assert.ok(line, 'a failed startup must provide a safe diagnostic');
  return JSON.parse(line.slice(prefix.length));
}

for (const [code, failure] of [
  ['28P01', 'database_authentication'], ['ETIMEDOUT', 'network_connection'],
  ['CERT_HAS_EXPIRED', 'database_tls'], ['42501', 'database_permissions'],
  ['ERR_MODULE_NOT_FOUND', 'missing_dependency_or_bundle'],
  ['ERR_DLOPEN_FAILED', 'native_dependency'], ['order_pin_unavailable', 'private_pin_file'],
] as const) {
  test(`startup identifies ${failure} while withholding provider error content`, async () => {
    const report = diagnostic(await hostingProcess(failureEntry(code)));
    assert.equal(report.failure, failure);
    assert.equal(report.code, code);
    assert.equal(report.diagnosticVersion, 2);
  });
}

test('untrusted error codes, nested causes and stacks cannot enter hosting logs', async () => {
  const report = diagnostic(await hostingProcess(failureEntry(secret)));
  assert.equal(report.code, 'unclassified');
  assert.equal(report.failure, 'unclassified');
  assert.equal(report.envFile, 'missing');
  assert.ok(report.missingSettings.includes('DATABASE_URL_or_SUPABASE_DB_URL'));
});

test('database connection timeouts without a SQLSTATE remain diagnosable', async () => {
  const report = diagnostic(await hostingProcess(failureEntry(undefined, 'Connection terminated due to connection timeout')));
  assert.equal(report.failure, 'database_connection_timeout');
});

async function configuredFiles(directory: string) {
  await fs.mkdir(path.join(directory, 'node_modules'));
  await fs.symlink(path.dirname(require.resolve('dotenv/package.json')), path.join(directory, 'node_modules/dotenv'), 'dir');
  const pin = path.join(directory, 'private.key');
  const certificate = path.join(directory, 'database.crt');
  await fs.writeFile(pin, Buffer.alloc(32), {mode: 0o600});
  await fs.writeFile(certificate, secret, {mode: 0o600});
  await fs.writeFile(path.join(directory, '.env'), [
    `DATABASE_URL=${secret}`, `SUPABASE_URL=${secret}`, `SUPABASE_ANON_KEY=${secret}`,
    `SUPABASE_DB_CA_FILE=${certificate}`, `MARKET_ORDER_PIN_KEY_FILE=${pin}`,
  ].join('\n'), {mode: 0o600});
  return {pin, certificate};
}

test('real dotenv parsing reports private file readiness without revealing values', async () => {
  const report = diagnostic(await hostingProcess(failureEntry('28P01'), {
    configure: async directory => {await configuredFiles(directory);},
  }));
  assert.equal(report.envFile, 'readable');
  assert.deepEqual(report.missingSettings, []);
  assert.equal(report.certificate, 'readable');
  assert.equal(report.deliveryPinKey, 'readable');
});

test('PIN diagnostics reject group-readable permissions and retain environment precedence', async () => {
  const report = diagnostic(await hostingProcess(failureEntry('order_pin_unavailable'), {
    configure: async directory => {
      await configuredFiles(directory);
      const alternate = path.join(directory, 'wrong-permissions.key');
      await fs.writeFile(alternate, Buffer.alloc(32), {mode: 0o644});
      return {MARKET_ORDER_PIN_KEY_FILE: alternate};
    },
  }));
  assert.equal(report.deliveryPinKey, 'permissions_too_open');
});

test('PIN diagnostics reject a wrong-sized key without reading its content', async () => {
  const report = diagnostic(await hostingProcess(failureEntry('order_pin_unavailable'), {
    configure: async directory => {
      const {pin} = await configuredFiles(directory);
      await fs.writeFile(pin, secret);
    },
  }));
  assert.equal(report.deliveryPinKey, 'wrong_size');
});

test('PIN diagnostics reject symbolic links without weakening private file protection', async () => {
  const report = diagnostic(await hostingProcess(failureEntry('order_pin_unavailable'), {
    configure: async directory => {
      const {pin} = await configuredFiles(directory);
      const linked = path.join(directory, 'linked.key');
      await fs.symlink(pin, linked);
      return {MARKET_ORDER_PIN_KEY_FILE: linked};
    },
  }));
  assert.equal(report.deliveryPinKey, 'missing_or_unreadable');
});

test('Passenger-style CommonJS loading still imports the ESM entry from the app root', async () => {
  const result = await hostingProcess(`
    import fs from 'node:fs';
    if (!fs.existsSync('app.cjs')) throw new Error('wrong working directory');
    console.log('startup-entry-reached');
  `, {passengerRequire: true});
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), 'startup-entry-reached');
  assert.equal(result.stderr, '');
});

test('non-production mode is still rejected before the application is imported', async () => {
  const result = await hostingProcess(`console.log('startup-entry-reached');`, {mode: 'development'});
  assert.equal(result.status, 1);
  assert.doesNotMatch(result.stdout, /startup-entry-reached/);
  assert.match(result.stderr, /Select Production mode/);
});
