import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  attributedFeelingNote,
  descriptionVersusInterpretationNote,
  garbledTextNote,
  isGenericQuestion,
  linkAddsSomethingNew,
  symbolWordingNote,
  unsupportedInsertionNote,
} from '../src/hero/reflectionChecks.ts';
import { runWithLanguageIntegrity } from '../server/languageGuard.ts';
import { sanitizeDreamQuestions } from '../src/hero/dreamQuestionsSchema.ts';

const DREAM = 'עליתי למעלה וגיליתי חדר שלא הכרתי, ובו מים עד הקרסוליים ומנורה דולקת. מישהו קרא לי בשמי מלמטה, אבל לא ידעתי אם לרדת.';

// ---- things the dreamer never said ----------------------------------------------------------------------------------

test('wording that adds a circumstance, a motive or a feeling the dreamer never gave is flagged; the same wording is fine when the dream or the dreamer used it', () => {
  const alone = ['עלית למעלה לבד ומצאת חדר חדש.'];
  assert.match(unsupportedInsertionNote(alone, [DREAM], 'he') ?? '', /"לבד"/);
  assert.equal(unsupportedInsertionNote(alone, [DREAM + ' הייתי לבד בבית.'], 'he'), null, 'the dream says it');
  assert.equal(unsupportedInsertionNote(['בלבד מלבד זה, עלית למעלה.'], [DREAM], 'he'), null, '"בלבד" and "מלבד" are not "לבד"');
  assert.match(unsupportedInsertionNote(['רצית לרדת אבל התביישת.'], [DREAM], 'he') ?? '', /"רצית"/);
  assert.equal(unsupportedInsertionNote(['פחדת מהקול.'], [DREAM + ' פחדתי מאוד.'], 'he'), null, 'the first-person form in the dream supports the second-person one');
  assert.match(unsupportedInsertionNote(['פחדת מהקול.'], [DREAM], 'he') ?? '', /"פחדת"/);
  assert.equal(unsupportedInsertionNote(['אמרת: "עליתי לבד"'], [DREAM], 'he'), null, 'a quotation of the dreamer is not checked');
  assert.match(unsupportedInsertionNote(['You went up alone and suddenly saw a room.'], ['I went up and found a room.'], 'en') ?? '', /"alone"/);
  assert.equal(unsupportedInsertionNote(['You went up and found a room.'], ['I went up and found a room.'], 'en'), null);
});

test('"symbolizes" and "represents" are caught in the claims, not inside a quotation', () => {
  assert.match(symbolWordingNote(['המים מסמלים רגש עמוק.'], 'he') ?? '', /fixed meaning/);
  assert.match(symbolWordingNote(['המנורה מייצגת תקווה.'], 'he') ?? '', /fixed meaning/);
  assert.equal(symbolWordingNote(['אפשר לשאול מה עולה כשחושבים על המים.'], 'he'), null);
  assert.equal(symbolWordingNote(['כתבת: "המים מסמלים משהו"'], 'he'), null);
  assert.ok(symbolWordingNote(['The lantern symbolizes hope.'], 'en'));
  assert.equal(symbolWordingNote(['The lantern had no flame.'], 'en'), null);
});

test('the observation only describes and the thread is always offered as a possibility', () => {
  assert.equal(descriptionVersusInterpretationNote({ observation: 'עלית למעלה וגילית חדר עם מים עד הקרסוליים.', possibleThread: 'ייתכן שהחדר הלא מוכר פוגש געגוע.' }, 'he'), null);
  assert.match(descriptionVersusInterpretationNote({ observation: 'נראה שהחדר משקף חיפוש.', possibleThread: 'ייתכן שיש כאן געגוע.' }, 'he') ?? '', /observation interprets/);
  assert.match(descriptionVersusInterpretationNote({ observation: 'עלית למעלה.', possibleThread: 'החלום מראה געגוע לילדות.' }, 'he') ?? '', /stated as a fact/);
  assert.equal(descriptionVersusInterpretationNote({ observation: 'You went up and found a room.', possibleThread: 'One possible thread is a longing for home.' }, 'en'), null);
  assert.ok(descriptionVersusInterpretationNote({ observation: 'Perhaps you went up.', possibleThread: 'One possible thread is x.' }, 'en'));
});

