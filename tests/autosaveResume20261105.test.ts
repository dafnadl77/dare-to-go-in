import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as X from '../src/hero/exploration';
import * as R from '../server/routes/dreamExploration';
import { aiRequestKey, type AiClaim, type AiRequestDeps } from '../server/aiRequestStore';
import { typedAnalysis } from '../src/demo/demoRouter';
import { CONVERSATIONS } from '../src/map/conversationScript';
import { createAutosave, createProgressWriter, FAILURES_BEFORE_WARNING, pauseAfter, type AutosaveStatus, type ProgressState, type WriteResult } from '../src/hero/dreamAutosave';
import { emptyReflection, isOpenDream, journeyStepOf, openDreamPayload, resumePlan, type DreamJourneyState } from '../src/hero/dreamJourneyRecord';
import { hasUnsavedDream } from '../src/hero/unsavedJourney';
import { getRecurringInsights, getArchiveEntries } from '../src/archive/archiveData';
import { en as enStrings, he as heStrings } from '../src/i18n/translations';
import { privacyEn, privacyHe } from '../src/legal/privacyContent';
import type { DreamAnalysis } from '../src/hero/dreamAnalysisSchema';
import type { SavedDream } from '../src/hero/dreamStorage';

/**
 * AUTOSAVE AND RESUME (2026-11-05): the scenarios she listed, on the real controller, writer, journey rules and route, over a row held in
 * memory that behaves like the live one (a write counts only on the version it read; an update cannot create a row). Nothing here reaches
 * a database or a model; the SQL itself is in autosaveResumeSql.test.ts.
 */

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

type Row = { id: string; rev: number; dream: Dream };
type Dream = { id: string; dreamImagePath?: string | null; dreamImageDataUrl?: string | null; journey?: DreamJourneyState; exploration?: X.Exploration };

/** The account, as seen by any device. */
function account() {
  let row: Row | null = null;
  const images = new Map<string, string>();
  const log = { uploads: 0, saves: 0, removed: [] as string[] };
  let offline = false;
  const guard = () => {
    if (offline) throw new Error('network');
  };
  const deps = {
    open: async (d: Dream) => {
      guard();
      if (!row) row = { id: d.id, rev: 0, dream: { ...d, journey: { ...(d.journey as DreamJourneyState), rev: 0 } } };
    },
    upload: async (_owner: string, id: string, image: string) => {
      guard();
      log.uploads += 1;
      images.set(`${id}.jpg`, image);
      return `${id}.jpg`;
    },
    save: async (d: Dream, _owner: string, baseRev: number): Promise<WriteResult> => {
      guard();
      log.saves += 1;
      if (!row) return 'gone';
      if (row.rev !== baseRev) return 'conflict';
      row = { id: d.id, rev: baseRev + 1, dream: d };
      return 'saved';
    },
    removeImage: async (path: string) => {
      log.removed.push(path);
      images.delete(path);
    },
  };
  return {
    deps,
    log,
    images,
    get row() {
      return row;
    },
    deleteDream() {
      row = null;
    },
    setOffline(v: boolean) {
      offline = v;
    },
  };
}

function device(acc: ReturnType<typeof account>, startRev = 0, opened = true, seen: { path: string | null; image: string | null } = { path: null, image: null }) {
  const statuses: AutosaveStatus[] = [];
  const pauses: number[] = [];
  let release: (() => void) | null = null;
  const write = createProgressWriter<Dream>({ ownerId: 'owner', opened, imagePath: seen.path, savedImage: seen.image }, acc.deps);
  const autosave = createAutosave<ProgressState<Dream>>(
    {
      write,
      onStatus: (s) => statuses.push(s),
      wait: (ms) => {
        pauses.push(ms);
        return new Promise((resolve) => {
          release = resolve;
        });
      },
    },
    startRev,
  );
  return { autosave, statuses, pauses, tick: () => release?.() };
}

const flush = async () => {
  for (let i = 0; i < 12; i += 1) await Promise.resolve();
};

const journey = (over: Partial<DreamJourneyState> = {}): DreamJourneyState => ({ status: 'open', step: 'map', momentId: null, rev: 0, ...over });
const dream = (over: Partial<Dream> = {}): Dream => ({ id: 'dream-1', journey: journey(), ...over });

