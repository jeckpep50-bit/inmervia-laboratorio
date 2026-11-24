// Share pending work as well as completed models when requests overlap.
export function createAssetStore(prepare) {
  const ready = new Map();
  const pending = new Map();
  return {
    get(id) {
      if (ready.has(id)) return Promise.resolve(ready.get(id));
      if (pending.has(id)) return pending.get(id);
      const request = Promise.resolve()
        .then(() => prepare(id))
        .then((value) => {
          ready.set(id, value);
          return value;
        })
        .finally(() => pending.delete(id));
      pending.set(id, request);
      return request;
    },
  };
}

export function boundedScale(value) {
  return Number.isFinite(value) ? Math.min(1.2, Math.max(0.2, value)) : 0.6;
}

// A failed renderer setup must not leave an immersive session running.
export async function startImmersiveSession(xr, manager) {
  if (!xr) throw new Error('Este navegador no ofrece WebXR.');
  const session = await xr.requestSession('immersive-ar', {
    requiredFeatures: ['local-floor'],
  });
  try {
    await manager.setSession(session);
    return session;
  } catch (error) {
    try {
      await session.end();
    } catch {
      // Preserve the setup error even if the browser already ended the session.
    }
    throw error;
  }
}
