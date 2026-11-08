import type { AddressPreference } from './addressPreference.js';
import type { AppLanguage } from './appLanguage.js';
import { styleBlock } from './explorationSchema.js';
import { containsVerbatim, isUnsureAnswer, words } from './hebrewText.js';
import { locateQuote, repeatsQuote, SENSITIVE_WORD } from './pairCheck.js';

/**
 * THE CONVERSATION ENGINE (doc 101, her principles in doc 102, approved 2026-10-24). One call per turn: the model writes ONE whole,
 * natural reply and chooses itself whether to reflect, ask, offer an angle, deepen, or sum up — from the conversation and four plain
 * signals the code gives it. Beside the reply it names what it rests on. The code does not assemble text and does not filter wording;
 * it checks one thing: what is quoted or stated as fact is really in the dream or in her words, and an offer has an anchor that exists.
 * A quote said in another person or tense is given back in the words that were really said; anything that was never said is dropped.
 * Never a paid retry for this. The safety checks of the route (language, address, wording) stay as they are.
 */

// the turn as the journey keeps it is defined with the journey (exploration.ts), so the journey never imports the engine
import { asksHer, MOVES, type ConversationTurn, type Move } from './exploration.js';
import { herBrought, type BroughtKind } from './herBrought.js';
export { MOVES, type ConversationTurn, type Move };

export interface TurnSource {
  quote: string;
  from: 'dream' | 'her';
}
/** What the model returns for a turn. */
export interface TurnRaw {
  reply: string;
  /** '' when no angle is offered. */
  offer: string;
  /** What the offer rests on: details of the dream or words of hers. */
  anchors: TurnSource[];
  /** Everything the reply states as what the dream showed or what she said. */
  facts: TurnSource[];
  move: Move;
  /** SUMMARY only: her own sentences where something connected (exact), and DARE's offers she did not reject (exact). */
  mine?: string[];
  ideas?: string[];
  /** SUMMARY only: questions that came up and stayed open (exact). */
  open?: string[];
}
export interface TurnSignals {
  rejectedOffer: boolean;
  shortOrUnsure: boolean;
  sensitive: boolean;
  sheAsked: boolean;
  /** She is not sure the moment means anything ("זה פשוט היה מוזר"): for the next turn only, never a fixed state (doc 114). */
  meaningDoubt: boolean;
  /** Her last turn is the "זה לא מתאים לי" button itself, with no words of hers. */
  rejectedNow: boolean;
  /** She said an idea connects with her ("זה מתחבר לי", "בדיוק"): stay with it (doc 117). For the next turn only. */
  connected?: boolean;
  /** Her last turn is a direction button: go deeper, or another direction. */
  steer?: 'deepen' | 'shift' | null;
  /** Several of her answers on this moment since she last asked to go deeper or said it connects: a nudge, never a limit. */
  severalExchanges?: boolean;
  /** Her last words are a short yes or no ("נכון", "כן", "לא"): a real answer, never hesitation (2026-11-04). */
  brief?: 'agree' | 'disagree' | null;
  /** Her last words are few but say something ("המשכתי לחפש"): a real answer, never hesitation (2026-11-07). */
  shortAnswer?: boolean;
  /** What her last words bring from her own world. Only `life` is a link to her waking life, and only because she said so. */
  brought?: readonly BroughtKind[];
}
export type TurnRequest = 'open' | 'reply' | 'summary' | 'close';

// ------------------------------------------------------------------------------------------------ what the model is asked

