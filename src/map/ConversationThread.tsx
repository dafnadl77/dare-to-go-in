import { useEffect, useRef, type ReactNode } from 'react';
import type { ConversationTurn } from '../hero/exploration';
import { threadWords } from './threadWords';
import { threadState } from './threadState';
import './conversation.css';

/**
 * A moment's conversation in its window on the map (doc 102): DARE and the dreamer, an angle offered apart with "זה לא מתאים לי",
 * her answer box, and the way on (another moment). Presentational only: the page that holds it decides what is sent and when.
 */

export interface ConversationThreadProps {
  title: string;
  excerpt: string | null;
  turns: readonly ConversationTurn[];
  address: 'masculine' | 'feminine' | 'neutral';
  /** The journey's language (Hebrew when absent, as on the development page). */
  language?: 'he' | 'en';
  /** DARE is writing. */
  pending: boolean;
  draft: string;
  onDraft: (value: string) => void;
  onSend: () => void;
  onReject: () => void;
  /** The direction buttons (doc 117): shown after DARE's turn, above the writing box, which always stays. */
  onSteer?: (kind: 'deepen' | 'shift') => void;
  onMoveOn: () => void;
  /** Close the conversation and see what came up (shown once she has said something somewhere). */
  onFinish?: () => void;
  canFinish?: boolean;
  /** This moment was already talked about. */
  explored?: boolean;
  /** The moment's three questions are spent and DARE closed it: no writing box and no buttons that ask DARE again, only the ways out. */
  closed?: boolean;
  /** How many questions DARE asked in this moment so far (the real count, kept across visits): "שאלה X מתוך 3". */
  questionNumber?: number;
  /** A plain line under the thread. */
  note?: string | null;
  /** The distress path (doc 106), shown by the page; while it waits for her answer, or after it stops the journey, no answer box. */
  safety?: ReactNode;
  safetyBlocks?: boolean;
  titleId: string;
}

export default function ConversationThread(p: ConversationThreadProps) {
  const w = threadWords(p.address, p.language);
  const end = useRef<HTMLDivElement>(null);
  const lastTurn = p.turns[p.turns.length - 1];
  const state = threadState(p.turns, p.pending, Boolean(p.explored));
  // she may always write while the moment is open and DARE is not writing (also after her own words: DARE answers each one)
  const herTurn = !p.explored && !p.pending && p.turns.length > 0 && !p.safetyBlocks && !p.closed;

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    end.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
  }, [p.turns.length, p.pending, p.safety]);

  return (
    <div className="cv-thread">
      <h2 id={p.titleId} className="dm-dialog-title">
        {p.title}
      </h2>
      {!p.explored && (p.questionNumber ?? 0) > 0 && <p className="cv-progress">{w.progress(p.questionNumber!)}</p>}
      {p.excerpt && (
        <figure className="dm-detail-excerpt">
          <figcaption>{w.fromTheDream}</figcaption>
          <blockquote>{p.excerpt}</blockquote>
        </figure>
      )}

      <ol className="cv-turns" aria-live="polite">
        {p.turns.map((t, i) =>
          t.role === 'dreamer' ? (
            <li key={i} className="cv-her">
              <p>{t.text}</p>
            </li>
          ) : (
            <li key={i} className="cv-dare">
              {/* one response, one bubble: the reply, then the suggestion as its own paragraph (approved 2026-10-26) */}
              {t.text && <p>{t.text}</p>}
              {t.offer && (
                <p className="cv-angle" data-rejected={t.rejected ? 'true' : 'false'}>
                  {t.offer}
                </p>
              )}
              {t.offer && t.rejected && <span className="cv-offer-mark">{w.rejected}</span>}
            </li>
          ),
        )}
        {p.pending && (
          <li className="cv-dare cv-pending">
            <p>{w.writing}</p>
          </li>
        )}
      </ol>
      {p.safety}
      <div ref={end} />

      {herTurn && (
        <form
          className="cv-answer"
          onSubmit={(e) => {
            e.preventDefault();
            if (p.draft.trim()) p.onSend();
          }}
        >
          {/* the three ways on, together and equal; "זה לא מתאים לי" only when the response holds a suggestion not yet rejected */}
          {p.onSteer && lastTurn?.role === 'dare' && (
            <div className="cv-steer" role="group" aria-label={w.steerLabel}>
              <button type="button" className="cv-offer-no" onClick={() => p.onSteer?.('deepen')}>
                {w.deepen}
              </button>
              <button type="button" className="cv-offer-no" onClick={() => p.onSteer?.('shift')}>
                {w.shift}
              </button>
              {lastTurn?.offer && !lastTurn.rejected && (
                <button type="button" className="cv-offer-no" onClick={p.onReject}>
                  {w.notForMe}
                </button>
              )}
            </div>
          )}
          <label className="dm-visually-hidden" htmlFor={`${p.titleId}-answer`}>
            {w.write}
          </label>
          <textarea id={`${p.titleId}-answer`} rows={3} placeholder={w.write} value={p.draft} onChange={(e) => p.onDraft(e.target.value)} />
          <div className="cv-actions">
            <button type="submit" className="dm-btn dm-btn-primary" disabled={!p.draft.trim()}>
              {w.send}
            </button>
            <button type="button" className="dm-btn" onClick={p.onMoveOn}>
              {w.moveOn}
            </button>
            {p.onFinish && p.canFinish && (
              <button type="button" className="dm-btn" onClick={p.onFinish}>
                {w.finish}
              </button>
            )}
          </div>
        </form>
      )}
      {p.closed && !p.pending && !p.explored && (
        <div className="cv-actions">
          <button type="button" className="dm-btn" onClick={p.onMoveOn}>
            {w.toMap}
          </button>
          {p.onFinish && (
            <button type="button" className="dm-btn dm-btn-primary" onClick={p.onFinish}>
              {w.finish}
            </button>
          )}
        </div>
      )}
      {!p.safetyBlocks && (
      <p className="cv-state" data-state={state} role="status">
        {p.closed && !p.pending && !p.explored ? w.closedNote : state === 'writing' ? w.writing : state === 'waiting' ? w.waiting(Boolean(p.onFinish && p.canFinish)) : state === 'done' ? w.done : p.turns.length ? w.open(Boolean(p.onFinish && p.canFinish)) : ''}
      </p>
      )}
      {p.note && <p className="cv-note">{p.note}</p>}
    </div>
  );
}