const store = CONVERSATIONS.find((c) => c.key === 'store')!;
const T0 = new Date('2026-11-05T10:00:00Z');
const dare = (text: string): X.ConversationTurn => ({ role: 'dare', text, move: 'ask' });

function conversation(answers = 1) {
  let e = X.createExploration('dream-1', store.moments.map((m) => ({ label: m.label, excerpt: m.excerpt })));
  e = X.beginConversation(e, 'm1', dare('מה עולה בך כשאת חושבת על המוכר?'), T0);
  for (let i = 0; i < answers; i += 1) {
    e = X.addDreamerTurn(e, 'm1', `תשובה ${i + 1}`);
    if (i < answers - 1) e = X.addDareTurn(e, 'm1', dare(`ומה עוד עולה בך, בפעם ה-${i + 2}?`));
  }
  return e;
}

// ---------------------------------------------------------------- saving and coming back

test('closing the browser: what was confirmed is in the row, and she comes back to the same step', async () => {
  const acc = account();
  acc.deps.open(dream({ journey: journey({ step: 'analysis' }) }));
  await flush();
  const d = device(acc);
  assert.equal(await d.autosave.push({ record: dream({ journey: journey({ step: 'feelings' }) }), image: 'data:image/jpeg;base64,AAAA' }), 'saved');
  // the browser is gone: only the account remains
  const row = acc.row!;
  assert.equal(row.dream.journey?.step, 'feelings');
  assert.deepEqual(resumePlan(row.dream.journey, true), { phase: 'inside', insideStep: 'emotions' });
  assert.equal(isOpenDream(row.dream), true);
});

test('every step comes back to itself; a picture that was still appearing is never made twice', () => {
  assert.deepEqual(resumePlan(journey({ step: 'map' }), true), { phase: 'inside', insideStep: 'map' });
  assert.deepEqual(resumePlan(journey({ step: 'interpreting' }), true), { phase: 'inside', insideStep: 'interpreting' });
  assert.deepEqual(resumePlan(journey({ step: 'reflection', reflected: true }), true), { phase: 'inside', insideStep: 'reflection' });
  assert.deepEqual(resumePlan(journey({ step: 'reflection' }), true), { phase: 'inside', insideStep: 'interpreting' }, 'a reflection that never arrived is asked for again');
  assert.deepEqual(resumePlan(journey({ step: 'closing', reflected: true }), true), { phase: 'inside', insideStep: 'closing' });
  assert.deepEqual(resumePlan(journey({ step: 'reveal' }), true), { phase: 'reveal', insideStep: 'emotions' });
  assert.deepEqual(resumePlan(journey({ step: 'analysis' }), true), { phase: 'reveal', insideStep: 'emotions' });
  assert.deepEqual(resumePlan(journey({ step: 'analysis' }), false), { phase: 'none', insideStep: 'emotions' }, 'no picture yet: the journey goes on from the analysis');
  assert.equal(journeyStepOf('imaging', 'prompt'), 'analysis');
  assert.equal(journeyStepOf('correcting', 'prompt'), 'reveal');
  assert.equal(journeyStepOf('inside', 'emotions'), 'feelings');
  assert.equal(journeyStepOf('inside', 'map'), 'map');
});

test('the same moment and the same round: the conversation comes back as she left it, and the third round still ends the moment', () => {
  const e = conversation(2);
  const saved = X.parseExploration(JSON.parse(JSON.stringify(e)));
  assert.ok(saved);
  assert.equal(X.exploringId(saved), 'm1');
  assert.equal(X.questionsAsked(saved, 'm1'), X.questionsAsked(e, 'm1'));
  assert.equal(X.questionsAsked(saved, 'm1'), 2);
  assert.equal(X.needsTurnCall(saved, 'm1'), true, 'her answer waits for its one reply');

  // the third round, after coming back: her third answer ends the moment with no further call
  const third = X.addDareTurn(saved, 'm1', dare('ומה נשאר איתך מזה?'));
  assert.equal(X.questionsAsked(third, 'm1'), X.MAX_QUESTIONS_PER_MOMENT);
  const last = X.addDreamerTurn(third, 'm1', 'תשובה 3');
  assert.equal(X.needsTurnCall(last, 'm1'), false);
  assert.equal(X.momentEnded(last, 'm1'), true);
  // nothing added afterwards can ask DARE for a fourth
  assert.equal(X.needsTurnCall(X.addDreamerTurn(last, 'm1', 'עוד'), 'm1'), false);
});

