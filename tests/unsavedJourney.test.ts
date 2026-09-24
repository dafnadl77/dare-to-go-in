import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hasUnsavedDream, decideLeave, createLeaveGate, handleBeforeUnload } from '../src/hero/unsavedJourney.ts';
import { createJourneyEpoch } from '../src/hero/journeyEpoch.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// ------------------------------------------------------ what is unsaved ----

test('no warning when there is no meaningful unsaved dream (nothing analyzed yet)', () => {
  assert.equal(hasUnsavedDream({ analysisOk: false, insideStep: 'prompt' }), false);
  assert.equal(hasUnsavedDream({ analysisOk: false, insideStep: 'reflection' }), false);
});

test('an analyzed, unsaved dream IS protected, and normal Dream Stage progression never changes that', () => {
  for (const step of ['prompt', 'choices', 'selected', 'reflecting', 'interpreting', 'reflection', 'closing', 'saving']) {
    assert.equal(hasUnsavedDream({ analysisOk: true, insideStep: step }), true, step);
  }
});

test('after a successful save, or once the dreamer deliberately lets it go, protection is removed', () => {
  for (const step of ['saved', 'letting-go', 'gone']) {
    assert.equal(hasUnsavedDream({ analysisOk: true, insideStep: step }), false, step);
  }
});

// ------------------------------------------------------- the leave gate ----

function scenario(unsaved: boolean) {
  const epoch = createJourneyEpoch();
  const log: string[] = [];
  const gate = createLeaveGate(() => {
    epoch.invalidate();
    log.push('discard');
  });
  return { epoch, log, gate, unsaved, go: (name: string) => () => log.push(`navigate:${name}`) };
}

test('nothing unsaved: navigation just happens, with no confirmation', () => {
  const s = scenario(false);
  assert.equal(decideLeave(false), 'proceed');
  assert.equal(s.gate.request(s.go('my-dreams'), false), 'ran');
  assert.deepEqual(s.log, ['navigate:my-dreams']);
  assert.equal(s.gate.hasPending(), false);
});

test('unsaved dream: navigation is held for confirmation, and nothing happens yet', () => {
  const s = scenario(true);
  assert.equal(decideLeave(true), 'confirm');
  assert.equal(s.gate.request(s.go('packages'), true), 'needs-confirmation');
  assert.deepEqual(s.log, []);
  assert.equal(s.gate.hasPending(), true);
});

test('Cancel/Stay preserves the journey exactly: no discard, no navigation, epoch unchanged', () => {
  const s = scenario(true);
  const before = s.epoch.current();
  s.gate.request(s.go('about'), true);
  s.gate.cancel();
  assert.deepEqual(s.log, []);
  assert.equal(s.epoch.current(), before);
  assert.equal(s.gate.hasPending(), false);
  assert.equal(s.gate.confirm(), false, 'a stale confirm after cancel does nothing');
  assert.deepEqual(s.log, []);
});

test('Confirm discards the journey FIRST (invalidating its epoch), then navigates', () => {
  const s = scenario(true);
  const before = s.epoch.current();
  s.gate.request(s.go('my-dreams'), true);
  assert.equal(s.gate.confirm(), true);
  assert.deepEqual(s.log, ['discard', 'navigate:my-dreams']);
  assert.equal(s.epoch.isCurrent(before), false, 'late responses of the discarded journey are now stale');
  assert.equal(s.gate.hasPending(), false);
});

test('a confirmed navigation runs exactly once (a double confirm cannot navigate twice)', () => {
  const s = scenario(true);
  s.gate.request(s.go('home'), true);
  s.gate.confirm();
  s.gate.confirm();
  assert.deepEqual(s.log.filter((l) => l.startsWith('navigate')), ['navigate:home']);
});

// -------------------------------------------------------- beforeunload ----

test('the beforeunload handler asks the browser to confirm', () => {
  const event = { preventDefault() { this.prevented = true; }, prevented: false, returnValue: undefined as unknown };
  handleBeforeUnload(event);
  assert.equal(event.prevented, true);
  assert.equal(event.returnValue, '');
});

const app = read('src/App.tsx');
const hero = read('src/hero/HeroDream.tsx');

test('beforeunload is attached ONLY while a dream is unsaved, and removed as soon as it is not', () => {
  const effect = app.slice(app.indexOf('if (!unsavedDream) return;'), app.indexOf('if (!unsavedDream) return;') + 220);
  assert.match(effect, /window\.addEventListener\('beforeunload', handleBeforeUnload\)/);
  assert.match(effect, /return \(\) => window\.removeEventListener\('beforeunload', handleBeforeUnload\)/);
  assert.match(effect, /\[unsavedDream\]/);
});

test('every in-app navigation that would destroy the journey goes through the confirmation gate', () => {
  const header = app.slice(app.indexOf('<GlobalHeader'), app.indexOf('/>', app.indexOf('<GlobalHeader')));
  assert.match(header, /onHome=\{\(\) => requestLeave\(goHome\)\}/);
  assert.match(header, /onMyDreams=\{\(\) => requestLeave\(handleMyDreamsNav\)\}/);
  assert.match(header, /onPackages=\{\(\) => requestLeave\(\(\) => setView\('pricing'\)\)\}/);
  assert.match(header, /onAbout=\{\(\) => requestLeave\(\(\) => setView\('about'\)\)\}/);
  // confirm = discard via the journey's own home handler, then navigate; Stay only cancels
  assert.match(app, /createLeaveGate\(\(\) => heroHomeHandlerRef\.current\?\.\(\)\)/);
  assert.match(app, /onStay=\{\(\) => \{\s*leaveGate\.cancel\(\);/);
  assert.match(app, /onLeave=\{\(\) => \{\s*leaveGate\.confirm\(\);/);
});

test('HeroDream reports the unsaved state (and clears it on unmount); saved or let-go removes protection', () => {
  assert.match(hero, /hasUnsavedDream\(\{ analysisOk: analysisResult\?\.status === 'ok', insideStep \}\)/);
  assert.match(hero, /onUnsavedDreamChange\(unsavedDream\)/);
  assert.match(hero, /useEffect\(\(\) => \(\) => onUnsavedDreamChange\(false\), \[onUnsavedDreamChange\]\)/);
  assert.match(app, /onUnsavedDreamChange=\{setUnsavedDream\}/);
});

test('the leave dialog is a real, localized, DARE-styled alert dialog with Stay as the default focus', () => {
  const dialog = read('src/ui/LeaveDreamDialog.tsx');
  assert.match(dialog, /role="alertdialog"/);
  assert.match(dialog, /stayRef\.current\?\.focus\(\)/);
  assert.match(dialog, /dd-dialog-backdrop/);
  assert.ok(!/\bconfirm\(/.test(dialog));
  const tr = read('src/i18n/translations.ts');
  for (const k of ['title', 'body', 'stay', 'leave']) assert.ok(tr.includes(`leaveDream: {`) && tr.split(`    ${k}:`).length - 1 >= 3);
});
