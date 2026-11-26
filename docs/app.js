import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DragControls } from 'three/addons/controls/DragControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { ZONES, ANIMALS, JOINTS } from './zones.js?v=0.3.0';
import { createAssetStore, boundedScale, startImmersiveSession } from './runtime.js?v=0.3.0';
import {
  collectRegions,
  outlineFor,
  showOutline,
  setClosures,
  isClosure,
  filterHiddenMaterials,
  breathe,
} from './model-tools.js?v=0.3.0';
import { LessonSession } from './lesson.js?v=0.3.0';
import { SensoryFeedback } from './sensory.js?v=0.3.0';
import { SpatialWorld } from './xr-world.js?v=0.3.0';
import { paintXRPanel } from './xr-panel.js?v=0.3.0';

const $ = (id) => document.getElementById(id);
const viewer = $('viewer');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.setClearColor(0x000000, 0);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
viewer.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(39, 1, 0.05, 100);
camera.position.set(4, 2.5, 4.7);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.95, 0);
controls.enableDamping = true;
controls.minDistance = 1.4;
controls.maxDistance = 12;
controls.maxPolarAngle = Math.PI * 0.49;
const pmrem = new THREE.PMREMGenerator(renderer),
  room = new RoomEnvironment();
const environmentTarget = pmrem.fromScene(room, 0.04);
scene.environment = environmentTarget.texture;
room.dispose();
pmrem.dispose();
const hemi = new THREE.HemisphereLight(0xffffff, 0x8e8278, 1.25);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xfff3e8, 1.9);
key.position.set(-3, 6, 4);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.left = -3;
key.shadow.camera.right = 3;
key.shadow.camera.top = 3;
key.shadow.camera.bottom = -3;
key.shadow.camera.near = 0.1;
key.shadow.camera.far = 15;
key.shadow.bias = -0.0002;
key.shadow.normalBias = 0.015;
key.shadow.radius = 3;
scene.add(key);
const fill = new THREE.DirectionalLight(0xcbe5ee, 0.8);
fill.position.set(4, 3, -3);
scene.add(fill);
const ground = new THREE.Group();
scene.add(ground);
const grid = new THREE.GridHelper(12, 48, 0xcbbfc8, 0xe5dedb);
grid.material.transparent = true;
grid.material.opacity = 0.24;
ground.add(grid);
const actor = new THREE.Group();
actor.rotation.y = 0.35;
scene.add(actor);
const sensory = new SensoryFeedback(scene, camera);
const spatial = new SpatialWorld(scene, actor, renderer, {
  onChange: (state) => {
    if ($('spatial-state')) $('spatial-state').textContent = state.anchor + ' · ' + state.occlusion;
    drawXRPanel();
  },
});
const floorShadow = new THREE.Mesh(
  new THREE.PlaneGeometry(8, 8),
  new THREE.ShadowMaterial({ opacity: 0.2, depthWrite: false }),
);
floorShadow.rotation.x = -Math.PI / 2;
floorShadow.receiveShadow = true;
floorShadow.position.y = 0.003;
scene.add(floorShadow);
const lessons = new Map();
let lesson = null,
  lessonStage = null,
  hovered = null,
  guidesVisible = true,
  xrTab = 'explore',
  lastHoverTime = 0;
let practiceStorage = null,
  noticeText = '',
  activeHand = null;
try {
  practiceStorage = window.localStorage;
} catch {}
const loader = new GLTFLoader(),
  raycaster = new THREE.Raycaster(),
  pointer = new THREE.Vector2();
loader.setMeshoptDecoder(MeshoptDecoder);
const models = createAssetStore(prepareAnimal);
let current = null,
  animal = 'horse',
  mode = 'explore',
  selected = null,
  loading = false,
  labelsVisible = false,
  jointIndex = 0,
  drag = null;
let loadSequence = 0,
  savedDesktop = null,
  toastTimer,
  failedAnimal = null;
let xrSupported = false,
  xrStarting = false,
  placementPending = false;
const visited = { horse: new Set(), cow: new Set() };
const labelEls = ZONES.map((z) => {
  const el = document.createElement('div');
  el.className = 'region-label';
  el.textContent = z.name;
  el.hidden = true;
  viewer.append(el);
  return el;
});
function status(text, success = false) {
  clearTimeout(toastTimer);
  if (!success) noticeText = '';
  $('xr-status').textContent = text;
  $('xr-status').classList.toggle('toast', success);
}
function toast(text) {
  noticeText = text;
  status(text, true);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    status(defaultStatus);
    drawXRPanel();
  }, 4500);
  drawXRPanel();
}
let defaultStatus = '';

