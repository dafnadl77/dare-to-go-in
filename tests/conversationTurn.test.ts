import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from '../src/hero/conversationTurn';
import { CONVERSATIONS, summaryOf, type ConversationScript } from '../src/map/conversationScript';

/**
 * THE CONVERSATION ENGINE (doc 101, principles doc 102, approved 2026-10-24), step 2: one call per turn writes a whole, natural reply;
 * the code checks only that what is quoted or rested on is really there, and that an offer has an anchor. Written BEFORE the engine
 * (docs/upgrade-2026-10/103-conversation-tests-before.txt). No model, no network.
 */

const T_ = T as unknown as Record<string, any>;
const herWordsOf = (c: ConversationScript) => c.moments.flatMap((m) => m.turns.flatMap((t) => (t.kind === 'dreamer' ? [t.text] : [])));
const ctxOf = (c: ConversationScript) => ({ sourceText: c.dreamText, labels: c.moments.map((m) => m.label), herWords: herWordsOf(c), language: 'he' as const });
const store = CONVERSATIONS.find((c) => c.key === 'store')!;
const hall = CONVERSATIONS.find((c) => c.key === 'hall')!;
const raw = (reply: string, extra: Partial<T.TurnRaw> = {}): T.TurnRaw => ({ reply, offer: '', anchors: [], facts: [], move: 'reflect', ...extra });

// ------------------------------------------------------------------------------------------------ what the model is asked for

test('the turn schema: one reply, an optional offer with its anchors, the facts it rests on, and the move it chose', () => {
  const s = T_.TURN_JSON_SCHEMA;
  assert.ok(s, 'TURN_JSON_SCHEMA');
  // "mine", "ideas" and "open": the summary's "מה לקחתי מהחלום" (docs 117, 120); empty in every other turn
  assert.deepEqual([...s.required].sort(), ['anchors', 'facts', 'ideas', 'mine', 'move', 'offer', 'open', 'reply']);
  assert.deepEqual(s.properties.move.enum, ['reflect', 'ask', 'offer', 'deepen', 'summarize']);
  for (const k of ['anchors', 'facts']) assert.deepEqual(s.properties[k].items.properties.from.enum, ['dream', 'her']);
});

test('the prompt carries her principles (doc 102), and no dream that is tested', () => {
  const p = T_.buildTurnSystemPrompt('he', 'feminine') as string;
  for (const must of ['הבנתי, אלה שני דברים שונים בשבילך', 'את צודקת', 'fixed meaning', 'never presume a cause', 'at most ONE question', 'Not every turn', 'not a questionnaire', 'waking life', 'sensitive'])
    assert.ok(p.includes(must), `the prompt lacks: ${must}`);
  for (const d of JSON.parse(readFileSync('docs/upgrade-2026-10/74-acceptance-dreams-2.json', 'utf8')) as { text: string }[])
    for (const piece of d.text.split(/[,.]/).map((x) => x.trim()).filter((x) => x.split(' ').length >= 4)) assert.ok(!p.includes(piece), `a tested dream is in the prompt: ${piece}`);
});

// ------------------------------------------------------------------------------------------------ the checks

test('every DARE turn of the three conversations passes unchanged: nothing she approved is blocked', () => {
  for (const c of CONVERSATIONS) {
    const raws = [...c.moments.flatMap((m) => m.turns.flatMap((t) => (t.kind === 'dare' ? [t.raw] : []))), summaryOf(c, c.moments.map((m) => m.label))];
    for (const raw of raws) {
      const out = T.checkTurn(raw, ctxOf(c));
      assert.deepEqual(out.dropped, [], `${c.key}: ${raw.reply.slice(0, 40)}`);
      assert.equal(out.reply, raw.reply.trim());
      assert.equal(out.offer, raw.offer.trim());
    }
  }
});

test('any order: each moment\'s conversation, and its line in "what came up", rest only on the dream and that moment\'s own words', () => {
  for (const c of CONVERSATIONS)
    for (const m of c.moments) {
      const own = { sourceText: c.dreamText, labels: c.moments.map((x) => x.label), herWords: m.turns.flatMap((t) => (t.kind === 'dreamer' ? [t.text] : [])), language: 'he' as const };
      for (const raw of [...m.turns.flatMap((t) => (t.kind === 'dare' ? [t.raw] : [])), summaryOf(c, [m.label])]) {
        const out = T.checkTurn(raw, own);
        assert.deepEqual(out.dropped, [], `${c.key} «${m.label}»: ${raw.reply.slice(0, 40)}`);
      }
      assert.equal(m.turns[0]?.kind, 'dare', `${c.key} «${m.label}» opens with DARE`);
    }
});

test('a quote in «…» is shown in the words that were really said: "יצאת…" becomes the dream\'s "אני יוצא…"', () => {
  const out = T.checkTurn(raw('ובחלום: «יצאת מהחנות בלי כלום ביד». מה עבר לך בראש?'), ctxOf(store));
  assert.match(out.reply, /«אני יוצא מהחנות בלי כלום ביד»/);
  assert.equal(out.fixed.length, 1);
});

test('a quote cut right after its negation says the opposite, and is not shown ("…ולא מוצא את המידה הנכונה")', () => {
  const out = T.checkTurn(raw('חיפשת, ובסוף «מוצא את המידה הנכונה». איך זה היה?'), ctxOf(store));
  assert.doesNotMatch(out.reply, /המידה הנכונה/);
});

