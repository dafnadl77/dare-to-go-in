import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import DreamMap, { type WholeViewPhase } from './DreamMap';
import ConversationThread from './ConversationThread';
import { CONVERSATIONS, summaryOf, type ConversationScript } from './conversationScript';
import { mapFromExploration } from './fromExploration';
import * as X from '../hero/exploration';
import { checkTurn, fallbackReply, saysItConnects } from '../hero/conversationTurn';
import { createExplorationEngine } from '../hero/explorationEngineCore';
import type { DreamAnalysis } from '../hero/dreamAnalysisSchema';
import type { MapMoment } from './mapTypes';
import { livePost, liveSpent } from '../devTools/conversationLive';
import SafetyPanel from '../hero/safety/SafetyPanel';
import type { CrisisLevel } from '../hero/safety/crisisTexts';
import type { RiskLevel, SafetyAck } from '../hero/safety/riskDetector';

/**
 * THE CONVERSATION PAGE (doc 102, step 2; development only, not in the build). Every moment of the three dreams has its own short
 * conversation, so the moments can be opened in any order. The conversations run through the product's own code: the journey's data
 * (exploration.ts), the browser engine (explorationEngineCore.ts), the check of every turn (checkTurn) and the dream map with its
 * window. Only the model is a stand-in: for each moment it answers with that moment's prepared turns, and once they run out, with the
 * engine's own plain line. Nothing leaves the page and nothing is saved.
 */

const IMAGE = '/dream-assets/dream-art-alt.jpg';
const DATE = '2026-10-24';

type Post = { status: number; data: unknown };

/** A moment's window: a moment not opened yet asks DARE for its first turn once, after it is shown (never while rendering). */
function MomentWindow({ shouldOpen, onOpen, children }: { shouldOpen: boolean; onOpen: () => void; children: ReactNode }) {
  const asked = useRef(false);
  useEffect(() => {
    if (shouldOpen && !asked.current) {
      asked.current = true;
      onOpen();
    }
  }, [shouldOpen, onOpen]);
  return <>{children}</>;
}

type Mode = 'prepared' | 'live';

const GUIDE_LIVE = ['לבחור רגע במפה, בכל סדר', 'לכתוב בחופשיות, במילים שלך', 'מתחת לשיחה כתוב אם DARE מחכה לתשובה', '"לרגע אחר" מחזיר למפה', '"לסיים ולראות מה עלה" מסכם את השיחה'];

/** Plain words when DARE could not answer (never a technical message). */
const troubleOf = (reason: string) =>
  reason === 'limit_reached' ? 'הגענו לגבול השיחה לחלום הזה.' : reason === 'not_needed' || reason === 'safety' ? null : 'DARE לא הצליחה לענות כרגע. אפשר לנסות שוב בעוד רגע.';

/** Why "what came up" was not made, in plain and precise words; a summary that was not made is never shown. */
const summaryTroubleOf = (reason: string, explored: number) =>
  reason === 'held_back'
    ? 'הסיכום לא עבר את בדיקת הבטיחות, ולכן הוא לא מוצג. אפשר לנסות שוב בעוד רגע.'
    : reason === 'budget_reached'
      ? 'תקציב בדיקת השיחה נגמר, ולכן לא נוצר סיכום.'
      : reason === 'limit_reached'
        ? 'כבר נוצרו כל הסיכומים האפשריים לחלום הזה.'
        : reason === 'safety'
          ? 'לא ניתן להכין סיכום לשיחה הזו. אם קשה לך עכשיו, אפשר לדבר עם ער"ן בטלפון 1201.'
          : reason === 'not_needed' && explored === 0
            ? 'כדי לראות מה עלה, צריך קודם לשוחח על רגע אחד לפחות.'
            : reason === 'not_needed'
              ? 'לא הצלחנו להכין את הסיכום כרגע. אפשר לנסות שוב בעוד רגע.'
              : 'שירות ה־AI לא זמין כרגע, ולכן לא נוצר סיכום. אפשר לנסות שוב בעוד רגע.';

