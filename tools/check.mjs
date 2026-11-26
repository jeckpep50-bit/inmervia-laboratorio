import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const files = fs
  .readdirSync('docs')
  .filter((name) => name.endsWith('.js'))
  .map((name) => path.join('docs', name));
files.push('server.mjs');
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('Sintaxis correcta: ' + files.length + ' módulos.');
