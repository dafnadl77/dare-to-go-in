import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as C from '../src/hero/conversationTurn.ts';
import { asksHer } from '../src/hero/exploration.ts';
import { findAddressViolation } from '../src/hero/languageIntegrity.ts';
import { unreportedAttribution, withoutWorkContent, worksSheNamed } from '../src/hero/attribution.ts';
import { finalizeReflectionExtras } from '../src/hero/dreamReflectionSchema.ts';

/**
 * The focused conversation fixes of 2026-11-07, on the current version (V3b was not adopted). Every sentence used here comes from the saved
 * test runs (test dreams only); the attribution check was also run on all 346 saved sentences: 14 found, read one by one.
 * Since 2026-11-08 (her decision) what the attribution check finds only asks the model once for a fresh answer: no sentence, no summary is
 * removed for a word, and the last answer is shown as it is.
 */

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const dare = (text: string, offer?: string) => ({ role: 'dare' as const, text, ...(offer ? { offer } : {}) });
const she = (text: string) => ({ role: 'dreamer' as const, text });

test('a sentence that only mentions describing is not a question', () => {
  assert.equal(asksHer('בחרת לתאר את הגשם כ"רועש".'), false, 'the turn that passed with no question');
  assert.equal(asksHer('בחרת לשתף את זה.'), false);
  for (const ask of ['תוכלי לתאר את הצליל.', 'אפשר לתאר מה ראית.', 'תארי לי את החדר.', 'ספרי לי עוד.', 'אשמח לשמוע.', 'מה עלה לך שם?']) assert.equal(asksHer(ask), true, ask);
});

test('the address, also in future forms', () => {
  const v = (t: string, p: 'neutral' | 'feminine' | 'masculine') => findAddressViolation([t], 'he', p);
  assert.ok(v('אם תרצה, אפשר להסתכל על הרגע הזה.', 'neutral'), 'masculine to a neutral account');
  assert.ok(v('אם תבחר להמשיך, נמשיך.', 'neutral'));
  assert.ok(v('אם תרצי, אפשר לחזור לעץ.', 'neutral'), 'feminine to a neutral account');
  assert.ok(v('אם תרצה, אפשר לחזור.', 'feminine'));
  assert.equal(v('אם תרצי, אפשר לחזור.', 'feminine'), null);
  assert.equal(v('אם תרצה, אפשר לחזור.', 'masculine'), null);
  assert.ok(v('אם תרצי, אפשר לחזור.', 'masculine'));
  assert.equal(v('אם היא תרצה לחזור, הדלת פתוחה.', 'neutral'), null, 'a third person is not the dreamer');
  assert.equal(v('אמרת «אם תרצה, תבוא».', 'neutral'), null, 'her own quote');
  assert.equal(v('אפשר להמשיך מכאן, או להסתכל על המטרייה.', 'neutral'), null);
  assert.equal(findAddressViolation(['If you want, we can go on.'], 'en', 'neutral'), null);
});

const store = { herWords: ['ברגים, ולא המידה הנכונה', 'המשכתי לחפש'], sourceText: 'אני בחנות כלי עבודה ישנה, מחפש בורג מסוים למדף שאני בונה בבית.', language: 'he' as const };
test('what she did not tell is not said as hers', () => {
  for (const s of ['לא ויתרת ישר, פשוט המשכת לחפש בתוך הקופסה שהוא הביא.', 'המשכת לחפש בין הברגים, למרות שידעת שאין שם את המידה הנכונה.', 'והמשכת לחפש שוב ושוב, בלי לוותר, גם כשלא מצאת.'])
    assert.ok(unreportedAttribution(s, store), s);
  const umbrella = { herWords: ['היא הייתה שם', 'השארתי אותה'], sourceText: 'ירד גשם על הגג. בחדר הייתה מטרייה שחורה סגורה, ולא פתחתי אותה.', language: 'he' as const };
  assert.ok(unreportedAttribution('המטרייה נשארה סגורה בחדר, לא נגעת בה בכלל.', umbrella));
  assert.ok(unreportedAttribution('The strangeness stood out to you, but you didn’t feel uneasy.', { herWords: ['I just kept walking. I felt calm.', 'Not really. It was just strange.'], sourceText: 'I was walking through an airport with no people in it.', language: 'en' }));
});

