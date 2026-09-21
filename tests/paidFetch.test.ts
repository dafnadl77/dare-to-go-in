import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paidFetch } from '../src/auth/paidFetch.ts';

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;

function withFetch<T>(handler: Handler, run: (calls: string[]) => Promise<T>): Promise<T> {
  const calls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string, init?: RequestInit) => {
    calls.push(String(input));
    return handler(String(input), init);
  }) as typeof fetch;
  return run(calls).finally(() => {
    globalThis.fetch = original;
  });
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('a paid call answered 401 trial_required gets one session bootstrap and one retry', async () => {
  let sessionReady = false;
  await withFetch(
    (url) => {
      if (url === '/api/trial-session') {
        sessionReady = true;
        return json(200, { kind: 'trial' });
      }
      return sessionReady ? json(200, { ok: true }) : json(401, { reason: 'trial_required' });
    },
    async (calls) => {
      const res = await paidFetch('/api/dream-analysis', { method: 'POST', body: '{}' });
      assert.equal(res.status, 200);
      assert.deepEqual(calls, ['/api/dream-analysis', '/api/trial-session', '/api/dream-analysis']);
    },
  );
});

test('concurrent paid calls share a single bootstrap request', async () => {
  let sessionReady = false;
  await withFetch(
    async (url) => {
      if (url === '/api/trial-session') {
        await new Promise((r) => setTimeout(r, 20));
        sessionReady = true;
        return json(200, { kind: 'trial' });
      }
      return sessionReady ? json(200, { ok: true }) : json(401, { reason: 'trial_required' });
    },
    async (calls) => {
      const results = await Promise.all([paidFetch('/api/dream-analysis'), paidFetch('/api/dream-element-labels'), paidFetch('/api/dream-transcription')]);
      assert.deepEqual(results.map((r) => r.status), [200, 200, 200]);
      assert.equal(calls.filter((c) => c === '/api/trial-session').length, 1);
    },
  );
});

test('anything other than 401 trial_required passes straight through (no bootstrap, no retry)', async () => {
  await withFetch(
    () => json(401, { reason: 'not_authenticated' }),
    async (calls) => {
      const res = await paidFetch('/api/dream-analysis');
      assert.equal(res.status, 401);
      assert.deepEqual(calls, ['/api/dream-analysis']);
    },
  );
  await withFetch(
    () => json(429, { reason: 'limit_reached' }),
    async (calls) => {
      assert.equal((await paidFetch('/api/dream-analysis')).status, 429);
      assert.equal(calls.length, 1);
    },
  );
});

test('if the bootstrap itself fails, the original response is returned and the call is not retried', async () => {
  await withFetch(
    (url) => (url === '/api/trial-session' ? json(429, { reason: 'rate_limited' }) : json(401, { reason: 'trial_required' })),
    async (calls) => {
      const res = await paidFetch('/api/dream-analysis');
      assert.equal(res.status, 401);
      assert.deepEqual(calls, ['/api/dream-analysis', '/api/trial-session']);
    },
  );
});
