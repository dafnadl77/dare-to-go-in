import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as R from '../server/routes/dreamExploration.ts';
import * as X from '../src/hero/exploration.ts';
import { checkLabel } from '../src/hero/claimCheck.ts';
import { checkMomentTitle, weakEnglishTitle } from '../src/hero/momentTitle.ts';
import { attributionNote, unreportedAttribution } from '../src/hero/attribution.ts';
import { pickFallbackQuestion, fallbackReply } from '../src/hero/conversationTurn.ts';
import { stillUnverified } from '../src/hero/verifiedFallback.ts';
import { mapJourneyFrom } from '../src/map/journeyRecord.ts';
import { typedAnalysis } from '../src/demo/demoRouter.ts';
import type { DreamAnalysis } from '../src/hero/dreamAnalysisSchema.ts';

/**
 * THE THREE PROBLEMS OF THE LIVE TESTS OF 2026-11-15 (checked 2026-11-17). Fictional dreams only; the model is a stub: no network, no AI call.
 *   1. English moment titles: "said", "reading room found", "walking through a large" (a lone verb, a verb with no object, a phrase cut in the middle).
 *   2. The whole view turned her "it does not fit" into a claim about her feelings ("the child did not raise a sense of safety in you").
 *   3. The plain backup question was one fixed sentence: it came back in two moments, and "change direction" did not open another angle.
 */

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const T0 = new Date('2026-11-17T10:00:00Z');
const X_ = X as unknown as Record<string, any>;

// ------------------------------------------------------------------------------------------------ 1. English titles

const library = 'I was walking through a large library at night, and every book I touched turned warm like fresh bread. In the reading room I found a long table with one lit candle and a silver key lying beside it. A woman I did not know sat across from me and asked whether I had brought the map. I said no, and she smiled and opened a window, and the whole room slowly filled with the sound of the sea.';
const momentsOfLibrary = [
  'A woman I did not know sat across from me and asked whether I had brought the map',
  'I said no, and she smiled and opened a window, and the whole room slowly filled with the sound of the sea',
  'In the reading room I found a long table with one lit candle and a silver key lying beside it',
  'I was walking through a large library at night, and every book I touched turned warm like fresh bread',
];

test('1. the three weak English titles of the live run are never kept, whoever wrote them', () => {
  const [, said, reading, walking] = momentsOfLibrary;
  for (const [bad, moment] of [['said', said], ['reading room found', reading], ['walking through a large', walking]] as const) {
    assert.equal(weakEnglishTitle(bad, moment), true, `weak: ${bad}`);
    const kept = checkMomentTitle(bad, moment, [], library);
    assert.notEqual(kept, bad, `replaced: ${bad}`);
    assert.equal(weakEnglishTitle(kept, moment), false, `what replaces it is whole: ${kept}`);
    assert.ok(kept.split(/\s+/).length >= 2 && kept.split(/\s+/).length <= 5, kept);
  }
});

test('1. with no title from the model the title is the moment\'s own first whole noun phrase, never a clause cut at a word count', () => {
  const [, said, reading, walking] = momentsOfLibrary;
  assert.equal(checkMomentTitle('', walking, [], library), 'a large library');
  assert.equal(checkMomentTitle('', reading, [], library), 'the reading room');
  assert.equal(checkMomentTitle('', said, [], library), 'a window');
  assert.equal(checkMomentTitle('', 'I stood at the edge of a cliff and below me there was a city of lights.', []), 'the edge of a cliff');
  assert.equal(checkMomentTitle('', 'I found a small brass key in my coat pocket.', []), 'a small brass key');
  // the same in the journey's own starting point (the call for titles failed): every title is whole, none is a lone verb, and none repeats
  const analysis = { ...(typedAnalysis(library, true) as unknown as DreamAnalysis), sourceText: library };
  const e = mapJourneyFrom('attempt-en', analysis, null);
  const labels = e.moments.map((m) => m.label);
  assert.equal(new Set(labels.map((l) => l.toLowerCase())).size, labels.length, 'no two alike');
  for (const [i, label] of labels.entries()) assert.equal(weakEnglishTitle(label, e.moments[i].excerpt ?? ''), false, label);
});

