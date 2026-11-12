import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import * as X from '../src/hero/exploration';
import { savedMapTextsToTranslate, translatedSavedMap } from '../src/map/savedMapTexts';
import { mapFromExploration } from '../src/map/fromExploration';
import { demoInitialRows, translateSample } from '../src/demo/demoRouter';

/**
 * THE SAVED MAP FOLLOWS THE INTERFACE LANGUAGE (her bug, 2026-11-12): on the English interface a dream saved in Hebrew opened its map in
 * Hebrew. The map's own words already followed the interface; its saved content did not. Now it is translated for display only, through
 * the archive's translation mechanism and cache; the saved dream is never changed. Test dreams only; no network, no AI.
 */

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const HEBREW = /[֐-׿]/;
const sample = demoInitialRows(Date.now()).find((r) => String((r as { id: string }).id).endsWith('7')) as { payload: { sourceText: string; exploration: unknown } };
const saved = X.parseExploration(sample.payload.exploration)!;
const source = sample.payload.sourceText;
const glossaryEn = (t: string) => {
  const en = translateSample(t, 'en');
  return en === t ? null : en;
};

test('the sample: a dream saved in Hebrew with two explored moments, their conversations and a whole view', () => {
  assert.ok(saved, 'a valid saved journey');
  assert.deepEqual(Object.keys(saved.explored), ['m1', 'm2']);
  assert.equal(saved.explored.m1.turns?.length, 4);
  assert.ok(saved.wholeView?.overview && saved.wholeView.connections.length === 1);
  assert.match(source, HEBREW);
});

test('on the English interface every Hebrew text of the map is asked for: the dream, moment names, quotes, both sides of every conversation, the whole view', () => {
  const texts = savedMapTextsToTranslate(saved, source, 'en');
  const must = [
    source,
    ...saved.moments.flatMap((m) => [m.label, m.excerpt ?? '']),
    ...Object.values(saved.explored).flatMap((x) => (x.turns ?? []).map((t) => t.text)),
    saved.wholeView!.overview,
    saved.wholeView!.connections[0].title,
    saved.wholeView!.connections[0].basis,
  ].filter(Boolean);
  for (const t of must) assert.ok(texts.includes(t), `asked for: ${t}`);
  assert.equal(new Set(texts).size, texts.length, 'each text once');
  assert.ok(texts.every((t) => HEBREW.test(t)), 'only what is in Hebrew');
});

test('the translated map shows no Hebrew on the English interface, and the saved journey is not changed', () => {
  const before = JSON.stringify(saved);
  const shown = translatedSavedMap(saved, source, 'en', glossaryEn);
  assert.equal(JSON.stringify(saved), before, 'the saved dream is never changed');
  assert.doesNotMatch(shown.sourceText, HEBREW);
  const m = mapFromExploration(shown.exploration, { key: saved.attemptId, language: 'en', date: '2026-11-09', sourceText: shown.sourceText, imageSrc: '' });
  const visible = JSON.stringify({ dream: m.dream, wholeView: m.wholeView, turns: Object.values(shown.exploration.explored).map((x) => x.turns) });
  assert.doesNotMatch(visible, HEBREW, 'not one Hebrew letter reaches the map');
  assert.equal(shown.exploration.attemptId, saved.attemptId, 'the same dream, not a new one');
  assert.equal(shown.exploration.explored.m1.turns?.[1].text, 'Quiet, but also a little height', 'her answer, in English');
});

test('a text whose translation is not there keeps its saved words; the Hebrew interface asks for nothing on a Hebrew dream', () => {
  const partial = translatedSavedMap(saved, source, 'en', () => null);
  assert.equal(JSON.stringify(partial.exploration), JSON.stringify(saved), 'no translation: the saved words, never an empty line');
  assert.deepEqual(savedMapTextsToTranslate(saved, source, 'he'), [], 'no call at all');
  assert.equal(JSON.stringify(translatedSavedMap(saved, source, 'he', () => 'X').exploration), JSON.stringify(saved));
});