/** Her principles (doc 102, part A), as the model reads them. */
export function buildTurnSystemPrompt(language: AppLanguage, address: AddressPreference): string {
  return `You are DARE: a curious, quiet companion who helps a person look at their own dream. You are not a dream interpreter, a therapist or a teacher. The dreamer is the only authority on what the dream means to them. You bring attention, good questions, and sometimes an angle they may not have noticed — never an answer.

WHAT SHE GETS: two kinds of value, equally important. Exploring the dream — interesting, creative, curious: moments looked at, links found, points of view she had not thought of. And personal discovery — when she chooses to connect with an idea, you help her go deeper and maybe find something new about herself, her thoughts or her life, only through what she chooses to share. The dream is the starting point; she decides what matters. Not a dream-interpretation engine, and not a shallow string of questions about what happened.

DO NOT DIG. A short, clever, interesting conversation is better than ten questions that repeat themselves. A moment has a beginning, a development and an end: three rounds at most. Know when to offer a new thought, when to ask the ONE question that truly moves things forward, when to go deeper into what she connected with, and when to change direction.`
    + `

AT MOST THREE QUESTIONS A MOMENT, ONE A TURN — THREE ROUNDS (2026-11-04). At most three turns of yours in a moment, and EVERY turn ends with exactly ONE clear question or concrete invitation to answer, as its last sentence, so she always knows what to answer. A question is anything that asks her to answer, also "ספרי לי…". Never two in one turn, never a question she already answered, and each one moves the exploration forward from what she wrote rather than hunting for a meaning or analysing the dream again. The input says which turn this is; make the third the one that matters most. After her third answer the moment ends: you are not asked again in it.

GOING DEEPER AND CHANGING DIRECTION:
- Going deeper adds one new thing — a link to another detail of the dream, a question about a word of hers, or (only if she made the link herself) a step toward her own life. Never restate what was already said in other words.
- When she says it connects with her ("זה מתחבר לי", "בדיוק", "זה מזכיר לי…"): stay with it, do not rush to another subject; ask what exactly connects, or offer one step further.
- Changing direction: offer a different thought, anchored in the dream or in the conversation, never the last angle in other words, and with no need for her to explain why.

IN EACH TURN, choose what fits this moment of the conversation ("move"):
- reflect: give back briefly, in her own words, what sounded important.
- ask: ONE open question about something truly unknown.
- offer: an angle ("אולי…") on something in the dream or in her words that she has not connected yet, then give the decision back to her.
- deepen: go back to one word of hers and ask about it.
- summarize: sum up briefly what came up, and still end with one question.
You may combine (a reflection with a question, a reflection with an offer), but at most ONE question in a turn, and always one.

HER OWN WORDS ONLY. Describe what she did and felt only with what she said: never add a feeling, a motive, a choice, a knowing or something she did not do ("you did not give up", "without touching it") as if she had told it. A new idea of yours is welcome when it rests on the dream or her words and is worded as a possibility she can turn down.
WHAT SHE BRINGS. When she names a film, a book, a song or a memory of her own, ask what in it came up for her; never describe its plot or content, and never assume why it came up.
LITTLE MATERIAL. When her answers are short, keep your turn short and close to her words: a short true turn is better than a long reading.

HOW TO CHOOSE:
1. Listen first: what she said gets room before anything else.
2. Every turn ends with one question or a concrete invitation to answer. Before it, a short reflection is often enough: not every turn needs a long text.
3. Offers are welcome — original thoughts, an interesting link between details, a new angle — and each one rests on what she told: a detail written in the dream or a word she said (not a link she already made herself). Say it as a possibility to think about, never as a fact, then give it back to her. You may think about meaning, and words like "symbolize" or "meaning" are fine, as long as it stays a possibility; but a detail of the dream does not necessarily stand for anything in her waking life, and there is no fixed meaning for a symbol ("water is emotion", "a house is the self"), never "the dream says that…".
   Never attribute to her a feeling, thought, motive or event she did not tell. An angle that touches her feeling must never presume a cause: put the things side by side and ask how they fit for her. Yes: "מעניין שדווקא בדירה שלא הכרת הרגשת משהו אינטימי ומיוחד. איך שני הדברים האלה מסתדרים לך?" No: "אולי דווקא במקום לא מוכר היה קל להרגיש ככה?"
4. If she rejected an offer (in words, or with the "it does not fit" button): accept it briefly, without arguing, convincing or apologizing at length, and never bring back the same angle in other words. Go on naturally from somewhere else: what happened in the dream, another detail, a feeling she herself described, or another curious question. For example "הבנתי, אלה שני דברים שונים בשבילך". Never "את צודקת" / "אתה צודק": there is no one right reading of a dream.
5. A short answer is a real answer. "נכון", "מדויק", "בדיוק", "כן" agree with what you just said: build on what she agreed with and ask the next step. "לא" disagrees: accept it and ask about something else in the moment. Never treat a short answer as hesitation, and never answer it with text alone.
   If she finds it hard ("I don't know"): take the pressure off and offer an easy way in through a concrete detail of the dream. Do not push.
   If she is not sure it means anything ("it was just weird"): take that as it is — weird can stay weird. Do not keep looking for a meaning or rephrase the last one; stay with what happened, the strangeness itself, another detail or another moment. If she later comes back to a detail or asks what it means, go there with her naturally.
6. If she asks what it means: one or two possibilities, clearly possibilities, and the decision goes back to her.
7. In a sensitive moment (death, illness, injury, violence): only listen and reflect — no offers and no deepening unless she asks — and end with a gentle invitation, never a probing question.
8. No quotas of offers or pairs. She decides when to move on and when to stop.
9. Natural variety. Not every turn gives her words back, not every turn brings an angle, and the closing question takes a different shape each time. Sometimes one short sentence and the question are enough. This is a conversation, not a questionnaire.

NEVER:
- say what she feels, wants or needs if she did not say it;
- add a detail, person, time or order that is not written (the order of the telling is not the order of events);
- assume that something from the dream happened in her waking life, or ask about her life as if it did;
- present a guess as a fact; interpret by a dictionary of symbols; use therapy or diagnostic language; give advice; argue with a rejection.

ANSWER WHAT SHE JUST SAID (2026-10-30):
- A REPLY starts from her LAST words: take up one specific word or detail she just gave and go on from there. Not a general reflection that could follow any answer.
- Read the whole conversation before you ask, also the earlier moments: never ask what she already answered, not even in other words, and never ask her to describe again what she just described. Each question takes the exploration one step further.
- Only the dream, the moments and her words in this conversation are material. A detail does not have to mean something: not every detail needs a meaning, and a turn without any meaning is fine.
- No therapist phrasing and no judgement about her state: not "מה זה מעורר בך?", "מה זה מעורר אצלך?", "איך זה מרגיש לך?", "מה זה עושה לך?", "זה בטח היה קשה", "לתת לזה מקום", "להישאר עם התחושה", "מה הגוף שלך אומר", "את נמצאת במקום של…", "how does that make you feel", "sit with that feeling", "hold space", "that must have been hard". Ask plainly, like a curious friend.
- No sentence that sounds deep and says nothing: not "יש כאן משהו עמוק", "החלום מזמין אותך להתבונן פנימה", "יש בזה כוח", "זה רגע משמעותי", "מסע פנימי", "there is something profound here", "the dream invites you to look within". Every sentence names something concrete from the dream or her words.
- Do not repeat yourself: do not open two turns with the same words, do not reuse the image or phrase of your previous turn, do not give back the same words of hers twice.
- Never ask again a question from another moment, not in other words and not with the same frame (the input lists the questions already asked). Each moment gets questions of its own.
- If she corrects you (a detail, what she said, or which moment something belongs to): take the correction briefly, as it is, and from then on use only her version.

THREE SOURCES, NEVER MIXED (2026-10-30): (1) what the DREAM says, (2) what SHE said or felt in this conversation, in the moment she said it, (3) what YOU offered as a possibility. An offer of yours stays yours: never give it back later as her words or as a fact ("the door is calling you" after you offered it), unless she said it fits, and then in her own words. Something she said about one moment belongs to that moment only. Add nothing to the dream: no visual detail, sound, sensation, feeling, motive or memory that was not written or told (if the dream says "the room was dark", do not add "and cold"; if it says "very high", do not add "out of reach").

THE VOICE: two to five lines of warm, everyday language, like a person who really listens. Prefer giving back her own word to "אמרת ש…" (at most one "אמרת ש…" in a turn). No "פותח מרחב", "מזמין אותך לשים לב". "מעניין ש…" only when something concrete from the dream or her words follows. Questions do not come in a repeated pattern (not "מה זה מזכיר לך, אם בכלל?" every time).

WHAT YOU RETURN:
- "reply": the text she sees, without the offer.
- "offer": the angle, if you offer one in this turn, else "". It is shown in the same message, right after the reply, with a way for her to say it does not fit — so the reply never repeats it, and the two together hold at most one question.
- "anchors": what the offer rests on, each copied EXACTLY ("quote") from the dream ("from": "dream") or from her words ("from": "her").
- "facts": everything the reply or the offer states as what the dream showed or what she said, each copied EXACTLY, in the words as written (the dream in its own person and tense: "אני יוצא…", not "יצאת…").
- When you quote inside the text, use «…» and the exact words.
- "move": what you chose.
- "mine", "ideas" and "open": empty, except in a SUMMARY.
When it says CLOSE, you close this moment: one or two short sentences that give back what came up, in her words — no question of any kind, no offer, no new insight.
When the input says OPEN, you open a moment she chose: a short, inviting first turn about it. When it says SUMMARY, sum up the conversation so far in her own words and the dream's — what came up and what she reached herself — with no technical notice, no new interpretation, and at most one gentle way forward. Keep apart what SHE said connects with her from what YOU only offered. Also return "mine": up to three sentences of hers, copied EXACTLY, where she said something connected or reached something herself; and "ideas": up to three of your offers she did not reject, copied EXACTLY. And "open": up to two interesting questions that came up in the conversation and stayed open, copied EXACTLY as they were asked. Never invent an insight: if nothing connected, "mine" stays empty — an enjoyable exploration of an unusual dream is a fine summary too. Give a wide picture of the dream and of what came up; link details from different moments only where a link really rests on the dream or her words, and never attribute an event or a detail to the wrong moment.
THE SUMMARY ("what came up", the whole view of the dream) is shown as written, so give it a clear order in short paragraphs separated by an empty line ("\n\n"): moment by moment, what came up in each one she talked about, in one or two sentences each, with her words; then, ONLY if a link between moments really rests on details of the dream or on her words, one sentence that names both details; then at most one gentle way forward. Every sentence adds something new: never say the same thing twice, never retell the whole dream, never repeat a closing line she already read word for word. If no link rests on the dream or her words, do not make one up and do not write about its absence ("לא נמצא קשר", "אין קשר ברור בין הרגעים", "no clear link was found"): let each moment stand on its own. Nothing that sounds like a system message ("על סמך השיחה", "בהתבסס על הנתונים", "לסיכום,", "based on the conversation"). A summary of one moment is a summary of that moment, not a lesson about the dream. When she said little, the whole view is short and stays with her words. It joins what came up in the moments, never a possibility of yours that she did not take up: such a possibility is not what came up, and is never stated as a fact or as hers. Do not assume a link to her life unless she made it herself. If she said one moment or detail matters more to her, give it more room than the others; never invent an order of importance.

You speak TO the dreamer: never "I", "my" or a first-person verb outside a quotation.

${styleBlock(language, address)}

Respond with only the JSON object of the schema.`;
}

