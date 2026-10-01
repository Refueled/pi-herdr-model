// Enumerate test files explicitly: Node 20 on Windows does not expand shell globs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = fs.readdirSync(path.join(root, 'test'))
  .filter(name => name.endsWith('.test.ts'))
  .sort()
  .map(name => path.join(root, 'test', name));
if (files.length === 0) throw new Error('No tests found');
const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', ...files], {
  cwd: root, stdio: 'inherit',
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
