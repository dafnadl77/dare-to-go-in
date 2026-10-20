import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { getArchiveEntries } from '../src/archive/archiveData.ts';
import type { SavedDream } from '../src/hero/dreamStorage.ts';
import { answerMoment, basedOnKey, beginMoment, completeMoment, createExploration, parseExploration, receiveReply, receiveWholeView } from '../src/hero/exploration.ts';

const root = new URL('../', import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root), 'utf8');
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(new URL(dir, root))) {
    const rel = join(dir, name).replace(/\\/g, '/');
    if (statSync(new URL(rel, root)).isDirectory()) out.push(...sourceFiles(`${rel}/`));
    else if (/\.(ts|tsx)$/.test(name)) out.push(rel);
  }
  return out;
}

/** An older saved dream exactly as the archive has them today: no `exploration`. */
function oldDream(): SavedDream {
  return {
    id: 'old-1',
    createdAt: '2026-09-01T12:00:00.000Z',
    favorite: false,
    sourceText: 'I was in a house by the sea and the door was open.',
    inputMode: 'text',
    dreamImageDataUrl: null,
    dreamImagePath: 'owner/old-1.jpg',
    selectedElement: 'the open door',
    reflectionResponse: 'it felt like a way out',
    dreamReflection: { observation: 'The door was open.', personalAssociation: 'p', possibleThread: 't', continuityQuestion: 'q?', lenses: { cognitive: null, jungian: null, psychodynamic: null }, confidenceNotes: [], groundingStatement: 'g' },
    corrections: [],
    appLanguage: 'en',
    dreamAnalysis: {
      sourceText: 'I was in a house by the sea and the door was open.',
      summary: 'A house by the sea with an open door',
      people: [],
      places: [{ name: 'house', description: null, explicit: true, confidence: 0.9 }],
      objects: [{ name: 'door', description: null, explicit: true, confidence: 0.9 }],
      actions: [],
      emotions: [],
      reconstruction: { keyPeople: [], keyObjects: ['door'], keyActions: [], emotionalAtmosphere: [], primarySetting: 'house by the sea' },
    },
  } as unknown as SavedDream;
}

// ------------------------------------------------------------------------------------------------ 5. older dreams open as before

test('an older dream (no exploration) reads exactly as before, and adding a journey does not change what the archive shows of it', () => {
  const old = oldDream();
  assert.equal(parseExploration((old as { exploration?: unknown }).exploration), null);
  const before = getArchiveEntries([old], 'en');
  assert.equal(before.length, 1);
  assert.equal(before[0].kind, 'real');
  let e = createExploration('att', [{ label: 'the open door' }]);
  e = beginMoment(e, 'm1', 'q?', 'pregenerated');
  e = answerMoment(e, 'm1', 'a');
  e = receiveReply(e, 'm1', { observation: 'o', reflection: 'r', possibility: 'p' }, null);
  e = completeMoment(e, 'm1');
  e = receiveWholeView(e, { overview: 'w', recurring: null, contrast: null, readings: [], closingQuestion: 'c?', connections: [] }, basedOnKey(e));
  const after = getArchiveEntries([{ ...old, exploration: e }], 'en');
  const strip = (x: unknown) => JSON.parse(JSON.stringify(x, (k, v) => (k === 'savedDream' ? undefined : v)));
  assert.deepEqual(strip(after), strip(before), 'title, excerpt, keywords and dates are unchanged by the new optional field');
});

test('stage 3a did not touch the archive views or the saved-dream readers', () => {
  for (const f of ['src/archive/DreamDetail.tsx', 'src/archive/archiveData.ts', 'src/archive/DreamArchive.tsx', 'src/hero/dreamRemoteStorage.ts', 'server/routes/patternReflection.ts']) {
    assert.doesNotMatch(read(f), /exploration|openJourney/i, f);
  }
});

// ------------------------------------------------------------------------------------------------ 4. resuming never makes a picture or spends a credit

test('the journey data, the encrypted store and the map adapter never call analysis, image generation, credits or any server', () => {
  for (const f of ['src/hero/exploration.ts', 'src/hero/momentExcerpt.ts', 'src/hero/openJourneyStore.ts', 'src/map/fromExploration.ts']) {
    assert.doesNotMatch(
      code(f),
      /\bfetch\(|paidFetch|\/api\/|analyzeDream|dream-analysis|generateDreamImage|dreamImage|dream-image|dream_credits|credit_ledger|start_user_attempt|reserve_|supabase/i,
      f,
    );
  }
});

test('a resumed journey carries what it needs so nothing is redone: the same attempt (no new analysis, so no credit) and the stored picture (no new image)', () => {
  const store = read('src/hero/openJourneyStore.ts');
  assert.match(store, /attemptId: string;/, 'the snapshot keeps the attempt the credit was spent on');
  assert.match(store, /if \(!live && image === undefined\) return 'needs-image';/, 'a new record never starts without the picture');
  assert.match(store, /image: Blob \| null;/, 'the picture comes back from the store');
});

// ------------------------------------------------------------------------------------------------ 3. the prototype demo stays out of the regular app

test('the prototype and its demo are reachable only from the development page, never from the app', () => {
  const importersOfMap = sourceFiles('src/').filter((f) => !f.startsWith('src/map/') && /from ['"][./]*map\//.test(read(f)));
  assert.deepEqual(importersOfMap, [], 'no app file imports src/map');
  assert.doesNotMatch(read('src/main.tsx') + read('src/App.tsx'), /src\/map|\.\/map\/|prototype/i);
  assert.match(read('dream-map-prototype.html'), /src\/map\/prototypeMain\.tsx/);
  assert.doesNotMatch(read('vite.config.ts'), /dream-map|rollupOptions|input:/, 'the build has one entry: index.html');
});

test('in the regular app the store is only ever CLEARED (sign-out, account deletion): no journey is written before stage 3c', () => {
  const users = sourceFiles('src/').filter((f) => f !== 'src/hero/openJourneyStore.ts' && /openJourneyStore/.test(read(f)));
  assert.deepEqual(users.sort(), ['src/auth/AuthContext.tsx', 'src/auth/deleteAccount.ts', 'src/map/DreamMapPrototype.tsx']);
  for (const f of ['src/auth/AuthContext.tsx', 'src/auth/deleteAccount.ts']) {
    assert.match(read(f), /import \{ clearAllOpenJourneys \} from '\.\.\/hero\/openJourneyStore';/, f);
    assert.doesNotMatch(code(f), /getOpenJourneyStore|\.save\(|\.load\(/, f);
  }
});