test('a dream saved in English on the Hebrew interface: DARE\'s words follow the interface, her own words stay as she wrote them', () => {
  let e = X.createExploration('en-dream', [{ label: 'The key in the pocket', excerpt: 'I found a small brass key' }]);
  e = X.beginConversation(e, 'm1', { role: 'dare', text: 'What was the key like in your hand?', move: 'ask' });
  e = X.addDreamerTurn(e, 'm1', 'Small and cold.');
  const texts = savedMapTextsToTranslate(e, 'I found a small brass key in my coat.', 'he');
  assert.deepEqual(texts, ['The key in the pocket', 'What was the key like in your hand?']);
  assert.equal(savedMapTextsToTranslate(e, 'I found a small brass key in my coat.', 'en').length, 0, 'English on English: nothing');
});

test('the demo stands in for the model with a glossary that covers the whole sample (so the Preview shows the map fully in English)', () => {
  const missing = savedMapTextsToTranslate(saved, source, 'en').filter((t) => glossaryEn(t) === null);
  assert.deepEqual(missing, []);
  assert.equal(demoInitialRows(Date.now()).length, 7);
});

test('wiring: the saved map uses the translation, shows nothing half-translated, and goes through the archive\'s mechanism and cache', () => {
  const page = read('src/map/SavedDreamMap.tsx');
  assert.match(page, /useSavedMapTranslation\(saved, savedSource, language\)/);
  assert.match(page, /if \(state === 'translating'\)/);
  assert.match(page, /mapFromExploration\(exploration, \{ key: exploration\.attemptId, language, date, sourceText, imageSrc \}\)/);
  const hook = read('src/map/savedMapTranslation.ts');
  assert.match(hook, /import \{ translateTexts \} from '\.\.\/archive\/dreamTranslationEngine';/, 'the same /api/dream-translation route: the extras key and its limits');
  assert.match(hook, /import \{ cacheMapText, getCachedMapText \} from '\.\.\/archive\/dreamTitleTranslation';/, 'the same tab cache: a language switch asks nothing twice');
  assert.match(hook, /const inFlight = new Map/, 'one request at a time for the same texts');
  assert.match(hook, /refusedUntil/, 'a refusal is not repeated at once');
  assert.match(read('src/archive/dreamTitleTranslation.ts'), /export function getCachedMapText\(text: string, language: AppLanguage\)/);
  assert.match(read('src/archive/DreamDetail.tsx'), /language=\{language === 'he' \? 'he' : 'en'\}/, 'the map is given the interface language');
  const route = read('server/routes/dreamTranslation.ts');
  assert.match(route, /openai: getExtrasOpenAIClient/, 'translation runs on the extras client');
  assert.match(route, /checkDuplicateTranslation[\s\S]*checkExtrasAllowance/, 'and its limits are kept');
});

register('data:text/javascript,' + encodeURIComponent(`export async function load(url, context, next) { if (url.endsWith('.css')) return { format: 'module', source: '', shortCircuit: true }; return next(url, context); }`));
const React = await import('react');
(globalThis as unknown as { React: typeof React }).React = React;
const { renderToStaticMarkup } = await import('react-dom/server');
const { default: ConversationThread } = await import('../src/map/ConversationThread');

test('drawn: each moment\'s conversation window on the English interface has no Hebrew left', () => {
  const shown = translatedSavedMap(saved, source, 'en', glossaryEn).exploration;
  for (const moment of shown.moments) {
    const html = renderToStaticMarkup(
      React.createElement(ConversationThread, {
        title: moment.label, excerpt: moment.excerpt, turns: shown.explored[moment.id]?.turns ?? [], address: 'feminine', language: 'en', pending: false, draft: '',
        onDraft: () => {}, onSend: () => {}, onReject: () => {}, onMoveOn: () => {}, explored: true, titleId: `t-${moment.id}`,
      } as never),
    );
    assert.doesNotMatch(html.replace(/<[^>]+>/g, ' '), HEBREW, `moment ${moment.id}`);
  }
});