test('1. a good title stays, and Hebrew titles are checked exactly as before', () => {
  assert.equal(checkMomentTitle('UNKNOWN WOMAN ASKS ABOUT MAP', momentsOfLibrary[0], [], library), 'UNKNOWN WOMAN ASKS ABOUT MAP');
  assert.equal(checkMomentTitle('The locked doors', 'I was walking through a large empty house and every door was locked.', []), 'The locked doors');
  assert.equal(weakEnglishTitle('הרכבת שלא הגיעה', 'הרכבת שלא הגיעה בסוף'), false, 'Hebrew is not judged by the English check');
  const he = 'בסוף התור נגמר, ואף אחד לא חזר לשבת מאחורי הקופה';
  for (const cand of ['סיום התור ללא קופאית', 'חיכיתי בתור', '']) assert.equal(checkMomentTitle(cand, he, [], he), checkLabel(cand, he, [], he), 'Hebrew goes through checkLabel unchanged');
  assert.equal(checkLabel('סיום התור ללא קופאית', 'בסוף התור נגמר, ואף אחד לא חזר לשבת מאחורי הקופה', [], 'בסוף התור נגמר, ואף אחד לא חזר לשבת מאחורי הקופה'), 'סיום התור ללא קופאית');
});

// ------------------------------------------------------------------------------------------------ 2. a rejection is not a claim about her

const child = {
  herWords: ['חיכיתי הרבה, בלי לדעת למה', 'הילד נראה רגוע, כאילו הוא יודע משהו שאני לא', 'זה לא מתאים לי'],
  sourceText: 'חיכיתי בתחנה ריקה. ילד קטן עמד לידי ושתק. הרכבת לא הגיעה.',
  language: 'he' as const,
};

test('2. what she turned down is not turned into a fact about what she felt', () => {
  const claim = 'הדמות של הילד לא העלתה בך תחושת ביטחון או ידיעה.';
  assert.ok(unreportedAttribution(claim, child), 'the live sentence');
  assert.ok(stillUnverified([claim], child), 'so a fresh answer is asked for, and if it still says it, it is not shown');
  assert.match(attributionNote([claim], child) ?? '', /never told/);
  for (const s of ['הילד לא עורר אצלך תחושת בטחון.', 'המקום לא יצר בך שום ביטחון.', 'השתיקה לא גרמה לך לפחד.'])
    assert.ok(unreportedAttribution(s, child), s);
  assert.ok(unreportedAttribution('The woman did not make you feel safe.', { herWords: ['She asked about the map.', 'It did not fit.'], sourceText: 'A woman sat across from me.', language: 'en' }));
  assert.ok(unreportedAttribution("The child didn't evoke a sense of trust in you.", { herWords: ['He was calm.'], sourceText: 'A child stood beside me.', language: 'en' }));
});

test('2. what she said, a possibility, a question and the dream\'s own events stay', () => {
  // she told it herself
  assert.equal(unreportedAttribution('הילד לא עורר בך ביטחון.', { ...child, herWords: [...child.herWords, 'לא הרגשתי ביטחון לידו'] }), null);
  // her own no to DARE's question makes the negated claim hers
  assert.equal(unreportedAttribution('הילד לא העלה בך תחושת ביטחון.', { ...child, answeredNo: ['האם הילד נתן לך תחושת ביטחון?'] }), null);
  assert.equal(unreportedAttribution('The woman did not make you feel safe.', { herWords: ['I did not feel safe with her.'], sourceText: 'A woman sat across from me.', language: 'en' }), null);
  // a possibility, a question
  assert.equal(unreportedAttribution('אולי הילד לא העלה בך תחושת ביטחון.', child), null);
  assert.equal(unreportedAttribution('האם הילד לא העלה בך תחושת ביטחון?', child), null);
  assert.equal(unreportedAttribution('Maybe the woman did not make you feel safe.', { herWords: ['She asked.'], sourceText: 'A woman sat across from me.', language: 'en' }), null);
  // what the dream itself says about a thing (no "you")
  assert.equal(unreportedAttribution('הילד לא הזיז את הרכבת, והרכבת לא הגיעה.', child), null);
  assert.equal(unreportedAttribution('הרכבת לא הגיעה ואף אחד לא אמר מילה.', child), null);
});

// ------------------------------------------------------------------------------------------------ 3. the plain question does not repeat

