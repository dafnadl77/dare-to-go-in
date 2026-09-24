import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createJourneyEpoch, runInJourney } from '../src/hero/journeyEpoch.ts';
import { buildSavedDream } from '../src/hero/dreamStorage.ts';
import { setActiveLanguage } from '../src/hero/appLanguage.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
const settle = () => new Promise((r) => setTimeout(r, 0));

// ------------------------------------------------------------ the guard ----

test('a response from the CURRENT journey is applied', async () => {
  const epoch = createJourneyEpoch();
  const d = deferred<string>();
  const applied: string[] = [];
  const run = runInJourney(epoch, () => d.promise, (r) => applied.push(r));
  d.resolve('analysis-1');
  await run;
  assert.deepEqual(applied, ['analysis-1']);
});

test('an abandoned analysis can NEVER resurrect an old journey: resolving after the journey was invalidated is a no-op', async () => {
  const epoch = createJourneyEpoch();
  const d = deferred<string>();
  const applied: string[] = [];
  const run = runInJourney(epoch, () => d.promise, (r) => applied.push(r));
  epoch.invalidate(); // the dreamer went home / left
  d.resolve('late-analysis-of-abandoned-dream');
  await run;
  assert.deepEqual(applied, []);
});

test('an old dream\'s image can NEVER become a new dream\'s image', async () => {
  const epoch = createJourneyEpoch();
  const oldImage = deferred<string>();
  const newImage = deferred<string>();
  const shown: string[] = [];
  const runOld = runInJourney(epoch, () => oldImage.promise, (r) => shown.push(r));
  epoch.invalidate(); // journey 1 abandoned, journey 2 begins
  const runNew = runInJourney(epoch, () => newImage.promise, (r) => shown.push(r));
  oldImage.resolve('IMAGE-OF-OLD-DREAM'); // arrives first
  await runOld;
  assert.deepEqual(shown, [], 'the old image must not appear while the new dream waits for its own');
  newImage.resolve('IMAGE-OF-NEW-DREAM');
  await runNew;
  assert.deepEqual(shown, ['IMAGE-OF-NEW-DREAM']);
});

test('old labels and an old reflection cannot mutate a new journey (each is guarded the same way)', async () => {
  const epoch = createJourneyEpoch();
  const labels = deferred<string[]>();
  const reflection = deferred<string>();
  const state = { labels: [] as string[], reflection: '' };
  const a = runInJourney(epoch, () => labels.promise, (r) => (state.labels = r));
  const b = runInJourney(epoch, () => reflection.promise, (r) => (state.reflection = r));
  epoch.invalidate();
  labels.resolve(['old label']);
  reflection.resolve('old reflection');
  await Promise.all([a, b]);
  assert.deepEqual(state, { labels: [], reflection: '' });
});

test('legitimate SEQUENTIAL requests inside one journey are all applied (analysis, then image, then a regeneration)', async () => {
  const epoch = createJourneyEpoch();
  const applied: string[] = [];
  for (const name of ['analysis', 'image', 'regeneration', 'reflection']) {
    const d = deferred<string>();
    const run = runInJourney(epoch, () => d.promise, (r) => applied.push(r));
    d.resolve(name);
    await run;
  }
  assert.deepEqual(applied, ['analysis', 'image', 'regeneration', 'reflection']);
});

test('a late FAILURE of an old journey is ignored too, and never throws', async () => {
  const epoch = createJourneyEpoch();
  const d = deferred<string>();
  const errors: unknown[] = [];
  const run = runInJourney(epoch, () => d.promise, () => {}, (e) => errors.push(e));
  epoch.invalidate();
  d.reject(new Error('late failure'));
  await assert.doesNotReject(run);
  await settle();
  assert.deepEqual(errors, []);
});

test('invalidate() is monotonic, so an older journey can never become current again', () => {
  const epoch = createJourneyEpoch();
  const first = epoch.current();
  epoch.invalidate();
  epoch.invalidate();
  assert.equal(epoch.isCurrent(first), false);
  assert.equal(epoch.isCurrent(epoch.current()), true);
});

