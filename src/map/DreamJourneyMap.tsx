import { useEffect, useRef, useState, type ReactNode } from 'react';
import DreamMap, { type WholeViewPhase } from './DreamMap';
import ConversationThread from './ConversationThread';
import { threadWords } from './threadWords';
import { mapFromExploration } from './fromExploration';
import { mapStrings } from './mapStrings';
import * as X from '../hero/exploration';
import { explorationEngine, type ExplorationEngine } from '../hero/explorationEngine';
import type { DreamAnalysis } from '../hero/dreamAnalysisSchema';
import type { AppLanguage } from '../hero/appLanguage';
import type { AddressPreference } from '../hero/addressPreference';
import type { EmotionId } from '../hero/dreamEmotions';
import type { MapMoment } from './mapTypes';
import SafetyPanel from '../hero/safety/SafetyPanel';
import type { CrisisLevel } from '../hero/safety/crisisTexts';
import type { RiskLevel, SafetyAck } from '../hero/safety/riskDetector';
import { sessionStopped, stopForSession } from '../hero/safety/sessionStop';
import './DreamJourneyMap.css';

/**
 * THE DREAM MAP IN THE REAL JOURNEY (after the picture and the feelings step). The approved map and its moment window, driven by the
 * real engine: each moment is a short conversation with DARE (at most three questions, the three direction buttons, "זה לא מתאים לי"),
 * the moments in any order, and "המבט השלם על החלום" from the moments she talked about. The journey itself lives with the page that
 * holds it (it is saved with the dream); this component only changes it through `onChange`.
 */

interface DreamJourneyMapProps {
  analysis: DreamAnalysis;
  /** Null while the moments are still being prepared. */
  exploration: X.Exploration | null;
  onChange: (e: X.Exploration) => void;
  imageSrc: string;
  language: AppLanguage;
  address: AddressPreference;
  emotions: readonly EmotionId[];
  /** On to keeping or letting go of the dream, once the whole view is there. */
  onContinue: () => void;
  /** Tests and the demo may hand in their own engine; the journey uses the real one. */
  engine?: ExplorationEngine;
}

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

const today = () => new Date().toISOString().slice(0, 10);

