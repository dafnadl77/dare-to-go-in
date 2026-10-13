import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { collectStrings, findAddressViolation, findScriptIntrusion } from '../src/hero/languageIntegrity.ts';
import { buildDreamReflectionSystemPrompt, diagnosticWordingNote } from '../src/hero/dreamReflectionSchema.ts';
import { mentionsUnlistedFeeling } from '../src/hero/dreamEmotions.ts';
import { runWithLanguageIntegrity } from '../server/languageGuard.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('strict mode catches a capitalised untranslated word inside Hebrew; the default does not; acronyms and the dreamer\'s own words pass', () => {
  const text = ['הדלת מזכירה Warmth של הבית'];
  assert.equal(findScriptIntrusion(text, 'he', ''), null, 'the default keeps allowing capitalised names/brands');
  const strict = findScriptIntrusion(text, 'he', '', { strictLatin: true });
  assert.ok(strict && strict.scripts.includes('Latin words'));
  assert.equal(findScriptIntrusion(['מדבר על AI ו-DARE'], 'he', '', { strictLatin: true }), null);
  assert.equal(findScriptIntrusion(['הלכתי עם Netflix בערב'], 'he', 'ראיתי Netflix כל הערב', { strictLatin: true }), null);
  assert.equal(findScriptIntrusion(['A calm sea'], 'en', '', { strictLatin: true }), null, 'English output is never affected');
});

test('a Hebrew reflection addressing a non-masculine dreamer with "אתה" is flagged; quotes, "את" the object marker and masculine choosers are not', () => {
  assert.ok(findAddressViolation(['אתה ציינת חוסר אונים'], 'he', 'neutral'));
  assert.ok(findAddressViolation(['אתה ציינת חוסר אונים'], 'he', 'feminine'));
  assert.equal(findAddressViolation(['אתה ציינת חוסר אונים'], 'he', 'masculine'), null);
  assert.equal(findAddressViolation(['הם פתחו את הדלת ואת הבית'], 'he', 'neutral'), null);
  assert.equal(findAddressViolation(['אמרתם: "אתה לא מבין"'], 'he', 'neutral'), null, 'the dreamer\'s own quoted words are theirs');
  assert.equal(findAddressViolation(['אתה'], 'en', 'neutral'), null);
  assert.equal(findAddressViolation(['אתם בחרתם לציין פחד'], 'he', 'neutral'), null, 'the plural product voice is fine');
});

test('the guard regenerates with the check\'s own note and never edits the text', async () => {
  const notes: string[] = [];
  const produced = ['אתה ציינת פחד', 'בחרתם לציין פחד'];
  let n = 0;
  const outcome = await runWithLanguageIntegrity(
    async (note) => {
      notes.push(note);
      return { text: produced[n++] };
    },
    (value) => [value.text],
    {
      route: 'test',
      language: 'he',
      context: '',
      strictLatin: true,
      extraCheck: (value) => findAddressViolation([value.text], 'he', 'neutral'),
    },
  );
  assert.equal(outcome.status, 'ok');
  assert.equal(outcome.status === 'ok' && outcome.value.text, 'בחרתם לציין פחד');
  assert.equal(notes.length, 2);
  assert.equal(notes[0], '');
  assert.match(notes[1], /אתה/);
});

test('without an extra check the guard behaves exactly as before (one attempt when the text is clean)', async () => {
  let calls = 0;
  const outcome = await runWithLanguageIntegrity(async () => (calls += 1, { text: 'בחלום הלכתם' }), (v) => [v.text], { route: 'test', language: 'he', context: '' });
  assert.equal(outcome.status, 'ok');
  assert.equal(calls, 1);
});

test('the Hebrew style guidance is only in the Hebrew prompt, follows the address preference, and its example is pure Hebrew', () => {
  const he = buildDreamReflectionSystemPrompt('he', 'neutral');
  const en = buildDreamReflectionSystemPrompt('en', 'neutral');
  assert.match(he, /HEBREW STYLE \(Hebrew output only\)/);
  assert.doesNotMatch(en, /HEBREW STYLE/);
  assert.match(he, /use the plural voice that the whole product uses/);
  const feminine = buildDreamReflectionSystemPrompt('he', 'feminine');
  assert.match(feminine, /Address the dreamer in the singular/);
  assert.doesNotMatch(feminine, /use the plural voice that the whole product uses/);
  const start = he.indexOf('{"observation"');
  const exampleJson = he.slice(start, he.indexOf('\n\n', start));
  assert.ok(exampleJson.startsWith('{"observation"') && exampleJson.endsWith('}'));
  assert.doesNotMatch(exampleJson.replace(/"(observation|personalAssociation|emotionReflection|possibleThread|continuityQuestion|summary)"/g, ''), /[A-Za-z]{3,}/);
  assert.match(he, /never an English word written in Hebrew letters|no English word written in Hebrew letters/);
});

test('diagnostic wording in the thread or the question asks for a regeneration; plain possibilities do not', () => {
  assert.ok(diagnosticWordingNote({ possibleThread: 'צחוק הילדים עשוי להעיד על תחושות חברתיות', continuityQuestion: 'מה?' }));
  assert.ok(diagnosticWordingNote({ possibleThread: 'ok', continuityQuestion: 'Are you coping with inner conflict?' }));
  assert.equal(diagnosticWordingNote({ possibleThread: 'אולי יש כאן קרבה למשהו מוכר', continuityQuestion: 'האם יש משהו שאתם מתקרבים אליו?' }), null);
});

test('a feelings text naming a feeling the dreamer did not name is detected (the caller drops it)', () => {
  assert.equal(mentionsUnlistedFeeling('בית ישן, זכרונות ושמחה שבחרתם לציין', ['calm', 'longing', 'fear'], 'he'), true);
  assert.equal(mentionsUnlistedFeeling('שלווה, געגוע ופחד שבחרתם לציין', ['calm', 'longing', 'fear'], 'he'), false);
  assert.equal(mentionsUnlistedFeeling('A door tied to fear and joy you named', ['fear'], 'en'), true);
  assert.equal(mentionsUnlistedFeeling('A door tied to fear you named', ['fear'], 'en'), false);
  assert.equal(mentionsUnlistedFeeling(null, ['fear'], 'en'), false);
});

test('the route wires the strict checks into its one generation and drops texts that name an unlisted feeling', () => {
  const route = read('server/routes/dreamReflection.ts');
  assert.match(route, /strictLatin: true/);
  assert.match(route, /findAddressViolation\(collectStrings\(\{ \.\.\.result, groundingStatement: '' \}\), language, addressPreference\) \?\? diagnosticWordingNote\(result\)/);
  assert.match(route, /mentionsUnlistedFeeling\(validated\.emotionReflection, emotions, language\)\) validated\.emotionReflection = null/);
  assert.match(route, /mentionsUnlistedFeeling\(validated\.summary, emotions, language\)\) validated\.summary = null/);
  assert.equal((route.match(/responses\.create\(/g) ?? []).length, 1, 'still exactly one model call per attempt site');
  assert.ok(collectStrings({ a: ['x', { b: 'y' }] }).length === 2);
});
