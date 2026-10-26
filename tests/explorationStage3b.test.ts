import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { typedAnalysis } from '../src/demo/demoRouter.ts';
import {
  answerFollowUp,
  answerMoment,
  basedOnKey,
  beginMoment,
  completeMoment,
  createExploration,
  receiveReply,
  receiveRefreshedInsight,
  receiveWholeView,
  type Exploration,
} from '../src/hero/exploration.ts';
import { buildMomentQuestionInput, buildWholeViewInput, clarificationNote, keepFollowUp, priorMoments } from '../src/hero/explorationSchema.ts';
import { assembleReply, assembleWhole, verifyQuestion } from '../src/hero/claimCheck.ts';
import { segmentDream } from '../src/hero/dreamSegments.ts';
import { EXPLORATION_LABEL_CAP, handleExploration, planCall, type ExplorationDeps } from '../server/routes/dreamExploration.ts';
import { explorationRules } from '../server/rateLimit.ts';
import { createExplorationEngine } from '../src/hero/explorationEngineCore.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const DREAM = 'הייתי בחתונה של חברה. כולם לבשו לבן ואני לבשתי שחור. אחי הקטן נתן לי מפתח ואמר שזה למקום שעוד לא הייתי בו. כשהגענו לדלת, המפתח היה קטן מדי.';
const analysis = typedAnalysis(DREAM, true) as unknown as import('../src/hero/dreamAnalysisSchema.ts').DreamAnalysis;
const T = new Date('2026-10-20T10:00:00Z');
const ins = (n: string) => ({ observation: `תצפית ${n}`, reflection: `אמרת ${n}`, possibility: `אולי ${n}` });

function journey(): Exploration {
  return createExploration('att-1', [
    { label: 'המפתח', pregeneratedQuestion: 'מה עולה כשחושבים על המפתח שאחיך נתן?' },
    { label: 'השמלה השחורה' },
    { label: 'הדלת' },
  ]);
}
function explored(e: Exploration, id: string, answer: string): Exploration {
  e = beginMoment(e, id, `שאלה על ${id}?`, 'adaptive', T);
  e = answerMoment(e, id, answer);
  e = receiveReply(e, id, ins(id), null);
  return completeMoment(e, id, T);
}

// ------------------------------------------------------------------------------------------------ the server asks the journey first

test('planCall: no call for a moment already opened or explored, for a reply already given, or for a whole view of the same answers', () => {
  let e = journey();
  assert.equal(planCall('moment-question', e, 'm9'), null, 'unknown moment');
  e = explored(e, 'm1', 'זה הרגיש כמו הבטחה');
  assert.equal(planCall('moment-question', e, 'm1'), null, 'already explored');
  const q = planCall('moment-question', e, 'm2');
  assert.equal(q?.kind, 'question');
  assert.deepEqual(q && q.kind === 'question' ? q.prior.map((p) => p.answer) : [], ['זה הרגיש כמו הבטחה'], 'the question is written WITH the earlier answer');
  e = beginMoment(e, 'm2', 'שאלה?', 'adaptive', T);
  assert.equal(planCall('moment-question', e, 'm3'), null, 'another moment is open');
  assert.equal(planCall('moment-reply', e, 'm2'), null, 'not answered yet');
  e = answerMoment(e, 'm2', 'לבשתי שחור כי לא ידעתי');
  assert.equal(planCall('moment-reply', e, 'm2')?.kind, 'reply');
  e = receiveReply(e, 'm2', ins('2'), 'מה לא ידעת?');
  assert.equal(planCall('moment-reply', e, 'm2'), null, 'the reply was given');
  e = answerFollowUp(e, 'm2', 'שזו חתונה');
  const refresh = planCall('moment-reply', e, 'm2');
  assert.ok(refresh?.kind === 'reply' && refresh.followUp?.answer === 'שזו חתונה', 'one refresh with the clarification');
  e = receiveRefreshedInsight(e, 'm2', ins('2b'));
  assert.equal(planCall('moment-reply', e, 'm2'), null, 'never a second refresh');
  e = completeMoment(e, 'm2', T);
  assert.equal(planCall('whole-view', e, null)?.kind, 'whole');
  e = receiveWholeView(e, { overview: 'o', recurring: null, contrast: null, readings: [], closingQuestion: 'q?', connections: [] }, basedOnKey(e), T);
  assert.equal(planCall('whole-view', e, null), null, 'same answers: the stored whole view');
});