test('the moment she left opens by itself, and only a reply she never received is asked for', () => {
  const map = read('src/map/DreamJourneyMap.tsx');
  assert.match(map, /initialMoment=\{resumeMomentId && e\.explored\[resumeMomentId\]\?\.status === 'exploring' \? resumeMomentId : null\}/);
  assert.match(map, /if \(X\.needsTurnCall\(exploration, resumeMomentId\) && !sessionStopped\(\)\) void answer\(exploration, resumeMomentId\);/);
  assert.match(read('src/map/DreamMap.tsx'), /useState<string \| null>\(props\.initialMoment \?\? null\)/);
});

test('"לרגע אחר" still closes the moment; closing the browser does not', () => {
  const e = conversation(1);
  assert.equal(X.exploringId(e), 'm1');
  assert.equal(X.exploringId(X.completeConversation(e, 'm1')), null);
  assert.equal(X.exploringId(X.parseExploration(JSON.parse(JSON.stringify(e)))!), 'm1');
});

// ---------------------------------------------------------------- another device

test('another device: it goes on from the row, and the first device can never write over it', async () => {
  const acc = account();
  await acc.deps.open(dream());
  const first = device(acc);
  assert.equal(await first.autosave.push({ record: dream({ journey: journey({ momentId: 'm1' }) }), image: null }), 'saved');

  const second = device(acc, acc.row!.rev);
  assert.equal(await second.autosave.push({ record: dream({ journey: journey({ momentId: 'm2' }) }), image: null }), 'saved');

  assert.equal(await first.autosave.push({ record: dream({ journey: journey({ momentId: 'old' }) }), image: null }), 'conflict');
  assert.equal(first.statuses.at(-1), 'conflict');
  assert.equal(acc.row!.dream.journey?.momentId, 'm2', 'the newer device stays');

  // the first device reads the row and goes on from it
  first.autosave.adopt(acc.row!.rev);
  assert.equal(await first.autosave.push({ record: dream({ journey: journey({ momentId: 'm2', step: 'closing' }) }), image: null }), 'saved');
});

