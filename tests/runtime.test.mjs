import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssetStore, boundedScale, startImmersiveSession } from '../docs/runtime.js';

test('overlapping loads share work and the same prepared object', async () => {
  let calls = 0;
  const store = createAssetStore(async () => {
    calls++;
    return { model: 'cow' };
  });
  const a = store.get('cow'),
    b = store.get('cow');
  assert.equal(a, b);
  const result = await a;
  assert.equal(await store.get('cow'), result);
  assert.equal(calls, 1);
});

test('failed loads can be retried and do not affect another animal', async () => {
  let attempts = 0;
  const store = createAssetStore(async (id) => {
    if (id === 'cow' && ++attempts === 1) throw new Error('network');
    return { id };
  });
  const horse = await store.get('horse');
  await assert.rejects(store.get('cow'), /network/);
  assert.deepEqual(await store.get('cow'), { id: 'cow' });
  assert.equal(await store.get('horse'), horse);
});

test('scale is bounded even after repeated resize commands', () => {
  let large = 0.6,
    small = 0.6;
  for (let i = 0; i < 100; i++) {
    large = boundedScale(large * 1.15);
    small = boundedScale(small * 0.85);
  }
  assert.equal(large, 1.2);
  assert.equal(small, 0.2);
  assert.equal(boundedScale(NaN), 0.6);
});

test('MR requests the floor reference space actually used by the renderer', async () => {
  let request;
  const session = { end: async () => assert.fail('A working session must remain open') };
  const xr = {
    requestSession: async (...args) => {
      request = args;
      return session;
    },
  };
  const manager = { setSession: async (value) => assert.equal(value, session) };
  assert.equal(await startImmersiveSession(xr, manager), session);
  assert.deepEqual(request, ['immersive-ar', { requiredFeatures: ['local-floor'] }]);
});

test('failed MR renderer setup closes the acquired session', async () => {
  let ended = 0;
  const session = { end: async () => ended++ };
  await assert.rejects(
    startImmersiveSession(
      { requestSession: async () => session },
      {
        setSession: async () => {
          throw new Error('renderer failed');
        },
      },
    ),
    /renderer failed/,
  );
  assert.equal(ended, 1);
});

test('session cleanup preserves the original setup error', async () => {
  await assert.rejects(
    startImmersiveSession(
      {
        requestSession: async () => ({
          end: async () => {
            throw new Error('already ended');
          },
        }),
      },
      {
        setSession: async () => {
          throw new Error('original');
        },
      },
    ),
    /original/,
  );
});

test('unsupported or refused MR does not start renderer setup', async () => {
  await assert.rejects(startImmersiveSession(null, {}), /WebXR/);
  await assert.rejects(
    startImmersiveSession(
      {
        requestSession: async () => {
          throw new Error('permission refused');
        },
      },
      { setSession: async () => assert.fail('must not run') },
    ),
    /permission refused/,
  );
});