ZONES.forEach((z, i) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.region = z.id;
  b.innerHTML = `<span>${String(i + 1).padStart(2, '0')}</span>${z.name}`;
  b.addEventListener('click', () => select(z.id, { assisted: true }));
  $('regions').append(b);
});
JOINTS.forEach((j, i) => {
  const o = document.createElement('option');
  o.value = i;
  o.textContent = j.label;
  $('joint').append(o);
});
function meshes() {
  return current ? (mode === 'assemble' ? current.pieces : current.parts) : [];
}
function materials(o) {
  return Array.isArray(o.material) ? o.material : [o.material];
}
function regionText(zone) {
  return animal === 'cow' && zone?.cowText ? zone.cowText : zone?.text;
}
function select(id, { assisted = false, userInitiated = true, controller = null } = {}) {
  const z = ZONES.find((z) => z.id === id),
    i = ZONES.indexOf(z);
  if (!current || !z) return;
  selected = id;
  visited[animal].add(id);
  $('region-number').textContent = `REGIÓN ${String(i + 1).padStart(2, '0')} / 10`;
  $('region-name').textContent = z.name;
  $('region-text').textContent = regionText(z);
  $('challenge').textContent = z.prompt;
  $('visited').textContent = `${visited[animal].size} / 10`;
  document.querySelectorAll('[data-region]').forEach((b) => {
    b.classList.toggle('active', b.dataset.region === id);
    b.classList.toggle('visited', visited[animal].has(b.dataset.region));
  });
  [...current.parts, ...current.pieces].forEach((o) =>
    materials(o).forEach((m) => {
      m.emissive?.set(o.userData.region === id ? 0x237b82 : 0x000000);
      m.emissiveIntensity = o.userData.region === id ? 0.035 : 0;
    }),
  );
  updateHighlights();
  updateGuides();
  if (userInitiated) {
    sensory.play('select', regionWorldPosition(id), controller);
    const result = lesson?.select(id, { assisted });
    if (result !== null && result !== undefined) syncLesson();
  }
  drawXRPanel();
}
function regionWorldPosition(id) {
  const piece = current?.pieces.find((p) => p.userData.region === id);
  return mode === 'assemble' && piece
    ? piece.getWorldPosition(new THREE.Vector3())
    : current?.centers.has(id)
      ? actor.localToWorld(current.centers.get(id).clone())
      : actor.position.clone();
}
function updateHighlights() {
  if (!current) return;
  for (const mesh of [...current.parts, ...current.pieces])
    showOutline(
      mesh,
      mesh.userData.region === selected || mesh.userData.region === hovered,
      mesh.userData.region === selected ? 0x31bcc4 : 0xf5a13a,
    );
}
function updateGuides() {
  if (!current?.guides) return;
  for (const guide of current.guides.children) {
    const piece = current.pieces.find((p) => p.userData.region === guide.userData.region);
    guide.visible =
      mode === 'assemble' &&
      guidesVisible &&
      guide.userData.region === selected &&
      !piece.userData.snapped;
  }
}
function snapPreview(piece) {
  if (!piece || !current) return;
  const pos = current.assembly.worldToLocal(piece.getWorldPosition(new THREE.Vector3()));
  const near = pos.distanceTo(piece.userData.home) < 0.2;
  const q = current.assembly
    .getWorldQuaternion(new THREE.Quaternion())
    .invert()
    .multiply(piece.getWorldQuaternion(new THREE.Quaternion()));
  const aligned = q.angleTo(piece.userData.homeQuaternion) < THREE.MathUtils.degToRad(28);
  const ready = near && aligned;
  const guide = current.guides?.children.find((g) => g.userData.region === piece.userData.region);
  if (guide)
    for (const material of materials(guide)) material.color.set(ready ? 0x52ba81 : 0x31bcc4);
  if ($('snap-status'))
    $('snap-status').textContent = ready
      ? 'Suelta para encajar.'
      : near
        ? 'La posición coincide. Ajusta el giro de la pieza.'
        : 'Acerca la pieza a su silueta para encajar.';
  if (ready && !piece.userData.wasReady) {
    const controller = controllers.find((c) => c.userData.held === piece);
    sensory.pulse(controller, 0.18, 25);
  }
  piece.userData.wasReady = ready;
}
function bakePieces(parts, closedSegments = false) {
  actor.updateMatrixWorld(true);
  const inverse = new THREE.Matrix4().copy(actor.matrixWorld).invert();
  return parts.map((source) => {
    const geometry = source.geometry.clone(),
      pos = geometry.getAttribute('position'),
      v = new THREE.Vector3();
    const toLocal = new THREE.Matrix4().multiplyMatrices(inverse, source.matrixWorld);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      source.applyBoneTransform(i, v);
      v.applyMatrix4(toLocal);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    pos.needsUpdate = true;
    geometry.deleteAttribute('skinIndex');
    geometry.deleteAttribute('skinWeight');
    geometry.morphAttributes = {};
    geometry.morphTargetsRelative = false;
    geometry.computeVertexNormals();
    geometry.computeTangents();
    geometry.computeBoundingBox();
    const center = geometry.boundingBox.getCenter(new THREE.Vector3());
    geometry.translate(-center.x, -center.y, -center.z);
    geometry.computeBoundingSphere();
    const clones = materials(source).map((material) => {
      const copy = material.clone();
      copy.side = isClosure(copy)
        ? THREE.DoubleSide
        : closedSegments
          ? THREE.FrontSide
          : THREE.DoubleSide;
      return copy;
    });
    const mat = Array.isArray(source.material) ? clones : clones[0];
    const piece = new THREE.Mesh(geometry, mat);
    filterHiddenMaterials(piece);
    piece.position.copy(center);
    piece.name = 'piece_' + source.userData.region;
    piece.userData = {
      region: source.userData.region,
      home: center.clone(),
      homeQuaternion: new THREE.Quaternion(),
      snapped: true,
    };
    return piece;
  });
}
function disposeObjects(...objects) {
  const geometries = new Set(),
    mats = new Set(),
    textures = new Set(),
    skeletons = new Set(),
    images = new Set();
  objects.filter(Boolean).forEach((root) =>
    root.traverse((o) => {
      if (o.geometry) geometries.add(o.geometry);
      if (o.skeleton) skeletons.add(o.skeleton);
      if (o.material)
        materials(o).forEach((m) => {
          mats.add(m);
          Object.values(m).forEach((v) => {
            if (v?.isTexture) textures.add(v);
          });
        });
    }),
  );
  geometries.forEach((g) => g.dispose());
  mats.forEach((m) => m.dispose());
  textures.forEach((t) => t.dispose());
  textures.forEach((t) => {
    if (typeof t.image?.close === 'function') images.add(t.image);
  });
  skeletons.forEach((s) => s.dispose());
  images.forEach((image) => image.close());
}
async function prepareAnimal(id) {
  let root, assembly;
  try {
    const embedded = window.__INMERVIA_MODELS__?.[id];
    const gltf = embedded
      ? await loader.parseAsync(Uint8Array.from(atob(embedded), (c) => c.charCodeAt(0)).buffer, '')
      : await loader.loadAsync(ANIMALS[id].file);
    root = gltf.scene;
    root.visible = false;
    actor.add(root);
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root, true),
      center = box.getCenter(new THREE.Vector3());
    const localCenter = actor.worldToLocal(center.clone());
    // Normalize the loaded authored root, retaining its skin hierarchy.
    root.position.x -= localCenter.x;
    root.position.z -= localCenter.z;
    root.updateMatrixWorld(true);
    const parts = collectRegions(root);
    if (parts.length !== 10) throw new Error('El modelo no contiene las diez regiones esperadas.');
    for (const part of parts) {
      setClosures(part, false);
      part.castShadow = true;
      part.receiveShadow = true;
    }
    const bones = [];
    root.traverse((o) => {
      if (o.isBone) {
        o.quaternion.normalize();
        bones.push(o);
      }
    });
    root.updateMatrixWorld(true);
    const tail = bones.find(
      (b) => b.name === `${ANIMALS[id].prefix}_Tail` || b.name === `${ANIMALS[id].prefix} Tail`,
    );
    if (tail && !ANIMALS[id].tailRestReady) {
      let tip = tail;
      while (tip.children.find((c) => c.isBone)) tip = tip.children.find((c) => c.isBone);
      const a = tail.getWorldPosition(new THREE.Vector3()),
        b = tip.getWorldPosition(new THREE.Vector3()),
        direction = b.sub(a).normalize();
      if (direction.lengthSq() > 0.5) {
        const delta = new THREE.Quaternion().setFromUnitVectors(
          direction,
          new THREE.Vector3(0, -1, 0),
        );
        const target = delta.multiply(tail.getWorldQuaternion(new THREE.Quaternion()));
        tail.quaternion.copy(
          tail.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(target),
        );
        root.updateMatrixWorld(true);
      }
    }
    const pieces = bakePieces(parts, ANIMALS[id].closedSegments);
    for (const part of parts) outlineFor(part, true);
    assembly = new THREE.Group();
    pieces.forEach((p) => assembly.add(p));
    assembly.visible = false;
    actor.add(assembly);
    const guides = new THREE.Group();
    assembly.add(guides);
    for (const piece of pieces) {
      piece.castShadow = true;
      piece.receiveShadow = true;
      outlineFor(piece);
      setClosures(piece, false);
      const ghostMaterials = materials(piece).map(
        (material) =>
          new THREE.MeshBasicMaterial({
            color: 0x31bcc4,
            transparent: true,
            opacity: 0.13,
            wireframe: false,
            side: THREE.DoubleSide,
            depthWrite: false,
            visible: !isClosure(material),
          }),
      );
      const guide = new THREE.Mesh(
        piece.geometry,
        Array.isArray(piece.material) ? ghostMaterials : ghostMaterials[0],
      );
      guide.position.copy(piece.userData.home);
      guide.userData.region = piece.userData.region;
      guide.visible = false;
      guides.add(guide);
    }
    const joints = JOINTS.map((j) => {
      const bone = bones.find(
        (b) =>
          b.name === `${ANIMALS[id].prefix} ${j.suffix}` ||
          b.name === `${ANIMALS[id].prefix}_${j.suffix.replaceAll(' ', '_')}`,
      );
      if (!bone) throw new Error('Articulación ausente: ' + j.label);
      bone.quaternion.normalize();
      const worldAxis = new THREE.Vector3(
        j.axis === 'x' ? 1 : 0,
        j.axis === 'y' ? 1 : 0,
        0,
      ).applyQuaternion(actor.getWorldQuaternion(new THREE.Quaternion()));
      const axis = worldAxis
        .applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion()).invert())
        .normalize();
      return { bone, rest: bone.quaternion.clone(), axis, angle: 0 };
    });
    return {
      root,
      parts,
      pieces,
      assembly,
      guides,
      joints,
      centers: new Map(pieces.map((p) => [p.userData.region, p.userData.home.clone()])),
    };
  } catch (error) {
    disposeObjects(root, assembly);
    root?.removeFromParent();
    assembly?.removeFromParent();
    throw error;
  }
}
function showLoading(id) {
  failedAnimal = null;
  $('load-state').hidden = false;
  $('load-state').classList.remove('failed');
  $('load-message').textContent = 'Preparando ' + ANIMALS[id].name.toLowerCase() + '…';
  $('load-spinner').hidden = false;
  $('retry-load').hidden = true;
}
function updateXRButton() {
  $('enter-mr').disabled = xrStarting || loading || renderer.xr.isPresenting;
  $('enter-mr').textContent = xrStarting ? 'Solicitando permiso…' : 'Entrar en realidad mixta';
}
async function loadAnimal(id) {
  if (!Object.hasOwn(ANIMALS, id)) return false;
  const ticket = ++loadSequence;
  releaseAll();
  loading = true;
  showLoading(id);
  updateXRButton();
  drawXRPanel();
  try {
    const datum = await models.get(id);
    if (ticket !== loadSequence) return false;
    if (current) {
      current.root.visible = false;
      current.assembly.visible = false;
    }
    current = datum;
    animal = id;
    if (!lessons.has(id)) lessons.set(id, new LessonSession(id, practiceStorage));
    lesson = lessons.get(id);
    lessonStage = null;
    selected = null;
    restorePieces(false);
    setMode('explore');
    $('animal-name').textContent = ANIMALS[id].name;
    $('animal-scientific').textContent = ANIMALS[id].scientific;
    document
      .querySelectorAll('[data-animal]')
      .forEach((b) => b.classList.toggle('active', b.dataset.animal === id));
    $('reference').hidden = id !== 'horse';
    select('head', { userInitiated: false });
    syncLesson();
    if (!renderer.xr.isPresenting) resetView();
    updateDrag();
    $('load-state').hidden = true;
    status(defaultStatus);
    return true;
  } catch (error) {
    if (ticket !== loadSequence) return false;
    console.error('Carga de ' + id + ':', error);
    failedAnimal = id;
    $('load-state').classList.add('failed');
    $('load-message').textContent =
      'No se pudo cargar ' + ANIMALS[id].name.toLowerCase() + '. Puedes volver a intentarlo.';
    $('load-spinner').hidden = true;
    $('retry-load').hidden = false;
    status(
      current
        ? 'Se conserva el animal anterior mientras reintentas la carga.'
        : 'No se pudo cargar el animal. Pulsa «Reintentar».',
    );
    return false;
  } finally {
    if (ticket === loadSequence) {
      loading = false;
      updateXRButton();
      renderLesson();
      drawXRPanel();
    }
  }
}
function setMode(next) {
  if (!current || !['explore', 'assemble'].includes(next)) return;
  releaseAll();
  mode = next;
  resetPose();
  current.root.visible = next === 'explore';
  current.assembly.visible = next === 'assemble';
  $('pose-card').hidden = next !== 'explore';
  $('assembly-card').hidden = next !== 'assemble';
  document
    .querySelectorAll('[data-mode]')
    .forEach((b) => b.classList.toggle('active', b.dataset.mode === next));
  $('mode-note').textContent =
    next === 'explore'
      ? 'Selecciona una región para conocerla.'
      : 'Separa y vuelve a colocar las diez piezas.';
  $('viewer-hint').textContent =
    next === 'explore'
      ? 'Arrastra para girar · Rueda para acercar · Clic para seleccionar'
      : 'Arrastra las piezas · Acércalas a su lugar para encajar';
  if (drag) drag.enabled = next === 'assemble' && !renderer.xr.isPresenting;
  controls.enabled = !renderer.xr.isPresenting;
  hovered = null;
  updateHighlights();
  updateGuides();
  updateCount();
  drawXRPanel();
}
function setPose(angle) {
  const value = Number(angle);
  if (!current || mode !== 'explore' || !Number.isFinite(value)) return;
  const j = current.joints[jointIndex];
  j.angle = THREE.MathUtils.clamp(value, -25, 25);
  j.bone.quaternion
    .copy(j.rest)
    .multiply(new THREE.Quaternion().setFromAxisAngle(j.axis, THREE.MathUtils.degToRad(j.angle)));
  refreshBounds();
  $('pose').value = j.angle;
  $('pose-value').textContent = j.angle + '°';
  drawXRPanel();
}
function refreshBounds() {
  current.root.updateMatrixWorld(true);
  current.parts.forEach((p) => {
    p.computeBoundingBox();
    p.computeBoundingSphere();
    const world = p.localToWorld(p.boundingBox.getCenter(new THREE.Vector3()));
    current.centers.set(p.userData.region, actor.worldToLocal(world));
  });
}
function resetPose() {
  if (!current) return;
  current.joints.forEach((j) => {
    j.bone.quaternion.copy(j.rest);
    j.angle = 0;
  });
  refreshBounds();
  $('pose').value = 0;
  $('pose-value').textContent = '0°';
}
function updateCount() {
  if (!current) return;
  const n = current.pieces.filter((p) => p.userData.snapped).length;
  $('assembly-count').textContent = `${n} / 10 piezas en su sitio`;
  const detached = new Set(
    current.pieces.filter((p) => !p.userData.snapped).map((p) => p.userData.region),
  );
  for (const piece of current.pieces)
    setClosures(
      piece,
      mode === 'assemble' && !piece.userData.snapped,
      mode === 'assemble' ? detached : new Set(),
    );
  updateGuides();
  drawXRPanel();
}
function restorePieces(message = true) {
  if (!current) return;
  releaseAll();
  current.pieces.forEach((p) => {
    p.position.copy(p.userData.home);
    p.quaternion.copy(p.userData.homeQuaternion);
    p.scale.setScalar(1);
    p.userData.snapped = true;
  });
  updateCount();
  if (message && lesson?.view.active && lesson.view.stage === 'assemble') {
    for (const id of [...lesson.view.remaining]) lesson.assemble(id, { assisted: true });
    syncLesson();
  }
  if (message) toast('Las diez piezas vuelven a su posición inicial.');
}
function explode(ids = null) {
  if (!current) return;
  if (mode !== 'assemble') setMode('assemble');
  releaseAll();
  actor.updateMatrixWorld(true);
  const view = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
  const inv = new THREE.Matrix4().copy(actor.matrixWorld).invert();
  const right = new THREE.Vector3(1, 0, 0)
    .applyQuaternion(view.getWorldQuaternion(new THREE.Quaternion()))
    .transformDirection(inv);
  const up = new THREE.Vector3(0, 1, 0)
    .applyQuaternion(view.getWorldQuaternion(new THREE.Quaternion()))
    .transformDirection(inv);
  current.pieces.forEach((p) => {
    if (ids && !ids.includes(p.userData.region)) return;
    const i = ZONES.findIndex((z) => z.id === p.userData.region),
      a = (i * Math.PI * 2) / 10;
    const dir = right.clone().multiplyScalar(Math.cos(a)).addScaledVector(up, Math.sin(a));
    const lessonOffsets = { head: [0.88, 0.1], fore_left: [-0.9, -0.2], hind_right: [-1.15, 0.25] };
    const offset = ids && lessonOffsets[p.userData.region];
    if (offset)
      p.position
        .copy(p.userData.home)
        .addScaledVector(right, offset[0])
        .addScaledVector(up, offset[1]);
    else p.position.copy(p.userData.home).addScaledVector(dir, 0.72 + (i % 3) * 0.08);
    p.quaternion.identity();
    p.userData.snapped = false;
  });
  updateCount();
}
function trySnap(p, assisted = false, record = true, controller = null) {
  const close = p.position.distanceTo(p.userData.home) < 0.2,
    aligned = p.quaternion.angleTo(p.userData.homeQuaternion) < THREE.MathUtils.degToRad(28);
  if (close && aligned) {
    p.position.copy(p.userData.home);
    p.quaternion.copy(p.userData.homeQuaternion);
    p.userData.snapped = true;
    toast('Pieza colocada: ' + ZONES.find((z) => z.id === p.userData.region).name);
    if (record) {
      sensory.play('snap', p.getWorldPosition(new THREE.Vector3()), controller);
      const result = lesson?.assemble(p.userData.region, { assisted });
      if (result) syncLesson();
    }
  } else p.userData.snapped = false;
  updateCount();
  return p.userData.snapped;
}
function selectedPiece() {
  return current?.pieces.find((p) => p.userData.region === selected);
}
function updateDrag() {
  if (drag) drag.dispose();
  controls.enabled = !renderer.xr.isPresenting;
  drag = new DragControls(current.pieces, camera, renderer.domElement);
  drag.recursive = false;
  drag.enabled = mode === 'assemble' && !renderer.xr.isPresenting;
  drag.addEventListener('dragstart', (e) => {
    controls.enabled = false;
    e.object.userData.snapped = false;
    select(e.object.userData.region);
    updateCount();
  });
  drag.addEventListener('drag', (e) => snapPreview(e.object));
  drag.addEventListener('dragend', (e) => {
    controls.enabled = true;
    trySnap(e.object);
  });
}
function resetView() {
  if (renderer.xr.isPresenting) {
    placeInRoom();
    return;
  }
  if (animal === 'cow') camera.position.set(2.5, 1.6, 3);
  else camera.position.set(3, 2.1, 3.6);
  controls.target.set(0, animal === 'cow' ? 0.72 : 1, 0);
  actor.position.set(0, 0, 0);
  actor.rotation.set(0, 0.35, 0);
  actor.scale.setScalar(1);
  controls.update();
}
function renderLesson() {
  if (!lesson) return;
  const view = lesson.view;
  $('lesson-title').textContent =
    view.active || view.stage === 'done' ? view.title : 'Observa, reconstruye y explica';
  $('lesson-instruction').textContent =
    view.active || view.stage === 'done'
      ? view.instruction
      : 'Reconoce siete regiones, reconstruye tres piezas y responde cinco preguntas.';
  $('lesson-progress').value = view.progress;
  $('lesson-feedback').textContent = view.feedback;
  $('lesson-feedback').hidden = !view.active && view.stage !== 'done';
  $('lesson-start').hidden = view.active;
  $('lesson-start').disabled = !current || loading;
  $('lesson-start').textContent =
    view.stage === 'done' ? 'Nuevo recorrido' : view.progress ? 'Continuar' : 'Comenzar';
  $('lesson-next').hidden = view.stage !== 'quiz' || !view.answered;
  $('lesson-help').hidden = !view.active || !['explore', 'orient', 'assemble'].includes(view.stage);
  $('lesson-score').textContent = 'Mi práctica · ' + view.score + '/100 puntos';
  $('lesson-result').textContent =
    view.mistakes +
    ' intentos para repasar · ' +
    view.assisted +
    ' acciones con ayuda. El progreso se guarda solo en este navegador, sin nombres ni envío a un servidor.';
  $('lesson-choices').replaceChildren();
  if (view.active && view.question)
    view.question.options.forEach((text, index) => {
      const button = document.createElement('button');
      button.textContent = String.fromCharCode(65 + index) + '. ' + text;
      button.dataset.answer = index;
      button.disabled = view.answered;
      button.addEventListener('click', () => answerLesson(index));
      $('lesson-choices').append(button);
    });
}
function syncLesson() {
  if (!lesson) return;
  const view = lesson.view,
    changed = lessonStage !== view.stage;
  lessonStage = view.stage;
  if (view.active && changed) {
    if (view.stage === 'assemble') {
      setMode('assemble');
      restorePieces(false);
      explode(view.remaining);
    } else setMode('explore');
  }
  renderLesson();
  drawXRPanel();
}
function startLesson() {
  if (!lesson) return;
  sensory.unlock();
  lesson.start();
  lessonStage = null;
  syncLesson();
}
function answerLesson(index) {
  const correct = lesson?.answer(index);
  if (correct !== null && correct !== undefined) {
    sensory.play(correct ? 'snap' : 'wrong', actor.position);
    syncLesson();
  }
}
function helpLesson() {
  if (!lesson) return;
  if (lesson.view.stage === 'assemble') {
    const id = lesson.view.remaining[0],
      piece = current.pieces.find((p) => p.userData.region === id);
    if (piece) {
      releaseAll();
      select(id, { userInitiated: false });
      piece.position.copy(piece.userData.home);
      piece.quaternion.copy(piece.userData.homeQuaternion);
      trySnap(piece, true);
    }
  } else {
    const id = lesson.expected();
    if (id) select(id, { assisted: true });
  }
}
function speakCurrent() {
  const text = lesson?.view.active
    ? lesson.view.title + '. ' + lesson.view.instruction
    : regionText(ZONES.find((z) => z.id === selected)) || 'Selecciona una región del animal.';
  if (!sensory.speak(text))
    toast('La voz no está disponible en este navegador. La explicación permanece en pantalla.');
}
function focusRegion() {
  if (renderer.xr.isPresenting) {
    toast('Ajusta el tamaño desde el panel para observar la región.');
    return;
  }
  if (!current || !selected) return;
  const target = regionWorldPosition(selected),
    direction = camera.position.clone().sub(target).normalize();
  controls.minDistance = 0.35;
  camera.position.copy(target).addScaledVector(direction, 1.35);
  controls.target.copy(target);
  controls.update();
}
let rotationAxis = 'y';
function rotateSelected(axis = rotationAxis, angle = 15) {
  const piece = selectedPiece();
  if (!piece || mode !== 'assemble') return;
  const vector = new THREE.Vector3(
    axis === 'x' ? 1 : 0,
    axis === 'y' ? 1 : 0,
    axis === 'z' ? 1 : 0,
  );
  piece.rotateOnAxis(vector, THREE.MathUtils.degToRad(angle));
  piece.userData.snapped = false;
  updateCount();
  snapPreview(piece);
}
function toggleGuides() {
  guidesVisible = !guidesVisible;
  $('toggle-guides').setAttribute('aria-pressed', String(guidesVisible));
  updateGuides();
  drawXRPanel();
}
function toggleSound() {
  const enabled = sensory.toggle();
  $('toggle-sound').textContent = enabled ? 'Sonido activado' : 'Sonido desactivado';
  $('toggle-sound').setAttribute('aria-pressed', String(enabled));
  drawXRPanel();
}
$('lesson-start').addEventListener('click', startLesson);
$('lesson-next').addEventListener('click', () => {
  lesson?.next();
  syncLesson();
});
$('lesson-help').addEventListener('click', helpLesson);
$('lesson-reset').addEventListener('click', () => {
  lesson?.reset();
  lessonStage = null;
  syncLesson();
});
$('lesson-export').addEventListener('click', () => {
  if (!lesson) return;
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(lesson.result(), null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = 'inmervia-practica-' + animal + '.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('read-region').addEventListener('click', speakCurrent);
$('toggle-sound').addEventListener('click', toggleSound);
$('focus-region').addEventListener('click', focusRegion);
$('toggle-guides').addEventListener('click', toggleGuides);
$('rotate-axis').addEventListener('click', () => {
  rotationAxis = ['x', 'y', 'z'][(['x', 'y', 'z'].indexOf(rotationAxis) + 1) % 3];
  $('rotate-axis').textContent = 'Eje de giro: ' + rotationAxis.toUpperCase();
});
viewer.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() === 'r' && mode === 'assemble') {
    event.preventDefault();
    rotateSelected(rotationAxis, event.shiftKey ? -15 : 15);
  }
});
$('place-room').addEventListener('click', () => {
  if (!renderer.xr.isPresenting) return;
  const placing = spatial.togglePlacement();
  toast(
    placing
      ? 'Apunta al suelo o a una superficie horizontal y pulsa el gatillo.'
      : 'Colocación cancelada.',
  );
  drawXRPanel();
});
$('anchor-room').addEventListener('click', () => spatial.requestAnchor());
$('clear-anchor-room').addEventListener('click', () => spatial.clearAnchor());
$('capture-room').addEventListener('click', async () => toast(await spatial.captureRoom()));
$('occlusion-toggle').addEventListener('change', (event) => {
  spatial.setOcclusion(event.target.checked);
  drawXRPanel();
});
document
  .querySelectorAll('[data-animal]')
  .forEach((b) => b.addEventListener('click', () => loadAnimal(b.dataset.animal)));
