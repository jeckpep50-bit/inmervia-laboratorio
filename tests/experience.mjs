import { chromium } from 'playwright';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
process.env.PORT = '0';
const { server } = await import('../server.mjs');
if (!server.listening) await once(server, 'listening');
const checks = [],
  errors = [],
  failures = [];
const ok = (name, value) => {
  assert.ok(value, name);
  checks.push(name);
};
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.TEST_BROWSER || undefined,
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://127.0.0.1:' + server.address().port);
  await page.waitForFunction(() => window.lab?.ready);
  for (const id of ['horse', 'cow']) {
    await page.locator(`[data-animal="${id}"]`).click();
    await page.waitForFunction((id) => window.lab.ready && window.lab.animal === id, id);
    const integrity = await page.evaluate(() => {
      const parts = window.lab.current.parts;
      return {
        triangles: parts.reduce((sum, p) => sum + p.geometry.index.count / 3, 0),
        joints: window.lab.current.joints.length,
        relative: parts.every((p) => p.geometry.morphTargetsRelative),
        closuresHidden: parts.every((p) =>
          (Array.isArray(p.material) ? p.material : [p.material])
            .filter((m) => m.name.includes('didactic_cut'))
            .every((m) => !m.visible),
        ),
      };
    });
    ok(
      id + ': modelo detallado dentro del presupuesto',
      integrity.triangles > 40000 && integrity.triangles <= 80000,
    );
    ok(
      id + ': conserva morphs relativos y oculta cierres ensamblados',
      integrity.relative && integrity.closuresHidden,
    );
    ok(
      id + ': once articulaciones disponibles',
      integrity.joints === 11 && (await page.locator('#joint option').count()) === 11,
    );
    if (id === 'cow') {
      const landmarks = await page.evaluate(() => {
        const lab = window.lab,
          points = [
            [-0.027, 0.472, -0.623],
            [-0.141, 0.472, -0.623],
            [0.001, 0.51, -0.703],
          ],
          nearest = points.map(() => ({ region: null, distance: Infinity })),
          v = lab.actor.position.clone();
        lab.current.root.updateMatrixWorld(true);
        for (const part of lab.current.parts) {
          const vertices = new Set();
          for (const group of part.geometry.groups) {
            if (part.material[group.materialIndex].name.includes('didactic_cut')) continue;
            for (let i = group.start; i < group.start + group.count; i++)
              vertices.add(part.geometry.index.getX(i));
          }
          for (const index of vertices) {
            part.getVertexPosition(index, v);
            part.localToWorld(v);
            lab.actor.worldToLocal(v);
            v.sub(lab.current.root.position);
            points.forEach((point, i) => {
              const distance = Math.hypot(v.x - point[0], v.y - point[1], v.z - point[2]);
              if (distance < nearest[i].distance)
                nearest[i] = { region: part.userData.region, distance };
            });
          }
        }
        return nearest;
      });
      ok(
        'cow: tres referencias de la ubre permanecen en el tronco',
        landmarks.every((point) => point.region === 'thorax' && point.distance < 0.025),
      );
    }
    for (let i = 0; i < 11; i++) {
      await page.locator('#joint').selectOption(String(i));
      await page.locator('#pose').fill('15');
      await page.locator('#pose').dispatchEvent('input');
      ok(
        id + ': movimiento ' + i,
        await page.evaluate((i) => {
          const j = window.lab.current.joints[i];
          return j.angle === 15 && j.bone.quaternion.angleTo(j.rest) > 0.1;
        }, i),
      );
      await page.locator('#reset-pose').click();
    }
    await page.locator('#joint').selectOption('0');
    for (const [view, pos] of [
      ['threequarter', id === 'horse' ? [3, 2.1, 3.6] : [2.5, 1.6, 3]],
      ['side', [5, 1.7, 0]],
      ['front', [0, 1.7, 5]],
      ['rear', [0, 1.7, -5]],
    ]) {
      await page.evaluate((pos) => {
        window.lab.actor.rotation.y = 0;
        window.lab.camera.position.set(...pos);
      }, pos);
      await page.waitForTimeout(150);
      await page.screenshot({ path: `assets/review/${id}-v2-${view}.png`, fullPage: true });
    }
    await page.evaluate(() => {
      window.lab.camera.position.set(4, 2.5, 4.7);
      for (const p of window.lab.current.parts)
        for (const m of Array.isArray(p.material) ? p.material : [p.material]) m.wireframe = true;
    });
    await page.screenshot({ path: `assets/review/${id}-v2-wireframe.png`, fullPage: true });
    await page.evaluate(() => {
      for (const p of window.lab.current.parts)
        for (const m of Array.isArray(p.material) ? p.material : [p.material]) m.wireframe = false;
      window.lab.resetView();
      window.lab.lesson.reset();
    });
    await page.locator('#lesson-start').click();
    for (let i = 0; i < 7; i++) await page.locator('#lesson-help').click();
    ok(
      id + ': ruta pasa de reconocimiento a montaje',
      await page.evaluate(
        () =>
          window.lab.lesson.view.stage === 'assemble' &&
          window.lab.mode === 'assemble' &&
          window.lab.current.pieces.filter((p) => !p.userData.snapped).length === 3,
      ),
    );
    await page.locator('[data-region="head"]').click();
    ok(
      id + ': guía individual visible',
      await page.evaluate(
        () => window.lab.current.guides.children.filter((g) => g.visible).length === 1,
      ),
    );
    ok(
      id + ': cierre visible en el cuello al retirar cabeza',
      await page.evaluate(() => {
        const p = window.lab.current.pieces.find((p) => p.userData.region === 'neck');
        return (Array.isArray(p.material) ? p.material : [p.material]).some(
          (m) =>
            m.name.includes('didactic_cut') && m.userData.closureNeighbor === 'head' && m.visible,
        );
      }),
    );
    await page.locator('#rotate-axis').click();
    await page.locator('#rotate-piece').click();
    ok(
      id + ': giro de pieza sobre el eje elegido',
      await page.evaluate(
        () =>
          window.lab.current.pieces
            .find((p) => p.userData.region === 'head')
            .quaternion.angleTo(
              window.lab.current.pieces.find((p) => p.userData.region === 'head').userData
                .homeQuaternion,
            ) > 0.1,
      ),
    );
    await page.screenshot({ path: `assets/review/${id}-v2-assemble.png`, fullPage: true });
    for (let i = 0; i < 3; i++) await page.locator('#lesson-help').click();
    ok(
      id + ': tres encajes activan evaluación',
      await page.evaluate(
        () => window.lab.lesson.view.stage === 'quiz' && window.lab.lesson.view.score === 29,
      ),
    );
    for (const [question, answer] of [1, 1, 0, 2, 1].entries()) {
      await page.locator(`[data-answer="${answer}"]`).click();
      ok(
        id + ': pregunta ' + question + ' explica la respuesta',
        (await page.locator('#lesson-feedback').textContent()).includes(
          question === 0 ? 'Repasemos.' : 'Correcto.',
        ),
      );
      await page.locator('#lesson-next').click();
    }
    ok(
      id + ': resultado distingue errores y ayudas',
      await page.evaluate(() => {
        const v = window.lab.lesson.view;
        return (
          v.stage === 'done' &&
          v.score === 57 &&
          v.mistakes === 1 &&
          v.assisted === 10 &&
          v.progress === 100
        );
      }),
    );
    await page.locator('.lesson-card details').evaluate((el) => (el.open = true));
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#lesson-export').click(),
    ]);
    const result = JSON.parse(await fs.readFile(await download.path(), 'utf8'));
    ok(
      id + ': descarga resultado anónimo',
      result.completed === true && !('name' in result) && result.animal === id,
    );
    await page.reload();
    await page.waitForFunction(() => window.lab?.ready);
    await page.locator(`[data-animal="${id}"]`).click();
    await page.waitForFunction((id) => window.lab.ready && window.lab.animal === id, id);
    ok(
      id + ': conserva progreso tras recargar',
      await page.evaluate(
        () => window.lab.lesson.view.stage === 'done' && window.lab.lesson.view.score === 57,
      ),
    );
  }
  ok('Sin errores de ejecución', errors.length === 0);
} catch (error) {
  failures.push(error.stack || String(error));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
  await fs.writeFile(
    'assets/review/experience-checks.json',
    JSON.stringify(
      { pass: !failures.length, checks, errors, failures, headset_tested: false },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ pass: !failures.length, checks: checks.length, errors, failures }));
}