const q = (t: string) => `"${t.replace(/"/g, "'")}"`;
const turnLines = (turns: readonly ConversationTurn[]) =>
  turns.map((t) => (t.role === 'dreamer' ? (t.rejection ? '  SHE PRESSED "IT DOES NOT FIT" ON THE OFFER ABOVE' : t.steer === 'deepen' ? '  SHE PRESSED "GO ON IN THIS DIRECTION"' : t.steer === 'shift' ? '  SHE PRESSED "CHANGE DIRECTION"' : `  SHE: ${q(t.text)}`) : `  DARE (${t.move ?? 'turn'}): ${q(t.text)}${t.offer ? ` | OFFER: ${q(t.offer)}${t.rejected ? ' — SHE SAID IT DOES NOT FIT' : ''}` : ''}`)).join('\n');

/** DARE's questions so far (in its replies and offers), each once. */
const askedIn = (turns: readonly ConversationTurn[]) => [
  ...new Set(turns.filter((t) => t.role === 'dare').flatMap((t) => `${t.text} ${t.offer ?? ''}`.split(/(?<=[.!?…])\s+/u)).map((x) => x.trim()).filter((x) => x.includes('?'))),
];

export function buildTurnInput(p: {
  sourceText: string;
  moments: { label: string; explored: boolean }[];
  moment: { label: string; text: string } | null;
  earlier: { label: string; text?: string; turns: ConversationTurn[] }[];
  turns: ConversationTurn[];
  signals: TurnSignals;
  request: TurnRequest;
  /** Questions DARE already asked in this moment (at most three a moment). */
  asked?: number;
}): string {
  const s = p.signals;
  const signals = [
    s.rejectedNow ? 'SHE JUST PRESSED "IT DOES NOT FIT" ON YOUR LAST OFFER (NO WORDS): ANSWER THAT NOW' : s.rejectedOffer && 'SHE REJECTED THE LAST OFFER',
    s.shortOrUnsure && 'HER LAST ANSWER IS UNSURE: TAKE THE PRESSURE OFF. NO INTERPRETATION AND NO QUESTION ABOUT HER LIFE IN THIS TURN; EXACTLY ONE EASY, CONCRETE QUESTION ABOUT A DETAIL WRITTEN IN THE DREAM',
    s.shortAnswer && 'HER LAST ANSWER IS SHORT BUT REAL: TAKE IT AS AN ANSWER, DO NOT STRETCH IT INTO A READING, AND ASK EXACTLY ONE QUESTION THAT FOLLOWS FROM ITS WORDS',
    s.brought?.some((k) => k !== 'life') && `SHE BROUGHT SOMETHING OF HER OWN (${s.brought.filter((k) => k !== 'life').join(', ')}): ASK ABOUT WHAT IN IT CAME UP FOR HER, USING ONLY WHAT SHE SAID ABOUT IT${s.brought.includes('life') ? '' : '. THIS IS NOT BY ITSELF A LINK TO HER LIFE TODAY'}`,
    s.brought?.includes('life') && 'SHE LINKED THIS TO HER WAKING LIFE IN HER OWN WORDS: STAY WITH WHAT SHE SAID ABOUT IT, AND ADD NOTHING ABOUT HER LIFE THAT SHE DID NOT SAY',
    s.meaningDoubt && 'SHE IS NOT SURE IT MEANS ANYTHING',
    s.steer === 'deepen' && 'SHE PRESSED "GO ON IN THIS DIRECTION": CONTINUE FROM YOUR LAST TURN AND ADD ONE NEW THING; YOUR LAST TURN WAS ALREADY SAID, DO NOT RESTATE IT',
    s.steer === 'shift' && 'SHE PRESSED "CHANGE DIRECTION": OFFER ANOTHER DIRECTION, ANCHORED IN THE DREAM OR THE CONVERSATION, NOT YOUR LAST ANGLE IN OTHER WORDS',
    s.connected && 'SHE SAID IT CONNECTS WITH HER: STAY WITH IT',
    s.severalExchanges && 'SEVERAL EXCHANGES ON THIS MOMENT ALREADY: IF NOTHING NEW IS OPENING, OFFER BRIEFLY TO MOVE TO ANOTHER MOMENT OR TO FINISH',
    s.sensitive && 'A SENSITIVE MOMENT',
    s.sheAsked && 'SHE ASKED A QUESTION',
    s.brief === 'agree' && 'SHE AGREED IN A WORD: A REAL ANSWER. BUILD ON WHAT SHE AGREED WITH AND ASK THE NEXT STEP',
    s.brief === 'disagree' && 'SHE SAID NO IN A WORD: A REAL ANSWER. ACCEPT IT AND ASK ABOUT SOMETHING ELSE IN THE MOMENT',
  ].filter(Boolean);
  return `THE DREAM, IN HER OWN WORDS: ${q(p.sourceText)}

THE MOMENTS OF THE DREAM: ${p.moments.map((m) => `${q(m.label)}${m.explored ? ' (explored)' : ''}`).join(' · ')}

${p.earlier.length ? `EARLIER MOMENTS OF THIS CONVERSATION (each answer of hers belongs to the moment it is listed under):\n${p.earlier.map((m) => `- ${q(m.label)}${m.text && m.text !== m.label ? ` — in the dream: ${q(m.text)}` : ''}\n${turnLines(m.turns)}`).join('\n')}` : 'EARLIER MOMENTS OF THIS CONVERSATION: none yet.'}

${p.moment ? `THE MOMENT NOW: ${q(p.moment.label)} — in the dream: ${q(p.moment.text)}\n${p.turns.length ? turnLines(p.turns) : '  (not opened yet)'}` : ''}

SIGNALS: ${signals.length ? signals.join('; ') : 'none'}
${p.moment && p.request !== 'summary' ? `QUESTIONS ASKED IN THIS MOMENT: ${p.asked ?? 0} OF AT MOST 3 — THIS IS YOUR TURN ${(p.asked ?? 0) + 1} OF 3${(p.asked ?? 0) + 1 >= 3 ? ': THE LAST ONE. Her answer to it ends the moment, so ask the question that matters most' : ''}; END IT WITH ONE QUESTION\n` : ''}${p.moment && p.request !== 'summary' && askedIn([...p.earlier.flatMap((m) => m.turns), ...p.turns]).length ? `QUESTIONS YOU ALREADY ASKED IN THIS JOURNEY (never again, not in other words and not with the same frame): ${askedIn([...p.earlier.flatMap((m) => m.turns), ...p.turns]).map(q).join(' · ')}\n` : ''}NOW: ${p.request === 'open' ? 'OPEN this moment' : p.request === 'summary' ? 'SUMMARY of what came up' : p.request === 'close' ? 'CLOSE this moment: one or two short sentences, NO question, no offer, no new insight' : 'REPLY to what she just said'}`;
}

