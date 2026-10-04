const { execFileSync } = require('node:child_process');
let paths;
try {
  paths = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).split('\0').filter(Boolean);
} catch {
  console.error('Cannot inspect the Git index. Refusing to approve this commit.');
  process.exit(1);
}
const privatePaths = paths.filter(name => /^(data|uploads|\.security)\//.test(name) || /(^|\/)(pinevela_store|request-limits)\.json(?:\.|$)/.test(name) || /(^|\/)\.env(?:\.|$)/.test(name) && !name.endsWith('.env.example'));
if (privatePaths.length) {
  console.error('Private runtime files must not be tracked in Git:\n' + privatePaths.join('\n'));
  process.exitCode = 1;
}

// Read staged bytes, never print credential values. Paystack secret keys cannot enter Git.
const exposed = paths.filter(name => {
  try { return /sk_(?:live|test)_[a-f0-9]{32,}/i.test(execFileSync('git', ['show', ':' + name], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] })); } catch { return false; }
});
if (exposed.length) { console.error('Paystack secret detected in staged files: ' + exposed.join(', ')); process.exitCode = 1; }

if (!process.exitCode) console.log('Private-data check passed: runtime data and local secrets are not tracked, and no staged Paystack secret was found.');
