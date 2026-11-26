import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
const json = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));
for (const name of ['current-browser-checks', 'experience-checks']) {
  const check = await json(`assets/review/${name}.json`);
  if (!check.pass) throw new Error(`No se publica: falla ${name}.`);
}
const validation = await json('assets/review/gltf-v2-summary.json');
if (validation.length !== 4 || validation.some((report) => report.errors))
  throw new Error('Validación glTF incompleta.');
const reports = await json('assets/review/animals-v2-report.json');
const models = {};
for (const animal of ['horse', 'cow']) {
  const report = reports.find((report) => report.animal === animal);
  if (!report?.qa.pass) throw new Error(`No se publica: QA de ${animal} pendiente.`);
  const file = `models/${animal}-v2.glb`,
    bytes = await fs.readFile('docs/' + file);
  models[animal] = {
    file,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    triangles: report.triangles,
    bones: report.bones,
    regions: report.parts.length,
  };
}
const pkg = await json('package.json');
await fs.writeFile(
  'docs/release.json',
  JSON.stringify(
    { version: pkg.version, builtAt: new Date().toISOString(), models, headsetTested: false },
    null,
    2,
  ) + '\n',
);
console.log(`Manifiesto ${pkg.version}: dos modelos y comprobaciones aprobadas.`);
