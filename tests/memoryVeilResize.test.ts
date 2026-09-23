import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidViewportSize } from '../src/hero/viewportGuard.ts';

// Regression coverage for the resize() guard in MemoryVeil.tsx: a transient
// window.innerWidth/innerHeight of 0 during a resize/viewport-emulation
// transition must never be treated as a valid size. The full resize()/
// frame() interaction (canvas + video elements) isn't unit-testable here
// without adding DOM/canvas test infrastructure the repo doesn't otherwise
// need; that end-to-end behavior (dimensions preserved, animation keeps
// running) is verified live in the browser instead. This test covers the
// actual guard predicate resize() relies on.

test('a normal, positive resize reading is valid', () => {
  assert.equal(isValidViewportSize(375, 812), true);
  assert.equal(isValidViewportSize(1280, 900), true);
});

test('a transient 0-width or 0-height reading is rejected, so the last valid canvas dimensions are kept', () => {
  assert.equal(isValidViewportSize(0, 812), false);
  assert.equal(isValidViewportSize(375, 0), false);
  assert.equal(isValidViewportSize(0, 0), false);
});

test('a negative reading (should not occur, but must not slip past the guard) is also rejected', () => {
  assert.equal(isValidViewportSize(-1, 812), false);
  assert.equal(isValidViewportSize(375, -1), false);
});

test('the guard only rejects on an invalid reading — a subsequent valid resize is accepted normally', () => {
  assert.equal(isValidViewportSize(0, 0), false);
  assert.equal(isValidViewportSize(768, 1024), true);
});
