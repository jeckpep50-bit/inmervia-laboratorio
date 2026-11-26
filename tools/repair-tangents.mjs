import fs from 'node:fs/promises';

// Blender can emit a zero tangent at a tiny UV triangle. Repair only invalid
// directions in the uncompressed export, using its surface normal as reference.
export async function repairTangents(file) {
  const bytes = await fs.readFile(file);
  if (bytes.readUInt32LE(0) !== 0x46546c67) throw new Error('Se requiere un GLB.');
  const jsonLength = bytes.readUInt32LE(12),
    json = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength));
  const binaryStart = 20 + jsonLength + 8,
    seen = new Set();
  let repaired = 0;
  for (const mesh of json.meshes || [])
    for (const primitive of mesh.primitives || []) {
      const index = primitive.attributes?.TANGENT;
      if (index === undefined || seen.has(index)) continue;
      seen.add(index);
      const tangent = json.accessors[index],
        normal = json.accessors[primitive.attributes.NORMAL];
      if (tangent.componentType !== 5126 || normal?.componentType !== 5126)
        throw new Error('Reparar antes de cuantizar el modelo.');
      const tv = json.bufferViews[tangent.bufferView],
        nv = json.bufferViews[normal.bufferView];
      const tbase = binaryStart + (tv.byteOffset || 0) + (tangent.byteOffset || 0),
        nbase = binaryStart + (nv.byteOffset || 0) + (normal.byteOffset || 0);
      for (let i = 0; i < tangent.count; i++) {
        const offset = tbase + i * (tv.byteStride || 16);
        let x = bytes.readFloatLE(offset),
          y = bytes.readFloatLE(offset + 4),
          z = bytes.readFloatLE(offset + 8);
        let length = Math.hypot(x, y, z);
        if (Number.isFinite(length) && Math.abs(length - 1) < 1e-5) continue;
        if (!Number.isFinite(length) || length < 1e-6) {
          const no = nbase + i * (nv.byteStride || 12),
            nx = bytes.readFloatLE(no),
            ny = bytes.readFloatLE(no + 4),
            nz = bytes.readFloatLE(no + 8);
          if (Math.abs(ny) < 0.9) {
            x = -nz;
            y = 0;
            z = nx;
          } else {
            x = 0;
            y = nz;
            z = -ny;
          }
          length = Math.hypot(x, y, z);
          if (length < 1e-8) throw new Error('Normal no válida para reconstruir la tangente.');
        }
        bytes.writeFloatLE(x / length, offset);
        bytes.writeFloatLE(y / length, offset + 4);
        bytes.writeFloatLE(z / length, offset + 8);
        bytes.writeFloatLE(bytes.readFloatLE(offset + 12) < 0 ? -1 : 1, offset + 12);
        repaired++;
      }
    }
  if (repaired) await fs.writeFile(file, bytes);
  return repaired;
}
