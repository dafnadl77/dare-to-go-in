import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attributionNote, questionTakesForGranted, unreportedAttribution } from '../src/hero/attribution.ts';
import * as V from '../src/hero/verifiedFallback.ts';
import { wordsOfHerSummary } from '../src/hero/conversationTurn.ts';

/**
 * THE CLOSING CHECK before the AI package (her three cases, 2026-11-08). Test dreams only, no network, no AI.
 *   1. A possibility may not invent an event ("אולי פחדת כי אבא שלך כעס"); a creative reading of the dream's own details stays.
 *   2. A question kept from an answer that was set aside: only when it takes nothing for granted; else a neutral one about the moment.
 *   3. No fallback line says as hers what she did not tell: every verified word comes from the dream or from her.
 */

const book = {
  herWords: ['תנועת הדפים הזכירה לי את הסרט קארי', 'זה היה גם מפחיד וגם קצת מרשים', 'לקבל שלוש משאלות זה חלום ילדות שלי, ואף פעם לא החלטתי מה לבקש'],
  sourceText: 'על השולחן היה ספר פתוח, והדפים זזו מעצמם. אחר כך נכנס מכשף ואמר שאני יכולה לבקש שלוש משאלות. התעוררתי לפני שביקשתי.',
  language: 'he' as const,
};
const en = { herWords: ['I just kept walking. I felt calm.', 'Small and cold.'], sourceText: 'I was walking through an airport with no people in it. I found a small brass key.', language: 'en' as const };

test('1. "אולי" does not let a possibility invent an event, a person, a past or a motive of hers', () => {
  for (const s of [
    'אולי פחדת כי אבא שלך כעס.',
    'אולי פחדת כי אביך כעס עלייך.',
    'ייתכן שזה מזכיר רגע שבו מישהו כעס עלייך.',
    'אולי פחדת כי מישהו צעק עלייך.',
    'אולי זה קשור לפעם שבה הלכת לאיבוד.',
    'נראה שפעם קרה לך משהו דומה.',
    'אולי הרגשת כך כי נפגעת בעבר.',
    'אולי זה מזכיר משהו שקרה כשהיית ילדה.',
  ]) {
    assert.ok(unreportedAttribution(s, book), `invented, though worded as a possibility: ${s}`);
    assert.ok(attributionNote([s], book), `and it asks for the fresh answer: ${s}`);
  }
  for (const s of ['Maybe you were scared because your father was angry.', 'Perhaps someone shouted at you once.', 'Maybe something like this happened to you before.'])
    assert.ok(unreportedAttribution(s, en), s);
});

test('1. a creative possibility that rests on the dream\'s own details stays, and so does what she told', () => {
  for (const s of [
    'אולי הדפים שזזו מעצמם הם תמונה של משהו שקורה בלי שליטה.',
    'ייתכן שהמכשף מגלם אפשרות שנפתחת פתאום.',
    'אולי התנועה של הדפים מעוררת גם פחד וגם סקרנות.',
    'אולי ההתעוררות לפני הבקשה משאירה את האפשרויות פתוחות.',
    'אפשר לראות בשלוש המשאלות דימוי של בחירה שעוד מחכה.',
  ]) {
    assert.equal(unreportedAttribution(s, book), null, `a reading of the dream stays: ${s}`);
    assert.equal(attributionNote([s], book), null, `and needs no fresh answer: ${s}`);
  }
  assert.equal(unreportedAttribution('Maybe the unreadable name matters more than the city itself.', en), null);
  const told = { ...book, herWords: [...book.herWords, 'אבא שלי תמיד כעס כשפחדתי'] };
  assert.equal(unreportedAttribution('אולי פחדת כי אבא שלך כעס.', told), null, 'what she told is hers to be reminded of');
  const lost = { ...book, herWords: ['פעם הלכתי לאיבוד בשוק'] };
  assert.equal(unreportedAttribution('אולי זה קשור לפעם שבה הלכת לאיבוד.', lost), null);
});

test('2. a backup question is kept only when it takes nothing for granted that she never told', () => {
  for (const q of [
    'מה הרגשת כשאבא שלך כעס?',
    'איך הרגשת כשלא ויתרת?',
    'מה קרה כשמישהו צעק עלייך?',
    'למה כעסת על המכשף?',
    'כשהיית עצובה, מה עשית?',
    'אולי פחדת כי אבא שלך כעס?',
    'מה הצעתי לך קודם?',
  ]) assert.ok(questionTakesForGranted(q, book), `not kept: ${q}`);
  for (const q of [
    'מה עלה בך כשהדפים זזו?',
    'מה עוד זכור לך מהמכשף?',
    'מה קרה לך שם בחלום?',
    'מה היה מפחיד ומה מרשים בתנועה של הדפים?',
    'האם יש בזה משהו מוכר לך, אם בכלל?',
    'מה היית מבקשת היום, אם בכלל?',
  ]) assert.equal(questionTakesForGranted(q, book), null, `kept: ${q}`);
  assert.ok(questionTakesForGranted('What did you feel when your father was angry?', en));
  assert.equal(questionTakesForGranted('What was the key like in your hand?', en), null);
});

