import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../docs/vendor/three/three.module.js';
import { SpatialWorld, planeGeometry } from '../docs/xr-world.js';
const polygon = [
  { x: -2, y: 0, z: -2 },
  { x: 2, y: 0, z: -2 },
  { x: 2, y: 0, z: 2 },
  { x: -2, y: 0, z: 2 },
];
const makeWorld = () =>
  new SpatialWorld(
    new THREE.Scene(),
    new THREE.Group(),
    { xr: { hasDepthSensing: () => false } },
    { makeTransform: (position, orientation) => ({ position, orientation }) },
  );
const transform = {
  matrix: new THREE.Matrix4().toArray(),
  position: { x: 0, y: 0, z: 0 },
  orientation: { x: 0, y: 0, z: 0, w: 1 },
};
test('detected polygons become depth-only geometry with correct triangle bounds', () => {
  const geometry = planeGeometry(polygon);
  assert.equal(geometry.index.count, 6);
  assert.equal(planeGeometry([]), null);
  geometry.dispose();
});
test('room occlusion uses actual planes and removes data no longer tracked', () => {
  const world = makeWorld(),
    plane = { polygon, planeSpace: {}, lastChangedTime: 1 };
  world.start({});
  const frame = { detectedPlanes: new Set([plane]), getPose: () => ({ transform }) };
  world.update(frame, {});
  assert.equal(world.state.planes, 1);
  assert.match(world.state.occlusion, /planos/);
  assert.equal(world.material.colorWrite, false);
  assert.equal(world.material.depthWrite, true);
  const ray = new THREE.Ray(new THREE.Vector3(0, 2, 0), new THREE.Vector3(0, -1, 0));
  assert.ok(world.placementHit(ray));
  assert.equal(world.place(ray), true);
  frame.detectedPlanes.clear();
  world.update(frame, {});
  assert.equal(world.records.size, 0);
  assert.match(world.state.occlusion, /Sin superficies/);
  world.dispose();
});
test('a session without anchor support reports the limitation rather than success', () => {
  const world = makeWorld();
  world.start({});
  world.requestAnchor();
  world.update({ getPose: () => null }, {});
  assert.match(world.state.anchor, /no disponibles/);
  world.dispose();
});
test('late anchors are deleted after exit instead of attaching to a new session', async () => {
  const world = makeWorld();
  let resolve,
    deleted = 0;
  world.start({});
  world.requestAnchor();
  world.update(
    { getPose: () => null, createAnchor: () => new Promise((done) => (resolve = done)) },
    {},
  );
  world.stop();
  resolve({ delete: () => deleted++ });
  await Promise.resolve();
  assert.equal(deleted, 1);
  assert.equal(world.anchor, null);
  world.dispose();
});
test('valid anchor tracking preserves the user-selected model scale', async () => {
  const world = makeWorld();
  world.start({});
  world.actor.scale.setScalar(0.6);
  const anchor = { anchorSpace: {}, delete() {} };
  const frame = {
    getPose: () => ({ transform: { ...transform, position: { x: 1, y: 0, z: 2 } } }),
    createAnchor: async () => anchor,
  };
  world.requestAnchor();
  world.update(frame, {});
  await Promise.resolve();
  world.update(frame, {});
  assert.deepEqual(world.actor.position.toArray(), [1, 0, 2]);
  assert.equal(world.actor.scale.x, 0.6);
  assert.match(world.state.anchor, /Anclado/);
  world.dispose();
});
