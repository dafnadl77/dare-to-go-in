import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  answerFollowUp,
  answerMoment,
  abandonMoment,
  basedOnKey,
  beginMoment,
  canRequestWholeView,
  compatFieldsFromExploration,
  completeMoment,
  createExploration,
  exploredCount,
  exploredInOrder,
  needsQuestionCall,
  needsReplyCall,
  parseExploration,
  questionPlanFor,
  receiveRefreshedInsight,
  receiveReply,
  receiveWholeView,
  wholeViewIsStale,
  wholeViewUpdatesLeft,
  MAX_WHOLE_VIEWS,
  type Exploration,
} from '../src/hero/exploration.ts';
import { excerptForMoment } from '../src/hero/momentExcerpt.ts';
import { mapFromExploration } from '../src/map/fromExploration.ts';
import { buildSavedDream } from '../src/hero/dreamStorage.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const T = new Date('2026-10-20T10:00:00Z');
const insight = (n: string) => ({ observation: `observation ${n}`, reflection: `reflection ${n}`, possibility: `possibility ${n}` });

function seeds(n: number) {
  return Array.from({ length: n }, (_, i) => ({ label: `moment ${i + 1}`, pregeneratedQuestion: `pre-written question ${i + 1}?` }));
}

/** Explores one moment end to end (question, answer, insight, done). */
function explore(e: Exploration, id: string, answer = `answer ${id}`): Exploration {
  const plan = questionPlanFor(e, id);
  e = beginMoment(e, id, plan.kind === 'ready' ? plan.question : `adaptive question ${id}?`, plan.kind === 'ready' ? plan.source : 'adaptive', T);
  e = answerMoment(e, id, answer);
  e = receiveReply(e, id, insight(id), null);
  return completeMoment(e, id, T);
}

const view = (connections: { from: string; to: string }[] = []) => ({
  overview: 'what joins the moments',
  recurring: null,
  contrast: 'a difference',
  readings: [{ basis: 'b', reading: 'r' }],
  closingQuestion: 'a question to keep?',
  connections: connections.map((c) => ({ ...c, title: 'a link', basis: 'what it rests on' })),
});

// ------------------------------------------------------------------------------------------------ the number of moments comes from the dream

test('creation keeps the dream\'s own moments only: 1 to 6, empty ones dropped, never padded, ids m1..m6', () => {
  assert.equal(createExploration('a', seeds(1)).moments.length, 1);
  assert.equal(createExploration('a', seeds(6)).moments.length, 6);
  assert.equal(createExploration('a', seeds(9)).moments.length, 6);
  const e = createExploration('a', [{ label: '  ' }, { label: 'door' }, { label: '' }, { label: 'sea' }]);
  assert.deepEqual(e.moments.map((m) => [m.id, m.label]), [['m1', 'door'], ['m2', 'sea']]);
  assert.equal(createExploration('a', []).moments.length, 0);
});

// ------------------------------------------------------------------------------------------------ exploring is free: one, some or all

test('a journey with one explored moment is complete enough for a whole view; exploring the rest is never required', () => {
  let e = createExploration('att', seeds(6));
  e = explore(e, 'm3');
  assert.equal(exploredCount(e), 1);
  assert.equal(canRequestWholeView(e), true, 'the whole view is offered after ONE moment');
  e = receiveWholeView(e, view(), basedOnKey(e), T);
  assert.ok(e.wholeView);
  assert.equal(e.wholeView!.momentIds.length, 1);
});

test('the moments are explored in the dreamer\'s own order, and that order is kept', () => {
  let e = createExploration('att', seeds(4));
  for (const id of ['m4', 'm1', 'm3']) e = explore(e, id);
  assert.deepEqual(exploredInOrder(e).map((x) => x.moment.id), ['m4', 'm1', 'm3']);
});

