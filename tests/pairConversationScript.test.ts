import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SCENARIOS, type Turn } from '../src/map/pairConversationScript';

/** The rules of doc 90 v3, checked on the scripted conversations of the design page (pair-conversation.html). */

type PairTurn = Extract<Turn, { kind: 'pair' }>;
const pairs = (turns: Turn[]) => turns.filter((t): t is PairTurn => t.kind === 'pair');

test('every pair quote is exact: from the dream text, or from an answer already given', () => {
  for (const s of SCENARIOS) {
    const answers: string[] = [];
    for (const step of s.steps) {
      for (const t of step.turns) {
        if (t.kind === 'answer') answers.push(t.text);
        if (t.kind !== 'pair') continue;
        for (const side of [t.a, t.b]) {
          const ok = side.from === 'dream' ? s.dreamText.includes(side.quote) : answers.some((a) => a.includes(side.quote));
          assert.ok(ok, `${s.key}: «${side.quote}» is not exact (${side.from})`);
        }
        assert.notEqual(t.a.from === t.b.from && t.a.quote === t.b.quote, true);
      }
    }
  }
});

test('the two quotes of a pair are not one dream sentence', () => {
  for (const s of SCENARIOS) {
    const sentences = s.dreamText.split(/[.!?]\s*/);
    for (const step of s.steps)
      for (const p of pairs(step.turns)) {
        if (p.a.from !== 'dream' || p.b.from !== 'dream') continue;
        assert.ok(!sentences.some((x) => x.includes(p.a.quote) && x.includes(p.b.quote)), `${s.key}: one dream sentence`);
      }
  }
});

test('pacing: the first moment is listening only, at most one pair per moment, never in consecutive moments', () => {
  for (const s of SCENARIOS) {
    const moments = s.steps.filter((x) => x.moment !== 'whole');
    assert.equal(pairs(moments[0].turns).length, 0, `${s.key}: a pair in the first moment`);
    let previous = false;
    for (const m of moments) {
      const n = pairs(m.turns).length;
      assert.ok(n <= 1, `${s.key}: more than one pair in "${m.moment}"`);
      assert.ok(!(previous && n === 1), `${s.key}: pairs in two moments in a row`);
      previous = n === 1;
    }
  }
});

test('a pair is the last thing in its moment: after it, only her answer and one reflection', () => {
  for (const s of SCENARIOS)
    for (const step of s.steps) {
      const i = step.turns.findIndex((t) => t.kind === 'pair');
      if (i >= 0) assert.equal(i, step.turns.length - 1, `${s.key}: something after the pair in "${step.moment}"`);
    }
});

test('the pair question is open and does not lead (no "האם", no suggested answer, no feeling she did not say)', () => {
  const leading = /האם|ההבדל|הקושי|הפחד|אולי|הקשר|מחבר|שניהם|מתחבר|הניגוד|המתח/;
  for (const s of SCENARIOS)
    for (const step of s.steps)
      for (const p of pairs(step.turns)) {
        assert.ok(!leading.test(p.question), `${s.key}: leading question "${p.question}"`);
        assert.ok(!leading.test(p.intro), `${s.key}: the intro says what links them "${p.intro}"`);
        assert.match(p.question, /^מה /);
      }
});

test('different images are offered only with a verified relation, as an open question', () => {
  const different = SCENARIOS.flatMap((s) => s.steps.flatMap((x) => pairs(x.turns))).filter((p) => p.differentImages);
  assert.ok(different.length >= 1, 'the page shows the different-images case');
  for (const p of different) {
    assert.ok(['negation', 'change', 'wanted-not-managed'].includes(p.relation));
    assert.match(p.question, /\?$/);
  }
});

test('the whole view adds: no quote already shown in a pair, no technical notice, one forward question', () => {
  const notices = /לא נמצא|עדיין לא המבט|זו התבוננות ראשונה|לא נמצא קשר|אין קשר/;
  for (const s of SCENARIOS) {
    const shown = s.steps.flatMap((x) => pairs(x.turns)).flatMap((p) => [p.a.quote, p.b.quote]);
    const whole = s.steps.flatMap((x) => x.turns).find((t): t is Extract<Turn, { kind: 'whole' }> => t.kind === 'whole');
    assert.ok(whole, `${s.key}: no whole view`);
    for (const line of [...whole.answered, ...whole.skipped, whole.question]) {
      assert.ok(!notices.test(line), `${s.key}: technical notice "${line}"`);
      for (const q of shown) {
        // no quote from the pair, and no run of three of its words
        const words = q.split(/\s+/);
        for (let i = 0; i + 3 <= words.length; i++)
          assert.ok(!line.includes(words.slice(i, i + 3).join(' ')), `${s.key}: the whole view repeats «${q}»`);
      }
    }
    assert.equal((whole.question.match(/\?/g) ?? []).length, 1, `${s.key}: one question`);
    // her note: a closing sounds like a person continuing the talk, not a questionnaire, and presumes no meaning
    assert.ok(!/אם בכלל|מזכיר|מה עוד עולה|משמעות|מסמל/.test(whole.question), `${s.key}: questionnaire closing "${whole.question}"`);
    if (whole.invite) assert.ok(whole.unexplored.includes(whole.invite));
  }
});

test('one scenario with a pair, one with none at all', () => {
  const counts = SCENARIOS.map((s) => s.steps.flatMap((x) => pairs(x.turns)).length);
  assert.ok(counts.some((n) => n >= 1));
  assert.ok(counts.some((n) => n === 0));
});

test('reflections are short: at most one "אמרת" each', () => {
  for (const s of SCENARIOS)
    for (const step of s.steps)
      for (const t of step.turns)
        if (t.kind === 'reflect') assert.ok(((t.her ?? '').match(/אמרת/g) ?? []).length <= 1, `${s.key}: "${t.her}"`);
});

test('the page is development only: vite builds index.html alone, and the page loads no network code', () => {
  const config = readFileSync('vite.config.ts', 'utf8');
  assert.ok(!/pair-conversation/.test(config));
  assert.ok(!/rollupOptions[\s\S]*input/.test(config), 'vite.config gained build inputs');
  for (const f of ['src/map/PairConversation.tsx', 'src/map/pairConversationMain.tsx', 'src/map/pairConversationScript.ts']) {
    const src = readFileSync(f, 'utf8');
    assert.ok(!/fetch\(|supabase|XMLHttpRequest|WebSocket|localStorage|indexedDB/i.test(src), `${f} reaches out`);
  }
});