test('what she did tell, what the dream says, and every possibility stay', () => {
  const balcony = { herWords: ['שום דבר. פשוט לא רציתי'], sourceText: 'השמיים היו ורודים, ולא רציתי לזוז משם.', language: 'he' as const };
  assert.equal(unreportedAttribution('במרפסת עצמה, שום דבר לא עצר אותך — פשוט לא רצית לזוז.', balcony), null, 'the dream says it');
  const umbrella = { herWords: ['השארתי אותה'], sourceText: 'בחדר הייתה מטרייה שחורה סגורה, ולא פתחתי אותה.', language: 'he' as const };
  assert.equal(unreportedAttribution('לא פתחת אותה, היא נשארה סגורה.', umbrella), null);
  const book = { herWords: ['לא, התעוררתי לפני'], sourceText: 'אחר כך נכנס מכשף ואמר שאני יכולה לבקש שלוש משאלות.', language: 'he' as const, answeredNo: ['ובחלום, הספקת לבקש משהו?'] };
  assert.equal(unreportedAttribution('גם בחלום לא הספקת לבקש, כי התעוררת לפני.', book), null, 'her no to the question');
  assert.equal(unreportedAttribution('אולי לא ויתרת כי החיפוש עצמו היה חשוב.', store), null, 'a possibility');
  assert.equal(unreportedAttribution('לא ויתרת?', store), null, 'a question');
  assert.equal(unreportedAttribution('במרפסת של דירה לא מוכרת, מישהו ניגן בפסנתר.', balcony), null, 'a thing, not her');
  assert.equal(unreportedAttribution('הריח של עוגה ואווירה בלי לחץ.', balcony), null, 'a noun after "בלי"');
  assert.equal(unreportedAttribution('זה בסדר, לא צריך לדעת.', balcony), null, 'an infinitive is no act of hers');
  assert.equal(unreportedAttribution('You did not know what it opened, but you kept it in your hand.', { herWords: ['No.', 'I kept it in my hand.'], sourceText: 'I found a small brass key.', language: 'en', answeredNo: ['Did you know what it opened?'] }), null);
});

test('a work she named is hers to tell', () => {
  const works = worksSheNamed(['תנועת הדפים הזכירה לי את הסרט קארי']);
  assert.deepEqual(works, ['קארי']);
  assert.equal(withoutWorkContent("הזכרת את הסרט 'קארי', שבו קורים דברים מוזרים שנראים כאילו יש להם כוח משלהם.", works), "הזכרת את הסרט 'קארי'.");
  assert.equal(withoutWorkContent("מה בסרט 'קארי' עלה לך?", works), null, 'asking about it is right');
});

test('nothing is removed for a word (her decision, 2026-11-08): the check asks for a fresh answer and never cuts the text', async () => {
  const { attributionNote } = await import('../src/hero/attribution.ts');
  const claim = 'לא ויתרת ישר, פשוט המשכת לחפש בתוך הקופסה שהוא הביא. מה משך אותך להמשיך?';
  const out = C.checkTurn({ reply: claim, offer: '', anchors: [], facts: [], move: 'ask' }, { sourceText: store.sourceText, labels: ['המוכר עם הקופסה'], herWords: store.herWords, language: 'he' });
  assert.equal(out.reply, claim, 'the whole turn stays');
  assert.equal(out.dropped.length, 0);
  assert.match(attributionNote([claim], store) ?? '', /never told \("לא ויתרת"\)/, 'what asks for the fresh answer');
  const filmHer = ['תנועת הדפים הזכירה לי את הסרט קארי'];
  const filmText = "הזכרת את הסרט 'קארי', שבו קורים דברים מוזרים. מה בסרט הזה עלה לך מול הדפים?";
  const film = C.checkTurn({ reply: filmText, offer: '', anchors: [], facts: [], move: 'ask' }, { sourceText: 'על השולחן היה ספר פתוח.', labels: ['הדפים זזים מעצמם'], herWords: filmHer, language: 'he' });
  assert.equal(film.reply, filmText, 'the sentence about the film is not cut');
  assert.match(attributionNote([filmText], { herWords: filmHer, sourceText: '', language: 'he' }) ?? '', /described what happens in a work the dreamer named/);
  assert.equal(attributionNote(["מה בסרט 'קארי' עלה לך מול הדפים?"], { herWords: filmHer, sourceText: '', language: 'he' }), null, 'asking about it needs nothing');
  const src = read('src/hero/conversationTurn.ts');
  assert.doesNotMatch(src, /unreportedAttribution|dareFirstPerson|withoutWorkContent/, 'the turn check does not use the word checks at all');
});