// Changed in the stage 3b fix round (decision of 2026-10-21, doc 30): the first moment's question is written for it too; the
// questions written in advance were written for the analysis's words, not for the moments the dreamer chooses.
test('every moment\'s question is written for it, the first one too; after an answer every question is written with the answers', () => {
  let e = createExploration('att', seeds(3));
  assert.deepEqual(questionPlanFor(e, 'm2'), { kind: 'needs-call' }, 'not the pre-written question, not even for the first moment');
  e = explore(e, 'm2');
  assert.deepEqual(questionPlanFor(e, 'm1'), { kind: 'needs-call' }, 'an answer exists, so a pre-written question cannot be adaptive');
  assert.equal(needsQuestionCall(e, 'm1'), true);
});

test('one moment at a time; an explored moment cannot be reopened as new; an unanswered one can be left', () => {
  let e = createExploration('att', seeds(3));
  e = beginMoment(e, 'm1', 'q?', 'pregenerated', T);
  assert.equal(beginMoment(e, 'm2', 'q2?', 'adaptive', T), e, 'another moment is open');
  e = abandonMoment(e, 'm1');
  assert.equal(e.explored.m1, undefined);
  e = explore(e, 'm1');
  assert.equal(beginMoment(e, 'm1', 'again?', 'adaptive', T), e, 'an explored moment is never started again');
  assert.equal(abandonMoment(e, 'm1'), e, 'an explored moment is never removed');
});

// ------------------------------------------------------------------------------------------------ clarification: optional, at most once, skippable

test('a clarification is shown only when the reply brought one, can be skipped, and is asked at most once', () => {
  let e = createExploration('att', seeds(2));
  e = beginMoment(e, 'm1', 'q?', 'pregenerated', T);
  e = answerMoment(e, 'm1', 'my answer');
  e = receiveReply(e, 'm1', insight('1'), 'a clarification?');
  assert.equal(completeMoment(e, 'm1', T), e, 'cannot close while the clarification waits');
  e = answerFollowUp(e, 'm1', null); // skipped
  assert.equal(e.explored.m1.followUp?.skipped, true);
  assert.equal(needsReplyCall(e, 'm1'), false, 'skipping never costs a call');
  e = completeMoment(e, 'm1', T);
  assert.equal(e.explored.m1.status, 'explored');
});

test('an answered clarification brings exactly one refreshed insight, never a second', () => {
  let e = createExploration('att', seeds(2));
  e = beginMoment(e, 'm1', 'q?', 'pregenerated', T);
  e = answerMoment(e, 'm1', 'my answer');
  assert.equal(needsReplyCall(e, 'm1'), true);
  e = receiveReply(e, 'm1', insight('first'), 'a clarification?');
  assert.equal(needsReplyCall(e, 'm1'), false);
  e = answerFollowUp(e, 'm1', 'more detail');
  assert.equal(needsReplyCall(e, 'm1'), true);
  e = receiveRefreshedInsight(e, 'm1', insight('refreshed'));
  assert.equal(needsReplyCall(e, 'm1'), false);
  assert.equal(receiveRefreshedInsight(e, 'm1', insight('third')), e, 'never refreshed twice');
  e = completeMoment(e, 'm1', T);
  assert.equal(e.explored.m1.insight?.observation, 'observation refreshed');
  // a reply never adds a second clarification
  let f = createExploration('att', seeds(1));
  f = beginMoment(f, 'm1', 'q?', 'pregenerated', T);
  f = answerMoment(f, 'm1', 'a');
  f = receiveReply(f, 'm1', insight('1'), 'first?');
  f = answerFollowUp(f, 'm1', 'b');
  f = receiveReply(f, 'm1', insight('2'), 'second?');
  assert.equal(f.explored.m1.followUp?.question, 'first?');
});

test('if the refreshed insight fails, the dreamer can still go on with the first one (explicitly)', () => {
  let e = createExploration('att', seeds(1));
  e = beginMoment(e, 'm1', 'q?', 'pregenerated', T);
  e = answerMoment(e, 'm1', 'a');
  e = receiveReply(e, 'm1', insight('first'), 'more?');
  e = answerFollowUp(e, 'm1', 'b');
  assert.equal(completeMoment(e, 'm1', T), e);
  e = completeMoment(e, 'm1', T, { keepFirstInsight: true });
  assert.equal(e.explored.m1.status, 'explored');
});

