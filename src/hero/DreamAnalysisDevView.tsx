import type { ReactNode } from 'react';
import type { AnalysisResult } from './dreamAnalysis';
import './DreamAnalysisDevView.css';

interface DreamAnalysisDevViewProps {
  pending: boolean;
  result: AnalysisResult | null;
  onDismiss: () => void;
}

/**
 * TEMPORARY development/debug panel — NOT final UI. Exists only so the
 * Dream Analysis pipeline can be inspected while it's being built. Will
 * be removed once real Dream Reconstruction exists. Deliberately plain
 * (not styled to match the hero) so it never gets mistaken for it.
 */
export default function DreamAnalysisDevView({ pending, result, onDismiss }: DreamAnalysisDevViewProps) {
  if (!pending && !result) return null;

  return (
    <div className="dev-view" role="dialog" aria-label="Dream analysis development view">
      <div className="dev-view-panel">
        <div className="dev-view-header">
          <span className="dev-view-tag">DEVELOPMENT VIEW — WILL BE REMOVED</span>
          <button type="button" className="dev-view-close" onClick={onDismiss} aria-label="Close development view">
            ×
          </button>
        </div>

        {pending && <p className="dev-view-status">Analyzing dream…</p>}

        {!pending && result?.status === 'error' && (
          <div className="dev-view-error">
            <p className="dev-view-status">DREAM ANALYSIS UNAVAILABLE</p>
            <p className="dev-view-reason">reason: {result.reason}</p>
            <p className="dev-view-message">{result.message}</p>
          </div>
        )}

        {!pending && result?.status === 'ok' && (
          <div className="dev-view-result">
            <p className="dev-view-status">DREAM UNDERSTOOD</p>

            <Section title="SUMMARY">
              <p>{result.analysis.summary || '(none)'}</p>
            </Section>

            <Section title="PEOPLE">
              <List
                items={result.analysis.people}
                render={(p) => `${p.nameOrRole}${p.relationshipToDreamer ? ` — ${p.relationshipToDreamer}` : ''} (${p.explicit ? 'explicit' : 'inferred'}, ${p.confidence.toFixed(2)})`}
              />
            </Section>

            <Section title="PLACES">
              <List items={result.analysis.places} render={(p) => `${p.name} (${p.explicit ? 'explicit' : 'inferred'}, ${p.confidence.toFixed(2)})`} />
            </Section>

            <Section title="ACTIONS">
              <List
                items={result.analysis.actions}
                render={(a) => `${a.subject ?? '?'} ${a.action} ${a.target ?? ''} (${a.explicit ? 'explicit' : 'inferred'}, ${a.confidence.toFixed(2)})`}
              />
            </Section>

            <Section title="EMOTIONS">
              <List items={result.analysis.emotions} render={(e) => `${e.emotion} (${e.explicit ? 'explicit' : 'inferred'}, ${e.confidence.toFixed(2)})`} />
            </Section>

            <Section title="UNUSUAL ELEMENTS">
              <List items={result.analysis.unusualElements} render={(u) => u} />
            </Section>

            <Section title="SEQUENCE">
              <List items={result.analysis.sequence} render={(s) => `${s.order}. ${s.description}`} />
            </Section>

            <Section title="RECONSTRUCTION FOUNDATION">
              <pre className="dev-view-json">{JSON.stringify(result.analysis.reconstruction, null, 2)}</pre>
            </Section>

            <Section title="RAW JSON">
              <pre className="dev-view-json">{JSON.stringify(result.analysis, null, 2)}</pre>
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="dev-view-section">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

function List<T>({ items, render }: { items: T[]; render: (item: T) => string }) {
  if (items.length === 0) return <p className="dev-view-empty">(none)</p>;
  return (
    <ul>
      {items.map((item, i) => (
        <li key={i}>{render(item)}</li>
      ))}
    </ul>
  );
}