const GUIDE = ['לבחור רגע במפה, בכל סדר', 'התשובה כבר מוכנה בתיבה: לשלוח אותה, או לכתוב משהו אחר', 'ליד זווית שמוצעת אפשר ללחוץ "זה לא מתאים לי"', '"לרגע אחר" מחזיר למפה', 'בסוף: "לגלות את התמונה השלמה"'];

export default function ConversationDemo() {
  const [key, setKey] = useState<ConversationScript['key']>('store');
  const script = CONVERSATIONS.find((c) => c.key === key)!;
  const freshJourney = (s: ConversationScript) => X.createExploration(`demo-${s.key}-${Date.now()}`, s.moments.map((m) => ({ label: m.label, excerpt: m.excerpt })));
  const [e, setE] = useState<X.Exploration>(() => freshJourney(script));
  /** The journey as it is now (a late reply or a click never works on an older copy). */
  const eRef = useRef(e);
  eRef.current = e;
  /** For each moment: how many of its prepared turns were used. */
  const used = useRef(new Map<string, number>());
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [phase, setPhase] = useState<WholeViewPhase>('idle');
  const [run, setRun] = useState(0);
  // ?live=1 (the live launcher) opens straight in the real conversation
  const [mode, setMode] = useState<Mode>(() => (new URLSearchParams(window.location.search).get('live') === '1' ? 'live' : 'prepared'));
  const [live, setLive] = useState<{ spent: number; cap: number; stageLeft: number } | null>(null);
  const [trouble, setTrouble] = useState<string | null>(null);
  /** What the whole-view panel says when "what came up" failed or was held back (the moment's window is closed by then). */
  const [wholeNote, setWholeNote] = useState<string | null>(null);
  /** The distress path in a moment's window (doc 106); nothing about it is kept. */
  const [safety, setSafety] = useState<{ id: string; level: CrisisLevel } | null>(null);
  /** After immediate danger or a threat, nothing more is asked of DARE on this page (until it is opened again). */
  const [stopped, setStopped] = useState<'danger' | 'threat' | null>(null);
  const refreshLive = () => void liveSpent().then(setLive);
  useEffect(() => {
    if (mode === 'live') refreshLive();
    // once, on opening
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const momentScript = (ex: X.Exploration, id: string) => {
    const label = ex.moments.find((m) => m.id === id)?.label;
    return script.moments.find((m) => m.label === label) ?? null;
  };
  /** Her prepared words after DARE's turn in this moment, if any. */
  const nextHer = (id: string, ex: X.Exploration) => {
    if (mode === 'live') return '';
    const ms = momentScript(ex, id);
    const t = ms?.turns[used.current.get(id) ?? 0];
    return t?.kind === 'dreamer' ? t.text : '';
  };

  // the stand-in model: this moment's prepared turns, through the real check of every turn
  const engine = useMemo(() => {
    const post = async (_url: string, body: unknown): Promise<Post> => {
      const b = body as { mode: string; momentId?: string; exploration: X.Exploration };
      const herWords = Object.values(b.exploration.explored).flatMap((x) => (x.turns ?? []).filter((t) => t.role === 'dreamer').map((t) => t.text));
      const ctx = { sourceText: script.dreamText, labels: script.moments.map((m) => m.label), herWords, language: 'he' as const };
      if (b.mode === 'conversation-turn' && b.momentId) {
        // the stand-in keeps the same rule as the route: after the third question, the closing line (no question)
        if (X.questionsAsked(b.exploration, b.momentId) >= X.MAX_QUESTIONS_PER_MOMENT) {
          return { status: 200, data: { turn: { role: 'dare', text: 'תודה על מה ששיתפת ברגע הזה. אפשר לעבור לרגע אחר, או לראות מה עלה.', move: 'summarize', closing: true } } };
        }
        const turns = momentScript(b.exploration, b.momentId)?.turns ?? [];
        let i = used.current.get(b.momentId) ?? 0;
        // her words were sent: skip her prepared turn
        if (turns[i]?.kind === 'dreamer') i += 1;
        const next = turns[i];
        const raw = next?.kind === 'dare' ? next.raw : { reply: fallbackReply('he'), offer: '', anchors: [], facts: [], move: 'reflect' as const };
        used.current.set(b.momentId, next?.kind === 'dare' ? i + 1 : i);
        const c = checkTurn(raw, ctx);
        return { status: 200, data: { turn: { role: 'dare', text: c.reply, move: c.move, ...(c.offer ? { offer: c.offer } : {}) } } };
      }
      if (b.mode === 'conversation-summary') {
        const labels = X.exploredInOrder(b.exploration).map((x) => x.moment.label);
        // the stand-in's "מה לקחתי מהחלום": her words where she said it connects, and offers she did not reject — through the same check
        const turns = Object.values(b.exploration.explored).flatMap((x) => x.turns ?? []);
        const offers = turns.filter((t) => t.role === 'dare' && t.offer && !t.rejected).map((t) => t.offer as string);
        const mine = turns.filter((t) => t.role === 'dreamer' && !t.rejection && !t.steer && saysItConnects(t.text)).map((t) => t.text);
        const c = checkTurn({ ...summaryOf(script, labels), mine, ideas: offers }, { ...ctx, offers });
        const takeaways = c.mine.length || c.ideas.length ? { takeaways: { mine: c.mine, ideas: c.ideas } } : {};
        return { status: 200, data: { basedOn: X.basedOnKey(b.exploration), wholeView: { kind: 'whole', notice: null, overview: c.reply, connections: [], recurring: null, contrast: null, readings: [], closingQuestion: '', invite: [], ...takeaways } } };
      }
      return { status: 400, data: {} };
    };
    if (mode === 'live') return createExplorationEngine({ post: (url, body, timeoutMs) => livePost(url, { ...(body as object), devAddress: script.address }, timeoutMs) });
    return createExplorationEngine({ post });
    // a new stand-in for each dream and each fresh start
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, run, mode]);

  // only the dream's own words; in live mode the local bridge builds the analysis from them, with no model
  const analysis = { sourceText: script.dreamText } as unknown as DreamAnalysis;

  const reset = (nextKey = key, nextMode = mode) => {
    setMode(nextMode);
    setTrouble(null);
    setSafety(null);
    if (nextMode === 'live') refreshLive();
    const s = CONVERSATIONS.find((c) => c.key === nextKey)!;
    setKey(nextKey);
    setE(freshJourney(s));
    used.current = new Map();
    setDraft('');
    setPending(false);
    setPhase('idle');
    setRun((r) => r + 1);
  };

  /** Opens a moment; a moment left open is closed first (explored if she said something in it, otherwise let go). */
  const open = async (id: string) => {
    if (e.explored[id] || pending) return;
    if (stopped) return setSafety({ id, level: stopped });
    let base = e;
    const other = X.exploringId(base);
    if (other && other !== id) {
      base = base.explored[other]?.turns?.some((t) => t.role === 'dreamer') ? X.completeConversation(base, other) : X.abandonMoment(base, other);
      if (!base.explored[other]) used.current.delete(other);
    }
    setE(base);
    setPending(true);
    const out = await engine.turn(base, analysis, id, 'he', []);
    setPending(false);
    if (out.status === 'safety') showSafety(id, out.level);
    else if (out.status === 'ok') {
      const opened = X.beginConversation(base, id, out.turn);
      setE(opened);
      setDraft(nextHer(id, opened));
      setTrouble(null);
    } else setTrouble(troubleOf(out.reason));
    if (mode === 'live') refreshLive();
  };

  /** A moment she leaves: explored if she said something in it, otherwise let go (no trace). */
  const leave = (ex: X.Exploration, id: string) => (ex.explored[id]?.turns?.some((t) => t.role === 'dreamer') ? X.completeConversation(ex, id) : X.abandonMoment(ex, id));

  const send = async (id: string) => {
    const words = draft.trim();
    if (!words || stopped) return;
    const next = X.addDreamerTurn(e, id, words);
    if (next === e) return;
    setE(next);
    setDraft('');
    setSafety(null);
    await answer(next, id);
  };

  /** DARE's turn after her words; with her answer to the distress path when she gave one. */
  const answer = async (next: X.Exploration, id: string, ack?: SafetyAck) => {
    setPending(true);
    const out = await engine.turn(next, analysis, id, 'he', [], ack ? { safetyAck: ack } : undefined);
    setPending(false);
    if (out.status === 'safety') showSafety(id, out.level);
    else if (out.status === 'ok') {
      const replied = X.addDareTurn(next, id, out.turn);
      setE(replied);
      setDraft(nextHer(id, replied));
      setTrouble(null);
    } else setTrouble(troubleOf(out.reason));
    if (mode === 'live') refreshLive();
  };

  const showSafety = (id: string, level: RiskLevel) => {
    if (level === 'none') return;
    if (level === 'danger' || level === 'threat') setStopped(level);
    setSafety({ id, level });
  };

  /** Her answer in the distress path: "from the dream" and "not in immediate danger" let the conversation go on, gently. */
  const choose = (id: string, choice: 'dream' | 'also-now' | 'in-danger' | 'not-immediate') => {
    if (choice === 'also-now') return setSafety({ id, level: 'concern' });
    if (choice === 'in-danger') return showSafety(id, 'danger');
    setSafety(choice === 'not-immediate' ? { id, level: 'after-not-immediate' } : null);
    void answer(e, id, choice);
  };

  /** "What came up" is in the map's own whole-view panel, below the map: the page goes there and the panel's title takes the focus. */
  const goToWhole = () => {
    // after the moment's window has closed and given its focus back, so nothing pulls the page up again
    window.setTimeout(() => {
      const panel = document.querySelector<HTMLElement>('.dm-whole');
      if (!panel) return;
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      panel.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      panel.querySelector<HTMLElement>('.dm-panel-title')?.focus({ preventScroll: true });
    }, 120);
  };

  const revealWhole = async () => {
    if (stopped) return;
    // every moment still open is closed first (explored if she said something in it), on the journey as it is now
    let base = eRef.current;
    let guard = 0;
    while (X.exploringId(base) && guard < X.MAX_MOMENTS) {
      base = leave(base, X.exploringId(base)!);
      guard += 1;
    }
    setE(base);
    setWholeNote(null);
    setPhase('revealing');
    goToWhole();
    const out = await engine.wholeView(base, analysis, 'he', [], 'conversation-summary');
    if (out.status === 'ok') {
      setE(X.receiveWholeView(base, out.view, out.basedOn));
      setPhase('shown');
    } else {
      // in the panel itself (the moment's window is closed), in precise words; and a technical code in the console, never content
      setPhase('idle');
      setWholeNote(summaryTroubleOf(out.reason, X.exploredCount(base)));
      console.info(`[DARE] summary not created: reason=${out.reason} explored=${X.exploredCount(base)} open=${X.exploringId(base) ?? 'none'} canRequest=${X.canRequestWholeView(base)}`);
    }
    if (mode === 'live') refreshLive();
  };

  const m = mapFromExploration(e, { key: script.key, language: 'he', date: DATE, sourceText: script.dreamText, imageSrc: IMAGE });

  const renderMoment = (moment: MapMoment, close: () => void) => {
    const entry = e.explored[moment.id];
    return (
      <MomentWindow key={moment.id} shouldOpen={!entry} onOpen={() => void open(moment.id)}>
        <ConversationThread
          title={moment.title}
          excerpt={moment.excerpt}
          turns={entry?.turns ?? []}
          address={script.address}
          pending={pending && (!entry || entry.status === 'exploring')}
          draft={draft}
          onDraft={setDraft}
          onSend={() => void send(moment.id)}
          onSteer={(kind) => {
            // her bubble and DARE's answer at once: a regular turn (out of the 16), once per DARE turn (doc 117)
            if (stopped) return setSafety({ id: moment.id, level: stopped });
            const next = X.steerWithReply(e, moment.id, kind);
            if (!next) return;
            setE(next);
            void answer(next, moment.id);
          }}
          onReject={() => {
            // her bubble "זה לא מתאים לי" and DARE's real answer at once (doc 114); once per rejection, 3 a dream, then only marked
            if (stopped) return setSafety({ id: moment.id, level: stopped });
            const r = X.rejectWithReply(e, moment.id);
            if (r.e === e) return;
            setE(r.e);
            if (r.reply) void answer(r.e, moment.id);
            else setTrouble('השתמשת בשלוש התגובות לדחייה בחלום הזה. אפשר לכתוב לאן להמשיך, או לבחור רגע אחר.');
          }}
          onMoveOn={() => {
            setE((cur) => leave(cur, moment.id));
            close();
          }}
          onFinish={() => {
            close();
            void revealWhole();
          }}
          canFinish={Object.values(e.explored).some((x) => x.turns?.some((t) => t.role === 'dreamer'))}
          explored={entry?.status === 'explored'}
          questionNumber={Math.min(X.MAX_QUESTIONS_PER_MOMENT, X.questionsAsked(e, moment.id))}
          // the moment's three questions are spent: its closing line came (or her last answer stands): only the ways out
          closed={X.momentClosed(e, moment.id) || (X.questionsAsked(e, moment.id) >= X.MAX_QUESTIONS_PER_MOMENT && entry?.turns?.[entry.turns.length - 1]?.role === 'dreamer' && !pending)}
          note={trouble}
          safety={safety?.id === moment.id ? <SafetyPanel level={safety.level} address={script.address} language="he" onChoice={(c) => choose(moment.id, c)} /> : undefined}
          safetyBlocks={safety?.id === moment.id && safety.level !== 'after-not-immediate'}
          titleId={`cv-${moment.id}-title`}
        />
      </MomentWindow>
    );
  };

  return (
    <>
      <div className="dmp-bar cvd-bar">
        <span className="dmp-status">
          עמוד פיתוח · שיחה עם DARE ·{' '}
          {mode === 'prepared'
            ? 'תשובות מוכנות מראש, שום דבר לא נשלח ולא נשמר'
            : live
              ? `שיחה אמיתית עם AI: הוצאו $${live.spent.toFixed(3)} מתוך תקרה של $${live.cap}`
              : 'השיחה האמיתית עוד לא פעילה'}
        </span>
        <div className="cvd-tabs" role="tablist" aria-label="סוג השיחה">
          <button type="button" role="tab" aria-selected={mode === 'prepared'} className="cvd-tab" onClick={() => reset(key, 'prepared')}>
            תשובות מוכנות
          </button>
          <button type="button" role="tab" aria-selected={mode === 'live'} className="cvd-tab" onClick={() => reset(key, 'live')}>
            שיחה אמיתית
          </button>
        </div>
        <div className="cvd-tabs" role="tablist" aria-label="חלום">
          {CONVERSATIONS.map((c) => (
            <button key={c.key} type="button" role="tab" aria-selected={c.key === key} className="cvd-tab" onClick={() => reset(c.key)}>
              {c.tab}
            </button>
          ))}
        </div>
        <button type="button" className="cvd-tab" onClick={() => reset()}>
          מההתחלה
        </button>
        <ol className="cvd-guide" aria-label="איך עוברים על השיחה">
          {(mode === 'live' ? GUIDE_LIVE : GUIDE).map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ol>
      </div>
      <DreamMap
        dream={m.dream}
        explored={m.explored}
        exploringId={m.exploringId}
        wholeView={m.wholeView}
        wholeViewPhase={phase}
        wholeViewNote={wholeNote}
        wholeViewStale={m.wholeViewStale}
        updatesLeft={X.wholeViewUpdatesLeft(e)}
        noSampleForSet={false}
        favorite={false}
        reducedMotion={false}
        onExplore={() => {}}
        onRevealWhole={() => void revealWhole()}
        onUpdateWhole={() => void revealWhole()}
        onToggleFavorite={() => {}}
        onBack={() => reset()}
        renderMoment={renderMoment}
      />
    </>
  );
}
