import { createRequire } from 'node:module';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
let server, browser;
let url = process.env.TEST_URL;
const checks = [],
  errors = [],
  failures = [];
const ok = (name, value) => {
  assert.ok(value, name);
  checks.push(name);
};
const reportPath = 'assets/review/current-browser-checks.json';

try {
  if (!url) {
    process.env.PORT = '0';
    ({ server } = await import('../server.mjs'));
    if (!server.listening) await once(server, 'listening');
    url = 'http://127.0.0.1:' + server.address().port + '/';
  }
  browser = await chromium.launch({
    executablePath: process.env.TEST_BROWSER || undefined,
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  context.on('page', (page) => page.on('pageerror', (e) => errors.push(e.message)));
  const page = await context.newPage();
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  const response = await page.goto(url);
  ok('Aplicación responde HTTP 200', response.status() === 200);
  await page.waitForFunction(() => window.lab?.ready);
  for (const id of ['horse', 'cow']) {
    await page.locator(`[data-animal="${id}"]`).click();
    await page.waitForFunction((id) => window.lab.ready && window.lab.animal === id, id);
    ok(id + ': diez regiones', await page.evaluate(() => window.lab.current.parts.length === 10));
    await page.locator('[data-region="head"]').click();
    ok(
      id + ': selección e información',
      await page.evaluate(
        () =>
          window.lab.selected === 'head' &&
          document.querySelector('#region-name').textContent === 'Cabeza',
      ),
    );
    await page.locator('#pose').fill('15');
    await page.locator('#pose').dispatchEvent('input');
    ok(id + ': postura', (await page.locator('#pose-value').textContent()) === '15°');
    await page.locator('#reset-pose').click();
    await page.locator('[data-mode="assemble"]').click();
    await page.locator('#explode').click();
    ok(
      id + ': separación',
      await page.evaluate(() => window.lab.current.pieces.every((p) => !p.userData.snapped)),
    );
    const hit = await page.evaluate(() => {
      const p = window.lab.current.pieces.find((p) => p.userData.region === 'head');
      const v = p.getWorldPosition(p.position.clone()).project(window.lab.camera);
      const r = document.querySelector('#viewer canvas').getBoundingClientRect();
      return {
        x: r.left + (v.x * 0.5 + 0.5) * r.width,
        y: r.top + (-v.y * 0.5 + 0.5) * r.height,
        before: p.position.toArray(),
      };
    });
    await page.mouse.move(hit.x, hit.y);
    await page.mouse.down();
    await page.mouse.move(hit.x + 55, hit.y + 25, { steps: 12 });
    await page.mouse.up();
    ok(
      id + ': arrastre real',
      await page.evaluate((before) => {
        const p = window.lab.current.pieces.find((p) => p.userData.region === 'head');
        return (
          window.lab.selected === 'head' &&
          p.position.distanceTo(p.position.clone().fromArray(before)) > 0.01
        );
      }, hit.before),
    );
    await page.locator('#restore').click();
    ok(
      id + ': restauración',
      await page.evaluate(() => window.lab.current.pieces.every((p) => p.userData.snapped)),
    );
    await page.locator('[data-mode="explore"]').click();
  }
  const before = await page.evaluate(() => ({
    animal: window.lab.animal,
    mode: window.lab.mode,
    selected: window.lab.selected,
  }));
  await page.evaluate(async () => {
    window.lab.select('invalid');
    window.lab.setMode('invalid');
    window.lab.setPose(NaN);
    await window.lab.loadAnimal('__proto__');
  });
  ok(
    'Entradas inválidas no corrompen el estado',
    JSON.stringify(before) ===
      JSON.stringify(
        await page.evaluate(() => ({
          animal: window.lab.animal,
          mode: window.lab.mode,
          selected: window.lab.selected,
        })),
      ),
  );
  ok(
    'Límites de escala',
    await page.evaluate(() => {
      for (let i = 0; i < 100; i++) window.lab.scaleActor(1.15);
      const upper = window.lab.actor.scale.x;
      for (let i = 0; i < 100; i++) window.lab.scaleActor(0.85);
      const lower = window.lab.actor.scale.x;
      window.lab.resetView();
      return upper === 1.2 && lower === 0.2;
    }),
  );
  await page.locator('[data-animal="horse"]').click();
  await page.waitForFunction(() => window.lab.ready && window.lab.animal === 'horse');
  await page.locator('#reference').click();
  ok(
    'Referencia visual',
    await page.locator('#reference-dialog img').evaluate((img) => img.naturalWidth > 0),
  );
  await page.locator('#reference-dialog [data-close]').click();
  const metrics = await page.evaluate(() => ({
    drawCalls: window.lab.renderer.info.render.calls,
    triangles: window.lab.renderer.info.render.triangles,
    geometries: window.lab.renderer.info.memory.geometries,
    textures: window.lab.renderer.info.memory.textures,
  }));
  await page.screenshot({ path: 'assets/review/current-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  ok(
    'Móvil sin desbordamiento horizontal',
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  await page.screenshot({ path: 'assets/review/current-mobile.png', fullPage: true });
  ok(
    'El panel móvil deja libre el visor',
    await page.evaluate(
      () =>
        document.querySelector('#pose-card').getBoundingClientRect().top >=
        document.querySelector('#viewer').getBoundingClientRect().bottom,
    ),
  );
  ok(
    'El botón MR queda visible al entrar desde móvil',
    await page
      .locator('#enter-mr')
      .evaluate((button) => button.getBoundingClientRect().bottom <= innerHeight),
  );

  const rapid = await context.newPage();
  let requests = 0;
  await rapid.route('**/models/cow.glb', async (route) => {
    requests++;
    await new Promise((resolve) => setTimeout(resolve, 250));
    await route.continue();
  });
  await rapid.goto(url);
  await rapid.waitForFunction(() => window.lab?.ready);
  await rapid.evaluate(() =>
    Promise.all([
      window.lab.loadAnimal('cow'),
      window.lab.loadAnimal('horse'),
      window.lab.loadAnimal('cow'),
    ]),
  );
  ok('Cargas simultáneas comparten una sola petición', requests === 1);
  ok(
    'El último animal solicitado queda activo sin duplicados',
    await rapid.evaluate(
      () =>
        window.lab.ready &&
        window.lab.animal === 'cow' &&
        window.lab.actor.children.length === 4 &&
        window.lab.actor.children.filter((o) => o.visible).length === 1,
    ),
  );

  const stale = await context.newPage();
  await stale.route('**/models/cow.glb', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 200));
    await route.abort();
  });
  await stale.goto(url);
  await stale.waitForFunction(() => window.lab?.ready);
  await stale.evaluate(() =>
    Promise.all([window.lab.loadAnimal('cow'), window.lab.loadAnimal('horse')]),
  );
  ok(
    'Un fallo antiguo no reemplaza una selección posterior',
    await stale.evaluate(
      () =>
        window.lab.ready &&
        window.lab.animal === 'horse' &&
        document.querySelector('#load-state').hidden,
    ),
  );

  const failed = await context.newPage();
  await failed.route('**/models/cow.glb', (route) => route.abort());
  await failed.goto(url);
  await failed.waitForFunction(() => window.lab?.ready);
  await failed.evaluate(() => window.lab.loadAnimal('cow'));
  ok(
    'Un fallo conserva el animal y su información',
    await failed.evaluate(
      () =>
        window.lab.ready &&
        window.lab.animal === 'horse' &&
        document.querySelector('#animal-name').textContent === 'Caballo',
    ),
  );
  ok('El error ofrece reintentar', await failed.locator('#retry-load').isVisible());
  await failed.unroute('**/models/cow.glb');
  await failed.locator('#retry-load').click();
  await failed.waitForFunction(() => window.lab.ready && window.lab.animal === 'cow');
  ok('Reintentar recupera la carga', await failed.locator('#load-state').isHidden());

  const initial = await context.newPage();
  await initial.route('**/models/horse.glb', (route) => route.abort());
  await initial.goto(url);
  await initial.locator('#retry-load').waitFor({ state: 'visible' });
  await initial.locator('#joint').dispatchEvent('change');
  ok('Fallo inicial recuperable', await initial.evaluate(() => !window.lab.ready));
  await initial.unroute('**/models/horse.glb');
  await initial.locator('#retry-load').click();
  await initial.waitForFunction(() => window.lab.ready);
  ok(
    'Reintento inicial completa el modelo',
    await initial.evaluate(() => window.lab.animal === 'horse'),
  );
  ok('Sin errores JavaScript ni recursos inesperados', errors.length === 0);
  await fs.writeFile(
    'assets/review/render-metrics.json',
    JSON.stringify(
      {
        scope: 'Desktop Chromium, screenshot frame; not Quest FPS or a performance benchmark',
        metrics,
      },
      null,
      2,
    ),
  );
} catch (error) {
  failures.push(error.stack || String(error));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  await fs.writeFile(
    reportPath,
    JSON.stringify(
      { url, pass: failures.length === 0, checks, errors, failures, headset_tested: false },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({ pass: failures.length === 0, checks: checks.length, errors, failures }),
  );
}