// ------------------------------------------------------------------------------------------------ the request: caps, rate limit, refunds

function fakeDeps(over: Partial<ExplorationDeps> = {}) {
  const log: string[] = [];
  const deps: ExplorationDeps = {
    resolveIdentity: async () => ({ ok: true, identity: { kind: 'user', userId: 'u1' } }),
    openai: () => ({}) as never,
    trialState: async () => 'open',
    completeTrial: async () => 'completed',
    rateLimit: async () => {
      log.push('rate');
      return { allowed: true };
    },
    reserveMoment: async () => {
      log.push('reserve-moment');
      return 'reserved';
    },
    refundMoment: async () => {
      log.push('refund-moment');
    },
    reserveWhole: async () => {
      log.push('reserve-whole');
      return 'reserved';
    },
    refundWhole: async () => {
      log.push('refund-whole');
    },
    address: async () => 'neutral',
    generateQuestion: (async () => {
      log.push('model');
      return { status: 'ok', value: { question: 'מה עולה כשחושבים על השמלה השחורה בחתונה?', buildsOn: null } };
    }) as never,
    generateReply: (async () => {
      log.push('model');
      return { status: 'ok', value: { insight: ins('x'), followUpQuestion: null, missingInformation: null } };
    }) as never,
    generateWhole: (async () => {
      log.push('model');
      return { status: 'ok', value: { overview: 'מבט', recurring: null, contrast: null, readings: [], closingQuestion: 'שאלה?', connections: [] } };
    }) as never,
    moderate: async () => ({ status: 'ok' as const, hit: false }),
    ...over,
  };
  return { deps, log };
}

const body = (e: Exploration, extra: Record<string, unknown> = {}) => ({ attemptId: e.attemptId, language: 'he', dreamAnalysis: analysis, exploration: e, ...extra });

test('a call that is not needed answers 409 with no rate-limit hit, no slot and no model call', async () => {
  const e = explored(journey(), 'm1', 'תשובה');
  const { deps, log } = fakeDeps();
  const res = await handleExploration('moment-question', body(e, { momentId: 'm1' }), {}, deps);
  assert.equal(res.status, 409);
  assert.deepEqual(log, []);
});

test('rate limited: 429 before any slot or model call', async () => {
  const e = explored(journey(), 'm1', 'תשובה');
  const { deps, log } = fakeDeps({ rateLimit: async () => ({ allowed: false, retryAfterSeconds: 120 }) });
  const res = await handleExploration('moment-question', body(e, { momentId: 'm2' }), {}, deps);
  assert.equal(res.status, 429);
  assert.equal(res.headers?.['Retry-After'], '120');
  assert.deepEqual(log, []);
});

test('a used-up or foreign attempt: 403 and no model call', async () => {
  const e = explored(journey(), 'm1', 'תשובה');
  const { deps, log } = fakeDeps({ reserveMoment: async () => 'rejected' });
  const res = await handleExploration('moment-question', body(e, { momentId: 'm2' }), {}, deps);
  assert.equal(res.status, 403);
  assert.deepEqual(log, ['rate']);
});

test('a failed or thrown generation returns its slot exactly once (the rate-limit hit is kept)', async () => {
  const e = explored(journey(), 'm1', 'תשובה');
  for (const generateQuestion of [async () => ({ status: 'invalid' }), async () => { throw new Error('network'); }]) {
    const { deps, log } = fakeDeps({ generateQuestion: generateQuestion as never });
    const res = await handleExploration('moment-question', body(e, { momentId: 'm2' }), {}, deps);
    assert.ok(res.status >= 500);
    assert.deepEqual(log, ['rate', 'reserve-moment', 'refund-moment']);
  }
});