test('garbled text (vowel points, a repeated word, a letter of another script inside a word) is caught', () => {
  assert.ok(garbledTextNote(['הדימוי מַעֵרֵב תקווה']));
  assert.ok(garbledTextNote(['המפתח המפתח קטן מדי']));
  assert.ok(garbledTextNote(['זה מרגיש כמו תMischung בין שניים']));
  assert.equal(garbledTextNote(['המפתח היה קטן מדי לדלת הסגורה.']), null);
});

test('a feeling nobody named is flagged in the main lines, unless the dreamer named it or the dream says it', () => {
  assert.ok(attributedFeelingNote(['הפחד שלך מהקול מתחבר לחדר.'], ['longing'], [DREAM], 'he'));
  assert.equal(attributedFeelingNote(['הפחד שלך מהקול מתחבר לחדר.'], ['fear'], [DREAM], 'he'), null, 'named by the dreamer');
  assert.equal(attributedFeelingNote(['הפחד שלך מהקול מתחבר לחדר.'], [], [DREAM + ' הרגשתי פחד.'], 'he'), null, 'the dreamer used the word');
  assert.equal(attributedFeelingNote(['הגעגוע שציינת מתחבר לחדר.'], ['longing'], [DREAM], 'he'), null);
});

// ---- questions that are not generic, and a link question that adds something -------------------------------------------------

test('a question that could be about any dream is generic; naming the moment plus one more detail of this dream is not', () => {
  assert.equal(isGenericQuestion('מה עולה כשחושבים על המנורה עכשיו?', 'המנורה הדולקת', DREAM), true);
  assert.equal(isGenericQuestion('מה עולה כשחושבים על המנורה הדולקת בחדר שלא הכרת?', 'המנורה הדולקת', DREAM), false);
  assert.equal(isGenericQuestion('מה עולה כשחושבים על הים הכחול בחדר שלא הכרת?', 'המנורה הדולקת', DREAM), true, 'it does not touch the moment');
});

test('a link question that only repeats the association question is dropped; one that opens a different detail stays', () => {
  const association = 'מה עולה כשחושבים על החדר שלא הכרת, עם מים עד הקרסוליים?';
  assert.equal(linkAddsSomethingNew('יש קשר בין החדר שלא הכרת לבין המים עד הקרסוליים?', association, 'חדר לא מוכר', DREAM), false);
  assert.equal(linkAddsSomethingNew('יש קשר בין החדר שלא הכרת לבין זה שמישהו קרא בשמך מלמטה?', association, 'חדר לא מוכר', DREAM), true);
});

test('sanitizing questions drops the generic, the repeated and the invented ones and keeps the specific ones', () => {
  const moments = ['חדר לא מוכר', 'מישהו קרא בשמי'];
  const kept = sanitizeDreamQuestions(
    {
      associationQuestions: ['מה עולה כשחושבים על החדר שלא הכרת, עם המים עד הקרסוליים?', 'מה עולה כשחושבים על מישהו עכשיו?'],
      linkQuestions: ['יש קשר בין החדר שלא הכרת לבין זה שמישהו קרא לך בשמך מלמטה?', 'יש קשר בין מישהו שקרא בשמי לבין המים עד הקרסוליים?'],
    },
    moments,
    DREAM,
    'he',
  );
  assert.equal(kept.associationQuestions[0], 'מה עולה כשחושבים על החדר שלא הכרת, עם המים עד הקרסוליים?');
  assert.equal(kept.associationQuestions[1], '', 'generic');
  assert.equal(kept.linkQuestions[0], 'יש קשר בין החדר שלא הכרת לבין זה שמישהו קרא לך בשמך מלמטה?');
  const invented = sanitizeDreamQuestions({ associationQuestions: ['מה עולה כשחושבים על החדר שלא הכרת כשעלית למעלה לבד?'], linkQuestions: [''] }, ['חדר לא מוכר'], DREAM, 'he');
  assert.equal(invented.associationQuestions[0], '', 'adds "alone", which the dream does not say');
});