document
  .querySelectorAll('[data-mode]')
  .forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
$('joint').addEventListener('change', (e) => {
  if (!current) return;
  const index = Number(e.target.value);
  if (!Number.isInteger(index) || !current.joints[index]) return;
  jointIndex = index;
  $('pose').value = current.joints[jointIndex].angle;
  $('pose-value').textContent = $('pose').value + '°';
  drawXRPanel();
});
$('retry-load').addEventListener('click', () => {
  if (failedAnimal) loadAnimal(failedAnimal);
});
$('pose').addEventListener('input', (e) => setPose(e.target.value));
$('reset-pose').addEventListener('click', () => {
  resetPose();
  drawXRPanel();
});
$('explode').addEventListener('click', () => explode());
$('restore').addEventListener('click', () => restorePieces());
$('rotate-piece').addEventListener('click', () => {
  rotateSelected();
});
$('fit-piece').addEventListener('click', () => {
  const p = selectedPiece();
  if (p) {
    releaseAll();
    p.position.copy(p.userData.home);
    p.quaternion.identity();
    trySnap(p, true);
  }
});
$('reset-view').addEventListener('click', resetView);
$('labels').addEventListener('click', () => {
  labelsVisible = !labelsVisible;
  $('labels').textContent = labelsVisible ? 'Ocultar nombres' : 'Mostrar nombres';
});
$('help').addEventListener('click', () => $('help-dialog').showModal());
$('reference').addEventListener('click', () => $('reference-dialog').showModal());
document
  .querySelectorAll('[data-close]')
  .forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
