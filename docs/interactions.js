import * as THREE from 'three';

// One short gesture at a time. Only the display model moves, so its room anchor stays fixed.
export class AnimalGesture {
  rotation = new THREE.Quaternion();
  active = null;
  makeTongue(head, bone, actor) {
    const vertex = new THREE.Vector3(),
      tip = new THREE.Vector3();
    let front = -Infinity;
    for (let i = 0; i < head.geometry.attributes.position.count; i++) {
      head.getVertexPosition(i, vertex);
      actor.worldToLocal(head.localToWorld(vertex));
      if (vertex.z > front) {
        front = vertex.z;
        tip.copy(vertex);
      }
    }
    const mount = new THREE.Group();
    actor.add(mount);
    mount.position.copy(tip);
    mount.position.y -= 0.038;
    mount.position.z -= 0.038;
    bone.attach(mount);
    const tongue = new THREE.Mesh(
      new THREE.SphereGeometry(1, 18, 12),
      new THREE.MeshStandardMaterial({ color: 0xad7281, roughness: 0.45 }),
    );
    mount.add(tongue);
    tongue.visible = false;
    return tongue;
  }
  start(model, species) {
    if (!model || this.active) return;
    this.active = {
      model,
      species,
      start: null,
      y: model.root.position.y,
      pose: model.joints.map((j) => j.bone.quaternion.clone()),
    };
  }
  update(time) {
    const motion = this.active;
    if (!motion) return;
    motion.start ??= time;
    const { model, species, pose } = motion;
    const t = Math.min(1, (time - motion.start) / (species === 'horse' ? 1350 : 1050));
    if (t === 1) {
      this.stop();
      return;
    }
    const bend = (index, angle) => {
      const joint = model.joints[index];
      joint.bone.quaternion
        .copy(pose[index])
        .multiply(this.rotation.setFromAxisAngle(joint.axis, angle));
    };
    if (species === 'horse') {
      const air = Math.sin(Math.PI * THREE.MathUtils.clamp((t - 0.18) / 0.64, 0, 1));
      const crouch =
        Math.sin(Math.PI * Math.min(1, t / 0.18)) +
        Math.sin(Math.PI * Math.max(0, (t - 0.82) / 0.18));
      model.root.position.y = motion.y + 0.29 * air - 0.035 * crouch;
      bend(0, -0.12 * air);
      for (const i of [2, 5]) bend(i, -0.4 * air);
      for (const i of [3, 6]) bend(i, 0.28 * air);
      for (const i of [7, 8]) bend(i, 0.72 * air);
      for (const i of [9, 10]) bend(i, -0.45 * air);
    } else {
      const reach = Math.sin(t * Math.PI);
      const tongue = model.tongue;
      bend(1, -0.09 * reach);
      tongue.visible = true;
      tongue.scale.set(0.026 * reach, 0.014 * reach, 0.092 * reach);
      tongue.position.set(0.023 * reach, 0.021 * reach * Math.sin(t * Math.PI * 2), 0.066 * reach);
      tongue.rotation.set(-0.45 * reach, 0.27 * reach, 0);
    }
  }
  stop() {
    if (!this.active) return;
    const { model, y, pose } = this.active;
    model.root.position.y = y;
    model.joints.forEach((j, i) => j.bone.quaternion.copy(pose[i]));
    if (model.tongue) model.tongue.visible = false;
    this.active = null;
  }
}

// Labels are actual world-space objects and remain attached to a piece when a controller holds it.
export class RegionNames {
  group = new THREE.Group();
  offset = new THREE.Vector3();
  constructor(zones) {
    this.group.visible = false;
    this.tags = zones.map(({ id, name }) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      ctx.font = 'bold 32px Arial';
      canvas.width = Math.ceil(ctx.measureText(name).width) + 32;
      canvas.height = 52;
      ctx.fillStyle = '#471d44';
      ctx.fillRect(0, 0, canvas.width, 52);
      ctx.fillStyle = 'white';
      ctx.font = 'bold 32px Arial';
      ctx.fillText(name, 16, 37);
      const map = new THREE.CanvasTexture(canvas);
      map.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map, depthTest: false, depthWrite: false, toneMapped: false }),
      );
      sprite.scale.set(canvas.width / 900, 52 / 900, 1);
      sprite.renderOrder = 5;
      const line = new THREE.Line(
        new THREE.BufferGeometry().setAttribute(
          'position',
          new THREE.BufferAttribute(new Float32Array(6), 3),
        ),
        new THREE.LineBasicMaterial({ color: 0x36a7ac }),
      );
      this.group.add(sprite, line);
      return { id, sprite, line };
    });
  }
  update(model, actor, mode, visible) {
    this.group.visible = Boolean(visible && model);
    if (!this.group.visible) return;
    this.tags.forEach(({ id, sprite, line }, i) => {
      const pos = sprite.position;
      if (mode === 'assemble')
        model.pieces.find((p) => p.userData.region === id).getWorldPosition(pos);
      else actor.localToWorld(pos.copy(model.centers.get(id)));
      const points = line.geometry.attributes.position;
      points.setXYZ(0, pos.x, pos.y, pos.z);
      const offset = this.offset;
      const side = id.endsWith('left') ? 1 : id.endsWith('right') ? -1 : i % 2 ? -1 : 1;
      offset
        .set(0.4 * side, id.includes('hind') ? 0.16 : 0.09, 0)
        .applyQuaternion(actor.quaternion);
      pos.add(offset);
      points.setXYZ(1, pos.x, pos.y, pos.z);
      points.needsUpdate = true;
      line.frustumCulled = false;
    });
  }
}
