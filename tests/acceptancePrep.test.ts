import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

/**
 * The preparation for the second acceptance run (doc 73, steps 1 and 3), checked without running anything and without reading the
 * blind dreams: the seal of doc 74 holds, the run script would use only those dreams under their own $0.40 cap, and the stage-3 cap is
 * the one she approved ($3.12). The acceptance run itself needs her separate approval.
 */

const DOCS = (f: string) => new URL(`../docs/upgrade-2026-10/${f}`, import.meta.url);
const EVAL = readFileSync(new URL('../scripts/explorationEval.ts', import.meta.url), 'utf8');

test('the blind dreams of doc 74 are exactly the file whose SHA-256 was recorded before any run', () => {
  const recorded = readFileSync(DOCS('74-acceptance-dreams-2-note.md'), 'utf8').match(/`([0-9a-f]{64})`/)?.[1];
  const actual = createHash('sha256').update(readFileSync(DOCS('74-acceptance-dreams-2.json'))).digest('hex');
  assert.equal(actual, recorded);
});

test('the run script: the round "acc2" has its own $0.40 cap, runs only the sealed dreams of doc 74, and checks their seal', () => {
  assert.match(EVAL, /acc2: 0\.4\b/);
  assert.match(EVAL, /acceptance2: \['74-acceptance-dreams-2\.json', '74-acceptance-dreams-2-note\.md'\]/);
  assert.match(EVAL, /ROUND === 'acc2' && \(only !== 'acceptance2' \|\| plans\.length !== 3\)/);
  assert.match(EVAL, /recorded !== actual\) throw new Error/);
});

test('the stage-3 cap is $3.3434 (doc 73 step 3, raised by $0.0734 in doc 99 and $0.15 in doc 105), the stop is at the cap (doc 80), and the ledger says the same', () => {
  assert.match(EVAL, /const CAP_USD = 3\.3434;/);
  assert.match(EVAL, /const STOP_AT_USD = 3\.3434;/); // her decision of doc 80: the stop at the cap
  const ledger = JSON.parse(readFileSync(DOCS('27-eval-cost-ledger.json'), 'utf8'));
  assert.equal(ledger.capUsd, 3.3434);
  assert.equal(ledger.stopAtUsd, 3.3434);
});

// (updated after the acceptance run she approved, doc 81: it was "no run yet"; now exactly that one run, within its cap, and no rerun)
test('exactly one acceptance-2 run was made (acc2-1, approved), within its $0.40 cap, and no rerun', () => {
  const ledger = JSON.parse(readFileSync(DOCS('27-eval-cost-ledger.json'), 'utf8'));
  const runs = new Set(ledger.entries.filter((e: { run: string }) => e.run.startsWith('acc2-')).map((e: { run: string }) => e.run));
  assert.deepEqual([...runs], ['acc2-1']);
  const spent = ledger.entries.filter((e: { run: string }) => e.run === 'acc2-1').reduce((a: number, e: { usd: number }) => a + e.usd, 0);
  assert.ok(spent <= 0.4, String(spent));
});