test('3. the backup question is never one already asked, and "change direction" opens another angle', () => {
  const first = pickFallbackQuestion('he', []);
  assert.equal(first, fallbackReply('he'), 'the first time it is the usual one');
  const second = pickFallbackQuestion('he', [first]);
  assert.notEqual(second, first, 'not twice in the journey');
  assert.notEqual(pickFallbackQuestion('he', [first, second]), second);
  // after "change direction" or "it does not fit": another angle, not the same kind of question again
  const steered = pickFallbackQuestion('he', [first], true);
  assert.notEqual(steered, first);
  assert.ok(!['מה בלט לך ברגע הזה?', 'מה הפתיע אותך ברגע הזה?'].includes(steered), steered);
  assert.match(steered, /פרט|סביב|לפני/);
  // every question is a question, neutral, and in its own language
  for (const lang of ['he', 'en'] as const) {
    const seen: string[] = [];
    for (let i = 0; i < 12; i++) {
      const q = pickFallbackQuestion(lang, seen, i % 3 === 2);
      assert.ok(q.endsWith('?'), q);
      assert.equal(lang === 'he' ? /[A-Za-z]/.test(q) : /[א-ת]/.test(q), false, q);
      if (i < 6) assert.ok(!seen.includes(q), `no repeat while unasked ones are left: ${q}`);
      seen.push(q);
    }
    assert.equal(pickFallbackQuestion(lang, ['What else comes to mind about this moment?', fallbackReply(lang)]) === '', false);
  }
  // all asked: the one asked longest ago, never a crash
  const all = Array.from({ length: 12 }, (_, i) => pickFallbackQuestion('en', Array.from({ length: i }, (_, j) => pickFallbackQuestion('en', [], false) + String(j))));
  assert.ok(all.every(Boolean));
  const asked: string[] = [];
  for (let i = 0; i < 20; i++) asked.push(pickFallbackQuestion('he', asked));
  assert.ok(asked.every((q) => q.endsWith('?')));
});

const analysisOf = (text: string) => ({ ...(typedAnalysis(text, true) as unknown as DreamAnalysis), sourceText: text });
const dream = 'חיכיתי בתחנה ריקה. ילד קטן עמד לידי ושתק. הרכבת לא הגיעה. אחר כך נכנסתי לחדר גדול עם שולחן ארוך.';
const seeds = [{ label: 'התחנה הריקה', excerpt: 'חיכיתי בתחנה ריקה. ילד קטן עמד לידי ושתק. הרכבת לא הגיעה.' }, { label: 'החדר הגדול', excerpt: 'אחר כך נכנסתי לחדר גדול עם שולחן ארוך.' }];

/** One real turn through the route with a model whose only sentence is a therapist's phrase (checkTurn removes it): the plain question takes its place. */
async function plainTurn(e: unknown, momentId: string) {
  const client = { responses: { create: async () => ({ model: 'stub', output_text: JSON.stringify({ reply: 'מה זה מעורר בך?', offer: '', anchors: [], facts: [], move: 'reflect' }), usage: { input_tokens: 0, output_tokens: 0 } }) } } as never;
  const res = await R.handleExploration('conversation-turn', { language: 'he', attemptId: (e as { attemptId: string }).attemptId, dreamAnalysis: analysisOf(dream), exploration: e, momentId }, {}, {
    ...R.realExplorationDeps,
    moderate: async () => ({ status: 'ok' as const, hit: false }),
    resolveIdentity: async () => ({ ok: true, identity: { kind: 'user', userId: 'u' } }) as never,
    openai: () => client,
    rateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }) as never,
    reserveMoment: async () => 'reserved',
    refundMoment: async () => {},
    address: async () => 'masculine',
  });
  return res as unknown as { status: number; body?: { turn?: { text: string; offer?: string } }; data?: { turn?: { text: string; offer?: string } } };
}
const textOf = (res: Awaited<ReturnType<typeof plainTurn>>) => {
  const turn = (res.body ?? res.data)?.turn;
  return `${turn?.text ?? ''} ${turn?.offer ?? ''}`.trim();
};

test('3. through the route: the same plain question does not come back in a second moment, nor after "change direction"', async () => {
  let e = X.createExploration('quality-1117', seeds) as unknown;
  e = X_.beginConversation(e, 'm1', { role: 'dare', text: 'מה ראית כשהגעת לתחנה?', move: 'ask' }, T0);
  e = X_.addDreamerTurn(e, 'm1', 'תחנה ריקה, אף אחד');
  const one = await plainTurn(e, 'm1');
  assert.equal(one.status, 200, JSON.stringify(one).slice(0, 300));
  const q1 = textOf(one);
  assert.ok(q1.includes(fallbackReply('he')), `the first plain question is the usual one: ${q1}`);
  // the journey keeps that turn; another moment, the same kind of failure
  e = X_.addDareTurn(e, 'm1', { role: 'dare', text: q1, move: 'reflect' });
  e = X_.completeConversation(e, 'm1', T0);
  e = X_.beginConversation(e, 'm2', { role: 'dare', text: 'מה בלט לך בחדר?', move: 'ask' }, T0);
  e = X_.addDreamerTurn(e, 'm2', 'השולחן היה ארוך מאוד');
  const two = await plainTurn(e, 'm2');
  assert.equal(two.status, 200, JSON.stringify(two).slice(0, 300));
  const q2 = textOf(two);
  assert.ok(!q2.includes(fallbackReply('he')), `not the same question in the second moment: ${q2}`);
  assert.match(q2, /\?$/);
});

