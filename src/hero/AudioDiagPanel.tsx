import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { RecordingDiag } from './audioRecordingDiag';

export interface UploadDiag {
  stage: 'idle' | 'uploading' | 'done';
  payloadBytes?: number;
  payloadType?: string;
  httpStatus?: number | null;
  transcript?: string;
  errorMessage?: string;
  rawBody?: unknown;
}

interface AudioDiagPanelProps {
  diag: RecordingDiag | null;
  audioBlob: Blob | null;
  upload: UploadDiag;
}

const row: React.CSSProperties = { margin: '2px 0' };
const label: React.CSSProperties = { color: '#8CFF6B', opacity: 0.75 };

/**
 * Real-device recording diagnostic — only mounted (see HoldToRemember.tsx)
 * when the page is loaded with ?audioDiag=1. Never part of the normal
 * user journey. Exists purely to answer one question with hard evidence:
 * did MediaRecorder actually capture audible speech, or is the recorded
 * blob itself the problem (as opposed to anything about uploading it or
 * OpenAI transcribing it).
 */
export default function AudioDiagPanel({ diag, audioBlob, upload }: AudioDiagPanelProps) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!audioBlob) {
      setAudioUrl(null);
      return;
    }
    const url = URL.createObjectURL(audioBlob);
    setAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [audioBlob]);

  // Rendered via a portal straight onto document.body: this component is
  // otherwise mounted deep inside .hold-to-remember, which (like several
  // ancestors in this animation-heavy tree) carries a CSS transform for
  // its own purposes — and a transformed ancestor becomes the containing
  // block for any position:fixed descendant, silently confining what
  // should be a full-viewport overlay to that ancestor's own box instead.
  // A portal escapes that entirely, so this reliably pins to the real
  // viewport regardless of what the rest of the tree is doing.
  return createPortal(
    <div
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        maxHeight: '70vh',
        overflowY: 'auto',
        background: 'rgba(0,0,0,0.92)',
        color: '#e8e8e8',
        font: '11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace',
        padding: '10px 12px calc(10px + env(safe-area-inset-bottom, 0px))',
        zIndex: 2147483647,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        borderTop: '2px solid #8CFF6B',
      }}
    >
      <div style={{ ...row, color: '#8CFF6B', fontWeight: 'bold' }}>AUDIO DIAGNOSTIC (?audioDiag=1)</div>

      {audioUrl && (
        <div style={{ margin: '8px 0' }}>
          <div style={label}>PLAYBACK — press play and listen for your voice:</div>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio controls src={audioUrl} style={{ width: '100%', marginTop: 4 }} />
        </div>
      )}

      {!diag && <div style={row}>No recording finished yet.</div>}

      {diag && (
        <>
          <div style={row}>
            <span style={label}>requested mimeType:</span> {diag.requestedMimeType}
          </div>
          <div style={row}>
            <span style={label}>actual mimeType:</span> {diag.actualMimeType}
          </div>
          <div style={row}>
            <span style={label}>started with timeslice:</span> {String(diag.startedWithTimeslice)}
            {' '}(no timeslice = ondataavailable fires once, at stop)
          </div>
          <div style={row}>
            <span style={label}>chunk count:</span> {diag.chunkSizes.length}
          </div>
          <div style={row}>
            <span style={label}>chunk sizes:</span> [{diag.chunkSizes.join(', ')}]
          </div>
          <div style={row}>
            <span style={label}>chunk types:</span> [{diag.chunkTypes.join(', ')}]
          </div>
          <div style={row}>
            <span style={label}>total bytes from chunks:</span> {diag.totalBytesFromChunks}
          </div>
          <div style={row}>
            <span style={label}>blob size:</span> {diag.blobSize} bytes{diag.blobSize === 0 ? '  ⚠️ EMPTY BLOB' : ''}
          </div>
          <div style={row}>
            <span style={label}>blob type:</span> {diag.blobType}
          </div>
          <div style={row}>
            <span style={label}>duration:</span> {Math.round(diag.durationMs)}ms
          </div>
          <div style={row}>
            <span style={label}>track @ start (live/capturing):</span>{' '}
            {diag.trackAtStart
              ? `readyState=${diag.trackAtStart.readyState} enabled=${diag.trackAtStart.enabled} muted=${diag.trackAtStart.muted} live=${diag.trackAtStart.live}`
              : 'none'}
          </div>
          <div style={row}>
            <span style={label}>track @ stop (after our own teardown):</span>{' '}
            {diag.trackAtStop
              ? `readyState=${diag.trackAtStop.readyState} enabled=${diag.trackAtStop.enabled} muted=${diag.trackAtStop.muted} live=${diag.trackAtStop.live}`
              : 'none'}
          </div>
          <div style={row}>
            <span style={label}>stream.active @ stop:</span> {String(diag.streamActiveAtStop)}
          </div>
          <div style={{ ...row, marginTop: 6 }}>
            <span style={label}>event log:</span>
          </div>
          {diag.events.map((e, i) => (
            <div key={i} style={{ paddingLeft: 8 }}>
              {e}
            </div>
          ))}
        </>
      )}

      <div style={{ ...row, marginTop: 10, color: '#8CFF6B', fontWeight: 'bold' }}>UPLOAD / TRANSCRIPTION</div>
      <div style={row}>
        <span style={label}>stage:</span> {upload.stage}
      </div>
      {upload.payloadBytes !== undefined && (
        <div style={row}>
          <span style={label}>payload size:</span> {upload.payloadBytes} bytes
        </div>
      )}
      {upload.payloadType !== undefined && (
        <div style={row}>
          <span style={label}>payload type:</span> {upload.payloadType}
        </div>
      )}
      {upload.httpStatus !== undefined && (
        <div style={row}>
          <span style={label}>server response status:</span> {String(upload.httpStatus)}
        </div>
      )}
      {upload.transcript !== undefined && (
        <div style={row}>
          <span style={label}>returned transcript:</span> "{upload.transcript}"
        </div>
      )}
      {upload.errorMessage !== undefined && (
        <div style={row}>
          <span style={label}>error message:</span> {upload.errorMessage}
        </div>
      )}
      {upload.rawBody !== undefined && (
        <div style={row}>
          <span style={label}>raw error body:</span> {JSON.stringify(upload.rawBody)}
        </div>
      )}
    </div>,
    document.body,
  );
}