test('moment calls use the moment slots; the whole view uses the whole-view slots (3 per dream)', async () => {
  let e = explored(journey(), 'm1', 'תשובה');
  let { deps, log } = fakeDeps();
  assert.equal((await handleExploration('moment-question', body(e, { momentId: 'm2' }), {}, deps)).status, 200);
  assert.deepEqual(log, ['rate', 'reserve-moment', 'model']);
  ({ deps, log } = fakeDeps());
  assert.equal((await handleExploration('whole-view', body(e), {}, deps)).status, 200);
  assert.deepEqual(log, ['rate', 'reserve-whole', 'model']);
  e = beginMoment(e, 'm2', 'q?', 'adaptive', T);
  e = answerMoment(e, 'm2', 'a');
  ({ deps, log } = fakeDeps());
  assert.equal((await handleExploration('moment-reply', body(e, { momentId: 'm2' }), {}, deps)).status, 200);
  assert.deepEqual(log, ['rate', 'reserve-moment', 'model']);
  assert.equal(EXPLORATION_LABEL_CAP, 19, '3 for labels and the pre-written questions + 16 for the journey');
  assert.match(read('server/dreamAttempts.ts'), /max: number = MAX_LABEL_CALLS_PER_ATTEMPT/, 'the labels and questions keep their own lower ceiling');
});

test('a journey for another attempt, or a malformed one, is refused before anything else', async () => {
  const e = explored(journey(), 'm1', 'תשובה');
  const { deps, log } = fakeDeps();
  assert.equal((await handleExploration('whole-view', { ...body(e), attemptId: 'other' }, {}, deps)).status, 400);
  assert.equal((await handleExploration('whole-view', { ...body(e), exploration: { nonsense: 1 } }, {}, deps)).status, 400);
  assert.equal((await handleExploration('whole-view', { ...body(e), dreamAnalysis: {} }, {}, deps)).status, 400);
  assert.deepEqual(log, []);
});

test('a guest\'s free dream completes with its FIRST insight; if another tab already completed it, the slot is returned and 403', async () => {
  let e = journey();
  e = beginMoment(e, 'm1', 'q?', 'pregenerated', T);
  e = answerMoment(e, 'm1', 'a');
  const trial = { resolveIdentity: async () => ({ ok: true as const, identity: { kind: 'trial' as const, trialId: 't1' } }) };
  let { deps, log } = fakeDeps({ ...trial, completeTrial: async () => 'completed' });
  assert.equal((await handleExploration('moment-reply', body(e, { momentId: 'm1' }), {}, deps)).status, 200);
  ({ deps, log } = fakeDeps({ ...trial, completeTrial: async () => 'consumed' }));
  assert.equal((await handleExploration('moment-reply', body(e, { momentId: 'm1' }), {}, deps)).status, 403);
  assert.ok(log.includes('refund-moment'));
});

test('the reply keeps a clarification only when something is missing, never after "I don\'t know", never when refreshing', async () => {
  const reply = (fq: string | null, missing: string | null) => ({ followUpQuestion: fq, missingInformation: missing });
  const base = { sourceText: DREAM, momentLabel: 'המפתח', prior: [], refreshing: false };
  assert.equal(keepFollowUp(reply('מה היה המקום שעוד לא היית בו?', 'which place'), { ...base, answer: 'זה הזכיר לי מקום מסוים' }), 'מה היה המקום שעוד לא היית בו?');
  assert.equal(keepFollowUp(reply('מה היה המקום שעוד לא היית בו?', null), { ...base, answer: 'זה הזכיר לי מקום מסוים' }), null, 'nothing missing was named');
  assert.equal(keepFollowUp(reply('מה המפתח הזכיר?', 'what'), { ...base, answer: 'לא יודעת' }), null, 'the dreamer does not know: no pressing');
  assert.equal(keepFollowUp(reply('מה היה המקום?', 'which'), { ...base, answer: 'מקום', refreshing: true }), null);
  assert.equal(keepFollowUp(reply('זה הזכיר לי מקום מסוים?', 'x'), { ...base, answer: 'זה הזכיר לי מקום מסוים' }), null, 'asks for what was already said');
});

