import * as THREE from './vendor/three/three.module.js';

export function planeGeometry(polygon) {
  if (!polygon || polygon.length < 3) return null;
  const points = Array.from(polygon);
  if (points.some((p) => ![p.x, p.y, p.z].every(Number.isFinite))) return null;
  const contour = points.map((p) => new THREE.Vector2(p.x, p.z));
  const triangles = THREE.ShapeUtils.triangulateShape(contour, []).flat();
  if (!triangles.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      points.flatMap((p) => [p.x, p.y, p.z]),
      3,
    ),
  );
  geometry.setIndex(triangles);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export class SpatialWorld {
  constructor(
    scene,
    actor,
    renderer,
    {
      onChange = () => {},
      makeTransform = (position, orientation) => new XRRigidTransform(position, orientation),
    } = {},
  ) {
    this.actor = actor;
    this.renderer = renderer;
    this.onChange = onChange;
    this.makeTransform = makeTransform;
    this.group = new THREE.Group();
    this.group.name = 'Detected room occlusion';
    scene.add(this.group);
    this.material = new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: true,
      side: THREE.DoubleSide,
    });
    this.records = new Map();
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 5;
    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.08, 0.105, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x31bcc4, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.marker.visible = false;
    scene.add(this.marker);
    this.enabled = true;
    this.placing = false;
    this.anchor = null;
    this.anchorTicket = 0;
    this.anchorPending = false;
    this.state = {
      planes: 0,
      meshes: 0,
      anchor: 'Sin ancla',
      occlusion: 'Entra en MR para detectar tu espacio',
    };
  }
  start(session) {
    this.stop();
    this.session = session;
    this.captureRequested = false;
    this.group.visible = this.enabled;
    this.state.anchor = 'Sin ancla';
    this.state.occlusion = 'Esperando datos del espacio';
    this.notify();
  }
  stop() {
    this.clearAnchor();
    this.session = null;
    this.placing = false;
    this.marker.visible = false;
    for (const record of this.records.values()) {
      record.mesh.removeFromParent();
      record.mesh.geometry.dispose();
    }
    this.records.clear();
    this.group.visible = false;
    this.state.planes = 0;
    this.state.meshes = 0;
    this.state.occlusion = 'Entra en MR para detectar tu espacio';
    this.notify();
  }
  clearAnchor() {
    this.anchorTicket++;
    this.anchorPending = false;
    try {
      this.anchor?.delete();
    } catch {}
    this.anchor = null;
    this.state.anchor = 'Sin ancla';
    this.notify();
  }
  requestAnchor() {
    if (!this.session) return false;
    this.clearAnchor();
    this.anchorPending = true;
    this.state.anchor = 'Solicitando ancla';
    this.notify();
    return true;
  }
  setOcclusion(enabled) {
    this.enabled = !!enabled;
    this.group.visible = this.enabled && !!this.session;
    this.notify();
  }
  togglePlacement() {
    this.placing = !this.placing;
    this.marker.visible = false;
    return this.placing;
  }
  async captureRoom() {
    if (typeof this.session?.initiateRoomCapture !== 'function')
      return 'Configura el espacio de tu habitación desde los ajustes del visor.';
    if (this.captureRequested)
      return 'La configuración del espacio ya se solicitó durante esta sesión.';
    this.captureRequested = true;
    try {
      await this.session.initiateRoomCapture();
      return 'Configuración del espacio solicitada en las gafas.';
    } catch (error) {
      return 'No se pudo abrir la configuración: ' + error.message;
    }
  }
  update(frame, reference) {
    if (!this.session || !frame || !reference) return;
    const entries = [
      ...Array.from(frame.detectedMeshes || []).map((value) => ({ value, type: 'mesh' })),
      ...Array.from(frame.detectedPlanes || []).map((value) => ({ value, type: 'plane' })),
    ];
    const retained = new Set();
    let planes = 0,
      meshes = 0;
    for (const { value, type } of entries.slice(0, 64)) {
      const space = type === 'plane' ? value.planeSpace : value.meshSpace;
      if (!space) continue;
      let pose;
      try {
        pose = frame.getPose(space, reference);
      } catch {
        continue;
      }
      if (!pose) continue;
      let record = this.records.get(value);
      const stamp = value.lastChangedTime ?? 0;
      if (!record || record.stamp !== stamp) {
        let geometry;
        if (type === 'plane') geometry = planeGeometry(value.polygon);
        else if (
          value.vertices?.length &&
          value.indices?.length &&
          value.indices.length <= 300000
        ) {
          geometry = new THREE.BufferGeometry();
          geometry.setAttribute('position', new THREE.Float32BufferAttribute(value.vertices, 3));
          geometry.setIndex(Array.from(value.indices));
          geometry.computeBoundingSphere();
        }
        if (!geometry) continue;
        if (record) {
          record.mesh.geometry.dispose();
          record.mesh.geometry = geometry;
          record.stamp = stamp;
        } else {
          const mesh = new THREE.Mesh(geometry, this.material);
          mesh.matrixAutoUpdate = false;
          mesh.renderOrder = -1000;
          mesh.name = 'Room ' + type;
          this.group.add(mesh);
          record = { mesh, stamp, type };
          this.records.set(value, record);
        }
      }
      record.mesh.matrix.fromArray(pose.transform.matrix);
      record.mesh.matrixWorldNeedsUpdate = true;
      retained.add(value);
      if (type === 'plane') planes++;
      else meshes++;
    }
    for (const [value, record] of this.records) {
      if (!retained.has(value)) {
        record.mesh.removeFromParent();
        record.mesh.geometry.dispose();
        this.records.delete(value);
      }
    }
    this.group.updateMatrixWorld(true);
    this.state.planes = planes;
    this.state.meshes = meshes;
    const depth = !!this.renderer.xr.hasDepthSensing?.();
    if (depth && this.renderer.xr.getCamera?.().cameras?.length) {
      const mesh = this.renderer.xr.getDepthSensingMesh?.();
      if (mesh) mesh.visible = this.enabled;
    }
    this.state.occlusion = !this.enabled
      ? 'Oclusión desactivada'
      : depth
        ? 'Oclusión por profundidad'
        : meshes
          ? 'Oclusión de geometría del espacio'
          : planes
            ? 'Oclusión de planos del espacio'
            : 'Sin superficies detectadas; configura tu habitación';
    if (this.anchor) {
      let pose;
      try {
        pose = frame.getPose(this.anchor.anchorSpace, reference);
      } catch {}
      if (pose) {
        const p = pose.transform.position,
          q = pose.transform.orientation;
        this.actor.position.set(p.x, p.y, p.z);
        this.actor.quaternion.set(q.x, q.y, q.z, q.w);
        this.state.anchor = 'Anclado durante esta sesión';
      } else this.state.anchor = 'Esperando seguimiento del ancla';
    }
    if (this.anchorPending) {
      this.anchorPending = false;
      const ticket = ++this.anchorTicket;
      if (typeof frame.createAnchor !== 'function') {
        this.state.anchor = 'Anclas no disponibles en esta sesión';
      } else {
        this.state.anchor = 'Creando ancla';
        const p = this.actor.position,
          q = this.actor.quaternion;
        try {
          const transform = this.makeTransform(
            { x: p.x, y: p.y, z: p.z },
            { x: q.x, y: q.y, z: q.z, w: q.w },
          );
          Promise.resolve(frame.createAnchor(transform, reference))
            .then((anchor) => {
              if (ticket !== this.anchorTicket || !this.session) {
                anchor.delete();
                return;
              }
              this.anchor = anchor;
              this.state.anchor = 'Anclado durante esta sesión';
              this.notify();
            })
            .catch((error) => {
              if (ticket === this.anchorTicket) {
                this.state.anchor = 'No se pudo anclar: ' + error.message;
                this.notify();
              }
            });
        } catch (error) {
          this.state.anchor = 'No se pudo anclar: ' + error.message;
        }
      }
    }
    this.notify();
  }
  surfaceHit(ray) {
    this.raycaster.ray.copy(ray);
    return (
      this.raycaster.intersectObjects(
        [...this.records.values()].map((record) => record.mesh),
        false,
      )[0] || null
    );
  }
  placementHit(ray) {
    const hit = this.surfaceHit(ray);
    if (!hit?.face) return null;
    const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    if (Math.abs(normal.y) < 0.75) return null;
    if (normal.y < 0) normal.negate();
    return { point: hit.point, normal };
  }
  preview(ray) {
    const hit = this.placing ? this.placementHit(ray) : null;
    this.marker.visible = !!hit;
    if (hit) {
      this.marker.position.copy(hit.point).addScaledVector(hit.normal, 0.006);
      this.marker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), hit.normal);
    }
  }
  place(ray) {
    const hit = this.placementHit(ray);
    if (!hit) return false;
    this.clearAnchor();
    this.actor.position.copy(hit.point);
    this.placing = false;
    this.marker.visible = false;
    this.requestAnchor();
    return true;
  }
  notify() {
    const text = JSON.stringify(this.state);
    if (text !== this.lastState) {
      this.lastState = text;
      this.onChange({ ...this.state });
    }
  }
  dispose() {
    this.stop();
    this.material.dispose();
    this.marker.geometry.dispose();
    this.marker.material.dispose();
    this.group.removeFromParent();
    this.marker.removeFromParent();
  }
}