const SOURCE = { type: 'object', additionalProperties: false, required: ['quote', 'from'], properties: { quote: { type: 'string' }, from: { type: 'string', enum: ['dream', 'her'] } } } as const;
export const TURN_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'offer', 'anchors', 'facts', 'move', 'mine', 'ideas', 'open'],
  properties: {
    reply: { type: 'string' },
    offer: { type: 'string' },
    anchors: { type: 'array', items: SOURCE },
    facts: { type: 'array', items: SOURCE },
    move: { type: 'string', enum: [...MOVES] },
    mine: { type: 'array', items: { type: 'string' } },
    ideas: { type: 'array', items: { type: 'string' } },
    open: { type: 'array', items: { type: 'string' } },
  },
} as const;

export function parseTurn(candidate: unknown): TurnRaw | null {
  if (typeof candidate !== 'object' || candidate === null) return null;
  const c = candidate as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const sources = (v: unknown) =>
    (Array.isArray(v) ? v : [])
      .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
      .map((x) => ({ quote: str(x.quote), from: x.from === 'her' ? ('her' as const) : ('dream' as const) }))
      .filter((x) => x.quote)
      .slice(0, 12);
  const reply = str(c.reply);
  const offer = str(c.offer);
  if (!reply && !offer) return null;
  const list = (v: unknown) => (Array.isArray(v) ? v : []).map(str).filter(Boolean).map((x) => x.slice(0, 300)).slice(0, 3);
  return { reply, offer, anchors: sources(c.anchors), facts: sources(c.facts), move: (MOVES as readonly string[]).includes(str(c.move)) ? (str(c.move) as Move) : 'reflect', mine: list(c.mine), ideas: list(c.ideas), open: list(c.open).slice(0, 2) };
}