// ------------------------------------------------------------------------------------------------ the deterministic checks (reworked in the fix round)

const SEGS = segmentDream(DREAM);
const KEY_DOOR = SEGS.find((x) => x.text.includes('קטן מדי'))!.id;
const KEY_GIVEN = SEGS.find((x) => x.text.includes('נתן לי מפתח'))!.id;

test('a moment question that repeats an earlier question, or asks about another part of the dream, is refused; a grounded one passes', () => {
  const e = explored(journey(), 'm1', 'המפתח היה כמו הבטחה של אחי שעוד לא קוימה');
  const prior = priorMoments(e).map((m) => ({ question: m.question, focus: m.focus, subject: m.subject }));
  const ctx = { language: 'he' as const, segments: SEGS, momentSegments: [KEY_DOOR], answers: ['המפתח היה כמו הבטחה של אחי שעוד לא קוימה'], prior };
  assert.ok(verifyQuestion({ question: priorMoments(e)[0].question, focus: 'detail', subject: '' }, ctx).reasons.some((r) => /repeats/.test(r)));
  assert.ok(verifyQuestion({ question: 'מה ראית כשלבשת שחור בחתונה?', focus: 'sense', subject: 'שחור' }, ctx).reasons.some((r) => /another part/.test(r)));
  assert.deepEqual(verifyQuestion({ question: 'מה עולה כשהמפתח היה קטן מדי לדלת?', focus: 'detail', subject: 'מפתח' }, ctx).reasons, []);
});

test('a possibility that repeats an earlier insight is not shown; the same one is fine when nothing earlier said it', () => {
  const s = { language: 'he' as const, sourceText: DREAM, segments: SEGS, allowed: [KEY_DOOR], answers: ['זה הרגיש כמו הבטחה'] };
  const raw = {
    dream: [{ segment: KEY_DOOR, action: 'היה', actor: 'מפתח', target: '', text: 'כשהגעתם לדלת, המפתח היה קטן מדי.' }],
    user: [{ quote: 'הבטחה', text: 'אמרת שזה הרגיש כמו הבטחה.' }],
    possibilities: [{ basis: ['d0', 'u0'], text: 'אולי המפתח הקטן נוגע בהבטחה שלא התקיימה.' }],
  };
  const out = assembleReply(raw, s, ['אולי המפתח הקטן נוגע בהבטחה שלא התקיימה']);
  assert.equal(out.insight.possibility, '');
  assert.equal(out.insight.kind, 'factual');
  assert.equal(assembleReply(raw, s).insight.kind, 'interpretive');
});

