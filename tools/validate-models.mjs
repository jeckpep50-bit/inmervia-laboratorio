import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const validator = require(process.env.GLTF_VALIDATOR_MODULE || 'gltf-validator');
const results = [];
for (const animal of ['horse', 'cow']) {
  for (const stage of ['distributed', 'uncompressed']) {
    const bytes = await fs.readFile(
      stage === 'distributed'
        ? `docs/models/${animal}-v2.glb`
        : `assets/cache/${animal}-uncompressed.glb`,
    );
    const report = await validator.validateBytes(new Uint8Array(bytes), {
      uri: `${animal}-v2.glb`,
      maxIssues: 200,
    });
    await fs.writeFile(
      `assets/review/${animal}-v2-${stage === 'distributed' ? 'gltf' : 'uncompressed-gltf'}.json`,
      JSON.stringify(report, null, 2),
    );
    results.push({
      animal,
      stage,
      bytes: bytes.length,
      errors: report.issues.numErrors,
      warnings: report.issues.numWarnings,
      info: report.issues.numInfos,
      triangles: report.info.totalTriangleCount,
      images: report.info.resources
        .filter((resource) => resource.image)
        .map((resource) => resource.image),
    });
  }
}
await fs.writeFile('assets/review/gltf-v2-summary.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify(results));
if (results.some((r) => r.errors)) process.exitCode = 1;
