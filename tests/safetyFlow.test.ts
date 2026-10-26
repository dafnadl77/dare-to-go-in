import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as X from '../src/hero/exploration';
import * as R from '../server/routes/dreamExploration';
import { typedAnalysis } from '../src/demo/demoRouter';
import type { DreamAnalysis } from '../src/hero/dreamAnalysisSchema';
import { createExplorationEngine } from '../src/hero/explorationEngineCore';
import { crisisContent } from '../src/hero/safety/crisisTexts';
import { CONVERSATIONS } from '../src/map/conversationScript';

/**
 * THE DISTRESS PATH IN THE FLOW (doc 106, stage א). The route checks her words in code BEFORE anything else: on risk it makes no model
 * call and takes no slot; after immediate danger or a threat, the journey makes no further model call; "it was in the dream" and
 * "not in immediate danger" let the conversation go on. It works with no model at all, and it keeps no mark of risk anywhere. The texts
 * are fixed, in every form of address. Written BEFORE the build (doc 107). No network, no AI.
 */

const store = CONVERSATIONS.find((c) => c.key === 'store')!;
const seeds = store.moments.map((m) => ({ label: m.label, excerpt: m.excerpt }));
const analysis = () => typedAnalysis(store.dreamText, true) as unknown as DreamAnalysis;
const T0 = new Date('2026-10-24T12:00:00Z');

let calls = 0;
const stubClient = () =>
  ({ responses: { create: async () => ((calls += 1), { model: 'stub', output_text: JSON.stringify({ reply: 'פשוט וקליל.', offer: '', anchors: [], facts: [], move: 'reflect' }), usage: { input_tokens: 0, output_tokens: 0 } }) } }) as never;
const deps = (log: string[], over: Partial<R.ExplorationDeps> = {}): R.ExplorationDeps => ({
  ...R.realExplorationDeps,
  moderate: async () => ({ status: 'ok' as const, hit: false }),
  resolveIdentity: async () => ({ ok: true, identity: { kind: 'user', userId: 'u' } }) as never,
  openai: () => stubClient(),
  rateLimit: async () => (log.push('rate'), { allowed: true, retryAfterSeconds: 0 }) as never,
  reserveMoment: async () => (log.push('slot'), 'reserved'),
  refundMoment: async () => {},
  reserveWhole: async () => (log.push('whole'), 'reserved'),
  refundWhole: async () => {},
  address: async () => 'feminine',
  ...over,
});
function journeyWith(her: string) {
  let e = X.createExploration('safety', seeds);
  e = X.beginConversation(e, 'm1', { role: 'dare', text: 'איך הוא נראה לך?', move: 'ask' }, T0);
  return X.addDreamerTurn(e, 'm1', her);
}
const body = (e: X.Exploration, extra: Record<string, unknown> = {}) => ({ language: 'he', attemptId: e.attemptId, dreamAnalysis: analysis(), exploration: e, momentId: 'm1', ...extra });
const turn = (e: X.Exploration, d: R.ExplorationDeps, extra: Record<string, unknown> = {}) => R.handleExploration('conversation-turn', body(e, extra), {}, d);

test('her words say she wants to die: no model call, no slot — the distress path answers', async () => {
  calls = 0;
  const log: string[] = [];
  const res = await turn(journeyWith('אני רוצה למות'), deps(log));
  assert.equal(res.status, 200);
  assert.deepEqual((res.body as { safety: { level: string } }).safety.level, 'concern');
  assert.equal(calls, 0);
  assert.deepEqual(log, [], 'no rate-limit hit, no slot taken');
});

test('"not in immediate danger": the conversation goes on, gently (the model is told it is a sensitive moment)', async () => {
  calls = 0;
  const res = await turn(journeyWith('אני רוצה למות'), deps([]), { safetyAck: 'not-immediate' });
  assert.equal(res.status, 200);
  assert.ok((res.body as { turn?: unknown }).turn, JSON.stringify(res.body));
  assert.equal(calls, 1);
});

test('immediate danger stops the journey: no model call now, and none later, whatever she answers', async () => {
  calls = 0;
  let e = journeyWith('לקחתי הרבה כדורים');
  const first = await turn(e, deps([]), { safetyAck: 'not-immediate' });
  assert.equal((first.body as { safety: { level: string } }).safety.level, 'danger');
  // the next turn, even with an "acknowledgement", and even "what came up": still nothing is sent to the model
  e = X.addDareTurn(e, 'm1', { role: 'dare', text: 'x' });
  e = X.addDreamerTurn(e, 'm1', 'סתם, הכל בסדר');
  const second = await turn(e, deps([]), { safetyAck: 'not-immediate' });
  assert.equal((second.body as { safety: { level: string } }).safety.level, 'danger');
  assert.equal(calls, 0);
});

test('a threat to someone else stops the journey too', async () => {
  calls = 0;
  const res = await turn(journeyWith('אני הולך להרוג אותו'), deps([]), { safetyAck: 'not-immediate' });
  assert.equal((res.body as { safety: { level: string } }).safety.level, 'threat');
  assert.equal(calls, 0);
});

test('"it was in the dream": an uncertain moment goes on when she says so', async () => {
  calls = 0;
  const asked = await turn(journeyWith('הרגשתי שאני רוצה למות'), deps([]));
  assert.equal((asked.body as { safety: { level: string } }).safety.level, 'uncertain');
  const goes = await turn(journeyWith('הרגשתי שאני רוצה למות'), deps([]), { safetyAck: 'dream' });
  assert.ok((goes.body as { turn?: unknown }).turn);
  assert.equal(calls, 1);
});