test('the whole view keeps only links between two different explored moments, each end resting on its own moment', () => {
  const explored2 = [
    { id: 'm1', label: 'המפתח', segments: [KEY_GIVEN], answers: ['זה הרגיש כמו הבטחה'], question: 'q1?', insight: null },
    { id: 'm2', label: 'הדלת', segments: [KEY_DOOR], answers: ['הרגשתי שההבטחה לא מתקיימת'], question: 'q2?', insight: null },
  ];
  const view = assembleWhole(
    {
      overview: [{ source: 'user', segment: -1, action: '', actor: '', target: '', moment: 'm1', quote: 'הבטחה', basis: [], text: 'אמרת שזה הרגיש כמו הבטחה.' }],
      connections: [
        { from: 'm1', to: 'm2', title: 'ההבטחה', fromQuote: 'כמו הבטחה', toQuote: 'ההבטחה לא מתקיימת', link: 'אולי ההבטחה פוגשת כאן את הדלת.' },
        { from: 'm1', to: 'm3', title: 'לא נחקר', fromQuote: 'כמו הבטחה', toQuote: 'הדלת', link: 'אולי.' },
        { from: 'm2', to: 'm1', title: 'רכבת', fromQuote: 'רכבת בתחנה ריקה', toQuote: 'כמו הבטחה', link: 'אולי משהו.' },
      ],
      recurring: { element: '', text: '', quotes: [] },
      contrast: { text: '', quotes: [] },
      readings: [{ segment: KEY_DOOR, text: 'אפשר לראות בדלת מקום שעוד לא נפתח.' }, { segment: 0, text: 'אפשר לראות בחתונה משהו.' }],
      closing: { text: 'מה עוד מחכה לך מאחורי ההבטחה?', moment: 'm1', quote: 'הבטחה' },
    },
    { language: 'he', sourceText: DREAM, segments: SEGS, explored: explored2, unexplored: [], previous: null, maxReadings: 2 },
  ).view;
  assert.equal(view.kind, 'whole');
  assert.deepEqual(view.connections.map((c) => c.title), ['ההבטחה']);
  assert.equal(view.readings.length, 1, 'a reading only on an explored part');
});

test("the prompts carry the earlier answers and the dream's numbered parts; the whole view is told which moments were NOT explored", () => {
  const e = explored(journey(), 'm1', 'זה הרגיש כמו הבטחה');
  const qIn = buildMomentQuestionInput({ sourceText: DREAM, segments: SEGS, prior: priorMoments(e), moment: { id: 'm3', label: 'הדלת', segments: [KEY_DOOR] }, otherMoments: ['השמלה השחורה'], alternative: null });
  assert.match(qIn, /זה הרגיש כמו הבטחה/);
  assert.match(qIn, /\[s\d\] "כשהגענו לדלת, המפתח היה קטן מדי"/);
  assert.match(qIn, /The order of the telling is NOT the order of events/);
  const wIn = buildWholeViewInput({ sourceText: DREAM, segments: SEGS, depth: 'standard', explored: priorMoments(e), unexplored: [{ id: 'm2', label: 'השמלה השחורה' }, { id: 'm3', label: 'הדלת' }], feelings: '' });
  assert.match(wIn, /EXPLORED MOMENT IDS \(connections, quotes and readings use only these\): m1/);
  assert.match(wIn, /MOMENTS NOT EXPLORED \(no link, no reading, no meaning for them\): \[m2\] "השמלה השחורה", \[m3\] "הדלת"/);
});

// ------------------------------------------------------------------------------------------------ the browser engine: no repeated calls

function fakeEngine(respond: (url: string, body: Record<string, unknown>) => { status: number; data: unknown }, delay = 5) {
  const sent: string[] = [];
  const engine = createExplorationEngine({
    async post(url, b) {
      sent.push(`${url}:${(b as { mode: string }).mode}`);
      await new Promise((r) => setTimeout(r, delay));
      return respond(url, b as Record<string, unknown>);
    },
  });
  return { engine, sent };
}

// Changed in the fix round (decision of 2026-10-21): the first moment's question is written for it too.
test("engine: the first moment's question is requested (written for it); an explored moment never asks again", async () => {
  const { engine, sent } = fakeEngine(() => ({ status: 200, data: { question: 'q?', source: 'adaptive', focus: 'detail', subject: 'מפתח' } }));
  let e = journey();
  const first = await engine.question(e, analysis, 'm1', 'he');
  assert.equal(first.status === 'ok' && first.requested, true);
  assert.deepEqual(sent, ['/api/dream-element-labels:moment-question']);
  e = explored(e, 'm1', 'a');
  assert.equal((await engine.question(e, analysis, 'm1', 'he')).status, 'error');
  assert.equal(sent.length, 1);
  assert.equal(engine.stats.avoided, 1);
});

