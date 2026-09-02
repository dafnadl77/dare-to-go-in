import { useEffect, useState } from 'react';
import { getDiagLog, subscribeDiag, type DiagEvent } from './speechDiag';

/**
 * Diagnostic-only, opt-in readout of the HOLD → mic → speech-recognition
 * event log — only mounted (see HeroDream.tsx) when the page is loaded
 * with ?diaglog=1. Never rendered for a normal visit; exists purely so a
 * real-device test can be read straight off the phone's own screen and
 * reported back verbatim, without needing a computer + USB debugging.
 */
export default function SpeechDiagPanel() {
  const [events, setEvents] = useState<DiagEvent[]>(() => getDiagLog());

  useEffect(() => subscribeDiag((e) => setEvents((prev) => [...prev.slice(-59), e])), []);

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        maxHeight: '36vh',
        overflowY: 'auto',
        background: 'rgba(0,0,0,0.88)',
        color: '#8CFF6B',
        font: '10px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace',
        padding: '6px 8px calc(6px + env(safe-area-inset-bottom, 0px))',
        zIndex: 2147483647,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        pointerEvents: 'none',
        borderTop: '1px solid rgba(140,255,107,0.35)',
      }}
    >
      {events.length === 0 ? (
        <div>diag: waiting for events…</div>
      ) : (
        events.map((e, i) => (
          <div key={i}>
            +{e.t}ms {e.type}
            {e.detail ? ' ' + JSON.stringify(e.detail) : ''}
          </div>
        ))
      )}
    </div>
  );
}