test('a frightening dream answer goes on as always: no distress path', async () => {
  calls = 0;
  const res = await turn(journeyWith('חלמתי שאבא שלי מת ובכיתי בהלוויה'), deps([]));
  assert.ok((res.body as { turn?: unknown }).turn);
  assert.equal(calls, 1);
});

test('with no model at all (not configured), the distress path still answers — it is code', async () => {
  const res = await turn(journeyWith('אני רוצה למות'), deps([], { openai: () => null }));
  assert.equal(res.status, 200);
  assert.equal((res.body as { safety: { level: string } }).safety.level, 'concern');
});

test('nothing marks her: no risk flag is kept in the journey, and nothing about it is logged', async () => {
  const e = journeyWith('אני רוצה למות');
  const logged: string[] = [];
  const orig = console.log;
  const origWarn = console.warn;
  console.log = (...a: unknown[]) => void logged.push(a.join(' '));
  console.warn = (...a: unknown[]) => void logged.push(a.join(' '));
  try {
    await turn(e, deps([]));
  } finally {
    console.log = orig;
    console.warn = origWarn;
  }
  assert.ok(!logged.some((l) => /למות|concern|safety|risk/i.test(l)), logged.join('\n'));
  const back = X.parseExploration(JSON.parse(JSON.stringify({ ...e, safety: 'concern', explored: { ...e.explored, m1: { ...e.explored.m1, risk: 'concern' } } })));
  assert.ok(!JSON.stringify(back).includes('concern'), 'a stored journey never carries a risk mark');
});

test('the browser side: her words are checked before anything is sent; after danger nothing is sent', async () => {
  const sent: unknown[] = [];
  const engine = createExplorationEngine({ post: async (_u, b) => (sent.push(b), { status: 200, data: { turn: { role: 'dare', text: 'x' } } }) }) as unknown as Record<string, any>;
  const out = await engine.turn(journeyWith('אני רוצה למות'), analysis(), 'm1', 'he', []);
  assert.equal(out.status, 'safety');
  assert.equal(out.level, 'concern');
  assert.equal(sent.length, 0, 'her words did not leave the browser');
  const goes = await engine.turn(journeyWith('אני רוצה למות'), analysis(), 'm1', 'he', [], { safetyAck: 'not-immediate' });
  assert.equal(goes.status, 'ok');
  assert.equal((sent[0] as { safetyAck: string }).safetyAck, 'not-immediate');
  const stop = await engine.turn(journeyWith('לקחתי הרבה כדורים'), analysis(), 'm1', 'he', [], { safetyAck: 'not-immediate' });
  assert.equal(stop.status, 'safety');
  assert.equal(stop.level, 'danger');
  assert.equal(sent.length, 1);
});

test('the fixed texts (doc 106, ד): every level, every address, with the numbers; never written by the model', () => {
  for (const address of ['feminine', 'masculine', 'neutral'] as const) {
    for (const level of ['uncertain', 'concern', 'after-not-immediate', 'danger', 'threat'] as const) {
      const c = crisisContent(level, address, 'he');
      assert.ok(c.lines.length > 0, `${level}/${address}`);
      const all = c.lines.join(' ');
      if (level !== 'uncertain') assert.match(all + c.contacts.map((x) => x.number).join(' '), /1201/, `${level}/${address}`);
      if (level === 'danger') for (const n of ['101', '100', '1201']) assert.ok(c.contacts.some((x) => x.number === n), `${level}/${address}: ${n}`);
    }
  }
  assert.match(crisisContent('concern', 'masculine', 'he').lines.join(' '), /אתה בטוח/);
  assert.match(crisisContent('concern', 'feminine', 'he').lines.join(' '), /את בטוחה/);
  assert.doesNotMatch(crisisContent('concern', 'neutral', 'he').lines.join(' '), /את בטוחה|אתה בטוח/);
  assert.ok(crisisContent('concern', 'feminine', 'en').lines.join(' ').length > 0);
  // the texts live in code: the model never writes them, and the route never asks the model for them
  assert.doesNotMatch(readFileSync('src/hero/safety/crisisTexts.ts', 'utf8'), /openai|responses\.create/i);
});

// ------------------------------------------------------------------------------------------------ DARE's own words, before they are shown

test('the model\'s answer is checked before it is shown: means, encouragement, or posing as a therapist never reach her', async () => {
  const bad = [
    'אפשר לקחת כמה כדורי שינה כדי להירדם לתמיד.',
    'אולי כדאי לך פשוט לסיים עם הכל.',
    'אני הפסיכולוגית שלך, ואני חושבת שאת בדיכאון.',
    "As your therapist, I think you should end it.",
    'You should kill yourself.',
    'לכי תמותי.',
  ];
  for (const reply of bad) {
    calls = 0;
    const client = { responses: { create: async () => ((calls += 1), { model: 'stub', output_text: JSON.stringify({ reply, offer: '', anchors: [], facts: [], move: 'reflect' }), usage: { input_tokens: 0, output_tokens: 0 } }) } } as never;
    const res = await turn(journeyWith('עץ הזית הקטן היה פשוט וקליל.'), deps([], { openai: () => client }));
    const shown = JSON.stringify(res.body);
    assert.ok(!shown.includes(reply.slice(0, 20)), `shown: ${reply}`);
  }
});

test('if the check of the answer itself fails, the answer is not shown (fail closed)', async () => {
  const S = await import('../src/hero/safety/outputCheck');
  assert.equal(S.checkOutputSafely(() => { throw new Error('broken'); }).ok, false);
  assert.equal(S.checkOutput('פשוט וקליל, ושקט.').ok, true, 'an ordinary answer passes');
  assert.equal(S.checkOutput('בחלום, העץ אמר לך בשקט: «אתה כבר יודע איזה צריך».').ok, true);
});