// ---- the guard: a quality check never turns a usable answer into an error ---------------------------------------------------

test('a quality note asks for a fresh answer at most twice and then accepts the last one; a safety note still fails', async () => {
  let calls = 0;
  const notes: string[] = [];
  const outcome = await runWithLanguageIntegrity(
    async (retryNote) => {
      calls += 1;
      notes.push(retryNote);
      return { text: 'שלום' };
    },
    (v) => [v.text],
    { route: 'test', language: 'he', context: '', qualityCheck: () => '\n\nQUALITY NOTE' },
  );
  assert.equal(outcome.status, 'ok', 'accepted on the last attempt');
  assert.equal(calls, 3);
  assert.deepEqual(notes, ['', '\n\nQUALITY NOTE', '\n\nQUALITY NOTE']);

  let safetyCalls = 0;
  const failed = await runWithLanguageIntegrity(
    async () => {
      safetyCalls += 1;
      return { text: 'שלום' };
    },
    (v) => [v.text],
    { route: 'test', language: 'he', context: '', extraCheck: () => '\n\nSAFETY NOTE', qualityCheck: () => null },
  );
  assert.equal(failed.status, 'language_intrusion');
  assert.equal(safetyCalls, 3);
});

test('feeling states named as nouns that the dreamer never gave are flagged too ("תסכול", "בדידות", "loneliness"), unless the dream or the dreamer said them', () => {
  assert.match(unsupportedInsertionNote(['הרגשות מתחברים לתסכול שמניע לברוח.'], [DREAM], 'he') ?? '', /"תסכול"/);
  assert.match(unsupportedInsertionNote(['אולי יש כאן תחושת בדידות.'], [DREAM], 'he') ?? '', /"בדידות"/);
  assert.equal(unsupportedInsertionNote(['אולי יש כאן תחושת בדידות.'], [DREAM + ' הרגשתי בדידות.'], 'he'), null);
  assert.equal(unsupportedInsertionNote(['המתח בין הרצון להתקדם לבין העצירה.'], [DREAM], 'he'), null, 'an ordinary use of "tension" is not a feeling');
  assert.match(unsupportedInsertionNote(['Perhaps loneliness runs through it.'], ['I was at a station.'], 'en') ?? '', /"loneliness"/);
});

test('the Hebrew questions prompt asks for fully impersonal questions when the dreamer\'s gender is unknown, and not otherwise', async () => {
  const { buildDreamQuestionsSystemPrompt } = await import('../src/hero/dreamQuestionsSchema.ts');
  assert.match(buildDreamQuestionsSystemPrompt('he', 'neutral'), /write EVERY question impersonally and never address the dreamer at all/);
  assert.ok(!buildDreamQuestionsSystemPrompt('he', 'feminine').includes('write EVERY question impersonally'));
  assert.ok(!buildDreamQuestionsSystemPrompt('en', 'neutral').includes('write EVERY question impersonally'));
});

test('the quality retries can be capped: with a cap of one, the second answer is accepted after one fresh request', async () => {
  let calls = 0;
  const outcome = await runWithLanguageIntegrity(
    async () => {
      calls += 1;
      return { text: 'שלום' };
    },
    (v) => [v.text],
    { route: 'test', language: 'he', context: '', qualityCheck: () => '\n\nQUALITY NOTE', maxQualityRetries: 1 },
  );
  assert.equal(outcome.status, 'ok');
  assert.equal(calls, 2);
});

test('"מסמן" (signifies) is caught like "מסמל", and an ordinary use of the word "סימן" is not', () => {
  assert.ok(symbolWordingNote(['הבית שגדל מסמן מרחב פנימי משתנה.'], 'he'));
  assert.equal(symbolWordingNote(['אין סימן שהוא מתקרב.'], 'he'), null);
});