test('on a conflict the screen takes the dream as it now stands and never writes over it', () => {
  const hero = read('src/hero/HeroDream.tsx');
  assert.match(hero, /if \(saveStatus !== 'conflict' \|\| finishingRef\.current/);
  assert.match(hero, /\(dream\) => onDreamMovedOn\?\.\(dream\)/);
  assert.match(read('src/App.tsx'), /if \(dream && isOpenDream\(dream\)\) void continueDream\(dream\);\n\s+else setView\('archive'\);/);
  const remote = read('src/hero/dreamRemoteStorage.ts');
  assert.match(remote, /\.eq\('payload->journey->>rev', String\(baseRev\)\)/);
});

// ---------------------------------------------------------------- the picture

test('the picture: uploaded once, kept by path, never as data in the row, and saved before its reveal ends', async () => {
  const acc = account();
  await acc.deps.open(dream());
  const d = device(acc);
  const image = 'data:image/jpeg;base64,PICTURE';
  await d.autosave.push({ record: dream(), image });
  await d.autosave.push({ record: dream({ journey: journey({ step: 'feelings' }) }), image });
  assert.equal(acc.log.uploads, 1);
  assert.equal(acc.row!.dream.dreamImagePath, 'dream-1.jpg');
  assert.equal(acc.images.get('dream-1.jpg'), image);

  const corrected = 'data:image/jpeg;base64,CORRECTED';
  await d.autosave.push({ record: dream(), image: corrected });
  assert.equal(acc.log.uploads, 2);
  assert.equal(acc.images.get('dream-1.jpg'), corrected, 'the same path: a correction leaves no second file');

  const hero = read('src/hero/HeroDream.tsx');
  assert.match(hero, /const latestImage = imageResult\?\.status === 'ok' \? imageResult\.imageDataUrl : displayedImageUrl;/);
  const remote = read('src/hero/dreamRemoteStorage.ts');
  assert.match(remote, /update\(\{ payload: \{ \.\.\.payload, dreamImageDataUrl: null \} \}\)/);
});

test('a dream she came back to is never uploaded again; a picture for a dream deleted meanwhile is removed', async () => {
  const acc = account();
  await acc.deps.open(dream());
  const seen = device(acc, 0, true, { path: 'dream-1.jpg', image: 'data:image/jpeg;base64,SAVED' });
  await seen.autosave.push({ record: dream(), image: 'data:image/jpeg;base64,SAVED' });
  assert.equal(acc.log.uploads, 0);
  assert.equal(acc.row!.dream.dreamImagePath, 'dream-1.jpg');

  const late = device(acc, acc.row!.rev);
  acc.deleteDream();
  assert.equal(await late.autosave.push({ record: dream(), image: 'data:image/jpeg;base64,LATE' }), 'gone');
  assert.deepEqual(acc.log.removed, ['dream-1.jpg']);
});

test('a row the server could not open is opened by the browser under the same id, once', async () => {
  const acc = account();
  const d = device(acc, 0, false);
  assert.equal(await d.autosave.push({ record: dream(), image: null }), 'saved');
  assert.equal(acc.row!.id, 'dream-1');
  assert.equal(acc.row!.rev, 1);
  assert.equal(await d.autosave.push({ record: dream({ journey: journey({ step: 'closing' }) }), image: null }), 'saved');
  assert.equal(acc.row!.rev, 2);
});

// ---------------------------------------------------------------- network failure

test('a network failure: the approved words, in order; a newer state wins; the connection coming back writes at once', async () => {
  const acc = account();
  await acc.deps.open(dream());
  acc.setOffline(true);
  const d = device(acc);
  assert.equal(await d.autosave.push({ record: dream({ journey: journey({ momentId: 'older' }) }), image: null }), 'failed');
  assert.equal(d.statuses.at(-1), 'retrying');
  for (let i = 1; i < FAILURES_BEFORE_WARNING; i += 1) {
    d.tick();
    await flush();
  }
  assert.equal(d.statuses.at(-1), 'failing', 'after three failures it asks her to keep the screen open');
  assert.deepEqual(d.pauses.slice(0, 3), [2000, 4000, 8000]);
  assert.equal(pauseAfter(50), 30000);

  const newer = d.autosave.push({ record: dream({ journey: journey({ momentId: 'newer' }) }), image: null });
  acc.setOffline(false);
  d.autosave.retryNow();
  assert.equal(await newer, 'saved');
  await flush();
  assert.equal(acc.row!.dream.journey?.momentId, 'newer');
  assert.equal(d.statuses.at(-1), 'saved');
  assert.equal(acc.log.saves, 1, 'the older state was never written after the newer one');
});

test('"saved" is never said for an older write: a state pushed during a write waits for its own', async () => {
  const acc = account();
  await acc.deps.open(dream());
  const d = device(acc);
  const first = d.autosave.push({ record: dream({ journey: journey({ momentId: 'a' }) }), image: null });
  const second = d.autosave.push({ record: dream({ journey: journey({ momentId: 'b' }) }), image: null });
  assert.equal(await first, 'saved');
  assert.equal(await second, 'saved');
  assert.equal(acc.row!.dream.journey?.momentId, 'b', 'answered only once the newest state is in the row');
});

test('the failure line appears only when something is wrong, and leaving is protected exactly then', () => {
  const hero = read('src/hero/HeroDream.tsx');
  assert.match(hero, /\(saveStatus === 'retrying' \|\| saveStatus === 'failing' \|\| saveStatus === 'gone'\) && \(/);
  assert.equal(hasUnsavedDream({ analysisOk: true, insideStep: 'map', savedInAccount: true }), false);
  assert.equal(hasUnsavedDream({ analysisOk: true, insideStep: 'map', savedInAccount: false }), true);
  assert.equal(hasUnsavedDream({ analysisOk: true, insideStep: 'map' }), true);
  assert.equal(hasUnsavedDream({ analysisOk: false, insideStep: 'prompt', paidAnalysisInFlight: true, savedInAccount: true }), true, 'an analysis with no answer yet is still protected');
  assert.match(hero, /saveStatus !== 'retrying' && saveStatus !== 'failing' && saveStatus !== 'gone'/);
});

test('her words reach the account before DARE is asked, without a slow connection holding DARE back', () => {
  const map = read('src/map/DreamJourneyMap.tsx');
  assert.match(map, /if \(\(await onPersist\?\.\(next\)\) === false\) return setPending\(false\);\n\s+const out = await engine\.turn\(next,/);
  assert.match(map, /if \(\(await onPersist\?\.\(base\)\) === false\) return setPending\(false\);\n\s+const out = await engine\.turn\(base,/);
  assert.match(map, /if \(\(await onPersist\?\.\(base\)\) === false\) return setPhase\(.*\);\n\s+const out = await engine\.wholeView\(base,/);
  const hero = read('src/hero/HeroDream.tsx');
  assert.match(hero, /PERSIST_WAIT_MS\)\)\]\);\n\s+return outcome !== 'conflict' && outcome !== 'gone';/, 'nothing is asked from a state another device moved past');
  assert.match(hero, /if \(cameBackUnchangedRef\.current\) \{/, 'just opening a dream writes nothing, so two open devices never push each other');
});

// ---------------------------------------------------------------- the route: one request, one charge

const analysis = () => typedAnalysis(store.dreamText, true) as unknown as DreamAnalysis;

function routeDeps(claims: AiClaim[], supersededRun = false) {
  const log = { model: 0, reserved: 0, refunded: 0, finished: [] as unknown[], released: 0, claims: 0 };
  const records: AiRequestDeps = {
    claim: async () => {
      log.claims += 1;
      return claims.shift() ?? null;
    },
    finish: async (_d, _o, _t, result) => void log.finished.push(result),
    release: async () => {
      log.released += 1;
      return !supersededRun;
    },
  };
  const deps: R.ExplorationDeps = {
    ...R.realExplorationDeps,
    resolveIdentity: async () => ({ ok: true, identity: { kind: 'user', userId: 'owner' } }) as never,
    openai: () => ({}) as never,
    rateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }) as never,
    aiRequests: records,
    reserveMoment: async () => {
      log.reserved += 1;
      return 'reserved';
    },
    refundMoment: async () => void (log.refunded += 1),
    address: async () => 'feminine',
    moderate: async () => ({ status: 'ok' as const, hit: false }),
    generateTurn: (async () => {
      log.model += 1;
      return { value: { text: 'מה עוד עולה?' }, usage: null };
    }) as never,
  };
  return { deps, log };
}