let down = null;
renderer.domElement.addEventListener('pointerdown', (e) => {
  down = e.button === 0 ? { id: e.pointerId, x: e.clientX, y: e.clientY } : null;
});
renderer.domElement.addEventListener('pointercancel', () => {
  down = null;
  controls.enabled = !renderer.xr.isPresenting;
});
renderer.domElement.addEventListener('pointerup', (e) => {
  const start = down;
  down = null;
  if (
    renderer.xr.isPresenting ||
    !start ||
    start.id !== e.pointerId ||
    Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6
  )
    return;
  const r = renderer.domElement.getBoundingClientRect();
  pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, (-(e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(meshes(), false)[0];
  if (hit) select(hit.object.userData.region);
});

// The headset gets its own world-space panel; it never depends on DOM overlay support.
const panelCanvas = document.createElement('canvas');
panelCanvas.width = 1024;
panelCanvas.height = 1190;
const panelTexture = new THREE.CanvasTexture(panelCanvas);
panelTexture.colorSpace = THREE.SRGBColorSpace;
const panel = new THREE.Mesh(
  new THREE.PlaneGeometry(0.84, 0.976),
  new THREE.MeshBasicMaterial({ map: panelTexture, side: THREE.DoubleSide, toneMapped: false }),
);
panel.visible = false;
scene.add(panel);
let panelButtons = [];
function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 4) {
  let line = '',
    row = 0;
  for (const word of text.split(' ')) {
    const test = line + word + ' ';
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line.trim(), x, y + row * lineHeight);
      row++;
      line = '';
      if (row >= maxLines) return;
    }
    line += word + ' ';
  }
  if (row < maxLines) ctx.fillText(line.trim(), x, y + row * lineHeight);
}
function scaleActor(factor) {
  if (Number.isFinite(factor) && factor > 0)
    actor.scale.setScalar(boundedScale(actor.scale.x * factor));
}
function drawXRPanel() {
  if (!panelCanvas.getContext('2d')) return;
  const zone = ZONES.find((zone) => zone.id === selected),
    practice = lesson?.view;
  const exit = ['Salir de MR', () => renderer.xr.getSession()?.end()];
  const articulation = (direction) =>
    setPose((current?.joints[jointIndex].angle || 0) + direction * 5);
  let actions,
    heading = zone?.name || 'Selecciona una región',
    body = regionText(zone) || 'Apunta al animal y pulsa el gatillo.';
  let statusText = loading
    ? 'Preparando el animal…'
    : failedAnimal
      ? 'Error de carga: pulsa el animal para reintentar.'
      : mode === 'assemble'
        ? current?.pieces.filter((piece) => piece.userData.snapped).length +
          ' / 10 piezas en su sitio'
        : JOINTS[jointIndex].label + ': ' + (current?.joints[jointIndex]?.angle || 0) + '°';
  if (xrTab === 'space') {
    heading = 'Tu aula, tu laboratorio';
    body =
      spatial.state.anchor +
      '. ' +
      spatial.state.occlusion +
      '. Superficies: ' +
      spatial.state.planes +
      ' planos y ' +
      spatial.state.meshes +
      ' mallas.';
    statusText = spatial.placing
      ? 'Apunta a una superficie horizontal y pulsa el gatillo.'
      : 'La posición se fija solo si el visor entrega un ancla.';
    actions = [
      [
        'Colocar en superficie',
        () => {
          $('place-room').click();
        },
      ],
      ['Fijar posición', () => spatial.requestAnchor()],
      ['Soltar ancla', () => spatial.clearAnchor()],
      ['Configurar habitación', async () => toast(await spatial.captureRoom())],
      [
        spatial.enabled ? 'Oclusión: activada' : 'Oclusión: desactivada',
        () => {
          spatial.setOcclusion(!spatial.enabled);
          $('occlusion-toggle').checked = spatial.enabled;
          drawXRPanel();
        },
      ],
      ['Reubicar delante', placeInRoom],
      ['Más pequeño', () => scaleActor(0.85)],
      ['Más grande', () => scaleActor(1.15)],
      ['Sonido: ' + (sensory.enabled ? 'sí' : 'no'), toggleSound],
      exit,
    ];
  } else if (xrTab === 'lesson') {
    heading = practice?.title || 'Ruta de aprendizaje';
    body = practice?.active
      ? practice.instruction
      : 'Reconoce regiones, orienta los lados y reconstruye tres piezas. Después responde cinco preguntas.';
    statusText = practice?.active
      ? practice.progress + '% · ' + practice.score + '/100 · ' + practice.feedback
      : practice?.stage === 'done'
        ? practice.score + '/100 puntos · Recorrido completado'
        : 'Práctica formativa sin datos personales.';
    actions = [
      ...(!practice?.active ? [['Comenzar recorrido', startLesson]] : []),
      ...(practice?.active && ['explore', 'orient', 'assemble'].includes(practice.stage)
        ? [['Ver con ayuda', helpLesson]]
        : []),
      ['Escuchar instrucción', speakCurrent],
      ...(practice?.stage === 'quiz' && practice.answered
        ? [
            [
              'Siguiente pregunta',
              () => {
                lesson.next();
                syncLesson();
              },
            ],
          ]
        : []),
      [
        'Reiniciar ruta',
        () => {
          lesson?.reset();
          lessonStage = null;
          syncLesson();
        },
      ],
      [
        'Explorar animal',
        () => {
          xrTab = 'explore';
          setMode('explore');
        },
      ],
    ];
    if (practice?.active && practice.question) {
      body = practice.answered ? practice.feedback : practice.question.question;
      if (practice.answered)
        statusText = practice.score + '/100 puntos · Pulsa «Siguiente pregunta».';
      if (!practice.answered)
        practice.question.options.forEach((text, index) =>
          actions.push([String.fromCharCode(65 + index) + '. ' + text, () => answerLesson(index)]),
        );
    }
    actions.push(['Sonido: ' + (sensory.enabled ? 'sí' : 'no'), toggleSound], exit);
  } else if (xrTab === 'assemble') {
    heading = zone?.name || 'Montar piezas';
    body = selected
      ? 'La silueta muestra dónde encaja la pieza. Agarra para mover y girar; suelta al coincidir.'
      : 'Selecciona una pieza para ver su lugar.';
    actions = [
      ['Separar piezas', () => explode()],
      ['Rearmar todo', () => restorePieces()],
      ['Región anterior', () => cycleRegion(-1)],
      ['Región siguiente', () => cycleRegion(1)],
      ['Girar en X', () => rotateSelected('x')],
      ['Girar en Y', () => rotateSelected('y')],
      ['Girar en Z', () => rotateSelected('z')],
      ['Encajar con ayuda', () => $('fit-piece').click()],
      [guidesVisible ? 'Guía: activada' : 'Guía: desactivada', toggleGuides],
      ['Escuchar explicación', speakCurrent],
      ['Sonido: ' + (sensory.enabled ? 'sí' : 'no'), toggleSound],
      exit,
    ];
  } else {
    actions = [
      ['Caballo', () => loadAnimal('horse')],
      ['Vaca', () => loadAnimal('cow')],
      ['Región anterior', () => cycleRegion(-1)],
      ['Región siguiente', () => cycleRegion(1)],
      ['Movimiento −', () => articulation(-1)],
      ['Movimiento +', () => articulation(1)],
      [
        'Otra articulación',
        () => {
          jointIndex = (jointIndex + 1) % JOINTS.length;
          $('joint').value = jointIndex;
          drawXRPanel();
        },
      ],
      [
        'Restablecer postura',
        () => {
          resetPose();
          drawXRPanel();
        },
      ],
      ['Escuchar explicación', speakCurrent],
      ['Sonido: ' + (sensory.enabled ? 'sí' : 'no'), toggleSound],
      ['Reubicar animal', placeInRoom],
      exit,
    ];
  }
  const tabs = [
    ['explore', 'Explorar'],
    ['assemble', 'Montar'],
    ['lesson', 'Aprender'],
    ['space', 'Aula MR'],
  ].map(([id, label]) => ({
    label,
    active: xrTab === id,
    action: () => {
      xrTab = id;
      if (id === 'explore') setMode('explore');
      if (id === 'assemble') setMode('assemble');
      drawXRPanel();
    },
  }));
  panelButtons = paintXRPanel(
    panelCanvas,
    {
      animal: ANIMALS[animal].name,
      subtitle:
        'Anatomía externa · ' +
        (xrTab === 'space'
          ? 'Integración con el aula'
          : xrTab === 'lesson'
            ? 'Ruta guiada'
            : mode === 'assemble'
              ? 'Montar piezas'
              : 'Explorar'),
      heading,
      body,
      status: noticeText || statusText,
    },
    actions,
    tabs,
  );
  panelTexture.needsUpdate = true;
}
function cycleRegion(delta) {
  const i = ZONES.findIndex((z) => z.id === selected);
  select(ZONES[(i + delta + ZONES.length) % ZONES.length].id, { assisted: true });
}
const controllers = [];
for (let i = 0; i < 2; i++) {
  const c = renderer.xr.getController(i);
  scene.add(c);
  controllers.push(c);
  const ray = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -4)]),
    new THREE.LineBasicMaterial({
      color: i ? 0xf5a13a : 0x31bcc4,
      transparent: true,
      opacity: 0.85,
    }),
  );
  c.add(ray);
  c.userData.pointerRay = ray;
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.009, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0x31bcc4 }),
  );
  dot.visible = false;
  c.add(dot);
  c.userData.pointerDot = dot;
  c.addEventListener('connected', (event) => {
    c.userData.inputSource = event.data;
  });
  c.addEventListener('selectstart', () => {
    activeHand = c;
    sensory.unlock();
    const hit = xrHit(c, true);
    if (hit?.object === panel) {
      const x = hit.uv.x * 1024,
        y = (1 - hit.uv.y) * 1190;
      panelButtons.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h)?.action();
      sensory.pulse(c, 0.14, 22);
    } else if (spatial.placing) {
      if (spatial.place(raycaster.ray)) {
        sensory.play('snap', actor.position, c);
        toast('Animal colocado. Se está solicitando el ancla.');
      } else toast('Apunta a una superficie horizontal detectada por el visor.');
    } else if (hit && current && !loading) select(hit.object.userData.region, { controller: c });
  });
  c.addEventListener('squeezestart', () => {
    if (mode !== 'assemble' || !current || loading || c.userData.held) return;
    const hit = xrHit(c, false);
    if (hit && !controllers.some((other) => other.userData.held === hit.object)) {
      const p = hit.object;
      select(p.userData.region, { controller: c });
      p.userData.snapped = false;
      c.attach(p);
      c.userData.held = p;
      updateCount();
    }
  });
  c.addEventListener('squeezeend', () => release(c));
  c.addEventListener('disconnected', () => {
    release(c, false);
    delete c.userData.inputSource;
  });
}
function xrHit(c, withPanel) {
  c.updateWorldMatrix(true, false);
  const m = new THREE.Matrix4().extractRotation(c.matrixWorld);
  raycaster.ray.origin.setFromMatrixPosition(c.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(m);
  const candidates = meshes().filter((mesh) => {
    const bounds = mesh.isSkinnedMesh ? mesh.boundingBox : mesh.geometry.boundingBox;
    if (!bounds) return true;
    const box = bounds.clone().applyMatrix4(mesh.matrixWorld);
    return raycaster.ray.intersectsBox(box);
  });
  const surface = spatial.enabled ? spatial.surfaceHit(raycaster.ray) : null;
  return raycaster
    .intersectObjects(withPanel ? [panel, ...candidates] : candidates, false)
    .find(
      (hit) =>
        hit.distance <= 5 &&
        (!surface || hit.distance <= surface.distance + 0.02) &&
        hit.object.visible &&
        hit.object.parent?.visible,
    );
}
function release(c, record = true) {
  const p = c.userData.held;
  if (!p) return;
  delete c.userData.held;
  if (current) {
    current.assembly.attach(p);
    trySnap(p, false, record, c);
  }
}
function releaseAll() {
  for (const c of controllers) release(c, false);
}
function placeInRoom() {
  if (!renderer.xr.isPresenting) return;
  releaseAll();
  const head = renderer.xr.getCamera(),
    pos = head.getWorldPosition(new THREE.Vector3()),
    dir = head.getWorldDirection(new THREE.Vector3());
  dir.y = 0;
  dir.normalize();
  if (dir.lengthSq() < 0.001) return false;
  spatial.clearAnchor();
  actor.position.copy(pos).addScaledVector(dir, 2);
  actor.position.y = 0;
  actor.rotation.set(0, Math.atan2(-dir.x, -dir.z) + 0.55, 0);
  const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
  panel.position.copy(pos).addScaledVector(dir, 0.95).addScaledVector(right, 0.78);
  panel.position.y = pos.y - 0.25;
  panel.lookAt(pos);
  drawXRPanel();
  spatial.requestAnchor();
  return true;
}
renderer.xr.addEventListener('sessionstart', () => {
  savedDesktop = {
    position: camera.position.clone(),
    quaternion: camera.quaternion.clone(),
    target: controls.target.clone(),
    actorPosition: actor.position.clone(),
    actorQuaternion: actor.quaternion.clone(),
    scale: actor.scale.clone(),
  };
  controls.enabled = false;
  if (drag) drag.enabled = false;
  ground.visible = false;
  panel.visible = true;
  document.body.classList.add('xr-active');
  actor.scale.setScalar(1);
  spatial.start(renderer.xr.getSession());
  for (const id of ['place-room', 'anchor-room', 'clear-anchor-room', 'capture-room'])
    $(id).disabled = false;
  placementPending = true;
  updateXRButton();
});
renderer.xr.addEventListener('sessionend', () => {
  placementPending = false;
  releaseAll();
  spatial.stop();
  hovered = null;
  updateHighlights();
  for (const id of ['place-room', 'anchor-room', 'clear-anchor-room', 'capture-room'])
    $(id).disabled = true;
  panel.visible = false;
  ground.visible = true;
  document.body.classList.remove('xr-active');
  if (savedDesktop) {
    camera.position.copy(savedDesktop.position);
    camera.quaternion.copy(savedDesktop.quaternion);
    controls.target.copy(savedDesktop.target);
    actor.position.copy(savedDesktop.actorPosition);
    actor.quaternion.copy(savedDesktop.actorQuaternion);
    actor.scale.copy(savedDesktop.scale);
    savedDesktop = null;
  }
  controls.enabled = true;
  if (drag) drag.enabled = mode === 'assemble';
  resize();
  controls.update();
  updateXRButton();
});
$('enter-mr').addEventListener('click', async () => {
  if (loading || !current || xrStarting || renderer.xr.isPresenting) return;
  if (!window.isSecureContext || location.protocol === 'file:' || !navigator.xr) {
    showXRDiagnostics();
    return;
  }
  xrStarting = true;
  sensory.unlock();
  updateXRButton();
  try {
    await startImmersiveSession(navigator.xr, renderer.xr);
  } catch (e) {
    status('No se pudo iniciar MR: ' + e.message);
    showXRDiagnostics(e);
  } finally {
    xrStarting = false;
    updateXRButton();
  }
});
async function checkXR() {
  if (!window.isSecureContext || location.protocol === 'file:') {
    defaultStatus =
      'Exploración 3D local disponible. Abre una dirección HTTPS en las gafas para utilizar realidad mixta.';
    status(defaultStatus);
    return;
  }
  try {
    xrSupported = !!navigator.xr && (await navigator.xr.isSessionSupported('immersive-ar'));
    if (xrSupported) {
      defaultStatus = 'MR disponible. Utiliza los mandos para seleccionar y agarrar.';
    } else {
      defaultStatus = navigator.xr
        ? 'La comprobación automática no confirmó MR. Pulsa «Entrar en realidad mixta» para solicitar el permiso.'
        : 'Vista 3D disponible. Para MR, utiliza Meta Quest Browser y abre este enlace directamente.';
    }
  } catch {
    defaultStatus = 'No se pudo comprobar la compatibilidad de realidad mixta.';
  }
  updateXRButton();
  status(defaultStatus);
}
function xrDiagnostic(error) {
  return {
    version: '0.3.0',
    url: location.href,
    secureContext: isSecureContext,
    embedded: window.self !== window.top,
    webXR: !!navigator.xr,
    arProbe: xrSupported,
    userAgent: navigator.userAgent,
    error: error ? { name: error.name, message: error.message } : null,
  };
}
function showXRDiagnostics(error) {
  const available = !!navigator.xr && isSecureContext && location.protocol !== 'file:';
  $('xr-diagnostics-summary').textContent = error
    ? 'El navegador no pudo iniciar la sesión: ' + error.message
    : available
      ? 'El navegador ofrece WebXR. Pulsa «Entrar en realidad mixta» y acepta el permiso.'
      : 'Este navegador no está ofreciendo acceso a realidad mixta. Revisa los pasos siguientes.';
  $('xr-diagnostics-output').textContent = JSON.stringify(xrDiagnostic(error), null, 2);
  const dialog = $('xr-diagnostics-dialog');
  if (!dialog.open) dialog.showModal();
}
$('xr-diagnostics').addEventListener('click', () => showXRDiagnostics());
$('copy-xr-diagnostics').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('xr-diagnostics-output').textContent);
    $('copy-xr-diagnostics').textContent = 'Diagnóstico copiado';
  } catch {
    $('copy-xr-diagnostics').textContent = 'Selecciona y copia el diagnóstico mostrado';
  }
});
function resize() {
  const w = viewer.clientWidth,
    h = viewer.clientHeight;
  if (!w || !h) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (!renderer.xr.isPresenting) renderer.setSize(w, h);
}
const resizeObserver = new ResizeObserver(resize);
resizeObserver.observe(viewer);
resize();
renderer.setAnimationLoop((time, frame) => {
  if (frame && renderer.xr.isPresenting) {
    const reference = renderer.xr.getReferenceSpace();
    if (reference) spatial.update(frame, reference);
  }
  if (placementPending && frame) {
    const reference = renderer.xr.getReferenceSpace();
    if (reference && frame.getViewerPose(reference)) {
      renderer.xr.updateCamera(camera);
      if (placeInRoom()) placementPending = false;
    }
  }
  if (!renderer.xr.isPresenting) controls.update();
  if (current && mode === 'explore')
    for (const part of current.parts) {
      breathe(part, (1 + Math.sin(time * 0.0016)) * 0.5);
    }
  floorShadow.position.copy(actor.position);
  floorShadow.position.y += 0.003;
  key.position.set(actor.position.x - 3, actor.position.y + 6, actor.position.z + 4);
  key.target.position.copy(actor.position);
  key.target.updateMatrixWorld();
  if (renderer.xr.isPresenting) {
    for (const c of controllers) {
      if (c.userData.held) snapPreview(c.userData.held);
      const pressed = !!c.userData.inputSource?.gamepad?.buttons[5]?.pressed;
      if (pressed && !c.userData.panelButton) {
        const head = renderer.xr.getCamera(),
          pos = head.getWorldPosition(new THREE.Vector3()),
          direction = head.getWorldDirection(new THREE.Vector3());
        panel.position.copy(pos).addScaledVector(direction, 1.1);
        panel.lookAt(pos);
      }
      c.userData.panelButton = pressed;
    }
    if (time - lastHoverTime > 90) {
      lastHoverTime = time;
      let next = null;
      for (const c of controllers) {
        if (!c.visible || c.userData.held) continue;
        const hit = xrHit(c, true);
        c.userData.pointerRay.scale.z = (hit ? Math.min(hit.distance, 4) : 4) / 4;
        c.userData.pointerDot.visible = !!hit;
        if (hit) c.userData.pointerDot.position.set(0, 0, -hit.distance);
        if (hit && hit.object !== panel) next = hit.object.userData.region;
        const controllerRegion = hit && hit.object !== panel ? hit.object.userData.region : null;
        if (c.userData.hovered !== controllerRegion) {
          sensory.pulse(c, 0.1, 18);
          c.userData.hovered = controllerRegion;
        }
        if (spatial.placing && (c === activeHand || !activeHand)) spatial.preview(raycaster.ray);
      }
      if (next !== hovered) {
        hovered = next;
        updateHighlights();
      }
    }
  }
  labelEls.forEach((el, i) => {
    el.hidden = !labelsVisible || renderer.xr.isPresenting || !current;
    if (el.hidden) return;
    const id = ZONES[i].id,
      p =
        mode === 'assemble'
          ? current.pieces
              .find((p) => p.userData.region === id)
              .getWorldPosition(new THREE.Vector3())
          : actor.localToWorld(current.centers.get(id).clone());
    p.project(camera);
    el.hidden = p.z < -1 || p.z > 1;
    if (!el.hidden) {
      el.style.left = (p.x * 0.5 + 0.5) * viewer.clientWidth + 'px';
      el.style.top = (-p.y * 0.5 + 0.5) * viewer.clientHeight + 'px';
    }
  });
  renderer.render(scene, camera);
});
// Small observable interface for automated checks of model integrity and interaction state.
window.lab = {
  get ready() {
    return !!current && !loading;
  },
  get animal() {
    return animal;
  },
  get mode() {
    return mode;
  },
  get selected() {
    return selected;
  },
  get current() {
    return current;
  },
  get actor() {
    return actor;
  },
  get renderer() {
    return renderer;
  },
  get scene() {
    return scene;
  },
  get camera() {
    return camera;
  },
  select,
  loadAnimal,
  setMode,
  setPose,
  explode,
  restorePieces,
  trySnap,
  resetPose,
  resetView,
  scaleActor,
  get lesson() {
    return lesson;
  },
  get spatial() {
    return spatial;
  },
  get jointIndex() {
    return jointIndex;
  },
};
window.addEventListener('pagehide', (event) => {
  if (event.persisted) return;
  clearTimeout(toastTimer);
  renderer.setAnimationLoop(null);
  sensory.dispose();
  spatial.dispose();
  resizeObserver.disconnect();
  drag?.dispose();
  controls.dispose();
  disposeObjects(scene);
  environmentTarget.dispose();
  renderer.dispose();
});
drawXRPanel();
checkXR();
loadAnimal('horse');