test('engine: two identical requests at the same time are one request', async () => {
  const { engine, sent } = fakeEngine(() => ({ status: 200, data: { momentId: 'm2', question: 'מה עולה כשחושבים על השמלה?' } }), 20);
  const e = explored(journey(), 'm1', 'a');
  const [a, b] = await Promise.all([engine.question(e, analysis, 'm2', 'he'), engine.question(e, analysis, 'm2', 'he')]);
  assert.deepEqual(a, b);
  assert.equal(sent.length, 1);
});

test('engine: a whole view of the same answers is never requested twice; a stored one is shown with no request', async () => {
  const { engine, sent } = fakeEngine(() => ({ status: 200, data: { basedOn: 'x', wholeView: { overview: 'o', closingQuestion: 'q?', readings: [], connections: [], recurring: null, contrast: null } } }));
  let e = explored(journey(), 'm1', 'a');
  await engine.wholeView(e, analysis, 'he', []);
  await engine.wholeView(e, analysis, 'he', []); // same answers, not yet stored by the journey: served from memory
  assert.equal(sent.length, 1);
  e = receiveWholeView(e, { overview: 'o', recurring: null, contrast: null, readings: [], closingQuestion: 'q?', connections: [] }, basedOnKey(e), T);
  const shown = await engine.wholeView(e, analysis, 'he', []);
  assert.equal(shown.status === 'ok' && shown.requested, false);
  assert.equal(sent.length, 1);
});

test('engine: a reply already received is not requested again; a refused call is reported, not retried in a loop', async () => {
  const { engine, sent } = fakeEngine(() => ({ status: 429, data: { reason: 'rate_limited' } }));
  let e = journey();
  e = beginMoment(e, 'm1', 'q?', 'pregenerated', T);
  e = answerMoment(e, 'm1', 'a');
  assert.deepEqual(await engine.reply(e, analysis, 'm1', 'he', []), { status: 'error', reason: 'rate_limited' });
  assert.equal(sent.length, 1);
  e = receiveReply(e, 'm1', ins('1'), null);
  assert.deepEqual(await engine.reply(e, analysis, 'm1', 'he', []), { status: 'error', reason: 'not_needed' });
  assert.equal(sent.length, 1);
});

// ------------------------------------------------------------------------------------------------ boundaries

test('the journey calls use the existing functions (still 12), a rate limit, and never touch credits, payments or images', () => {
  assert.equal(readdirSync(new URL('../api/', import.meta.url)).filter((f) => f.endsWith('.ts')).length, 12);
  assert.match(read('server/routes/dreamElementLabels.ts'), /explorationModeOf\(rawBody, \['moment-question'\]\)/);
  assert.match(read('server/routes/dreamReflection.ts'), /mode === 'moment-reply' \|\| mode === 'whole-view'/);
  assert.deepEqual(explorationRules({}).map((r) => [r.name, r.limit, r.windowSeconds]), [['h', 40, 3600], ['d', 150, 86400]]);
  const code = read('server/routes/dreamExploration.ts').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.doesNotMatch(code, /dream_credits|credit_ledger|start_user_attempt|consume_credit|balance|generateDreamImage|images\.generate|payment/i);
  assert.doesNotMatch(read('src/hero/explorationEngine.ts') + read('src/hero/explorationEngineCore.ts'), /dream-image|dream-analysis|generateDreamImage/);
});

test('stage 3b does not connect the screens or the archive yet', () => {
  for (const f of ['src/hero/HeroDream.tsx', 'src/hero/DreamReflection.tsx', 'src/archive/DreamDetail.tsx', 'src/App.tsx']) {
    assert.doesNotMatch(read(f), /explorationEngine|dreamExploration|moment-reply|whole-view/, f);
  }
});

// ------------------------------------------------------------------------------------------------ checks added after reading real samples