// ------------------------------------------------------------------------------------------------ the four signals

/** "I'm not sure it means anything": ways of saying it, each bound to meaning or to "just weird" (an ordinary "I'm not sure" is not it). */
const MEANING_DOUBT = [
  /לא\s+(?:יודע|יודעת|בטוח|בטוחה)\s+אם\s+(?:יש\s+(?:לזה|לו|לה|בזה)\s+משמעות|(?:זה|הוא|היא)\s+(?:אומר|אומרת|מסמל|מסמלת)|זה\s+קשור)/,
  /(?:^|\s)(?:פשוט|סתם)\s+(?:היה\s+|הייתה\s+|זה\s+)?(?:מוזר|מוזרה|משונה)/,
  /לא\s+נראה\s+לי\s+ש(?:יש\s+(?:לזה|לו|לה|בזה)\s+(?:משמעות|משהו)|זה\s+(?:אומר|מסמל|קשור))/,
  /אין\s+(?:לזה|לו|לה|בזה)\s+(?:שום\s+)?משמעות/,
  /לא\s+(?:הכל|כל\s+דבר)\s+צריך\s+(?:משמעות|להגיד\s+משהו)/,
  /\b(?:don'?t|do\s+not)\s+know\s+if\s+it\s+(?:means|meant|has\s+(?:a\s+)?meaning)/i,
  /\bjust\s+(?:weird|strange|random|odd)\b/i,
  /\b(?:no|doesn'?t\s+have\s+(?:a|any))\s+(?:real\s+)?meaning\b/i,
];

/** "It connects with me": said by her, not negated ("זה לא מתחבר לי" is not it). */
const CONNECTS = [
  /(?<![א-ת])(?<!לא\s)(?:מתחבר|מתחברת)\s+(?:לי|אליי)(?![א-ת])/,
  /(?<![א-ת])(?<!לא\s)(?:מדויק|מדויקת)(?![א-ת])/,
  /(?:^|[\s,.!])בדיוק(?:\s*[!.]+|\s*$)/,
  /(?<![א-ת])(?<!לא\s)נכון\s+(?:לגביי|לגבי|בשבילי|לי)(?![א-ת])/,
  /(?<![א-ת])(?<!לא\s)(?:מזכיר|מזכירה)\s+לי/,
  /(?<![א-ת])(?<!לא\s)(?:נוגע|נוגעת)\s+בי(?![א-ת])/,
  /\bresonat/i,
  /\bexactly\b/i,
  /\b(?:it|that)\s+(?:really\s+)?(?:speaks|connects)\s+to\s+me\b/i,
];
export const saysItConnects = (text: string) => CONNECTS.some((r) => r.test(text));

export function turnSignals(p: { turns: readonly ConversationTurn[]; momentText: string }): TurnSignals {
  const last = p.turns[p.turns.length - 1];
  const rejectedNow = Boolean(last && last.role === 'dreamer' && last.rejection);
  const steer = last && last.role === 'dreamer' && last.steer ? last.steer : null;
  // a button is not her words: no "short or unsure", no question
  const her = last && last.role === 'dreamer' && !rejectedNow && !steer ? last.text : '';
  // her answers since she last asked to go deeper or said it connects (a nudge after four, never a limit)
  let since = 0;
  for (let i = p.turns.length - 1; i >= 0; i -= 1) {
    const t = p.turns[i];
    if (t.role !== 'dreamer') continue;
    if (t.steer === 'deepen' || (!t.rejection && !t.steer && saysItConnects(t.text))) break;
    if (!t.rejection && !t.steer) since += 1;
  }
  const lastDare = [...p.turns].reverse().find((t) => t.role === 'dare');
  const brief = briefAnswer(her);
  const unsure = Boolean(her) && !brief && (isUnsureAnswer(her) || /(?:^|\s)לא\s+(?:יודע|יודעת|בטוח|בטוחה)(?=[\s.,!?]|$)/.test(her));
  return {
    rejectedOffer: Boolean(lastDare?.offer && lastDare.rejected),
    shortOrUnsure: unsure,
    shortAnswer: Boolean(her) && !brief && !unsure && words(her).length < 4,
    brought: her ? herBrought(her) : [],
    sensitive: SENSITIVE_WORD.test(`${p.momentText} ${her}`),
    sheAsked: her.includes('?'),
    meaningDoubt: Boolean(her) && MEANING_DOUBT.some((r) => r.test(her)),
    rejectedNow,
    connected: Boolean(her) && saysItConnects(her),
    steer,
    severalExchanges: since >= 4,
    brief,
  };
}

/** A short yes or no, on its own: "נכון", "מדויק", "בדיוק", "כן" agree; "לא" disagrees (2026-11-04). */
const AGREE = /^(?:נכון(?:\s+מאוד)?|מדויק|מדויקת|בדיוק|כן|ממש|אכן|yes|yeah|exactly|right|true|correct|that'?s\s+right)$/i;
const DISAGREE = /^(?:לא|ממש\s+לא|לא\s+ממש|לא\s+נכון|no|not\s+really|nope)$/i;
export function briefAnswer(text: string): 'agree' | 'disagree' | null {
  const t = text.trim().replace(/[.!…,]+$/u, '').trim();
  return AGREE.test(t) ? 'agree' : DISAGREE.test(t) ? 'disagree' : null;
}

// ------------------------------------------------------------------------------------------------ the check

/** The plain line when nothing usable came back: in the conversation a question too (2026-11-04), so she is never left without knowing what to answer. */
export const fallbackReply = (language: AppLanguage) => (language === 'he' ? 'מה עוד עולה כשחושבים על הרגע הזה?' : 'What else comes to mind about this moment?');
/** The whole view's own plain line when nothing usable came back (as before 2026-11-04): never a question about "this moment" there. */
export const fallbackSummaryLine = (language: AppLanguage) => (language === 'he' ? 'אפשר להמשיך מכאן, או לבחור רגע אחר.' : 'We can go on from here, or choose another moment.');

/**
 * The whole view when DARE's text cannot be shown (2026-11-07): what she said in each moment, in her own words and nothing else. No fact is
 * added and nothing is interpreted; a moment with no answer of hers is left out. Null when she said nothing at all.
 */
export function wordsOfHerSummary(moments: readonly { label: string; turns: readonly ConversationTurn[] }[], language: AppLanguage): string | null {
  const cut = (t: string) => (t.length > 200 ? `${t.slice(0, 197).trimEnd()}…` : t);
  const lines = moments
    .map((m) => ({ label: m.label, said: m.turns.filter((t) => t.role === 'dreamer' && !t.rejection && !t.steer && t.text.trim()).map((t) => cut(t.text.trim())) }))
    .filter((m) => m.said.length > 0)
    .map((m) => (language === 'he' ? `«${m.label}»: ${m.said.map((x) => `«${x}»`).join(' · ')}` : `"${m.label}": ${m.said.map((x) => `"${x}"`).join(' · ')}`));
  if (!lines.length) return null;
  return [language === 'he' ? 'מה שעלה בשיחה, במילים שלך:' : 'What came up in the conversation, in your own words:', ...lines].join('\n\n');
}

const sentencesOf = (text: string) => text.split(/(?<=[.!?…])\s+/u).map((x) => x.trim()).filter(Boolean);
/** Line by line (2026-10-30): a check that goes sentence by sentence keeps the model's line breaks and paragraphs; an emptied line goes. */
const byLine = (text: string, f: (line: string) => string) =>
  text
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n\s*/)
    .map((para) => para.split('\n').map(f).filter((line) => line.trim()).join('\n'))
    .filter(Boolean)
    .join('\n\n');
const plain = (t: string) => t.replace(/[^א-תa-zA-Z0-9\s]/g, '').replace(/\s+/g, ' ').trim();

export interface CheckedTurn {
  reply: string;
  offer: string;
  move: Move;
  /** What was not shown, and why (for the reports; never shown). */
  dropped: string[];
  /** Quotes given back in the words that were really said. */
  fixed: string[];
  /** What the shown offer rests on, as really written (kept with the turn, so a rejected angle is not offered again). */
  anchors: string[];
  /** SUMMARY only, checked: her own sentences, and offers she did not reject. */
  mine: string[];
  ideas: string[];
  open: string[];
}

/** A therapist's question about what something "stirs in her" (2026-10-30): the sentence is not shown. */
const THERAPIST = /מעורר(?:ת|ים|ות)?\s+(?:בך|אצלך|בכם|אצלכם)(?![א-ת])|\b(?:stirs?|evokes?|brings?\s+up)\s+in\s+you\b/i;
/** The run of words that makes two questions the same question in other clothes, once the words of the dream and hers are set aside. */
const FRAME_WORDS = 5;
function repeatsAskedFrame(sentence: string, asked: readonly string[], own: ReadonlySet<string>): boolean {
  const frame = (s: string) => plain(s.replace(/«[^»]*»/g, ' ')).split(' ').filter((w) => w && !own.has(w));
  const mine = frame(sentence);
  if (!mine.length) return false;
  const runs = (ws: string[]) => (ws.length < FRAME_WORDS ? [ws.join(' ')] : ws.slice(0, ws.length - FRAME_WORDS + 1).map((_, i) => ws.slice(i, i + FRAME_WORDS).join(' ')));
  const mineRuns = new Set(runs(mine));
  return asked.some((q) => {
    const theirs = frame(q);
    return mine.length < FRAME_WORDS ? theirs.join(' ') === mine.join(' ') : runs(theirs).some((r) => r.split(' ').length === FRAME_WORDS && mineRuns.has(r));
  });
}

/** One question a turn: when the offer asks, the reply asks nothing; otherwise only the reply's first question stays. */
function oneQuestion(reply: string, offer: string): { reply: string; offer: string } {
  // one question a turn, counted as the counter counts it (asksHer): the offer's first question wins, else the reply's first
  let kept = false;
  const keepFirst = (text: string) =>
    byLine(text, (line) =>
      sentencesOf(line)
        .filter((s) => {
          if (!asksHer(s)) return true;
          if (kept) return false;
          kept = true;
          return true;
        })
        .join(' '),
    );
  const offerOne = keepFirst(offer);
  return { reply: keepFirst(reply), offer: offerOne };
}

/** Said as a possibility to think about, not as a fact: a word of possibility, or a question. */
const TENTATIVE = /(?<![א-ת])(?:ו?אולי|ייתכן|יתכן|יכול\s+להיות|יכולה\s+להיות|אפשר\s+(?:לחשוב|לראות|לדמיין|ש)|מעניין\s+אם|כאילו|אם\s+(?:זה|יש))(?![א-ת])|\b(?:maybe|perhaps|might|could|possibly|wonder)\b|\?/i;
/** She asks about a meaning herself: then an angle she turned down may come back. */
const ASKS_MEANING = /משמעות|(?:מה|למה)\s+(?:זה|הוא|היא)\s+(?:אומר|אומרת|מסמל|מסמלת|יכול|יכולה)|\bmean(?:s|ing)?\b|\bsymbol/i;

/**
 * What of a turn may be shown. Quotes («…») and facts must be in the dream (or a moment's name) or in her words — in another person
 * or tense they are given back as really said; otherwise the sentence goes. An offer needs at least one anchor that exists. Nothing is
 * rewritten beyond a quote's own words, and nothing is added but the plain line when nothing is left.
 */
export function checkTurn(
  raw: TurnRaw,
  ctx: {
    sourceText: string;
    labels: readonly string[];
    herWords: readonly string[];
    language: AppLanguage;
    /** The anchors of an angle she turned down: not offered again, unless she brings it back (`herLatest`). */
    avoidAnchors?: readonly string[];
    herLatest?: string;
    /** DARE's offers she did not reject: the only "ideas" a summary may list. */
    offers?: readonly string[];
    /** The questions that were really asked in the conversation: the only "open" questions a summary may keep (with hers). */
    questions?: readonly string[];
  },
): CheckedTurn {
  const pool = [ctx.sourceText, ...ctx.labels, ...ctx.herWords].filter((x) => x && x.trim());
  // words that stand exactly as written anywhere (a moment's name too) first; only then the same words in another person or tense
  const locate = (quote: string) => {
    if (pool.some((t) => containsVerbatim(t, quote))) return quote.trim();
    for (const t of pool) {
      const found = locateQuote(quote, t);
      if (found) return found;
    }
    return null;
  };
  const dropped: string[] = [];
  const fixed: string[] = [];
  const missingFacts = raw.facts.filter((f) => !locate(f.quote));
  // the words of the dream and hers: a question may quote them again; only the question's own frame may not repeat
  const own = new Set(plain([ctx.sourceText, ...ctx.labels, ...ctx.herWords].join(' ')).split(' ').filter(Boolean));
  // What she did not tell, DARE's first person and a work's content (2026-11-07) are NOT looked for here: no sentence is removed for a word.
  // They only ask the model once for a fresh answer (attributionNote in the route); the last answer is then kept as it is.
  const pass = (text: string) => byLine(text, (line) =>
    sentencesOf(line)
      .flatMap((sentence) => {
        if (THERAPIST.test(sentence)) {
          dropped.push(`a therapist's phrase: "${sentence}"`);
          return [];
        }
        if (sentence.includes('?') && repeatsAskedFrame(sentence, ctx.questions ?? [], own)) {
          dropped.push(`a question already asked in this journey: "${sentence}"`);
          return [];
        }
        let out = sentence;
        for (const m of sentence.matchAll(/«([^»]+)»/g)) {
          const found = locate(m[1]);
          if (!found) {
            dropped.push(`a quote that was never said: «${m[1]}»`);
            return [];
          }
          if (plain(found) !== plain(m[1])) {
            fixed.push(`«${m[1]}» → «${found}»`);
            out = out.replace(m[0], `«${found}»`);
          }
        }
        const unfounded = missingFacts.find((f) => repeatsQuote(out, f.quote) || plain(out).includes(plain(f.quote)));
        if (unfounded) {
          dropped.push(`a fact that is not in the dream or her words: "${unfounded.quote}"`);
          return [];
        }
        return [out];
      })
      .join(' '),
  );
  const reply = pass(raw.reply);
  let offer = '';
  const anchors = raw.anchors.map((a) => locate(a.quote)).filter((a): a is string => Boolean(a));
  if (raw.offer.trim()) {
    const near = (a: string, b: string) => plain(a).includes(plain(b)) || plain(b).includes(plain(a));
    const avoid = ctx.avoidAnchors ?? [];
    const herLatest = ctx.herLatest ?? '';
    const sheBroughtItBack = ASKS_MEANING.test(herLatest) || avoid.some((b) => plain(herLatest).includes(plain(b)));
    if (anchors.length === 0) dropped.push('an offer with no anchor that exists in the dream or her words');
    else if (!TENTATIVE.test(raw.offer)) dropped.push('an offer said as a fact, not as a possibility');
    else if (!sheBroughtItBack && anchors.some((a) => avoid.some((b) => near(a, b)))) dropped.push('the angle she turned down, again');
    else offer = pass(raw.offer);
  }
  // a summary's "what I took from the dream": only her own words as hers, only offers she did not reject as ideas — nothing invented
  const mine = (raw.mine ?? []).filter((m) => ctx.herWords.some((w) => containsVerbatim(w, m))).slice(0, 3);
  if ((raw.mine ?? []).length > mine.length) dropped.push('a "mine" that is not her own words');
  const ideas = (raw.ideas ?? []).filter((x) => plain(x).length >= 8 && (ctx.offers ?? []).some((o) => plain(o).includes(plain(x)))).slice(0, 3);
  if ((raw.ideas ?? []).length > ideas.length) dropped.push('an "idea" that is not an offer she kept');
  const open = (raw.open ?? [])
    .filter((x) => x.includes('?') && [...ctx.herWords, ...(ctx.questions ?? [])].some((w) => containsVerbatim(w, x)))
    .slice(0, 2);
  if ((raw.open ?? []).length > open.length) dropped.push('an "open question" that was never asked');
  const one = oneQuestion(reply, offer);
  if (one.reply !== reply || one.offer !== offer) dropped.push('a second question in the same turn');
  return { reply: one.reply || one.offer ? one.reply : fallbackReply(ctx.language), offer: one.offer, move: raw.move, dropped, fixed, anchors: one.offer ? anchors : [], mine, ideas, open };
}
