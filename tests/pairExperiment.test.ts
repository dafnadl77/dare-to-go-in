import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as X from '../scripts/lib/pairExperiment';
import { pairReplySetup } from '../server/routes/dreamExploration';

/**
 * The pair fixed-input test (doc 90 §5, stage 1), checked with NO call: its inputs are the product's own, its budget rule is all or
 * nothing and refuses without her approval, the pacing she approved holds in what it shows, and the judge is not told what the code
 * chose. The script's `send` is run here only with a cap of 0, which can never fit: it must refuse before any client exists.
 */

const run = JSON.parse(readFileSync('docs/upgrade-2026-10/33-stage3b-fix-eval-acc2-1.json', 'utf8'));
const dreams = JSON.parse(readFileSync('docs/upgrade-2026-10/74-acceptance-dreams-2.json', 'utf8'));
const ledgerText = () => readFileSync('docs/upgrade-2026-10/27-eval-cost-ledger.json', 'utf8');

test('the eight moments of acc2-1, as asked, with no interpretive possibility of the old run in their context', () => {
  const ms = X.fixedMoments(run, dreams);
  assert.deepEqual(ms.map((m) => m.key), ['acc2-1#1', 'acc2-1#2', 'acc2-1#3', 'acc2-2#1', 'acc2-2#2', 'acc2-2#3', 'acc2-3#1', 'acc2-3#2']);
  for (const m of ms) for (const p of m.p.prior) assert.equal(p.insight?.possibility ?? '', '');
  // after an "I don't know", the question actually answered (the box moment)
  assert.match(ms[4].question, /תפס את העין/);
});

test('the inputs are the route\'s own: the pair prompt and schema, "up to three" in the test, and the plain question in the prompt', () => {
  const ms = X.fixedMoments(run, dreams);
  const f = pairReplySetup(ms[5].ctx as never, ms[5].p as never, { pairsNow: true });
  assert.match(f.instructions, /"pairs"/);
  assert.doesNotMatch(f.instructions, /"possibilities"/);
  assert.match(f.input, /PAIRS: up to three/);
  assert.match(f.instructions, /מה אתה רואה כשהם עומדים יחד\?/);
  // without forcing, the route's pacing: the first moment is told "not now"
  assert.match(pairReplySetup(ms[3].ctx as never, ms[3].p as never).input, /PAIRS: NOT NOW/);
});

test('the budget is all or nothing, and refuses without her approval', () => {
  const ok = { worstTotal: 0.1037, runCap: 0.11, spentInStage: 3.083421, stageStop: 3.2, alreadyRun: false };
  assert.equal(X.budgetVerdict(ok).ok, true);
  assert.equal(X.budgetVerdict({ ...ok, runCap: 0 }).ok, false, 'no cap approved');
  assert.equal(X.budgetVerdict({ ...ok, stageStop: 3.12 }).ok, false, 'stage 3 has $0.0366 left');
  assert.equal(X.budgetVerdict({ ...ok, alreadyRun: true }).ok, false, 'never twice');
  assert.ok(X.worstCaseUsd('x'.repeat(3000), 'y'.repeat(6000)) > 0.0075);
});

test('the pacing she approved holds in what is shown: never two moments in a row', () => {
  const r = (key: string, plan: string, pair: boolean) => ({ key, plan, label: '', momentText: '', question: '', answer: '', invalid: false, approved: pair ? [{} as never] : [], refused: [], value: { insight: pair ? { pair: {} } : {} } as never });
  const m = X.automaticMeasures([r('a#1', 'a', false), r('a#2', 'a', true), r('a#3', 'a', false), r('b#1', 'b', false), r('b#2', 'b', true)]);
  assert.equal(m.consecutiveShown, 0);
  assert.equal(X.automaticMeasures([r('a#1', 'a', false), r('a#2', 'a', true), r('a#3', 'a', true)]).consecutiveShown, 1, 'the measure sees it');
  assert.ok(X.DECISION_RULE.some((d) => d.he.includes('רצופים') && d.pass.startsWith('0')));
});

test('send without an approved cap refuses before any client, and the ledger is unchanged', () => {
  const before = ledgerText();
  const res = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/pairFixedInputTest.ts', 'send'], { encoding: 'utf8', env: { ...process.env, PFI_RUN_CAP: '0', OPENAI_API_KEY: '' }, timeout: 120000 });
  assert.equal(res.status, 1, res.stdout + res.stderr);
  assert.match(res.stderr, /refused, nothing was sent/);
  assert.equal(ledgerText(), before);
});

test('stub (no network): the whole pipeline runs, the pacing holds, and the judge is not told what the code chose', () => {
  const before = ledgerText();
  const real = 'docs/upgrade-2026-10/97-pair-fixed-input-test.json';
  const realBefore = existsSync(real) ? readFileSync(real, 'utf8') : null;
  const res = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/pairFixedInputTest.ts', 'stub'], { encoding: 'utf8', env: { ...process.env, OPENAI_API_KEY: '' }, timeout: 120000 });
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.equal(ledgerText(), before);
  const dir = join(tmpdir(), 'pairfit-stub');
  assert.ok(existsSync(join(dir, '98-pair-judge-packet.md')));
  const out = JSON.parse(readFileSync(join(dir, '97-pair-fixed-input-test.json'), 'utf8'));
  assert.equal(out.mode, 'stub');
  assert.equal(out.measures.consecutiveShown, 0);
  assert.equal(out.calls.length, 0);
  const packet = readFileSync(join(dir, '98-pair-judge-packet.md'), 'utf8');
  assert.doesNotMatch(packet, /negation|wanted-not-managed|\(נבחר\)|chosen|relation/);
  // a stub never writes the docs folder (the real run's output, once it exists, stays as it was)
  assert.equal(existsSync(real) ? readFileSync(real, 'utf8') : null, realBefore);
});
