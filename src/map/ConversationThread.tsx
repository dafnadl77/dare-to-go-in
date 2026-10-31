import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ConversationTurn } from '../hero/exploration';
import { threadWords } from './threadWords';
import { threadState } from './threadState';
import './conversation.css';

/**
 * A moment's conversation in its window on the map (doc 102): DARE and the dreamer, an angle offered apart with "זה לא מתאים לי",
 * her answer box, and the way on (another moment). Presentational only: the page that holds it decides what is sent and when.
 * After DARE's turn (2026-10-28): "להמשיך בכיוון" opens the writing box (nothing is asked of DARE), "לשנות כיוון" asks DARE for
 * another direction; the box is closed until then, and Enter sends (Shift+Enter is a new line), as does the small send button in it.
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
  /** "לשנות כיוון" (doc 117): DARE offers another direction. "להמשיך בכיוון" only opens the writing box, here. */
  onSteer?: (kind: 'shift') => void;
  onMoveOn: () => void;
  /** Another moment can still be explored: only then "לרגע אחר" (absent: shown, as on the development page). */
  canMoveOn?: boolean;
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
  const canMoveOn = p.canMoveOn !== false;
  const canFinish = Boolean(p.onFinish && p.canFinish);
  // the writing box opens with "להמשיך בכיוון"; a new turn closes it again. Without direction buttons, or when DARE has not answered
  // her last words yet (its answer failed), it stays open so she is never left without a way to write.
  const [writing, setWriting] = useState(false);
  useEffect(() => setWriting(false), [p.turns.length]);
  const steerRow = Boolean(p.onSteer) && lastTurn?.role === 'dare';
  const boxOpen = writing || !steerRow;
  const answerId = `${p.titleId}-answer`;

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
          {/* the ways on after DARE's turn, together and equal; "זה לא מתאים לי" only when the response holds a suggestion not yet rejected */}
          {steerRow && (
            <div className="cv-steer" role="group" aria-label={w.steerLabel}>
              <button type="button" className="cv-offer-no" aria-expanded={boxOpen} aria-controls={boxOpen ? answerId : undefined} onClick={() => setWriting(true)}>
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
          {boxOpen && (
            <>
              <label className="dm-visually-hidden" htmlFor={answerId}>
                {w.write}
              </label>
              <div className="cv-compose">
                <textarea
                  id={answerId}
                  rows={3}
                  placeholder={w.write}
                  value={p.draft}
                  enterKeyHint="send"
                  aria-describedby={`${answerId}-keys`}
                  autoFocus={writing}
                  onChange={(e) => p.onDraft(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter sends; Shift+Enter is a new line; a word still being composed (IME) is never sent half-way
                    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
                    e.preventDefault();
                    if (p.draft.trim()) p.onSend();
                  }}
                />
                {/* the send button (2026-10-30): the same as Enter, through the form's submit; a touch is enough on a phone */}
                <button type="submit" className="cv-send" aria-label={w.send} title={w.send} disabled={p.pending || !p.draft.trim()}>
                  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
                    <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
              <p id={`${answerId}-keys`} className="cv-keys">
                {w.keys}
              </p>
            </>
          )}
          {(canMoveOn || canFinish) && (
            <div className="cv-actions">
              {canMoveOn && (
                <button type="button" className="dm-btn" onClick={p.onMoveOn}>
                  {w.moveOn}
                </button>
              )}
              {canFinish && (
                <button type="button" className="dm-btn" onClick={p.onFinish}>
                  {w.finish}
                </button>
              )}
            </div>
          )}
        </form>
      )}
      {/* the moment's three questions are spent: DARE's closing line stands alone, then only the ways out — another moment when
          one is left, and always "what came up" */}
      {p.closed && !p.pending && !p.explored && (
        <div className="cv-actions">
          {canMoveOn && (
            <button type="button" className="dm-btn" onClick={p.onMoveOn}>
              {w.moveOn}
            </button>
          )}
          {p.onFinish && (
            <button type="button" className="dm-btn dm-btn-primary" onClick={p.onFinish}>
              {w.finish}
            </button>
          )}
        </div>
      )}
      {!p.safetyBlocks && (
      <p className="cv-state" data-state={state} role="status">
        {p.closed && !p.pending && !p.explored ? w.closedNote(canMoveOn) : state === 'writing' ? w.writing : state === 'waiting' ? w.waiting(canFinish, canMoveOn) : state === 'done' ? w.done : p.turns.length ? w.open(canFinish, canMoveOn) : ''}
      </p>
      )}
      {p.note && <p className="cv-note">{p.note}</p>}
    </div>
  );
}