test('a quote that was never said is not shown: its sentence goes, the rest stays', () => {
  const out = T.checkTurn(raw('אמרת «הרגשתי פחד גדול מהמוכר». ויצאת בלי כלום ביד.'), ctxOf(store));
  assert.doesNotMatch(out.reply, /פחד/);
  assert.match(out.reply, /ויצאת בלי כלום ביד/);
  assert.equal(out.dropped.length, 1);
});

test('a "fact" that is not in the dream is not shown — the slip of doc 101 ("המוכר מרים אליך מבט": it is he who lifts his head)', () => {
  const out = T.checkTurn(raw('המוכר מרים אליך מבט, והוא כבר עץ זית קטן. איך הוא נראה לך?', { facts: [{ quote: 'המוכר מרים אליך מבט', from: 'dream' }], move: 'ask' }), ctxOf(store));
  assert.doesNotMatch(out.reply, /מרים אליך מבט/);
  assert.ok(out.dropped.some((d) => /not in the dream or her words/.test(d)), out.dropped.join(' | '));
});

test('an offer with no anchor that exists is not shown; the reply stays', () => {
  const out = T.checkTurn(raw('כבר ידעת מה אתה צריך.', { offer: 'אולי המוכר הוא אביך. זה מתאים לך?', anchors: [{ quote: 'המוכר הוא אבא שלי', from: 'dream' }], move: 'offer' }), ctxOf(store));
  assert.equal(out.offer, '');
  assert.equal(out.reply, 'כבר ידעת מה אתה צריך.');
  assert.ok(out.dropped.some((d) => /offer.*anchor/.test(d)), out.dropped.join(' | '));
});

test('the real offer of the hall (the lamp) rests on two details of the dream, and is shown', () => {
  const step = hall.moments.flatMap((m) => m.turns).find((t) => t.kind === 'dare' && t.raw.offer.includes('מנורה'))!;
  const out = T.checkTurn((step as { raw: T.TurnRaw }).raw, ctxOf(hall));
  assert.match(out.offer, /מנורה קטנה כחולה/);
});

test('when nothing is left, a plain line that invents nothing (no paid retry)', () => {
  const out = T.checkTurn(raw('אמרת «משהו שלא נאמר בכלל כאן».'), ctxOf(store));
  assert.equal(out.reply, T.fallbackReply('he'));
  assert.doesNotMatch(out.reply, /[«»]/);
});

// ------------------------------------------------------------------------------------------------ the four signals

test('the four signals the code gives the model: a rejected offer, a short or unsure answer, a sensitive moment, her own question', () => {
  const d = (text: string, extra: Partial<T.ConversationTurn> = {}): T.ConversationTurn => ({ role: 'dare', text, ...extra });
  const h = (text: string): T.ConversationTurn => ({ role: 'dreamer', text });
  const base = { momentText: 'אני יוצא מהחנות בלי כלום ביד' };
  assert.deepEqual(T.turnSignals({ ...base, turns: [d('x'), h('הבנתי שאני מחפש משהו, אבל בעצם ידעתי כבר מה אני צריך.')] }), { rejectedOffer: false, shortOrUnsure: false, sensitive: false, sheAsked: false, meaningDoubt: false, rejectedNow: false, connected: false, steer: null, severalExchanges: false });
  assert.equal(T.turnSignals({ ...base, turns: [d('x', { offer: 'אולי…', rejected: true }), h('לא ממש.')] }).rejectedOffer, true);
  assert.equal(T.turnSignals({ ...base, turns: [d('x'), h('לא יודעת.')] }).shortOrUnsure, true);
  assert.equal(T.turnSignals({ ...base, turns: [d('x'), h('השאלה.')] }).shortOrUnsure, true);
  assert.equal(T.turnSignals({ momentText: 'אבא שלי שכב בבית החולים', turns: [d('x'), h('זה היה קשה לראות אותו ככה.')] }).sensitive, true);
  assert.equal(T.turnSignals({ ...base, turns: [d('x'), h('אף אחד מהם לא היה מה שהייתי צריך באמת.')] }).sensitive, false, '"באמת" is not "מת"');
  assert.equal(T.turnSignals({ ...base, turns: [d('x'), h('מה זה אומר, שיצאתי בלי כלום?')] }).sheAsked, true);
});

test('the input tells the model the signals, the conversation so far, and what is asked now (open / reply / summary)', () => {
  const input = T.buildTurnInput({
    sourceText: store.dreamText,
    moments: store.moments.map((m) => ({ label: m.label, explored: m.label === 'המוכר לתוך העץ' })),
    moment: { label: 'יוצא מהחנות ריק', text: 'אני יוצא מהחנות בלי כלום ביד' },
    earlier: [{ label: 'המוכר לתוך העץ', turns: [{ role: 'dare', text: 'איך הוא נראה לך?' }, { role: 'dreamer', text: 'פשוט וקליל.' }] }],
    turns: [{ role: 'dare', text: 'מה עבר לך בראש שם?' }, { role: 'dreamer', text: 'לא ממש.' }],
    signals: { rejectedOffer: true, shortOrUnsure: true, sensitive: false, sheAsked: false },
    request: 'reply',
  });
  for (const must of ['REJECTED', 'SHORT OR UNSURE', 'פשוט וקליל', 'מה עבר לך בראש שם?', 'REPLY']) assert.ok(input.includes(must), `the input lacks: ${must}`);
});
