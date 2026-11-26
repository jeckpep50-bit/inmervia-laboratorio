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
    const interactions = await page.evaluate(async (species) => {
      const { AnimalGesture, RegionNames } = await import('./interactions.js?v=0.4.0');
      const { ZONES } = await import('./zones.js?v=0.4.0');
      const { current, actor, renderer, scene } = window.lab;
      const gesture = new AnimalGesture();
      const base = current.root.position.y;
      gesture.start(current, species);
      gesture.update(1000);
      gesture.update(1580);
      const moved =
        species === 'horse'
          ? current.root.position.y > base + 0.15
          : current.tongue.visible && current.tongue.scale.z > 0.06;
      gesture.update(3000);
      const restored =
        current.root.position.y === base &&
        !current.tongue?.visible &&
        current.joints.every((j) => j.bone.quaternion.angleTo(j.rest) < 0.001);
      const names = new RegionNames(ZONES);
      const head = current.pieces.find((p) => p.userData.region === 'head');
      names.update(current, actor, 'assemble', true);
      const before = names.tags[0].sprite.position.clone();
      head.position.x += 0.25;
      names.update(current, actor, 'assemble', true);
      const follows = Math.abs(before.distanceTo(names.tags[0].sprite.position) - 0.25) < 0.001;
      head.position.x -= 0.25;
      names.update(current, actor, 'assemble', false);
      for (const tag of names.tags) {
        tag.sprite.material.map.dispose();
        tag.sprite.material.dispose();
        tag.line.geometry.dispose();
        tag.line.material.dispose();
      }
      const texts = [];
      const proto = CanvasRenderingContext2D.prototype,
        fill = proto.fillText;
      proto.fillText = function (...args) {
        texts.push(args[0]);
        return fill.apply(this, args);
      };
      try {
        renderer.xr.dispatchEvent({ type: 'sessionstart' });
        const panel = scene.children.find((o) => o.material?.map?.image?.height === 1190);
        panel.position.set(10, 1, 0);
        panel.updateMatrixWorld(true);
        const c = renderer.xr.getController(0);
        function click(x, y) {
          c.position.set(10 + (x / 1024 - 0.5) * 0.84, 1 + (0.5 - y / 1190) * 0.976, 0.5);
          c.quaternion.identity();
          c.updateMatrix();
          c.dispatchEvent({ type: 'selectstart' });
        }
        const explore =
          texts.includes(species === 'horse' ? 'Ver salto' : 'Ver lamida') &&
          texts.includes('Mostrar nombres') &&
          !texts.includes('Aprender');
        click(690, 670);
        const toggles = texts.includes('Ocultar nombres');
        click(690, 670);
        texts.length = 0;
        click(466, 473);
        const assembly = texts.includes('Encajar con ayuda') && !texts.includes('Región siguiente');
        texts.length = 0;
        click(790, 473);
        const room =
          texts.includes('Colocar en superficie') &&
          !texts.includes('Más grande') &&
          actor.scale.x === 1.2;
        c.position.set(0, 0, 0);
        c.updateMatrix();
        panel.position.set(0, 0, 0);
        return { moved, restored, follows, explore, toggles, assembly, room };
      } finally {
        renderer.xr.dispatchEvent({ type: 'sessionend' });
        proto.fillText = fill;
        window.lab.setMode('explore');
      }
    }, id);
    for (const [check, pass] of Object.entries(interactions)) ok(id + ' · ' + check, pass);
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
      window.lab.setMode('assemble');
      window.lab.explode();
      window.lab.select('head');
    });
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
    await page.locator('#restore').click();
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
