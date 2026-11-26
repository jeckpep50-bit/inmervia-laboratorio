import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { repairTangents } from './repair-tangents.mjs';
// Pass the installed @gltf-transform/cli 4.3.0 bin/cli.js path as the argument.
const cli = process.argv[2];
if (!cli)
  throw new Error(
    'Indica la ruta de @gltf-transform/cli 4.3.0 bin/cli.js. Ejecutar después de build_animals.py.',
  );
await fs.mkdir('assets/cache', { recursive: true });
const selected = process.argv.includes('--animal')
  ? [process.argv[process.argv.indexOf('--animal') + 1]]
  : ['horse', 'cow'];
if (selected.some((id) => !['horse', 'cow'].includes(id))) throw new Error('Animal no válido.');
for (const id of ['horse', 'cow']) {
  const qa = JSON.parse(await fs.readFile(`assets/review/${id}-v2-qa.json`, 'utf8'));
  if (!qa.pass) throw new Error(`QA pendiente en ${id}; no se comprime ni publica.`);
}
for (const id of ['horse', 'cow']) {
  if (!selected.includes(id)) continue;
  const output = `docs/models/${id}-v2.glb`,
    input = `assets/cache/${id}-uncompressed.glb`;
  if (!process.argv.includes('--reuse-source')) await fs.copyFile(output, input);
  console.log(id + ': tangentes reparadas ' + (await repairTangents(input)));
  const result = spawnSync(
    process.execPath,
    [
      cli,
      'meshopt',
      input,
      output,
      '--quantize-position',
      '16',
      '--quantize-normal',
      '12',
      '--quantize-texcoord',
      '14',
    ],
    { stdio: 'inherit', windowsHide: true },
  );
  if (result.status !== 0) process.exit(result.status || 1);
}
