import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import OpenAI from 'openai';
import { imageFailureLine } from '../server/routes/dreamImage.ts';

/**
 * 2026-10-28: on the live site every dream picture failed and the server log said nothing about why. Every branch where a picture is
 * not made now writes ONE line with codes only — never the dream, the prompt, the provider's message or a key. And the age question's
 * quiet note gets a little room under the two answers. No network, no AI.
 */

const read = (p: string) => readFileSync(p, 'utf8');

test('the failure line carries the provider status, code and type — and nothing of the message or the dream', () => {
  const err = new OpenAI.APIError(403, { code: 'model_not_allowed', type: 'invalid_request_error', message: 'my secret dream about the sea sk-abc123' }, 'my secret dream about the sea sk-abc123', new Headers());
  const line = imageFailureLine('provider', err);
  assert.match(line, /^dream_image_failed stage=provider status=403 code=model_not_allowed type=invalid_request_error/);
  assert.doesNotMatch(line, /secret|dream about|sea|sk-/);
});

test('a failure that is not the provider\'s still names its stage', () => {
  assert.equal(imageFailureLine('reserve_rejected'), 'dream_image_failed stage=reserve_rejected status=none code=none type=none error=none');
  assert.match(imageFailureLine('provider', new TypeError('fetch failed')), /error=TypeError$/);
});

test('every branch that ends without a picture writes its line; a slow picture is said too', () => {
  const route = read('server/routes/dreamImage.ts');
  for (const stage of ['identity_', 'brief_shape', 'no_attempt', 'no_api_key', 'reserve_unavailable', 'reserve_rejected', 'no_image_data', 'provider']) {
    assert.ok(route.includes(`imageFailureLine(\`${stage}`) || route.includes(`imageFailureLine('${stage}`), stage);
  }
  assert.match(route, /dream_image_slow ms=/);
  // the prompt is never logged
  assert.doesNotMatch(route, /console\.(error|warn|log)\([^)]*prompt/);
});

test('the age question: a little room between the two answers and the note under them; nothing else changes', () => {
  const gate = read('src/auth/AgeGate.tsx');
  assert.match(gate, /<p className="dd-dialog-body ag-note">\s*<small>\{t\('ageGate\.note'\)\}<\/small>/);
  assert.match(read('src/auth/AgeGate.css'), /\.dd-dialog \.ag-note \{\s*margin-top: 1\.1rem;\s*\}/);
});