test('3. the route uses the rotating question everywhere the plain one was used for a turn, and the whole view keeps its own line', () => {
  const route = read('server/routes/dreamExploration.ts');
  assert.match(route, /pickFallbackQuestion\(ctx\.language, askedHere/);
  assert.match(route, /signals\.steer === 'shift' \|\| signals\.rejectedNow/);
  assert.equal((route.match(/\$\{freshQuestion\(\)\}/g) ?? []).length, 2, 'the ending question of a turn, in the offer and in the text');
  assert.match(route, /fallbackSummaryLine\(ctx\.language\)/, 'the whole view keeps its own plain line');
  assert.match(route, /otherQuestion:/, 'a moment question already asked is not asked again');
});

test('3. through the route: after "change direction" the plain question opens another angle', async () => {
  let e = X.createExploration('quality-1117b', seeds) as unknown;
  e = X_.beginConversation(e, 'm1', { role: 'dare', text: 'מה ראית כשהגעת לתחנה?', move: 'ask' }, T0);
  e = X_.addDreamerTurn(e, 'm1', 'תחנה ריקה, אף אחד');
  e = X_.addDareTurn(e, 'm1', { role: 'dare', text: fallbackReply('he'), move: 'reflect' });
  const steered = X_.steerWithReply(e, 'm1', 'shift');
  assert.ok(steered, 'the direction button is allowed here');
  const res = await plainTurn(steered, 'm1');
  assert.equal(res.status, 200, JSON.stringify(res).slice(0, 300));
  const q = textOf(res);
  assert.ok(!q.includes(fallbackReply('he')), q);
  assert.match(q, /פרט|סביב|לפני/, `another angle, not the same kind of question: ${q}`);
});

// ------------------------------------------------------------------------------------------------ 2b. the gaps found in the Preview check

test('2b. "קרה לי" and "פעם הייתי" she told are hers: "קרה לך" is not refused then (the bare "s" in HER_PAST_TOLD)', async () => {
  const { inventedLifeDetail } = await import('../src/hero/attribution.ts');
  const dreamOnly = { herWords: ['חלמתי על בית ישן'], sourceText: 'עמדתי מול בית ישן.', language: 'he' as const };
  assert.ok(inventedLifeDetail('קרה לך משהו דומה.', dreamOnly), 'never told: refused, as before');
  for (const told of ['קרה לי משהו כזה פעם', 'זה קרה גם לי', 'פעם הייתי בבית כזה', 'בעבר גרתי ליד הים'])
    assert.equal(inventedLifeDetail('קרה לך משהו דומה.', { ...dreamOnly, herWords: [told] }), null, told);
  assert.ok(inventedLifeDetail('קרה לך משהו דומה.', { ...dreamOnly, herWords: ['אף פעם לא הייתי שם'] }), '"אף פעם לא" is not a past she told');
});

test('2b. "never" with a past verb: what the dream never stirred in her is not said as a fact', () => {
  const en = { herWords: ['The child was quiet.', 'It does not fit.'], sourceText: 'A child stood beside me at the station.', language: 'en' as const };
  for (const s of ['The dream never stirred any anger in you.', 'The child never gave you a sense of safety.', 'The station had not raised any fear in you.', 'It never made you feel calm.'])
    assert.ok(unreportedAttribution(s, en), s);
  assert.equal(unreportedAttribution('The child never moved.', en), null, 'an event of the dream');
  assert.equal(unreportedAttribution('Perhaps the dream never stirred anger in you.', en), null, 'a possibility');
  assert.equal(unreportedAttribution('The dream never stirred anger in you.', { ...en, herWords: ['There was no anger in me at all.'] }), null, 'she said it');
});

test('2b. a feeling, or its absence, with "felt" / "הרגשת": the feeling word itself needs a basis', () => {
  const en = { herWords: ['I felt calm.', 'I just kept walking.'], sourceText: 'I was walking through an airport with no people in it.', language: 'en' as const };
  // she said "felt", but not "afraid": the absence of fear is not hers
  assert.ok(unreportedAttribution('You did not feel afraid when the hall was empty.', en), 'the Preview case');
  assert.ok(unreportedAttribution('You felt lonely in the empty hall.', en));
  assert.ok(unreportedAttribution('You were scared of the empty hall.', en));
  assert.ok(unreportedAttribution('You were not afraid of the empty hall.', en));
  // what she said, a possibility, a question, and a feeling she chose stay
  assert.equal(unreportedAttribution('You felt calm in the empty hall.', en), null);
  assert.equal(unreportedAttribution('You said you felt calm, and you kept walking.', en), null);
  assert.equal(unreportedAttribution('Maybe you felt lonely there.', en), null);
  assert.equal(unreportedAttribution('Did you feel afraid there?', en), null);
  assert.equal(unreportedAttribution('You felt like a stranger there.', { ...en, herWords: ['I was a stranger there.'] }), null, '"felt like" names no feeling word');
  assert.equal(unreportedAttribution('You did not feel afraid.', { ...en, feelings: 'fear, calm' }), null, 'a feeling she chose from the list');
  const he = { herWords: ['הרגשתי רוגע', 'פשוט המשכתי ללכת'], sourceText: 'הלכתי בשדה תעופה ריק.', language: 'he' as const };
  assert.ok(unreportedAttribution('לא הרגשת פחד באולם הריק.', he), '"הרגשתי" is no basis for another feeling');
  assert.ok(unreportedAttribution('הרגשת בדידות באולם הריק.', he));
  assert.ok(unreportedAttribution('לא חשת שום פחד שם.', he));
  assert.equal(unreportedAttribution('הרגשת רוגע באולם הריק.', he), null, 'her own feeling');
  assert.equal(unreportedAttribution('אמרת שהרגשת רוגע, והמשכת ללכת.', he), null);
  assert.equal(unreportedAttribution('אולי הרגשת בדידות שם.', he), null, 'a possibility');
  assert.equal(unreportedAttribution('מה הרגשת באולם הריק?', he), null, 'a question');
  assert.equal(unreportedAttribution('הרגשת שמשהו חסר שם.', { ...he, herWords: ['משהו היה חסר'] }), null, 'a clause, not a feeling word');
  assert.equal(unreportedAttribution('לא הרגשת פחד.', { ...he, feelings: 'פחד, רוגע' }), null, 'a feeling she chose from the list');
});

test('2b. the chosen feelings reach the check in both routes', () => {
  assert.match(read('server/routes/dreamExploration.ts'), /answeredNo: cc\.answeredNo, feelings: ctx\.feelings \}\)/);
  assert.match(read('server/routes/dreamExploration.ts'), /const about = \{[^}]*feelings: ctx\.feelings \}/);
  assert.match(read('server/routes/dreamReflection.ts'), /feelings: p\.emotions\?\.length \? emotionNamesForModel\(p\.emotions, p\.language\) : ''/);
  assert.match(read('server/routes/dreamReflection.ts'), /attributionContextOf\(\{ dreamerText, herAnswers, answeredNo, language, emotions \}\)/);
});