const turn = (e: X.Exploration, deps: R.ExplorationDeps) =>
  R.handleExploration('conversation-turn', { language: 'he', attemptId: e.attemptId, dreamAnalysis: analysis(), exploration: e, momentId: 'm1' }, {}, deps);

test('an interrupted request: she comes back and receives the reply already paid for, with no model and no slot', async () => {
  const e = conversation(1);
  const { deps, log } = routeDeps([{ state: 'done', result: { kind: 'turn', turn: { role: 'dare', text: 'התשובה ששמורה' } } }]);
  const res = await turn(e, deps);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { kind: 'turn', turn: { role: 'dare', text: 'התשובה ששמורה' } });
  assert.equal(log.model, 0);
  assert.equal(log.reserved, 0);
});

test('the same request still running, or another one: answered 202, with no model and no slot', async () => {
  const e = conversation(1);
  for (const state of ['processing', 'busy'] as const) {
    const { deps, log } = routeDeps([{ state }]);
    const res = await turn(e, deps);
    assert.equal(res.status, 202);
    assert.deepEqual(res.body, { pending: true });
    assert.equal(log.model, 0);
    assert.equal(log.reserved, 0);
  }
});

test('a run that fails after a recovery took it over gives back nothing: the slot is the recovery\'s', async () => {
  const e = conversation(1);
  const failing = async () => {
    throw new Error('late failure');
  };
  const late = routeDeps([{ state: 'new', token: 'old' }], true);
  await turn(e, { ...late.deps, generateTurn: failing as never });
  assert.equal(late.log.reserved, 1);
  assert.equal(late.log.refunded, 0);
  const normal = routeDeps([{ state: 'new', token: 'mine' }]);
  await turn(e, { ...normal.deps, generateTurn: failing as never });
  assert.equal(normal.log.refunded, 1, 'an ordinary failure still returns its slot');
});

