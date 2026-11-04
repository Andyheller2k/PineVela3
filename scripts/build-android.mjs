import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const android = path.join(root, 'android');
if (!existsSync(path.join(android, 'app/src/main/assets/public/index.html'))) {
  throw new Error('Run npm run android:sync before building the Android APK.');
}
const wrapper = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
const result = spawnSync(wrapper, [':app:assembleDebug', '--no-daemon', '--max-workers=1'], {
  cwd: android,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