test('a short real answer is an answer; "I do not know" stays hesitation; both ask exactly one question', () => {
  const sig = (text: string) => C.turnSignals({ turns: [dare('ומה עשית כשלא מצאת?'), she(text)], momentText: 'x' });
  assert.equal(sig('המשכתי לחפש').shortAnswer, true);
  assert.equal(sig('המשכתי לחפש').shortOrUnsure, false);
  assert.equal(sig('לא יודע').shortOrUnsure, true);
  const input = (text: string) => C.buildTurnInput({ sourceText: 'x', moments: [], moment: { label: 'm', text: 'x' }, earlier: [], turns: [dare('א?'), she(text)], signals: sig(text), request: 'reply', asked: 2 });
  assert.match(input('המשכתי לחפש'), /SHORT BUT REAL.*EXACTLY ONE QUESTION/);
  assert.match(input('לא יודע'), /IS UNSURE.*EXACTLY ONE EASY/);
  assert.doesNotMatch(input('לא יודע'), /AT MOST ONE/);
  const film = C.turnSignals({ turns: [dare('מה עלה בך?'), she('תנועת הדפים הזכירה לי את הסרט קארי')], momentText: 'x' });
  assert.deepEqual(film.brought, ['association', 'reference']);
});

test('the instructions: three short lines, on the current text', () => {
  const p = C.buildTurnSystemPrompt('he', 'neutral' as never);
  assert.match(p, /HER OWN WORDS ONLY\. Describe what she did and felt only with what she said/);
  assert.match(p, /A new idea of yours is welcome when it rests on the dream or her words and is worded as a possibility she can turn down/);
  assert.match(p, /never describe its plot or content/);
  assert.match(p, /When she said little, the whole view is short and stays with her words/);
  assert.doesNotMatch(p, /CURIOSITY BEFORE MEANING|THREE THINGS, ALWAYS KEPT APART/, 'nothing of V3b');
});