test('a dream that is gone, or someone else\'s: refused before any model, slot, record or credit', async () => {
  const e = conversation(1);
  for (const [access, status] of [['missing', 404], ['unavailable', 503]] as const) {
    let moderated = 0;
    const { deps, log } = routeDeps([{ state: 'new', token: 't' }]);
    const res = await turn(e, {
      ...deps,
      dreamAccess: async () => access,
      moderate: async () => {
        moderated += 1;
        return { status: 'ok' as const, hit: false };
      },
      refundCredit: async () => {
        throw new Error('no credit action');
      },
    });
    assert.equal(res.status, status);
    assert.equal(log.model + log.reserved + log.claims + moderated, 0);
  }
});

test('every AI route of a dream asks first, in code that runs before its model and its slot', () => {
  for (const file of ['dreamImage', 'dreamElementLabels', 'dreamQuestions', 'dreamReflection', 'dreamExploration']) {
    const src = read(`server/routes/${file}.ts`);
    const asked = src.indexOf('await dreamRefusal(');
    assert.ok(asked > 0, file);
    for (const later of ['getOpenAIClient()', 'reserveImageAttempt(attemptId', 'reserveLabelsAttempt(attemptId', 'reserveReflectionAttempt(attemptId', 'records.claim(', 'checkHerAnswers(']) {
      const at = src.indexOf(later, src.indexOf('export async function handle'));
      if (at >= 0 && file !== 'dreamExploration' && later !== 'getOpenAIClient()') assert.ok(asked < at, `${file}: ${later}`);
    }
  }
  const route = read('server/routes/dreamExploration.ts');
  assert.ok(route.indexOf('await dreamRefusal(') < route.indexOf('await checkHerAnswers('), 'before the moderation call too');
  assert.ok(route.indexOf('await dreamRefusal(') < route.indexOf('await records.claim('));
});

