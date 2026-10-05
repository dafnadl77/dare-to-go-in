import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harnessAllowed } from '../server/pdf/previewHarness.ts';

/** PREVIEW ONLY (this file lives on the preview branch with the harness): the harness can never answer in production. */

test('the preview harness answers ONLY on a Vercel preview deployment of a preview/* branch', () => {
  assert.equal(harnessAllowed({ VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'preview/dream-journal-pdf' }), true);
  for (const env of [
    {},
    { VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'main' },
    { VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'preview/dream-journal-pdf' },
    { VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'main' },
    { VERCEL_ENV: 'preview' },
    { VERCEL_ENV: 'development', VERCEL_GIT_COMMIT_REF: 'preview/x' },
    { NODE_ENV: 'production' },
  ]) {
    assert.equal(harnessAllowed(env as NodeJS.ProcessEnv), false, JSON.stringify(env));
  }
});

test('the harness touches no database, storage or AI client and writes nothing', async () => {
  const { readFileSync } = await import('node:fs');
  const src = ['server/pdf/previewHarness.ts', 'server/pdf/previewFixtures.ts'].map((f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')).join('\n');
  assert.ok(!/supabase|openai|createClient|\.upload\(|writeFile|createWriteStream|SERVICE_ROLE/i.test(src));
});
