import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
const outlines = new WeakMap();
const closureGroups = new WeakMap();
function canonicalAttribute(attribute) {
  const values = new Float32Array(attribute.count * attribute.itemSize);
  for (let i = 0; i < attribute.count; i++)
    for (let c = 0; c < attribute.itemSize; c++)
      values[i * attribute.itemSize + c] = attribute.getComponent(i, c);
  return new THREE.BufferAttribute(values, attribute.itemSize);
}
export function breathe(source, value) {
  const index = source.morphTargetDictionary?.Breath;
  if (index === undefined || !source.morphTargetInfluences) return;
  source.morphTargetInfluences[index] = value;
  const outline = outlines.get(source);
  if (outline?.morphTargetInfluences) outline.morphTargetInfluences[index] = value;
}
export const isClosure = (material) => material.name.includes('didactic_cut');
export function filterHiddenMaterials(mesh) {
  const raycast = mesh.raycast.bind(mesh);
  mesh.raycast = (raycaster, hits) => {
    const candidates = [];
    raycast(raycaster, candidates);
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const hit of candidates) {
      if (mats[hit.face?.materialIndex || 0]?.visible !== false) hits.push(hit);
    }
  };
}
export function setClosures(mesh, visible, exposedNeighbors = new Set()) {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  if (mesh.geometry.groups.length) {
    if (!closureGroups.has(mesh))
      closureGroups.set(
        mesh,
        mesh.geometry.groups.map((group) => ({ ...group })),
      );
    const original = closureGroups.get(mesh);
    const caps = original.filter((group) => isClosure(materials[group.materialIndex]));
    const consecutive = caps.every(
      (group, index) =>
        index === 0 || group.start === caps[index - 1].start + caps[index - 1].count,
    );
    // All neutral closure materials are visually identical. A detached piece
    // draws them together; an assembled piece restores per-neighbor groups.
    mesh.geometry.groups =
      visible && caps.length > 1 && consecutive
        ? [
            ...original.filter((group) => !isClosure(materials[group.materialIndex])),
            {
              start: caps[0].start,
              count: caps.reduce((sum, group) => sum + group.count, 0),
              materialIndex: caps[0].materialIndex,
            },
          ]
        : original.map((group) => ({ ...group }));
  }
  for (const material of materials) {
    if (isClosure(material)) {
      const neighbor = material.userData.closureNeighbor || material.name.split('__')[1];
      material.visible = !!visible || exposedNeighbors.has(neighbor);
      if (material.transparent || material.opacity !== 1) {
        material.transparent = false;
        material.opacity = 1;
        material.depthWrite = true;
        material.needsUpdate = true;
      }
    }
  }
}
export function showOutline(mesh, visible, color = 0x31bcc4) {
  const outline = outlines.get(mesh);
  if (!outline) return;
  outline.visible = visible;
  const materials = Array.isArray(outline.material) ? outline.material : [outline.material];
  materials.forEach((material) => material.color.set(color));
}

// glTF may split a region into primitives for its skin and its didactic closure.
// Keep one selectable, skinned object per region while retaining both materials.
export function collectRegions(root) {
  const groups = new Map();
  root.traverse((object) => {
    if (!object.isSkinnedMesh) return;
    let node = object;
    while (node && !node.userData.region) node = node.parent;
    const region = node?.userData.region;
    if (!region) return;
    if (!groups.has(region)) groups.set(region, []);
    groups.get(region).push(object);
  });
  const parts = [];
  for (const [region, members] of groups) {
    let mesh = members[0];
    if (members.length > 1) {
      const geometries = members.map((member) => member.geometry.clone());
      // Meshopt can quantize UVs on the skin while leaving the closure UVs as
      // floats. Merge decoded values, not incompatible packed storage layouts.
      for (const geometry of geometries) {
        for (const [name, attribute] of Object.entries(geometry.attributes))
          geometry.setAttribute(name, canonicalAttribute(attribute));
        for (const name of Object.keys(geometry.morphAttributes))
          geometry.morphAttributes[name] = geometry.morphAttributes[name].map(canonicalAttribute);
      }
      if (geometries.some((g) => g.hasAttribute('tangent'))) {
        for (const geometry of geometries) {
          if (geometry.hasAttribute('tangent')) continue;
          const values = new Float32Array(geometry.attributes.position.count * 4);
          for (let i = 0; i < values.length; i += 4) {
            values[i] = 1;
            values[i + 3] = 1;
          }
          geometry.setAttribute('tangent', new THREE.BufferAttribute(values, 4));
        }
      }
      const geometry = mergeGeometries(geometries, true);
      if (geometry) geometry.morphTargetsRelative = members[0].geometry.morphTargetsRelative;
      geometries.forEach((g) => g.dispose());
      if (!geometry) throw new Error('No se pudieron combinar las superficies de ' + region);
      mesh = new THREE.SkinnedMesh(
        geometry,
        members.map((member) => member.material),
      );
      mesh.position.copy(members[0].position);
      mesh.quaternion.copy(members[0].quaternion);
      mesh.scale.copy(members[0].scale);
      mesh.bindMode = members[0].bindMode;
      mesh.bind(members[0].skeleton, members[0].bindMatrix);
      mesh.bindMatrixInverse.copy(members[0].bindMatrixInverse);
      mesh.morphTargetDictionary = members[0].morphTargetDictionary;
      if (members[0].morphTargetInfluences)
        mesh.morphTargetInfluences = [...members[0].morphTargetInfluences];
      const parent = members[0].parent;
      for (const member of members) {
        member.removeFromParent();
        member.geometry.dispose();
      }
      parent.add(mesh);
    }
    mesh.name = 'part_' + region;
    mesh.userData.region = region;
    mesh.frustumCulled = false;
    const clone = (material) => {
      const copy = material.clone();
      copy.roughness = Math.max(0.48, copy.roughness);
      return copy;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(clone) : clone(mesh.material);
    filterHiddenMaterials(mesh);
    parts.push(mesh);
  }
  return parts;
}

export function outlineFor(source, skinned = false) {
  const geometry = source.geometry.clone();
  const positions = geometry.attributes.position,
    normals = geometry.attributes.normal;
  for (let i = 0; i < positions.count; i++) {
    positions.setXYZ(
      i,
      positions.getX(i) + normals.getX(i) * 0.005,
      positions.getY(i) + normals.getY(i) * 0.005,
      positions.getZ(i) + normals.getZ(i) * 0.005,
    );
  }
  const material = new THREE.MeshBasicMaterial({
    color: 0x31bcc4,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const mats = (Array.isArray(source.material) ? source.material : [source.material]).map(
    (sourceMaterial) => {
      const copy = material.clone();
      copy.visible = !isClosure(sourceMaterial);
      return copy;
    },
  );
  material.dispose();
  const assigned = Array.isArray(source.material) ? mats : mats[0];
  const outline = skinned
    ? new THREE.SkinnedMesh(geometry, assigned)
    : new THREE.Mesh(geometry, assigned);
  if (skinned) {
    outline.bindMode = source.bindMode;
    outline.bind(source.skeleton, source.bindMatrix);
    outline.bindMatrixInverse.copy(source.bindMatrixInverse);
  }
  outline.frustumCulled = false;
  outline.userData.outline = true;
  outline.visible = false;
  source.add(outline);
  outlines.set(source, outline);
  return outline;
}