test('a whole view that cannot be shown: her own words, moment by moment, and nothing else', () => {
  const moments = [
    { label: 'גשם על הגג', turns: [dare('איך נשמע הגשם?'), she('רועש'), dare('איפה היית?'), she('בפנים')] },
    { label: 'המטרייה הסגורה', turns: [dare('מה משך אותך?'), { role: 'dreamer' as const, text: '', rejection: true }, she('השארתי אותה')] },
    { label: 'רגע שלא נפתח', turns: [] },
  ];
  assert.equal(C.wordsOfHerSummary(moments as never, 'he'), 'מה שעלה בשיחה, במילים שלך:\n\n«גשם על הגג»: «רועש» · «בפנים»\n\n«המטרייה הסגורה»: «השארתי אותה»');
  assert.equal(C.wordsOfHerSummary([{ label: 'x', turns: [dare('?')] }] as never, 'he'), null);
  const route = read('server/routes/dreamExploration.ts');
  const log = /console\.warn\(`\[conversation-summary\][^`]*`\)/.exec(route)?.[0] ?? '';
  assert.ok(log, 'the reason is logged');
  assert.doesNotMatch(log, /herSummary|checked\.|sourceText|text/, 'never a word of the dream, hers or DARE’s');
  assert.match(route, /const plainLine = p\.kind === 'summary' \? herSummary \?\? \(unverified \? thinWholeViewLine\(ctx\.language\) : fallbackSummaryLine\(ctx\.language\)\)/);
  assert.match(route, /if \(unsafe && p\.kind === 'summary'\) return \{ status: 'unsafe' as const \};/, 'a view held back for safety stays held back');
});

test('a brief dream: at most one lens and no existential angle', () => {
  const base = { observation: 'o', personalAssociation: 'p', possibleThread: 'אולי', continuityQuestion: 'q?', confidenceNotes: '', emotionReflection: null, summary: 's', existentialFit: 'clear', existentialLens: { basis: 'המתנה', text: 'שאלה של המתנה' }, alternativeReadings: [], lenses: { cognitive: 'א', jungian: 'ב', psychodynamic: 'ג' } };
  const brief = finalizeReflectionExtras(base as never, 'brief', ['המתנה בתחנה']);
  assert.deepEqual(Object.values(brief.lenses).filter(Boolean), ['א']);
  assert.equal(brief.existentialLens, null);
  const rich = finalizeReflectionExtras(base as never, 'rich', ['המתנה בתחנה']);
  assert.equal(Object.values(rich.lenses).filter(Boolean).length, 3);
});

test('a possibility may read the dream anew, but may not invent a person, a past, a place of her life or a motive', async () => {
  const { inventedLifeDetail } = await import('../src/hero/attribution.ts');
  const bus = { herWords: ['חושך', 'לא', 'נשארתי שם', 'חיכיתי עוד'], sourceText: 'עמדתי בתחנת אוטובוס בלילה. האוטובוס הגיע, עבר על פניי ולא עצר.', language: 'he' as const };
  for (const s of ['אולי זה קשור לאמא שלך, שגם היא חיכתה.', 'ייתכן שזה מזכיר משהו שקרה כשהיית ילדה.', 'אולי חיכית כי פחדת לעזוב.', 'נראה שזה קשור למה שקורה בעבודה.', 'Maybe this is about your mother.', 'Perhaps you waited because you were afraid.'])
    assert.ok(unreportedAttribution(s, { ...bus, language: /[a-z]/i.test(s) ? 'en' : 'he' }), s);
  for (const s of ['אולי האוטובוס שלא עצר הוא תמונה של משהו שחולף.', 'ייתכן שהחושך בתחנה נותן לרגע הזה שקט מיוחד.', 'אולי ההמתנה עצמה היא העיקר כאן.', 'Maybe the unreadable name matters more than the city itself.'])
    assert.equal(unreportedAttribution(s, { ...bus, language: /[a-z]/i.test(s) ? 'en' : 'he' }), null, `a reading of the dream stays: ${s}`);
  const balcony = { herWords: ['הרגשתי במקום אינטימי ומיוחד, כמו בדירה של סבתא שלי כשהייתי קטן'], sourceText: 'ישבתי על מרפסת.', language: 'he' as const };
  assert.equal(inventedLifeDetail('אולי זה כמו בדירה של סבתא שלך כשהיית קטן.', balcony), null, 'what she told');
  assert.equal(inventedLifeDetail('האם זה מזכיר לך את אמא שלך?', bus), null, 'a question states nothing');
});

test("DARE's own first person asks once for a fresh answer, and the text is never cut", async () => {
  const { dareFirstPerson, attributionNote } = await import('../src/hero/attribution.ts');
  assert.equal(dareFirstPerson('העליתי אפשרות שקשורה לשליטה, אבל בשבילך עיקר העניין היה הפחד.', []), 'העליתי');
  assert.equal(dareFirstPerson('הצעתי שאולי יש כאן עניין של שליטה.', []), 'הצעתי');
  assert.equal(dareFirstPerson('I suggested it might be about control.', []), 'I suggested');
  assert.equal(dareFirstPerson('אמרת «שאלתי את המוכר».', []), null, 'her quote');
  assert.equal(dareFirstPerson('עלתה אפשרות שקשורה לשליטה.', []), null);
  const out = C.checkTurn(
    { reply: 'העליתי אפשרות שקשורה לשליטה. במכשף עלה חלום הילדות שלך.', offer: '', anchors: [], facts: [], move: 'summarize' },
    { sourceText: 'נכנס מכשף.', labels: ['המכשף'], herWords: ['לקבל שלוש משאלות זה חלום ילדות שלי'], language: 'he' },
  );
  assert.equal(out.reply, 'העליתי אפשרות שקשורה לשליטה. במכשף עלה חלום הילדות שלך.', 'kept whole: only the fresh answer may change it');
  const note = attributionNote(['הצעתי שאולי יש כאן שליטה.', 'לא ויתרת ישר.'], store);
  assert.match(note ?? '', /never told \("לא ויתרת"\)/);
  assert.match(note ?? '', /first person \("הצעתי"\)/);
  assert.equal(attributionNote(['אולי החיפוש עצמו היה העיקר.'], store), null);
});

test('the reflection: the same check asks for a fresh answer, and the summary is never removed for a word', () => {
  const route = read('server/routes/dreamReflection.ts');
  assert.match(route, /attributionNote\(proseOf\(result\), attributionContextOf\(p\)\)/);
  assert.match(route, /herWords: \[p\.dreamerText, \.\.\.\(p\.herAnswers \?\? \[\]\)\]/, 'her answers on the map are her words too');
  assert.match(route, /const verified = verifiedReflection\(outcome\.value,[^\n]*\n[^\n]*\n\s*const validated = finalizeDeliveredReflection\(verified\.value,/, 'the verified fields go on to the existing checks and moderation');
  assert.doesNotMatch(route, /unreportedAttribution|dareFirstPerson/, 'no word check removes the summary');
  assert.match(route, /maxQualityRetries: 1,\s*\},/, 'one fresh answer, and the last one is accepted (no rejectExhaustedQuality here)');
  assert.match(read('src/hero/dreamReflectionSchema.ts'), /NOTHING TO FILL A FIELD: when the material is thin/);
});

test('when the one fix fails, the reflection: only a field that still does not rest on her words is set aside, whole, for verified words', async () => {
  const { verifiedReflection, verifiedClosingText, thinWholeViewLine, herWordsLine } = await import('../src/hero/verifiedFallback.ts');
  const ctx = { herWords: ['עמדתי בתחנת אוטובוס בלילה. האוטובוס הגיע, עבר על פניי ולא עצר.', 'חושך', 'לא', 'נשארתי שם', 'חיכיתי עוד'], sourceText: '', language: 'he' as const };
  const r = {
    observation: 'האוטובוס עבר על פנייך ולא עצר, ונשארת בתחנה.',
    personalAssociation: 'אמרת שהיה חושך, ולא ויתרת גם כשהאוטובוס עבר.',
    possibleThread: 'ידעת שהוא לא יעצור, ובכל זאת חיכית.',
    continuityQuestion: 'יש רגעים שבהם את מחכה למשהו, אם בכלל?',
    lenses: { cognitive: 'אולי ההמתנה עצמה היא העיקר.', jungian: 'חיכית כי פחדת לעזוב.', psychodynamic: null },
    summary: 'עמדת בתחנה בלילה וחיכית עוד.',
    emotionReflection: null,
    alternativeReadings: [{ basis: 'חיכיתי עוד', reading: 'אפשר לראות בזה סבלנות.' }, { basis: 'חושך', reading: 'לא ויתרת על התקווה.' }],
    existentialLens: null,
  };
  const { value, replaced } = verifiedReflection(r, ctx, { sourceText: 'עמדתי בתחנת אוטובוס בלילה. האוטובוס הגיע, עבר על פניי ולא עצר.', herAnswers: ['חיכיתי עוד', 'לא זוכרת'] });
  assert.equal(value.observation, r.observation, 'what rests on her words is not touched');
  assert.equal(value.summary, r.summary);
  assert.equal(value.lenses.cognitive, r.lenses.cognitive, 'a possibility stays: depth and ideas are kept');
  assert.equal(value.continuityQuestion, r.continuityQuestion);
  assert.equal(value.personalAssociation, 'אמרת: «חיכיתי עוד» · «לא זוכרת».', 'her own answers, nothing added');
  assert.match(value.possibleThread, /עדיין לא מספיק כדי להצביע על חוט מקשר/, 'said gently, never a conclusion');
  assert.equal(value.lenses.jungian, null, 'an invented motive is not shown');
  assert.deepEqual(value.alternativeReadings, [r.alternativeReadings[0]]);
  assert.deepEqual(replaced, ['personalAssociation', 'possibleThread', 'lens:jungian', 'alternativeReadings'], 'only field names, for the log');
  const clean = verifiedReflection({ ...r, personalAssociation: 'אמרת שחיכית עוד.', possibleThread: 'אולי ההמתנה היא העיקר.', lenses: { cognitive: null, jungian: null, psychodynamic: null }, alternativeReadings: [] }, ctx, { sourceText: '', herAnswers: [] });
  assert.deepEqual(clean.replaced, [], 'a clean reflection is never touched');
  const obs = verifiedReflection({ ...r, observation: 'לא ויתרת על האוטובוס.' }, ctx, { sourceText: 'עמדתי בתחנת אוטובוס בלילה. האוטובוס הגיע.', herAnswers: [] });
  assert.equal(obs.value.observation, 'בחלום: «עמדתי בתחנת אוטובוס בלילה».');
  assert.equal(verifiedClosingText('חיכיתי עוד', 'תודה על מה ששיתפת ברגע הזה.', 'he'), 'אמרת: «חיכיתי עוד». תודה על מה ששיתפת ברגע הזה.');
  assert.equal(verifiedClosingText('', 'תודה.', 'he'), 'תודה.');
  assert.equal(herWordsLine('x'.repeat(300), 'he')?.length, 'אמרת: «».'.length + 160, 'a long answer is shortened');
  assert.doesNotMatch(thinWholeViewLine('he') + herWordsLine('a', 'he'), /תרצי|תרצה|אתה|את\s/, 'reads the same for every dreamer');
});