// ------------------------------------------ HeroDream really uses the guard ----

const hero = read('src/hero/HeroDream.tsx');

test('every async result that can change the journey goes through runInJourney (analysis, labels, image incl. regeneration, reflection)', () => {
  const analysis = hero.slice(hero.indexOf('const runAnalysis'), hero.indexOf('const handleDreamCapture'));
  assert.match(analysis, /runInJourney\(\s*epoch,\s*\(\) => analyzeDream\(input\)/);
  assert.match(analysis, /if \(seq !== analysisSeqRef\.current\) return;/);
  assert.match(hero, /runInJourney\(\s*epoch,\s*\(\) => getDisplayLabels\(/);
  assert.match(hero, /runInJourney\(\s*epoch,\s*\(\) => generateDreamImage\(briefToUse, attemptId\)/);
  assert.match(hero, /runInJourney\(\s*epoch,\s*\(\) => getDreamReflection\(/);
  // none of the raw, unguarded call shapes remain
  assert.ok(!/analyzeDream\(input\)\s*\.then/.test(hero));
  assert.ok(!/getDisplayLabels\([^)]*\)\.then/.test(hero));
  assert.ok(!/generateDreamImage\(briefToUse, attemptId\)\.then/.test(hero));
  assert.ok(!/getDreamReflection\(request\)\.then/.test(hero));
});

test('within a journey, a newer image / reflection request supersedes an older one (token check on arrival)', () => {
  assert.match(hero, /if \(generationTokenRef\.current !== token\) return;/);
  assert.match(hero, /if \(reflectionTokenRef\.current !== token\) return;/);
});

test('the journey is invalidated when it is abandoned (go home / let go) and when the screen unmounts', () => {
  const goHome = hero.slice(hero.indexOf('const handleGoHome'), hero.indexOf('const handleGoHome') + 400);
  assert.match(goHome, /epoch\.invalidate\(\);/);
  assert.match(goHome, /analysisSeqRef\.current \+= 1;/);
  assert.match(hero, /useEffect\(\s*\(\) => \(\) => \{\s*epoch\.invalidate\(\);\s*\},\s*\[epoch\],?\s*\);/);
});

// ------------------------------------------------------ journey language ----

test('language consistency: the journey language is locked at the first generation and used for labels, the reflection and the saved stamp', () => {
  assert.match(hero, /if \(journeyLanguageRef\.current === null\) journeyLanguageRef\.current = getAppLanguage\(\);/);
  assert.match(hero, /getDisplayLabels\(analysis\.sourceText, combined, analysisResult\.attemptId, journeyLanguage\)/);
  assert.match(hero, /language: journeyLanguageRef\.current \?\? getAppLanguage\(\)/);
  assert.match(hero, /appLanguage: journeyLanguageRef\.current \?\? undefined/);
  assert.match(read('src/hero/dreamReflectionEngine.ts'), /language: request\.language \?\? getAppLanguage\(\)/);
  assert.match(read('src/hero/dreamElementLabels.ts'), /language: AppLanguage = getAppLanguage\(\)/);
  // a new journey starts unlocked
  assert.match(hero.slice(hero.indexOf('const handleGoHome')), /journeyLanguageRef\.current = null;/);
});

test('a dream generated in one language is stamped with THAT language even if the UI language changed before saving', () => {
  const base = {
    sourceText: 't',
    inputMode: 'text' as const,
    dreamAnalysis: {} as never,
    dreamImageDataUrl: null,
    selectedElement: 'x',
    reflectionResponse: 'y',
    dreamReflection: {} as never,
    corrections: [],
  };
  setActiveLanguage('en'); // the language the journey was generated in (locked)
  const journeyLanguage = 'en' as const;
  setActiveLanguage('he'); // the dreamer flips the interface language before saving
  assert.equal(buildSavedDream({ ...base, appLanguage: journeyLanguage }).appLanguage, 'en');
  // with no locked journey language (older callers) it still falls back to the current app language
  assert.equal(buildSavedDream(base).appLanguage, 'he');
  setActiveLanguage('en');
});