// ------------------------------------------------------------------------------------------------ the whole view: no repeated calls, a clear limit

test('the whole view is never requested twice for the same answers, only again after a new moment, at most 3 times', () => {
  let e = createExploration('att', seeds(6));
  assert.equal(canRequestWholeView(e), false, 'nothing explored yet');
  e = explore(e, 'm1');
  e = receiveWholeView(e, view(), basedOnKey(e), T);
  assert.equal(canRequestWholeView(e), false, 'same answers: the stored view is shown, no call');
  assert.equal(wholeViewIsStale(e), false);
  e = explore(e, 'm2');
  assert.equal(wholeViewIsStale(e), true);
  assert.equal(canRequestWholeView(e), true);
  e = receiveWholeView(e, view([{ from: 'm1', to: 'm2' }]), basedOnKey(e), T);
  e = explore(e, 'm3');
  e = receiveWholeView(e, view(), basedOnKey(e), T);
  assert.equal(e.wholeViewCount, MAX_WHOLE_VIEWS);
  assert.equal(wholeViewUpdatesLeft(e), 0);
  e = explore(e, 'm4');
  assert.equal(canRequestWholeView(e), false, 'the limit holds even with a new moment');
});

test('a late whole view written from older answers is ignored; links only between two different explored moments', () => {
  let e = createExploration('att', seeds(4));
  e = explore(e, 'm1');
  const oldKey = basedOnKey(e);
  e = explore(e, 'm2');
  assert.equal(receiveWholeView(e, view(), oldKey, T), e, 'written from answers that are no longer current');
  e = receiveWholeView(
    e,
    view([{ from: 'm1', to: 'm2' }, { from: 'm2', to: 'm1' }, { from: 'm1', to: 'm1' }, { from: 'm1', to: 'm3' }, { from: 'm9', to: 'm1' }]),
    basedOnKey(e),
    T,
  );
  assert.deepEqual(e.wholeView!.connections.map((c) => `${c.from}-${c.to}`), ['m1-m2'], 'duplicate, self, unexplored and unknown links dropped');
});

// ------------------------------------------------------------------------------------------------ storage round trip and compatibility

test('parseExploration: a saved journey reads back the same; older dreams and malformed data give null, never invented content', () => {
  let e = createExploration('att', seeds(3));
  e = explore(e, 'm2');
  e = receiveWholeView(e, view(), basedOnKey(e), T);
  assert.deepEqual(parseExploration(JSON.parse(JSON.stringify(e))), e);
  assert.equal(parseExploration(undefined), null);
  assert.equal(parseExploration({}), null);
  assert.equal(parseExploration({ version: 2, attemptId: 'a', moments: [{ id: 'm1', label: 'x' }] }), null);
  const broken = JSON.parse(JSON.stringify(e));
  broken.explored.m2.insight = null; // an "explored" moment without its insight is not explored
  assert.equal(parseExploration(broken)!.explored.m2, undefined);
});

test('compatibility: the fields every existing reader uses are filled from the journey, never invented', () => {
  let e = createExploration('att', [{ label: 'the open door' }, { label: 'the sea' }]);
  assert.equal(compatFieldsFromExploration(e, 'G'), null, 'nothing explored: nothing to save');
  e = explore(e, 'm2', 'it was calm');
  let c = compatFieldsFromExploration(e, 'G')!;
  assert.equal(c.selectedElement, 'the sea');
  assert.equal(c.reflectionResponse, 'it was calm');
  assert.equal(c.dreamReflection.observation, 'observation m2');
  assert.equal(c.dreamReflection.groundingStatement, 'G');
  assert.deepEqual(c.dreamReflection.lenses, { cognitive: null, jungian: null, psychodynamic: null });
  e = receiveWholeView(e, view(), basedOnKey(e), T);
  c = compatFieldsFromExploration(e, 'G')!;
  assert.equal(c.dreamReflection.observation, 'what joins the moments');
  assert.equal(c.dreamReflection.continuityQuestion, 'a question to keep?');
});

