import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const expected = JSON.parse(await fs.readFile('docs/release.json', 'utf8'));
const base = process.env.TEST_URL || 'https://jeckpep50-bit.github.io/inmervia-laboratorio/';
const url = new URL(base);
url.searchParams.set('v', expected.version);
const checks = [],
  errors = [],
  failures = [];
const ok = (name, value) => {
  assert.ok(value, name);
  checks.push(name);
};
let browser;
const output = process.env.TEST_REPORT_DIR || 'assets/review';
await fs.mkdir(output, { recursive: true });
try {
  browser = await chromium.launch({
    executablePath: process.env.TEST_BROWSER || undefined,
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(response.status() + ' ' + response.url());
  });
  const response = await page.goto(url.href);
  ok(
    'Publicación accesible por HTTPS',
    response.status() === 200 && (await page.evaluate(() => isSecureContext)),
  );
  await page.waitForFunction(() => window.lab?.ready, null, { timeout: 60000 });
  ok(
    'Entrada MR visible y versión correcta',
    (await page.locator('#enter-mr').isVisible()) &&
      (await page.evaluate(
        (version) => document.querySelector('script[src*="app.js"]').src.includes('v=' + version),
        expected.version,
      )),
  );
  const manifestResponse = await page.request.get(
    new URL('release.json?v=' + expected.version, base).href,
  );
  const manifest = await manifestResponse.json();
  ok('Manifiesto publicado coincide', manifest.version === expected.version);
  for (const id of ['horse', 'cow']) {
    const model = expected.models[id];
    const resource = await page.request.get(
      new URL(model.file + '?v=' + expected.version, base).href,
    );
    const bytes = await resource.body();
    ok(
      id + ': archivo publicado idéntico al validado',
      resource.status() === 200 &&
        createHash('sha256').update(bytes).digest('hex') === model.sha256 &&
        manifest.models[id].sha256 === model.sha256,
    );
    await page.locator(`[data-animal="${id}"]`).click();
    await page.waitForFunction((id) => window.lab.ready && window.lab.animal === id, id);
    ok(
      id + ': diez regiones y once movimientos',
      await page.evaluate(
        () => window.lab.current.parts.length === 10 && window.lab.current.joints.length === 11,
      ),
    );
    await page.evaluate(() => window.lab.select('head'));
    ok(
      id + ': selección e información',
      await page.evaluate(
        () =>
          window.lab.selected === 'head' &&
          document.querySelector('#region-name').textContent === 'Cabeza',
      ),
    );
    await page.locator('[data-mode="assemble"]').click();
    await page.locator('#explode').click();
    ok(
      id + ': separación y grupos de dibujo limitados',
      await page.evaluate(
        () =>
          window.lab.current.pieces.every((p) => !p.userData.snapped) &&
          window.lab.current.pieces.reduce((sum, p) => sum + p.geometry.groups.length, 0) <= 20,
      ),
    );
    await page.locator('#restore').click();
    ok(
      id + ': rearmado',
      await page.evaluate(() => window.lab.current.pieces.every((p) => p.userData.snapped)),
    );
    await page.locator('[data-mode="explore"]').click();
  }
  ok(
    'Menú simplificado',
    (await page.locator('#regions,#lesson-start,#toggle-sound,#place-room').count()) === 0,
  );
  const credits = await page.request.get(new URL('credits.html', base).href);
  ok(
    'Créditos de los modelos publicados',
    credits.status() === 200 && (await credits.text()).includes('Grab3D'),
  );
  await page.screenshot({ path: path.join(output, 'pages-v0.4.png'), fullPage: true });
  ok('Sin errores de JavaScript ni recursos', errors.length === 0);
} catch (error) {
  failures.push(error.stack || String(error));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  await fs.writeFile(
    path.join(output, 'pages-checks.json'),
    JSON.stringify(
      {
        url: url.href,
        version: expected.version,
        pass: !failures.length,
        checks,
        errors,
        failures,
        headset_tested: false,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ pass: !failures.length, checks: checks.length, errors, failures }));
}
