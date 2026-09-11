import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { useAccessibility } from './AccessibilityContext';
import './AccessibilityControl.css';

/** A restrained line-drawn accessibility pictogram (head/arms/torso/legs)
    — matches DreamAuth's GoogleMark in stroke weight/style rather than a
    borrowed icon-font glyph, so it reads as part of DARE's own visual
    language instead of a bolted-on generic accessibility-blue widget. */
function AccessibilityMark() {
  return (
    <svg className="a11y-mark" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="6" r="2" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M12 8v6M6 10h12M12 14l-3.5 5.5M12 14l3.5 5.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** One toggle row in the panel — a real button with a real aria-pressed
    state, not a styled checkbox pretending to be one. */
function ToggleRow({ label, pressed, onToggle }: { label: string; pressed: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="a11y-row a11y-toggle" aria-pressed={pressed} onClick={onToggle}>
      <span className="a11y-row-label">{label}</span>
      <span className="a11y-switch" data-on={pressed} aria-hidden="true">
        <span className="a11y-switch-knob" />
      </span>
    </button>
  );
}

/**
 * The floating accessibility control — fixed bottom-left on every screen
 * (mounted once, in App.tsx), a small real panel of working adjustments.
 * Never a fake "accessibility widget" claiming features that don't exist:
 * every control here does exactly what it says (see AccessibilityContext.tsx
 * and accessibility.css for the real, global effect each one has).
 */
export default function AccessibilityControl() {
  const { t } = useLanguage();
  const { textScale, highContrast, underlineLinks, reduceMotion, increaseText, decreaseText, setHighContrast, setUnderlineLinks, setReduceMotion, reset } =
    useAccessibility();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  return (
    <div className="a11y-control" ref={rootRef}>
      <button
        type="button"
        className="a11y-trigger"
        ref={triggerRef}
        data-cursor-hover
        aria-label={t('a11y.controlAriaLabel')}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="a11y-panel"
        onClick={() => setOpen((v) => !v)}
      >
        <AccessibilityMark />
      </button>

      {open && (
        <div id="a11y-panel" className="a11y-panel" role="dialog" aria-label={t('a11y.panelTitle')}>
          <p className="a11y-panel-title">{t('a11y.panelTitle')}</p>

          <div className="a11y-row a11y-text-size-row">
            <span className="a11y-row-label">{t('a11y.textSize')}</span>
            <span className="a11y-text-size-buttons">
              <button
                type="button"
                className="a11y-step-button"
                data-cursor-hover
                onClick={decreaseText}
                disabled={textScale === 0}
                aria-label={t('a11y.decreaseText')}
              >
                A−
              </button>
              <button
                type="button"
                className="a11y-step-button"
                data-cursor-hover
                onClick={increaseText}
                disabled={textScale === 2}
                aria-label={t('a11y.increaseText')}
              >
                A+
              </button>
            </span>
          </div>

          <ToggleRow label={t('a11y.highContrast')} pressed={highContrast} onToggle={() => setHighContrast(!highContrast)} />
          <ToggleRow label={t('a11y.underlineLinks')} pressed={underlineLinks} onToggle={() => setUnderlineLinks(!underlineLinks)} />
          <ToggleRow label={t('a11y.reduceMotion')} pressed={reduceMotion} onToggle={() => setReduceMotion(!reduceMotion)} />

          <button type="button" className="a11y-reset" data-cursor-hover onClick={reset}>
            {t('a11y.reset')}
          </button>
        </div>
      )}
    </div>
  );
}