test('a saved dream keeps a valid journey and drops an invalid one; dreams without it stay exactly as before', () => {
  let e = createExploration('att', seeds(2));
  e = explore(e, 'm1');
  const base = {
    sourceText: 'x',
    inputMode: 'text' as const,
    dreamAnalysis: {} as never,
    dreamImageDataUrl: null,
    selectedElement: 's',
    reflectionResponse: 'r',
    dreamReflection: {} as never,
    corrections: [],
    appLanguage: 'he' as const,
  };
  assert.deepEqual(buildSavedDream({ ...base, exploration: e }).exploration, e);
  assert.equal('exploration' in buildSavedDream({ ...base, exploration: { nonsense: true } as never }), false);
  assert.equal('exploration' in buildSavedDream(base), false);
});

// ------------------------------------------------------------------------------------------------ the line "from the dream"

test('excerpt: a sentence copied from the dream itself (Hebrew prefixes understood), or nothing', () => {
  const he = 'התעוררתי בחדר שינה שלא הכרתי. התקרה הייתה עשויה ממים. הדלת בצד החדר הייתה פתוחה, אבל לא ידעתי לאן היא מובילה.';
  assert.equal(excerptForMoment(he, null, 'הדלת הפתוחה'), 'הדלת בצד החדר הייתה פתוחה, אבל לא ידעתי לאן היא מובילה.');
  assert.equal(excerptForMoment(he, null, 'תקרה של מים'), 'התקרה הייתה עשויה ממים.');
  assert.equal(excerptForMoment(he, null, 'סוס לבן'), null, 'no shared word: no excerpt, never a written one');
  const en = 'I woke up in a room. Through the window I saw a calm sea. The door was open.';
  assert.equal(excerptForMoment(en, 'calm sea', 'הים השקט'), 'Through the window I saw a calm sea.', 'the label in the dream\'s own language first');
  for (const text of [he, en]) {
    const ex = excerptForMoment(text, null, 'door');
    if (ex) assert.ok(text.includes(ex.replace(/…$/, '')), 'always a part of the dream text as written');
  }
});

// ------------------------------------------------------------------------------------------------ the approved map reads the real journey

test('the map adapter shows only what exists: explored moments with their insight, unexplored ones without invented text', () => {
  let e = createExploration('att', [{ label: 'door', excerpt: 'The door was open.' }, { label: 'sea' }, { label: 'ceiling' }]);
  e = explore(e, 'm2');
  e = beginMoment(e, 'm3', 'q3?', 'adaptive', T);
  e = receiveWholeView(e, view(), basedOnKey(e), T);
  const m = mapFromExploration(e, { key: 'k', language: 'en', date: '2026-10-20', sourceText: 'x', imageSrc: '/img.jpg' });
  assert.deepEqual(m.explored, ['m2']);
  assert.equal(m.exploringId, 'm3');
  assert.equal(m.dream.moments[0].insight.headline, '');
  assert.equal(m.dream.moments[0].excerpt, 'The door was open.');
  assert.equal(m.dream.moments[1].insight.headline, 'possibility m2');
  assert.equal(m.wholeViewStale, false);
  assert.equal(m.dream.imageSrc, '/img.jpg', 'the one picture of the dream');
});

// ------------------------------------------------------------------------------------------------ stage 3a boundaries

test('stage 3a adds no AI call, no image generation and no credit or payment code', () => {
  for (const f of ['src/hero/exploration.ts', 'src/hero/momentExcerpt.ts', 'src/map/fromExploration.ts', 'src/hero/openJourneyStore.ts']) {
    const code = read(f).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    assert.doesNotMatch(code, /\bfetch\(|paidFetch|\/api\/|generateDreamImage|dream_credits|credit_ledger|start_user_attempt|supabase/i, f);
  }
});