// ------------------------------------------------------------------------------------------------ the local live test (prepared, no call)

test('the local bridge uses the new title check, a run of its own and a cap that counts what is already on its way', async () => {
  const bridge = read('scripts/mapJourneyBridge.ts');
  assert.match(bridge, /checkMomentTitle\(l, elements\[i\], used, sourceText\)/, 'the titles of the live test are the fixed ones');
  assert.doesNotMatch(bridge, /checkLabel\(/);
  assert.match(bridge, /MAP_LIVE_RUN/, 'a new run is named apart, so earlier spending is neither counted nor changed');
  assert.match(bridge, /\/\^map-live-\[a-z0-9-\]\{1,30\}\$\//, 'a run name is checked');
  assert.match(bridge, /RUN_CAP > 0 && RUN_CAP <= 0\.5/, 'the cap still needs her approval and stays at most $0.50');
  assert.match(bridge, /spentRun: spent \+ inFlightWorst/, 'requests side by side are counted before they are sent');
  assert.match(bridge, /finally \{\s*inFlightWorst -= worst;/);
  // the arithmetic: two requests side by side can never pass the cap together
  const { mayCall } = await import('../scripts/lib/liveGuard.ts');
  const worst = 0.03;
  assert.equal(mayCall({ worst, spentRun: 0.15, runCap: 0.2, stageSpent: 0.15, stageStop: 0.2 }).ok, true, 'one alone fits');
  assert.equal(mayCall({ worst, spentRun: 0.15 + worst, runCap: 0.2, stageSpent: 0.15 + worst, stageStop: 0.2 }).ok, false, 'the second, counted with the first on its way, does not');
});

test('the raw log of the live test is local, off by default, and holds no request, key or header', () => {
  const bridge = read('scripts/mapJourneyBridge.ts');
  assert.match(bridge, /process\.env\.MAP_LIVE_RAW_LOG === '1'/, 'off unless asked for');
  assert.match(bridge, /\.\.\/logs\/map-live-raw\//, 'under logs/, which Git ignores');
  assert.match(read('.gitignore'), /^logs$/m);
  const fn = bridge.slice(bridge.indexOf('function writeRawLog'), bridge.indexOf('const budgetReply'));
  assert.ok(fn.length > 200);
  for (const never of [/params/, /apiKey|OPENAI_API_KEY|process\.env/, /headers/i, /authorization/i, /userId|email/i]) assert.doesNotMatch(fn, never, String(never));
});

test('2b. no check of the conversation has a space written as a bare "s" (how HER_PAST_TOLD lost its \\s)', () => {
  for (const f of ['attribution.ts', 'conversationTurn.ts', 'verifiedFallback.ts', 'momentTitle.ts', 'claimCheck.ts', 'hebrewText.ts']) {
    const src = read(`src/hero/${f}`);
    assert.doesNotMatch(src, /[א-ת)\]]s\+/, `${f}: "s+" right after a Hebrew letter, a group or a class is a lost \\s`);
    assert.doesNotMatch(src, /\(\?<!אףs\)/, f);
  }
});

// 2026-11-22, found in the demo journey (no AI): a noun and then its past verb was taken as a title ("a stranger followed").
test('2026-11-22: an English title never ends on the verb after its noun; a describing "-ed" before the noun stays', () => {
  assert.equal(checkMomentTitle('', 'Suddenly a stranger followed me and I was scared', []), 'a stranger');
  assert.equal(checkMomentTitle('A stranger followed', 'Suddenly a stranger followed me', []), 'a stranger');
  assert.equal(checkMomentTitle('', 'A dog barked at me', []), 'A dog');
  assert.equal(checkMomentTitle('', 'The door opened and a light came in', []), 'The door');
  assert.equal(checkMomentTitle('', 'I saw a frightened child near the gate', []), 'a frightened child');
  assert.equal(checkMomentTitle('', 'I walked into the old painted house', []), 'the old painted house');
  assert.equal(checkMomentTitle('The haunted house', 'We entered the haunted house', []), 'The haunted house');
  assert.equal(checkMomentTitle('The red bed', 'I lay on the red bed', []), 'The red bed');
  assert.equal(weakEnglishTitle('a stranger followed', ''), true);
  assert.equal(weakEnglishTitle('everything changed', ''), true);
  assert.equal(weakEnglishTitle('the locked door', ''), false);
  // a Hebrew title is untouched by the English rules
  assert.equal(checkMomentTitle('איש זר', 'פתאום איש זר הלך אחריי ופחדתי', []), checkLabel('איש זר', 'פתאום איש זר הלך אחריי ופחדתי', []));
});

test('2026-11-22: the round-2 feeling rules keep her own feelings and plain questions, and still catch a feeling she never named', () => {
  const en = { herWords: ['I was walking by the sea and I felt calm. Then a man followed me and I was scared.'], sourceText: '', language: 'en' as const, feelings: 'calm, fear' };
  const he = { herWords: ['הלכתי ליד הים והרגשתי רוגע. ואז איש הלך אחריי ופחדתי.'], sourceText: '', language: 'he' as const, feelings: 'שלווה, פחד' };
  for (const s of ['You felt calm by the sea.', 'You were scared when the man followed you.', 'You felt afraid of the man.', 'Did you feel afraid?', 'You felt the wind on your face.', 'You felt like the sea was calling.']) assert.equal(unreportedAttribution(s, en), null, s);
  for (const s of ['הרגשת רוגע ליד הים.', 'לא הרגשת פחד.', 'מה הרגשת כשהוא התקרב?', 'הרגשת שהים קורא לך.']) assert.equal(unreportedAttribution(s, he), null, s);
  for (const s of ['You felt ashamed.', 'You did not feel safe.', 'You were angry at him.']) assert.notEqual(unreportedAttribution(s, en), null, s);
  assert.notEqual(unreportedAttribution('הרגשת בושה.', he), null);
});