export default function DreamJourneyMap({ analysis, exploration, onChange, imageSrc, language, address, emotions, onContinue, engine = explorationEngine }: DreamJourneyMapProps) {
  const s = mapStrings(language);
  const w = threadWords(address, language);
  /** The journey as it is now (a late reply or a click never works on an older copy). */
  const eRef = useRef(exploration);
  eRef.current = exploration;
  const set = (next: X.Exploration) => {
    eRef.current = next;
    onChange(next);
  };
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [phase, setPhase] = useState<WholeViewPhase>(exploration?.wholeView ? 'shown' : 'idle');
  const [trouble, setTrouble] = useState<string | null>(null);
  const [wholeNote, setWholeNote] = useState<string | null>(null);
  /** The distress path in a moment's window (doc 106); nothing about it is kept. */
  const [safety, setSafety] = useState<{ id: string; level: CrisisLevel } | null>(null);
  const [date] = useState(today);

  if (!exploration) {
    return (
      <div className="dj-map" dir={language === 'he' ? 'rtl' : 'ltr'} lang={language}>
        <p className="dj-preparing" role="status">
          {s.preparingMoments}
        </p>
      </div>
    );
  }
  const e = exploration;

  // DARE's AI budget ran out (2026-10-30): the approved wording; the conversation so far stays on the screen
  const unavailableOf = (reason: string) =>
    reason === 'service_unavailable_refunded' ? s.troubleUnavailableRefunded : reason === 'service_unavailable' ? s.troubleUnavailable : null;
  const troubleOf = (reason: string) =>
    unavailableOf(reason) ?? (reason === 'limit_reached' ? s.troubleLimit : reason === 'not_needed' || reason === 'safety' ? null : s.troubleTurn);
  const summaryTroubleOf = (reason: string, explored: number) =>
    unavailableOf(reason) ??
    (reason === 'held_back'
      ? s.summaryHeldBack
      : reason === 'limit_reached'
        ? s.summaryLimit
        : reason === 'safety'
          ? s.summarySafety
          : reason === 'not_needed' && explored === 0
            ? s.summaryNeedsMoment
            : s.summaryFailed);

  const showSafety = (id: string, level: RiskLevel) => {
    if (level === 'none') return;
    if (level === 'danger' || level === 'threat') stopForSession(level);
    setSafety({ id, level });
  };
  /** After immediate danger or a threat nothing more is asked of DARE in this session (the same stop paidFetch keeps). */
  const stoppedFor = (id: string) => {
    const stopped = sessionStopped();
    if (stopped) setSafety({ id, level: stopped });
    return stopped !== null;
  };

  /** A moment she leaves: explored if she said something in it, otherwise let go (its questions stay counted). */
  const leave = (ex: X.Exploration, id: string) => (ex.explored[id]?.turns?.some((t) => t.role === 'dreamer') ? X.completeConversation(ex, id) : X.abandonMoment(ex, id));

  /** Opens a moment; a moment left open is closed first. */
  const open = async (id: string) => {
    const cur = eRef.current!;
    if (cur.explored[id] || pending || stoppedFor(id)) return;
    let base = cur;
    const other = X.exploringId(base);
    if (other && other !== id) base = leave(base, other);
    set(base);
    setPending(true);
    const out = await engine.turn(base, analysis, id, language, emotions);
    setPending(false);
    if (out.status === 'safety') showSafety(id, out.level);
    else if (out.status === 'ok') {
      set(X.beginConversation(eRef.current!, id, out.turn));
      setDraft('');
      setTrouble(null);
    } else setTrouble(troubleOf(out.reason));
  };

  /** DARE's turn after her words; with her answer to the distress path when she gave one. */
  const answer = async (next: X.Exploration, id: string, ack?: SafetyAck) => {
    setPending(true);
    const out = await engine.turn(next, analysis, id, language, emotions, ack ? { safetyAck: ack } : undefined);
    setPending(false);
    if (out.status === 'safety') showSafety(id, out.level);
    else if (out.status === 'ok') {
      set(X.addDareTurn(eRef.current!, id, out.turn));
      setTrouble(null);
    } else setTrouble(troubleOf(out.reason));
  };

  const send = async (id: string) => {
    const words = draft.trim();
    if (!words || stoppedFor(id)) return;
    const next = X.addDreamerTurn(eRef.current!, id, words);
    if (next === eRef.current) return;
    set(next);
    setDraft('');
    setSafety(null);
    await answer(next, id);
  };

  /** Her answer in the distress path: "from the dream" and "not in immediate danger" let the conversation go on, gently. */
  const choose = (id: string, choice: 'dream' | 'also-now' | 'in-danger' | 'not-immediate') => {
    if (choice === 'also-now') return setSafety({ id, level: 'concern' });
    if (choice === 'in-danger') return showSafety(id, 'danger');
    setSafety(choice === 'not-immediate' ? { id, level: 'after-not-immediate' } : null);
    void answer(eRef.current!, id, choice);
  };

  /** "What came up" is in the map's own whole-view panel, below the map: the page goes there and the panel's title takes the focus. */
  const goToWhole = () => {
    window.setTimeout(() => {
      const panel = document.querySelector<HTMLElement>('.dj-map .dm-whole');
      if (!panel) return;
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      panel.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      panel.querySelector<HTMLElement>('.dm-panel-title')?.focus({ preventScroll: true });
    }, 120);
  };

  const revealWhole = async () => {
    if (sessionStopped()) return;
    // every moment still open is closed first (explored if she said something in it), on the journey as it is now
    let base = eRef.current!;
    let guard = 0;
    while (X.exploringId(base) && guard < X.MAX_MOMENTS) {
      base = leave(base, X.exploringId(base)!);
      guard += 1;
    }
    set(base);
    setWholeNote(null);
    setPhase('revealing');
    goToWhole();
    const out = await engine.wholeView(base, analysis, language, emotions, 'conversation-summary');
    if (out.status === 'ok') {
      set(X.receiveWholeView(eRef.current!, out.view, out.basedOn));
      setPhase('shown');
    } else {
      setPhase(eRef.current!.wholeView ? 'shown' : 'idle');
      setWholeNote(summaryTroubleOf(out.reason, X.exploredCount(base)));
    }
  };

  const m = mapFromExploration(e, { key: e.attemptId, language, date, sourceText: analysis.sourceText, imageSrc });

  const renderMoment = (moment: MapMoment, close: () => void) => {
    const entry = e.explored[moment.id];
    return (
      <MomentWindow key={moment.id} shouldOpen={!entry} onOpen={() => void open(moment.id)}>
        <ConversationThread
          title={moment.title}
          excerpt={moment.excerpt}
          turns={entry?.turns ?? []}
          address={address}
          language={language}
          pending={pending && (!entry || entry.status === 'exploring')}
          draft={draft}
          onDraft={setDraft}
          onSend={() => void send(moment.id)}
          onSteer={() => {
            // "לשנות כיוון": her bubble and DARE's other direction at once: a regular turn (out of the 16), once per DARE turn (doc 117).
            // "להמשיך בכיוון" asks nothing of DARE: it only opens her writing box (2026-10-28).
            if (stoppedFor(moment.id)) return;
            const next = X.steerWithReply(eRef.current!, moment.id, 'shift', w.shift);
            if (!next) return;
            set(next);
            void answer(next, moment.id);
          }}
          onReject={() => {
            // her bubble "זה לא מתאים לי" and DARE's real answer at once (doc 114); 3 a dream, then only marked
            if (stoppedFor(moment.id)) return;
            const r = X.rejectWithReply(eRef.current!, moment.id, w.notForMe);
            if (r.e === eRef.current) return;
            set(r.e);
            if (r.reply) void answer(r.e, moment.id);
            else setTrouble(s.rejectionsUsed);
          }}
          onMoveOn={() => {
            set(leave(eRef.current!, moment.id));
            setDraft('');
            close();
          }}
          onFinish={() => {
            close();
            void revealWhole();
          }}
          canFinish={Object.values(e.explored).some((x) => x.turns?.some((t) => t.role === 'dreamer'))}
          canMoveOn={X.anotherMomentLeft(e, moment.id)}
          explored={entry?.status === 'explored'}
          questionNumber={Math.min(X.MAX_QUESTIONS_PER_MOMENT, X.questionsAsked(e, moment.id))}
          // the moment's three questions are spent: its closing line came (or her last answer stands): only the ways out
          closed={X.momentClosed(e, moment.id) || (X.questionsAsked(e, moment.id) >= X.MAX_QUESTIONS_PER_MOMENT && entry?.turns?.[entry.turns.length - 1]?.role === 'dreamer' && !pending)}
          note={trouble}
          safety={safety?.id === moment.id ? <SafetyPanel level={safety.level} address={address} language={language} onChoice={(c) => choose(moment.id, c)} /> : undefined}
          safetyBlocks={safety?.id === moment.id && safety.level !== 'after-not-immediate'}
          titleId={`dj-${moment.id}-title`}
        />
      </MomentWindow>
    );
  };

  return (
    <div className="dj-map">
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
        onBack={() => {}}
        renderMoment={renderMoment}
        journey={{ continueLabel: s.continueJourney, onContinue }}
      />
    </div>
  );
}