test('2. the turn from verified parts: the answer\'s own question when clean, else a neutral one about the moment', () => {
  const clean = V.verifiedTurnText({ herLast: 'זה היה מפחיד', questions: ['מה היה מפחיד שם?'], label: 'הדפים זזים מעצמם', language: 'he' });
  assert.equal(clean, 'אמרת: «זה היה מפחיד». מה היה מפחיד שם?');
  const neutral = V.verifiedTurnText({ herLast: 'זה היה מפחיד', questions: [], label: 'הדפים זזים מעצמם', language: 'he' });
  assert.equal(neutral, 'אמרת: «זה היה מפחיד». מה עוד זכור לך מהרגע «הדפים זזים מעצמם»?');
  assert.equal(questionTakesForGranted(V.momentQuestion('הדפים זזים מעצמם', 'he'), book), null, 'the neutral question takes nothing for granted');
  assert.equal(questionTakesForGranted(V.dreamQuestion('he'), book), null);
  assert.equal(questionTakesForGranted(V.momentQuestion('The key', 'en'), en), null);
});

/** What is left of a fallback line once its fixed frame is taken out: must be words of hers or of the dream. */
const frameless = (t: string) =>
  t.replace(/^(?:אמרת:|בחלום:|You said:|In the dream:)\s*/u, '').split(/\s*·\s*/).map((x) => x.replace(/^[«“]|[»”]\.?$/gu, '').replace(/…$/u, '').trim()).filter(Boolean);
const fromHerOrDream = (t: string, ctx: { herWords: readonly string[]; sourceText: string }, extra: readonly string[] = []) =>
  frameless(t).every((piece) => [...ctx.herWords, ctx.sourceText, ...extra].some((w) => w.includes(piece)));

test('3. every fallback field of the reflection: nothing said as hers that she did not tell, every verified word from the dream or from her', () => {
  const bad = 'לא ויתרת, כי אבא שלך כעס.';
  const r = {
    observation: bad,
    personalAssociation: bad,
    possibleThread: bad,
    continuityQuestion: 'מה הרגשת כשאבא שלך כעס?',
    lenses: { cognitive: bad, jungian: bad, psychodynamic: bad },
    summary: bad,
    emotionReflection: bad,
    alternativeReadings: [{ basis: 'הדפים', reading: bad }],
    existentialLens: { basis: 'המכשף', text: bad },
  };
  const herAnswers = ['זה היה גם מפחיד וגם קצת מרשים', 'לקבל שלוש משאלות זה חלום ילדות שלי, ואף פעם לא החלטתי מה לבקש'];
  const { value, replaced } = V.verifiedReflection(r, book, { sourceText: book.sourceText, herAnswers });
  assert.equal(replaced.length, 11, 'every field that said it was set aside');
  assert.ok(fromHerOrDream(value.observation, book), `observation: ${value.observation}`);
  assert.ok(fromHerOrDream(value.personalAssociation, book), `association: ${value.personalAssociation}`);
  assert.equal(value.possibleThread, V.thinThreadLine('he'));
  assert.equal(value.continuityQuestion, V.dreamQuestion('he'));
  assert.equal(value.summary, null);
  assert.equal(value.emotionReflection, null);
  assert.deepEqual(value.lenses, { cognitive: null, jungian: null, psychodynamic: null });
  assert.deepEqual(value.alternativeReadings, []);
  assert.equal(value.existentialLens, null);
  const shown = [value.observation, value.personalAssociation, value.possibleThread, value.continuityQuestion];
  assert.equal(V.stillUnverified(shown, book), false, 'nothing unverified is left');
  for (const t of shown) assert.equal(unreportedAttribution(t, book, true), null, `read strictly too: ${t}`);
  // no answers of hers and no dream text: the gentle lines, never a conclusion
  const empty = V.verifiedReflection(r, book, { sourceText: '', herAnswers: [] }).value;
  assert.equal(empty.observation, V.thinThreadLine('he'));
  assert.equal(empty.personalAssociation, V.thinThreadLine('he'));
});

test('3. the conversation\'s fallbacks: her words, the dream\'s moment names and fixed gentle lines only', () => {
  const herLast = 'זה היה גם מפחיד וגם קצת מרשים';
  const turn = V.verifiedTurnText({ herLast, questions: [], label: 'הדפים זזים מעצמם', language: 'he' });
  assert.ok(fromHerOrDream(turn.split('. ')[0] + '.', book), turn);
  const closing = V.verifiedClosingText(herLast, 'תודה על מה ששיתפת ברגע הזה.', 'he');
  assert.equal(closing, `אמרת: «${herLast}». תודה על מה ששיתפת ברגע הזה.`);
  const view = wordsOfHerSummary([{ label: 'הדפים זזים מעצמם', turns: [{ role: 'dare', text: 'מה עלה בך?' }, { role: 'dreamer', text: herLast }] }] as never, 'he') ?? '';
  assert.equal(view, `מה שעלה בשיחה, במילים שלך:\n\n«הדפים זזים מעצמם»: «${herLast}»`, 'the moment\'s name and her words, nothing of DARE');
  for (const line of [V.thinWholeViewLine('he'), V.thinThreadLine('he'), V.thinWholeViewLine('en'), V.thinThreadLine('en'), V.dreamQuestion('he'), closing, turn]) {
    assert.equal(unreportedAttribution(line, book, true), null, `attributes nothing: ${line}`);
    assert.doesNotMatch(line, /תרצי|תרצה|אתה|(?<![א-ת])את\s|עצובה|כעסת|פחדת/, `reads the same for every dreamer and names no feeling: ${line}`);
  }
});
