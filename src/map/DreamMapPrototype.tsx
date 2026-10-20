import { useEffect, useMemo, useState } from 'react';
import DreamMap, { type WholeViewPhase } from './DreamMap';
import { SYNTHETIC_DREAMS } from './syntheticDreams';
import type { MapDream, WholeView } from './mapTypes';

/** The plan's limit: one whole view and two updates per dream. */
const MAX_WHOLE_VIEWS = 3;
/** How long the prototype pretends a model call takes (the real calls take about 2-5 seconds). */
const FAKE_CALL_MS = 1600;

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));

function findView(dream: MapDream, explored: string[]): WholeView | null {
  return dream.wholeViews.find((v) => sameSet(v.basedOn, explored)) ?? null;
}

const params = new URLSearchParams(window.location.search);
const openWithWholeView = params.get('whole') === '1';

/**
 * PROTOTYPE SHELL (design review only): the toolbar (sample dream, reduced motion, reset) and, below it, one session of the map.
 * URL options: ?dream=rich-he|short-he|two-he|sensitive-he|rich-en, &whole=1 (open with the whole view shown), &motion=reduced.
 */
export default function DreamMapPrototype() {
  const [dreamKey, setDreamKey] = useState(() => {
    const asked = params.get('dream');
    return SYNTHETIC_DREAMS.some((d) => d.key === asked) ? (asked as string) : SYNTHETIC_DREAMS[0].key;
  });
  const dream = useMemo(() => SYNTHETIC_DREAMS.find((d) => d.key === dreamKey) ?? SYNTHETIC_DREAMS[0], [dreamKey]);
  const [reducedMotion, setReducedMotion] = useState(params.get('motion') === 'reduced');
  const [runId, setRunId] = useState(0);

  // The page's own language and direction follow the dream's (an external system: the document element).
  useEffect(() => {
    document.documentElement.lang = dream.language;
    document.documentElement.dir = dream.language === 'he' ? 'rtl' : 'ltr';
    document.title = dream.language === 'he' ? 'מפת החלום · אבטיפוס' : 'Dream map · prototype';
  }, [dream.language]);

  const he = dream.language === 'he';

  return (
    <>
      <div className="dmp-bar" dir={he ? 'rtl' : 'ltr'} lang={he ? 'he' : 'en'}>
        <strong className="dmp-badge">{he ? 'אבטיפוס · נתונים סינתטיים · לא מחובר למערכת' : 'Prototype · synthetic data · not connected'}</strong>
        <label className="dmp-field">
          <span>{he ? 'חלום לדוגמה' : 'Sample dream'}</span>
          <select value={dreamKey} onChange={(e) => setDreamKey(e.target.value)}>
            {SYNTHETIC_DREAMS.map((d) => (
              <option key={d.key} value={d.key}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <label className="dmp-field dmp-check">
          <input type="checkbox" checked={reducedMotion} onChange={(e) => setReducedMotion(e.target.checked)} />
          <span>{he ? 'תנועה מופחתת' : 'Reduced motion'}</span>
        </label>
        <button type="button" className="dmp-reset" onClick={() => setRunId((n) => n + 1)}>
          {he ? 'איפוס' : 'Reset'}
        </button>
      </div>
      {/* A new key = a fresh session: changing the sample dream or pressing Reset starts from the dream's opening state. */}
      <PrototypeSession key={`${dream.key}-${runId}`} dream={dream} reducedMotion={reducedMotion} />
    </>
  );
}

/**
 * Holds the state the real journey will hold later, and plays it with synthetic data: exploring a moment and revealing / updating the
 * whole view only wait a moment and then show text written in advance. No request leaves the page: no model, no database, no credit.
 */
function PrototypeSession({ dream, reducedMotion }: { dream: MapDream; reducedMotion: boolean }) {
  const [explored, setExplored] = useState<string[]>(dream.initiallyExplored);
  const [exploringId, setExploringId] = useState<string | null>(null);
  const [shownView, setShownView] = useState<WholeView | null>(() => (openWithWholeView ? findView(dream, dream.initiallyExplored) : null));
  const [phase, setPhase] = useState<WholeViewPhase>(openWithWholeView ? 'shown' : 'idle');
  const [generations, setGenerations] = useState(openWithWholeView ? 1 : 0);
  const [noSample, setNoSample] = useState(false);
  const [favorite, setFavorite] = useState(false);

  const pause = () => new Promise<void>((resolve) => setTimeout(resolve, reducedMotion ? 400 : FAKE_CALL_MS));

  const explore = async (id: string) => {
    if (exploringId || explored.includes(id)) return;
    setExploringId(id);
    await pause();
    setExplored((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setExploringId(null);
    // A new moment makes a fresh whole view possible again.
    setNoSample(false);
  };

  const writeWholeView = async () => {
    if (phase === 'revealing' || generations >= MAX_WHOLE_VIEWS) return;
    const view = findView(dream, explored);
    if (!view) {
      setNoSample(true);
      return;
    }
    setPhase('revealing');
    await pause();
    setShownView(view);
    setNoSample(false);
    setGenerations((g) => g + 1);
    setPhase('shown');
  };

  const stale = phase === 'shown' && shownView !== null && !sameSet(shownView.basedOn, explored);

  return (
    <DreamMap
      dream={dream}
      explored={explored}
      exploringId={exploringId}
      wholeView={shownView}
      wholeViewPhase={phase}
      wholeViewStale={stale}
      updatesLeft={MAX_WHOLE_VIEWS - generations}
      noSampleForSet={noSample && stale}
      favorite={favorite}
      reducedMotion={reducedMotion}
      onExplore={explore}
      onRevealWhole={writeWholeView}
      onUpdateWhole={writeWholeView}
      onToggleFavorite={() => setFavorite((v) => !v)}
      onBack={() => {}}
    />
  );
}
