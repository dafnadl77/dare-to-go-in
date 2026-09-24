import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { paidFetch, RequestTimeoutError } from '../src/auth/paidFetch.ts';
import { IMAGE_TIMEOUT_MS, ANALYSIS_TIMEOUT_MS, REFLECTION_TIMEOUT_MS, LABELS_TIMEOUT_MS } from '../src/hero/requestTimeouts.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

type FetchStub = (input: string, init?: RequestInit) => Promise<Response> | Response;

async function withFetch<T>(stub: FetchStub, run: (calls: { url: string; init?: RequestInit }[]) => Promise<T>): Promise<T> {
  const calls: { url: string; init?: RequestInit }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return stub(String(input), init);
  }) as typeof fetch;
  try {
    return await run(calls);
  } finally {
    globalThis.fetch = original;
  }
}

/** A request that never answers on its own but honors abort, like a real fetch. */
const hangingFetch: FetchStub = (_url, init) =>
  new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
  });

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('the deadlines are the specified ones', () => {
  assert.equal(IMAGE_TIMEOUT_MS, 90_000);
  assert.equal(ANALYSIS_TIMEOUT_MS, 45_000);
  assert.equal(REFLECTION_TIMEOUT_MS, 45_000);
  assert.equal(LABELS_TIMEOUT_MS, 45_000);
});

test('a timeout ABORTS the request and rejects with RequestTimeoutError', async () => {
  await withFetch(hangingFetch, async (calls) => {
    const started = Date.now();
    await assert.rejects(paidFetch('/api/dream-image', { method: 'POST' }, { timeoutMs: 40 }), (err: unknown) => err instanceof RequestTimeoutError);
    assert.ok(Date.now() - started < 1000);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].init?.signal?.aborted, true, 'the underlying request was actually aborted');
  });
});

test('a timeout is NEVER retried: no second request appears afterwards (no duplicate request, so no duplicate spend)', async () => {
  await withFetch(hangingFetch, async (calls) => {
    await assert.rejects(paidFetch('/api/dream-analysis', { method: 'POST' }, { timeoutMs: 30 }));
    await sleep(120);
    assert.equal(calls.length, 1);
  });
});

test('a response that arrives in time is returned intact (status, headers and body)', async () => {
  await withFetch(
    () => json(200, { ok: true, n: 7 }),
    async () => {
      const res = await paidFetch('/api/dream-reflection', { method: 'POST' }, { timeoutMs: 1000 });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-type'), 'application/json');
      assert.deepEqual(await res.json(), { ok: true, n: 7 });
    },
  );
});

test('error statuses pass through unchanged so existing error mapping still works (402 credits_required, 403 free_dream_used)', async () => {
  for (const [status, reason] of [[402, 'credits_required'], [403, 'free_dream_used'], [502, 'request_failed']] as const) {
    await withFetch(
      () => json(status, { reason, message: 'm' }),
      async () => {
        const res = await paidFetch('/api/dream-analysis', { method: 'POST' }, { timeoutMs: 1000 });
        assert.equal(res.status, status);
        assert.equal(((await res.json()) as { reason: string }).reason, reason);
      },
    );
  }
});

test('a server that sends headers and then STALLS the body is also bounded by the deadline', async () => {
  const stalled = { status: 200, statusText: 'OK', headers: new Headers(), clone: () => stalled, text: () => new Promise<string>(() => {}) } as unknown as Response;
  await withFetch(
    () => stalled,
    async () => {
      await assert.rejects(paidFetch('/api/dream-image', { method: 'POST' }, { timeoutMs: 40 }), (err: unknown) => err instanceof RequestTimeoutError);
    },
  );
});

test('the one trial bootstrap + retry still happens inside a single deadline, and only once', async () => {
  let ready = false;
  await withFetch(
    (url) => {
      if (url === '/api/trial-session') {
        ready = true;
        return json(200, { kind: 'trial' });
      }
      return ready ? json(200, { ok: true }) : json(401, { reason: 'trial_required' });
    },
    async (calls) => {
      const res = await paidFetch('/api/dream-analysis', { method: 'POST' }, { timeoutMs: 1000 });
      assert.equal(res.status, 200);
      assert.deepEqual(calls.map((c) => c.url), ['/api/dream-analysis', '/api/trial-session', '/api/dream-analysis']);
    },
  );
});

test('without a timeout paidFetch behaves exactly as before (the untimed path is untouched)', async () => {
  await withFetch(
    () => json(200, { ok: 1 }),
    async (calls) => {
      const res = await paidFetch('/api/dream-transcription', { method: 'POST' });
      assert.equal(res.status, 200);
      assert.equal(calls[0].init?.signal, undefined);
    },
  );
});

test('all four AI clients pass their own deadline, and a timeout lands in their existing recoverable failure path', () => {
  const expectations: [string, string][] = [
    ['src/hero/dreamAnalysis.ts', 'ANALYSIS_TIMEOUT_MS'],
    ['src/hero/dreamImage.ts', 'IMAGE_TIMEOUT_MS'],
    ['src/hero/dreamReflectionEngine.ts', 'REFLECTION_TIMEOUT_MS'],
    ['src/hero/dreamElementLabels.ts', 'LABELS_TIMEOUT_MS'],
  ];
  for (const [file, constant] of expectations) {
    const src = read(file);
    assert.match(src, new RegExp(`\\{ timeoutMs: ${constant} \\}`), file);
    // the thrown RequestTimeoutError is caught by the client's own catch and turned into request_failed
    assert.match(src, /\} catch \(err\) \{[\s\S]*?reason: 'request_failed'/, file);
  }
});

test('transcription keeps its own cancel and gets NO client deadline (its user-facing cancel is untouched)', () => {
  const src = read('src/hero/dreamTranscription.ts');
  assert.ok(!/requestTimeouts|timeoutMs/.test(src));
  assert.match(src, /signal\?: AbortSignal/);
});

test('a timed-out analysis is never retried automatically: the only re-submit paths are the dreamer\'s own TRY AGAIN / EDIT', () => {
  const hero = read('src/hero/HeroDream.tsx');
  const calls = hero.match(/runAnalysis\(/g) ?? [];
  assert.equal(calls.length, 2, 'only handleDreamCapture and handleRetryAnalysis (both dreamer-initiated) call it');
  assert.match(hero, /const handleDreamCapture = \(input: DreamInput\) => \{\s*dreamInputRef\.current = input;\s*runAnalysis\(input\);/);
  assert.match(hero, /const handleRetryAnalysis = \(\) => \{\s*if \(!dreamInputRef\.current\) return;\s*runAnalysis\(dreamInputRef\.current\);/);
  assert.ok(!/setTimeout\([^)]*runAnalysis|setInterval\([^)]*runAnalysis/.test(hero));
});