test('real-sample gaps are now caught: feminine address with negation or a two-letter prefix, past-tense symbol wording, an invented "immediately", a misquote, a repeated update', async () => {
  const { findAddressViolation } = await import('../src/hero/languageIntegrity.ts');
  const { symbolWordingNote, unsupportedInsertionNote } = await import('../src/hero/reflectionChecks.ts');
  const { quotedWordsNote } = await import('../src/hero/explorationSchema.ts');
  for (const t of ['ואת לא יודעת מה נשאר איתך', 'כשאת חושבת על התמונה', 'כשאת נזכרת שאמרת']) assert.ok(findAddressViolation([t], 'he', 'neutral'), t);
  for (const t of ['את הדלת הזו', 'אמרת שלא ידעת', 'כשחושבים על הדלת']) assert.equal(findAddressViolation([t], 'he', 'neutral'), null, t);
  assert.ok(symbolWordingNote(['הדמות שהוא ייצג לא הייתה נגישה'], 'he'));
  assert.ok(unsupportedInsertionNote(['המפתח ניתן לך מיד אחרי שהגעת'], [DREAM], 'he'));
  assert.equal(unsupportedInsertionNote(['המפתח ניתן לך אחרי שהגעת'], [DREAM], 'he'), null);
  const answers = 'פתאום הרגשתי שהמפתח קטן מדי וזה תפס אותי לא מוכנה';
  assert.ok(quotedWordsNote(['המילים שלך, "הופתעתי לגלות שהמפתח מרשים", פוגשות את החלום'], [DREAM, answers]), 'words she never said, in quotes');
  assert.equal(quotedWordsNote(['המילים שלך, "תפס אותי לא מוכנה", פוגשות את החלום'], [DREAM, answers]), null);
  const one = [{ id: 'm1', label: 'המפתח', segments: [KEY_GIVEN], answers: ['זה הרגיש כמו הבטחה'], question: 'q1?', insight: null }];
  const w = assembleWhole(
    {
      overview: [{ source: 'interpretation', segment: -1, action: '', actor: '', target: '', moment: '', quote: '', basis: [], text: 'אולי.' }],
      connections: [],
      recurring: { element: '', text: '', quotes: [] },
      contrast: { text: '', quotes: [] },
      readings: [{ segment: KEY_GIVEN, text: 'אפשר לראות במפתח מאחיך הבטחה למקום חדש.' }],
      closing: { text: 'מה עוד מחכה מאחורי ההבטחה של אחיך?', moment: 'm1', quote: 'הבטחה' },
    },
    { language: 'he', sourceText: DREAM, segments: SEGS, explored: one, unexplored: [], previous: { overview: 'x', closingQuestion: 'מה עוד מחכה מאחורי ההבטחה של אחיך?' }, maxReadings: 2 },
  );
  // (quality round, 2026-10-21: a closing question that fails its checks is replaced by a safe one built from her words, never left empty)
  assert.notEqual(w.view.closingQuestion, 'מה עוד מחכה מאחורי ההבטחה של אחיך?', 'the previous closing question is not asked again');
  // (doc 70: the code's closing is now an open question about her word, "מה המילה «…» מזכירה לך, אם בכלל?")
  assert.match(w.view.closingQuestion, /«.+».*\?$/, 'a safe closing question built from her own words takes its place');
});

test('a vague answer ("something that happened with my brother") asks for its clarification; a mixed pair is never put in the feminine plural', async () => {
  const { mixedPluralNote } = await import('../src/hero/explorationSchema.ts');
  const r = { followUpQuestion: null };
  assert.match(clarificationNote(r, 'זה מזכיר לי משהו שקרה עם אחי פעם') ?? '', /clarification/);
  assert.equal(clarificationNote(r, 'זה מזכיר לי את החתונה של אחי בשנה שעברה'), null);
  assert.equal(clarificationNote(r, 'לא יודעת'), null);
  assert.ok(mixedPluralNote(['הלכתן יחד לאורך החוף'], 'אחי הקטן נתן לי מפתח'));
  assert.equal(mixedPluralNote(['הלכתם יחד לאורך החוף'], 'אחי הקטן נתן לי מפתח'), null);
  assert.equal(mixedPluralNote(['מה שהיה ביניכן'], 'הייתי בחתונה של חברה'), null, 'two women: the feminine plural is right');
});
