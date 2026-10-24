'use strict';

// CloudLinux/Passenger loads a CommonJS startup file. The application itself
// remains the existing Supabase/Express ESM bundle.
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

// Logs must identify a hosting failure without serializing provider messages,
// database URLs, environment values, error stacks or nested error objects.
function startupDiagnostic(error) {
  const message = typeof error?.message === 'string' ? error.message : '';
  const knownCodes = new Set([
    'ERR_MODULE_NOT_FOUND', 'MODULE_NOT_FOUND', 'ERR_REQUIRE_ESM',
    'ERR_REQUIRE_ASYNC_MODULE', 'ERR_DLOPEN_FAILED', 'ERR_INVALID_URL',
    'ENOENT', 'EACCES', 'EPERM', 'EADDRINUSE', 'ENOTFOUND', 'EAI_AGAIN',
    'ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH',
    'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'SELF_SIGNED_CERT_IN_CHAIN',
    'DEPTH_ZERO_SELF_SIGNED_CERT', 'CERT_HAS_EXPIRED', 'ERR_TLS_CERT_ALTNAME_INVALID',
    'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', '28P01', '28000', '42501', '42P01',
    '3F000', '53300', '53400', '57P01', '57P03', 'order_pin_unavailable',
  ]);
  const code = knownCodes.has(error?.code) ? error.code : 'unclassified';
  let failure = 'unclassified';
  if (['ERR_MODULE_NOT_FOUND', 'MODULE_NOT_FOUND'].includes(code)) failure = 'missing_dependency_or_bundle';
  else if (['ERR_REQUIRE_ESM', 'ERR_REQUIRE_ASYNC_MODULE'].includes(code)) failure = 'module_loader';
  else if (code === 'ERR_DLOPEN_FAILED' || /Could not load the "sharp" module/.test(message)) failure = 'native_dependency';
  else if (code === 'ERR_INVALID_URL') failure = 'invalid_configuration_url';
  else if (['ENOENT', 'EACCES', 'EPERM'].includes(code)) failure = 'file_missing_or_unreadable';
  else if (code === 'EADDRINUSE') failure = 'listener_port_in_use';
  else if (['ENOTFOUND', 'EAI_AGAIN'].includes(code)) failure = 'dns_lookup';
  else if (['ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH'].includes(code)) failure = 'network_connection';
  else if (['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'SELF_SIGNED_CERT_IN_CHAIN', 'DEPTH_ZERO_SELF_SIGNED_CERT',
    'CERT_HAS_EXPIRED', 'ERR_TLS_CERT_ALTNAME_INVALID', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY'].includes(code)) failure = 'database_tls';
  else if (['28P01', '28000'].includes(code)) failure = 'database_authentication';
  else if (code === '42501') failure = 'database_permissions';
  else if (['42P01', '3F000'].includes(code)) failure = 'database_schema';
  else if (['53300', '53400', '57P01', '57P03'].includes(code)) failure = 'database_unavailable';
  else if (code === 'order_pin_unavailable') failure = 'private_pin_file';
  else if (message === 'Supabase PostgreSQL and CA configuration are required.') failure = 'missing_database_configuration';
  else if (message === 'Supabase project and Session pooler configuration do not match.') failure = 'database_configuration_mismatch';
  else if (message === 'Apply all Supabase migrations before starting the server.') failure = 'schema_version_missing';
  else if (message === 'Restore the matching private delivery PIN key before starting the replacement server.') failure = 'pin_key_mismatch';
  else if (/^(Connection terminated due to connection timeout|Connection timeout|timeout expired|Query read timeout)$/.test(message)) failure = 'database_connection_timeout';

  let env = process.env;
  let envFile = 'unreadable';
  try {
    const contents = fs.readFileSync(path.join(__dirname, '.env'));
    envFile = 'readable';
    // Match dotenv's existing no-override behavior without changing the process.
    env = { ...require('dotenv').parse(contents), ...process.env };
  } catch (fileError) {
    if (fileError?.code === 'ENOENT') envFile = 'missing';
  }
  const missingSettings = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_DB_CA_FILE', 'MARKET_ORDER_PIN_KEY_FILE']
    .filter(name => !env[name]);
  if (!(env.DATABASE_URL || env.SUPABASE_DB_URL)) missingSettings.push('DATABASE_URL_or_SUPABASE_DB_URL');
  function privateFile(name, pin) {
    if (!env[name]) return 'not_configured';
    let fd;
    try {
      fd = fs.openSync(env[name], fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
      const stat = fs.fstatSync(fd);
      if (!stat.isFile()) return 'not_regular_file';
      if (pin && (stat.mode & 0o077)) return 'permissions_too_open';
      if (pin && stat.size !== 32) return 'wrong_size';
      return 'readable';
    } catch {
      return 'missing_or_unreadable';
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }
  }
  return {
    diagnosticVersion: 2, failure, code, node: process.versions.node,
    envFile, missingSettings,
    certificate: privateFile('SUPABASE_DB_CA_FILE', false),
    deliveryPinKey: privateFile('MARKET_ORDER_PIN_KEY_FILE', true),
    backendBundle: fs.existsSync(path.join(__dirname, 'dist-supabase-backend', 'supabase-server.mjs')) ? 'present' : 'missing',
  };
}

if (process.env.NODE_ENV !== 'production') {
  throw new Error('Select Production mode for the PineVela hosting application.');
}

// This file is copied to the upload package's application root. Keep dotenv,
// static assets and existing private key paths relative to that application.
process.chdir(__dirname);
const entry = path.join(__dirname, 'dist-supabase-backend', 'supabase-server.mjs');
import(pathToFileURL(entry).href).catch(error => {
  try {
    console.error('[PineVela] Startup failed.', JSON.stringify(startupDiagnostic(error)));
  } catch {
    console.error('[PineVela] Startup failed. Safe diagnostics unavailable.');
  }
  process.exit(1);
});
