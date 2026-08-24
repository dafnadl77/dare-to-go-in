import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import type { HoldState } from './HoldState';
import './HoldToRemember.css';

interface HoldToRememberProps {
  revealed: boolean;
  holdRef: RefObject<HoldState>;
}

type Mode = 'hold' | 'typing' | 'done';

const FILL_MS = 800;
const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function HoldToRemember({ revealed, holdRef }: HoldToRememberProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const ringRef = useRef<SVGCircleElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isHolding, setIsHolding] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [mode, setMode] = useState<Mode>('hold');
  const [entry, setEntry] = useState('');
  const rafRef = useRef(0);
  const startRef = useRef(0);
  const listenTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const tick = useCallback(() => {
    const elapsed = performance.now() - startRef.current;
    const progress = Math.min(1, elapsed / FILL_MS);
    if (holdRef.current) holdRef.current.progress = progress;
    if (ringRef.current) {
      ringRef.current.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - progress));
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [holdRef]);

  const beginHold = useCallback(() => {
    if (mode !== 'hold') return;
    const btn = buttonRef.current;
    if (btn && holdRef.current) {
      const rect = btn.getBoundingClientRect();
      holdRef.current.cx = rect.left + rect.width / 2;
      holdRef.current.cy = rect.top + rect.height / 2;
      holdRef.current.active = true;
      holdRef.current.progress = 0;
    }
    startRef.current = performance.now();
    setIsHolding(true);
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
    listenTimerRef.current = setTimeout(() => setIsListening(true), FILL_MS);
  }, [mode, holdRef, tick]);

  const endHold = useCallback(() => {
    if (!holdRef.current?.active) return;
    setIsHolding(false);
    setIsListening(false);
    holdRef.current.active = false;
    clearTimeout(listenTimerRef.current);
    cancelAnimationFrame(rafRef.current);

    const decay = () => {
      if (!holdRef.current) return;
      holdRef.current.progress *= 0.9;
      if (ringRef.current) {
        const p = holdRef.current.progress;
        ringRef.current.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - p));
      }
      if (holdRef.current.progress > 0.01) {
        rafRef.current = requestAnimationFrame(decay);
      } else if (holdRef.current) {
        holdRef.current.progress = 0;
        if (ringRef.current) ringRef.current.style.strokeDashoffset = String(CIRCUMFERENCE);
      }
    };
    rafRef.current = requestAnimationFrame(decay);
  }, [holdRef]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      clearTimeout(listenTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (mode === 'typing') {
      textareaRef.current?.focus();
    }
  }, [mode]);

  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ' ') && !isHolding) {
      e.preventDefault();
      beginHold();
    }
  };
  const handleKeyUp = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      endHold();
    }
  };

  const handleEntryChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setEntry(e.target.value);
  };

  const handleBack = () => {
    setMode('hold');
    setEntry('');
  };

  const handleDone = () => {
    setMode('done');
  };

  const isHoldFaded = mode !== 'hold';

  return (
    <div className={`hold-to-remember${revealed ? ' is-revealed' : ''} is-mode-${mode}`}>
      <button
        ref={buttonRef}
        type="button"
        className={`htr-circle${isHolding ? ' is-holding' : ''}${isListening ? ' is-listening' : ''}`}
        data-cursor-hover
        tabIndex={isHoldFaded ? -1 : 0}
        aria-hidden={isHoldFaded}
        onPointerDown={(e) => {
          e.preventDefault();
          beginHold();
        }}
        onPointerUp={endHold}
        onPointerLeave={endHold}
        onPointerCancel={endHold}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        aria-label="Hold to tell me about your dream"
      >
        <svg className="htr-ring" viewBox="0 0 96 96" aria-hidden="true">
          <circle className="htr-ring-track" cx="48" cy="48" r={RADIUS} />
          <circle
            ref={ringRef}
            className="htr-ring-fill"
            cx="48"
            cy="48"
            r={RADIUS}
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE}
          />
        </svg>

        <span className="htr-waveform" aria-hidden="true">
          {Array.from({ length: 7 }).map((_, i) => (
            <span key={i} className="htr-bar" style={{ '--bi': i } as CSSProperties} />
          ))}
        </span>

        <span className="htr-label">{isListening ? 'LISTENING…' : 'HOLD TO TELL ME'}</span>
      </button>

      <button
        type="button"
        className="htr-type-link"
        data-cursor-hover
        tabIndex={isHoldFaded ? -1 : 0}
        aria-hidden={isHoldFaded}
        onClick={() => setMode('typing')}
      >
        I&rsquo;D RATHER TYPE
      </button>

      <div
        className={`central-typing${mode === 'typing' ? ' is-active' : ''}`}
        aria-hidden={mode !== 'typing'}
      >
        <p className="central-typing-heading">TELL ME WHAT HAPPENED.</p>
        <textarea
          ref={textareaRef}
          className="central-typing-textarea"
          placeholder="Start with anything you remember..."
          value={entry}
          onChange={handleEntryChange}
          tabIndex={mode === 'typing' ? 0 : -1}
          rows={4}
          dir="auto"
        />
        <div className="central-typing-actions">
          <button
            type="button"
            className="central-back"
            data-cursor-hover
            tabIndex={mode === 'typing' ? 0 : -1}
            onClick={handleBack}
          >
            ← Back
          </button>
          <button
            type="button"
            className="central-done"
            data-cursor-hover
            tabIndex={mode === 'typing' ? 0 : -1}
            onClick={handleDone}
          >
            I&rsquo;M DONE
          </button>
        </div>
      </div>

      <div
        className={`central-settled${mode === 'done' ? ' is-active' : ''}`}
        aria-hidden={mode !== 'done'}
      >
        <p className="central-settled-text">I THINK I HAVE IT.</p>
      </div>
    </div>
  );
}
