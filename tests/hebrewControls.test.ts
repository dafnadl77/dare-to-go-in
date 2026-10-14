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
  assert.match(he, /Address the dreamer in the singular, gender-neutral way/);
  assert.doesNotMatch(he, /use the plural voice that the whole product uses/);
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

test('neutral Hebrew address: one instruction, in the singular, with forms that read the same for a man and a woman (no plural voice, no contradicting nominal-only rule)', () => {
  const he = buildDreamReflectionSystemPrompt('he', 'neutral');
  assert.match(he, /Address the dreamer in the SINGULAR, in a way that reads the same for a man and a woman/);
  assert.match(he, /past tense of the second person/);
  assert.doesNotMatch(he, /prefer a nominalized or impersonal construction/, 'the older shared rule that pushed noun chains is not part of the dream reflection prompt any more');
  assert.doesNotMatch(he, /use the plural voice/);
  const example = he.slice(he.indexOf('{"observation"'), he.indexOf('\n', he.indexOf('{"observation"')));
  assert.doesNotMatch(example, /אתם|שלכם|בחרתם|אתה|אמרתם/, 'the neutral example speaks in neither the plural nor the masculine');
  assert.match(example, /בחרת לציין/);
});

test('each preference gets an example in its own grammar (a feminine reader is no longer shown a masculine example)', () => {
  const grab = (p: 'feminine' | 'masculine' | 'neutral') => {
    const prompt = buildDreamReflectionSystemPrompt('he', p);
    return prompt.slice(prompt.indexOf('{"observation"'), prompt.indexOf('\n', prompt.indexOf('{"observation"')));
  };
  assert.doesNotMatch(grab('feminine'), /אתה/);
  assert.match(grab('feminine'), /שאת מתקרבת/);
  assert.match(grab('masculine'), /שאתה מתקרב/);
});

test('the Hebrew style guidance keeps the dreamer\'s own actions and keeps every reading a possibility', () => {
  const he = buildDreamReflectionSystemPrompt('he', 'neutral');
  assert.match(he, /never change the verb of what the dreamer did/);
  assert.match(he, /הלכת לאיבוד/);
  assert.match(he, /never present a psychological explanation as a fact/);
  assert.doesNotMatch(buildDreamReflectionSystemPrompt('en', 'neutral'), /HEBREW STYLE|הלכת לאיבוד/);
});

test('the retry notes after a masculine "אתה" no longer ask for the plural voice', () => {
  const neutral = findAddressViolation(['אתה ציינת פחד'], 'he', 'neutral');
  const feminine = findAddressViolation(['אתה ציינת פחד'], 'he', 'feminine');
  assert.ok(neutral && /singular/.test(neutral) && !/אתם/.test(neutral));
  assert.ok(feminine && !/אתם/.test(feminine));
});