test('an old analysis key can never bring back a deleted dream', async () => {
  const route = read('server/routes/dreamAnalysis.ts');
  assert.doesNotMatch(route, /upsert|openDreamInAccount/);
  assert.match(route, /if \(access === 'missing'\) return withHeaders\(errorResult\(409, 'analysis_expired'/);
  assert.match(read('supabase/migrations/20261105_autosave_resume.sql'), /complete_analysis_open_dream/);
});

test('a stuck request is run again on the slot it already holds: no second charge', () => {
  const route = read('server/routes/dreamExploration.ts');
  assert.match(route, /const reservation = claim\?\.state === 'retry' \? 'reserved' : await/);
  assert.match(read('server/routes/dreamReflection.ts'), /claim/);
});

test('the request key: the same words are the same request, a new answer is a new one', () => {
  const a = aiRequestKey('t', ['m1', 'turn', 2, 1, 'תשובה']);
  assert.equal(a, aiRequestKey('t', ['m1', 'turn', 2, 1, 'תשובה']));
  assert.notEqual(a, aiRequestKey('t', ['m1', 'turn', 2, 1, 'תשובה אחרת']));
  assert.notEqual(a, aiRequestKey('w', ['m1', 'turn', 2, 1, 'תשובה']));
  assert.ok(a.length <= 200, 'the record refuses longer keys');
  assert.doesNotMatch(a, /תשובה/, 'the key holds no words of hers');
});

test('a browser that waits for a running request is bounded, and then counts it as not answered', () => {
  const core = read('src/hero/explorationEngineCore.ts');
  assert.match(core, /for \(let i = 0; i < REQUEST_WAITS; i \+= 1\)/);
  assert.match(read('src/hero/dreamReflectionEngine.ts'), /res\.status === 202 && i < REQUEST_WAITS/);
  assert.match(read('src/hero/requestTimeouts.ts'), /REQUEST_WAITS = 12;\nexport const REQUEST_WAIT_MS = 5000;/);
});

test('the moment-call allowance is the approved 20, and the hourly limit is untouched', () => {
  assert.equal(X.MAX_MOMENT_CALLS, 20);
  assert.match(read('server/routes/dreamExploration.ts'), /EXPLORATION_LABEL_CAP = MAX_LABEL_CALLS_PER_ATTEMPT \+ MAX_MOMENT_CALLS/);
  assert.match(read('server/rateLimit.ts'), /readPositiveIntEnv\(env\.DARE_EXPLORE_PER_HOUR, 40\)/);
});

// ---------------------------------------------------------------- finishing and deleting

test('finishing: the same row turns done, the open state can never come after it', async () => {
  const acc = account();
  await acc.deps.open(dream());
  const d = device(acc);
  await d.autosave.push({ record: dream(), image: null });
  assert.equal(await d.autosave.push({ record: dream({ journey: journey({ status: 'done', step: 'closing', reflected: true }) }), image: null }), 'saved');
  assert.equal(isOpenDream(acc.row!.dream), false);

  const hero = read('src/hero/HeroDream.tsx');
  assert.match(hero, /if \(finishingRef\.current \|\| analysisResult\?\.status !== 'ok'\) return null;/);
  assert.match(hero, /finishingRef\.current = true;\n\s+setInsideStep\('saving'\);/);
  assert.match(hero, /finishInAccount\(record\)\.then\(/);
  assert.match(hero, /\.\.\.\(user \? \{ id: analysisResult\.attemptId \} : \{\}\)/, 'finishing never makes a second dream');
});

test('deleted from the archive: nothing writes it back, and the screen stops saving', async () => {
  const acc = account();
  await acc.deps.open(dream());
  const d = device(acc);
  await d.autosave.push({ record: dream(), image: null });
  acc.deleteDream();
  assert.equal(await d.autosave.push({ record: dream(), image: null }), 'gone');
  assert.equal(d.statuses.at(-1), 'gone');
  assert.equal(await d.autosave.push({ record: dream(), image: null }), 'gone');
  assert.equal(acc.row, null);
});

test('an open dream in the archive: labelled, opened as a journey, and outside her patterns', () => {
  const base = (id: string, status?: 'open') =>
    ({
      id,
      createdAt: '2026-11-05T10:00:00.000Z',
      sourceText: 'חלום',
      inputMode: 'text',
      dreamAnalysis: { summary: 'חלום', emotions: [], reconstruction: { emotionalAtmosphere: [], keyObjects: [] }, entities: [], events: [] },
      dreamImageDataUrl: null,
      selectedElement: '',
      reflectionResponse: '',
      dreamReflection: emptyReflection('he'),
      corrections: [],
      appLanguage: 'he',
      ...(status ? { journey: journey() } : {}),
    }) as unknown as SavedDream;
  const entries = getArchiveEntries([base('a', 'open'), base('b')], 'he');
  assert.equal(entries.length, 2, 'an open dream is in the archive');
  assert.equal(isOpenDream(base('a', 'open')), true);
  assert.equal(isOpenDream(base('b')), false, 'every dream saved before autosave is a finished dream');
  assert.doesNotThrow(() => getRecurringInsights(entries));
  assert.match(read('src/archive/archiveData.ts'), /allEntries\.filter\(\(e\) => e\.kind !== 'real' \|\| !isOpenDream\(e\.savedDream\)\)/);
  assert.match(read('server/routes/patternReflection.ts'), /row\.payload\.journey\?\.status !== 'open'/);
  assert.match(read('src/archive/DreamTimeline.tsx'), /isOpenDream\(entry\.savedDream\) && <span className="dt-card-progress">\{t\('archive\.inProgress'\)\}<\/span>/);
  assert.match(read('src/App.tsx'), /void continueDream\(fresh\)/);
});

// ---------------------------------------------------------------- the analysis opens the dream

test('the open dream starts in the right shape in both languages, with nothing that reads a saved dream breaking on it', () => {
  for (const language of ['he', 'en'] as const) {
    const p = openDreamPayload({ sourceText: 'x', inputMode: 'text', analysis: {} as DreamAnalysis, language });
    assert.deepEqual(p.journey, { status: 'open', step: 'analysis', momentId: null, rev: 0 });
    assert.equal(p.dreamImageDataUrl, null);
    assert.equal(p.appLanguage, language);
    assert.deepEqual(p.dreamReflection, emptyReflection(language));
    assert.ok(p.dreamReflection.groundingStatement.length > 0);
  }
});

// ---------------------------------------------------------------- closing screen and wording

test('the closing: one portal, the approved words in both languages, the rest of the code kept', () => {
  const tsx = read('src/hero/DreamClosing.tsx');
  assert.match(tsx, /const LET_GO_OFFERED = false;/);
  assert.match(tsx, /\{LET_GO_OFFERED && <button type="button" className="dc-portal dc-portal--let-go"/);
  assert.match(tsx, /\{LET_GO_OFFERED && <p className="dc-choice-hint">/);
  assert.match(tsx, /step === 'letting-go'/, 'the old animation stays in the code');
  assert.match(tsx, /t\('closing\.returnToTheRoom'\)/);
  assert.match(tsx, /t\('closing\.goToMyDreamArchive'\)/);
  const he = heStrings.closing;
  const en = enStrings.closing;
  assert.equal(he.journeyEnded, 'המסע הגיע לסופו.');
  assert.equal(he.finishJourney, 'לסיים\nאת המסע');
  assert.equal(he.waitsInArchive, 'החלום שלך מחכה לך בארכיון.');
  assert.equal(he.returnToTheRoom, 'חזרה לחדר');
  assert.equal(he.goToMyDreamArchive, 'מעבר לארכיון החלומות שלי');
  assert.equal(en.journeyEnded, 'THE JOURNEY HAS COME TO ITS END.');
  assert.equal(en.finishJourney, 'FINISH\nTHE JOURNEY');
  assert.equal(en.waitsInArchive, 'YOUR DREAM IS WAITING FOR YOU IN THE ARCHIVE.');
});

test('the failure words, the archive label and the privacy text, in Hebrew and in English', () => {
  assert.equal(heStrings.autosave.retrying, 'לא הצלחנו לשמור את ההתקדמות. מנסים שוב…');
  assert.equal(heStrings.autosave.failing, 'השמירה עדיין לא הצליחה. נא לא לסגור את המסך עד שהיא תצליח.');
  assert.equal(enStrings.autosave.retrying, "We couldn't save your progress. Trying again…");
  assert.equal(enStrings.autosave.failing, "Saving still hasn't worked. Please keep this screen open until it does.");
  assert.equal(heStrings.archive.inProgress, 'בתהליך');
  assert.equal(enStrings.archive.inProgress, 'In progress');
  const he = JSON.stringify(privacyHe);
  const en = JSON.stringify(privacyEn);
  assert.match(he, /כשניתוח החלום מסתיים, החלום וההתקדמות שלכם בו נשמרים בחשבון אוטומטית/);
  assert.match(he, /התשובה האחרונה של DARE נשמרת זמנית/);
  assert.match(en, /the dream and your progress in it are saved to your account automatically/);
  assert.match(en, /DARE's latest reply is kept temporarily with the dream/);
  assert.doesNotMatch(he, /רק אם שומרים את החלום/);
  assert.doesNotMatch(en, /only if you save the dream/);
});

test('the language of the journey stays with the dream when she comes back', () => {
  const hero = read('src/hero/HeroDream.tsx');
  assert.match(hero, /useRef<AppLanguage \| null>\(resumedDream\?\.appLanguage \?\? null\)/);
  assert.match(read('src/hero/dreamAnalysis.ts'), /language: getAppLanguage\(\)/);
});

test('nothing paid runs again on the way back: no analysis, the moments and fragments reused, only what never arrived is asked for', () => {
  const hero = read('src/hero/HeroDream.tsx');
  assert.match(hero, /if \(cameBack\) setFragments\(rawFragments\);/);
  assert.match(hero, /if \(!cameBack\?\.exploration\) prepareMoments\(analysis, attemptId, journeyLanguage\);/);
  assert.match(hero, /reconstructionPhase === 'inside' && resumedRef\.current\?\.phase !== 'inside'/);
  assert.match(hero, /if \(cameBack\.phase === 'inside' && cameBack\.insideStep === 'interpreting'\) handleContinueFromMap\(\);/);
  assert.match(hero, /useRef\(resumedDream\?\.corrections\.length \?\? 0\)/);
});
