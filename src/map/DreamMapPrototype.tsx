import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DreamMap, { type WholeViewPhase } from './DreamMap';
import MapDialog from './MapDialog';
import { SYNTHETIC_DREAMS } from './syntheticDreams';
import type { MapDream, WholeView } from './mapTypes';
import {
  answerMoment,
  basedOnKey,
  beginMoment,
  completeMoment,
  createExploration,
  receiveReply,
  receiveWholeView,
  exploredInOrder,
  type Exploration,
} from '../hero/exploration';
import {
  clearAllOpenJourneys,
  createIndexedDbBackend,
  createOpenJourneyStore,
  unavailableOpenJourneyStore,
  type OpenJourneySnapshot,
  type OpenJourneyStore,
} from '../hero/openJourneyStore';

/** The plan's limit: one whole view and two updates per dream. */
const MAX_WHOLE_VIEWS = 3;
/** How long the prototype pretends a model call takes (the real calls take about 2-5 seconds). */
const FAKE_CALL_MS = 1600;
const DAY_MS = 24 * 60 * 60 * 1000;

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));

function findView(dream: MapDream, explored: string[]): WholeView | null {
  return dream.wholeViews.find((v) => sameSet(v.basedOn, explored)) ?? null;
}

const params = new URLSearchParams(window.location.search);
const openWithWholeView = params.get('whole') === '1';

// ------------------------------------------------------------------------------------------------ demo of the open-journey store
// (stage 3a). Two pretend accounts on this browser; "sign out" and "8 days later" act on the REAL encrypted IndexedDB store.

const DEMO_USERS = { a: 'demo-account-a', b: 'demo-account-b' } as const;
type DemoUser = keyof typeof DEMO_USERS;
const SESSION_USER = 'dmp.demoUser';
const SESSION_OFFSET = 'dmp.demoTimeOffset';

const readSession = (key: string): string | null => {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
};
const writeSession = (key: string, value: string | null) => {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    /* demo only */
  }
};

function makeStore(timeOffset: number): OpenJourneyStore {
  const g = globalThis as { indexedDB?: IDBFactory; crypto?: Crypto };
  if (params.get('nostore') === '1' || !g.indexedDB || !g.crypto?.subtle) return unavailableOpenJourneyStore;
  const c = g.crypto;
  return createOpenJourneyStore({ backend: createIndexedDbBackend(g.indexedDB), subtle: c.subtle, random: (b) => c.getRandomValues(b), now: () => Date.now() + timeOffset });
}

/** The prototype's state as a real Exploration (synthetic texts), so the real store saves exactly what the journey will save. */
function explorationFromPrototype(dream: MapDream, explored: string[], shown: WholeView | null): Exploration {
  let e = createExploration(`proto-${dream.key}`, dream.moments.map((m) => ({ label: m.title, excerpt: m.excerpt, pregeneratedQuestion: m.question })));
  for (const id of explored) {
    const m = dream.moments.find((x) => x.id === id);
    if (!m) continue;
    e = beginMoment(e, id, m.question, 'adaptive');
    e = answerMoment(e, id, m.answer);
    e = receiveReply(e, id, { observation: m.insight.full, reflection: m.answer, possibility: m.insight.headline }, null);
    e = completeMoment(e, id);
  }
  if (shown && sameSet(shown.basedOn, explored)) e = receiveWholeView(e, shown, basedOnKey(e));
  return e;
}

/** The dream's one picture as binary, drawn from the image already on the page (no request, no new picture). */
function pictureAsBlob(src: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext('2d')?.drawImage(img, 0, 0);
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

interface Resumable {
  dreamKey: string;
  explored: string[];
  wholeViewShown: boolean;
  image: Blob | null;
  expiresAt: number;
}

/**
 * PROTOTYPE SHELL (design review only): the toolbar (sample dream, reduced motion, reset; and the open-journey demo: pretend account,
 * sign out, 8 days later) and, below it, one session of the map.
 * URL options: ?dream=rich-he|short-he|two-he|sensitive-he|rich-en, &whole=1, &motion=reduced, &nostore=1 (storage unavailable).
 */
export default function DreamMapPrototype() {
  const [dreamKey, setDreamKey] = useState(() => {
    const asked = params.get('dream');
    return SYNTHETIC_DREAMS.some((d) => d.key === asked) ? (asked as string) : SYNTHETIC_DREAMS[0].key;
  });
  const dream = useMemo(() => SYNTHETIC_DREAMS.find((d) => d.key === dreamKey) ?? SYNTHETIC_DREAMS[0], [dreamKey]);
  const [reducedMotion, setReducedMotion] = useState(params.get('motion') === 'reduced');
  const [runId, setRunId] = useState(0);
  const [demoUser, setDemoUser] = useState<DemoUser>(() => (readSession(SESSION_USER) === 'b' ? 'b' : 'a'));
  const [timeOffset, setTimeOffset] = useState(() => Number(readSession(SESSION_OFFSET)) || 0);
  const store = useMemo(() => makeStore(timeOffset), [timeOffset]);
  const [resumable, setResumable] = useState<Resumable | null>(null);
  const [restored, setRestored] = useState<Resumable | null>(null);
  const [status, setStatus] = useState('');

  // On load and on every change of account / clock: drop expired journeys, then offer this account's own unfinished one.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await store.purgeExpired();
      const loaded = await store.load(DEMO_USERS[demoUser]);
      if (cancelled) return;
      const key = loaded?.snapshot.attemptId.replace(/^proto-/, '');
      if (loaded && key && SYNTHETIC_DREAMS.some((d) => d.key === key)) {
        setResumable({
          dreamKey: key,
          explored: exploredInOrder(loaded.snapshot.exploration).map((x) => x.moment.id),
          wholeViewShown: loaded.snapshot.exploration.wholeView !== null,
          image: loaded.image,
          expiresAt: loaded.expiresAt,
        });
      } else {
        setResumable(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [store, demoUser]);

  // The page's own language and direction follow the dream's (an external system: the document element).
  useEffect(() => {
    document.documentElement.lang = dream.language;
    document.documentElement.dir = dream.language === 'he' ? 'rtl' : 'ltr';
    document.title = dream.language === 'he' ? 'מפת החלום · אבטיפוס' : 'Dream map · prototype';
  }, [dream.language]);

  const he = dream.language === 'he';
  const imageRef = useRef<Blob | null>(null);

  const saveJourney = useCallback(
    async (d: MapDream, explored: string[], shown: WholeView | null) => {
      if (!store.available) {
        setStatus(he ? 'אחסון לא זמין: המסע ממשיך בלי שמירה מקומית' : 'Storage unavailable: the journey goes on without a local copy');
        return;
      }
      const snapshot: OpenJourneySnapshot = {
        attemptId: `proto-${d.key}`,
        language: d.language,
        inputMode: 'text',
        analysis: { sourceText: d.sourceText },
        corrections: [],
        emotions: [],
        exploration: explorationFromPrototype(d, explored, shown),
        step: 'map',
        draft: null,
      };
      // The picture is sent only when the store starts a new record (it asks for it); otherwise the stored one is kept.
      let result = await store.save(DEMO_USERS[demoUser], snapshot);
      if (result === 'needs-image') {
        if (imageRef.current === null) imageRef.current = await pictureAsBlob(d.imageSrc);
        result = await store.save(DEMO_USERS[demoUser], snapshot, imageRef.current);
      }
      const ok = result === 'saved';
      const time = new Date().toLocaleTimeString(he ? 'he-IL' : 'en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setStatus(ok ? (he ? `המסע נשמר מוצפן בדפדפן (${time})` : `Journey saved, encrypted, in this browser (${time})`) : he ? 'השמירה המקומית לא הצליחה; המסע ממשיך' : 'Local save failed; the journey goes on');
    },
    [store, demoUser, he],
  );

  const continueResume = () => {
    if (!resumable) return;
    setDreamKey(resumable.dreamKey);
    setRestored(resumable);
    setResumable(null);
    setRunId((n) => n + 1);
    setStatus(he ? 'המסע שוחזר מהאחסון המוצפן, כולל התמונה' : 'Journey restored from encrypted storage, picture included');
  };

  const discardResume = async () => {
    await store.discard(DEMO_USERS[demoUser]);
    setResumable(null);
    setStatus(he ? 'הטיוטה נמחקה' : 'Draft deleted');
  };

  const restoredImageUrl = useMemo(() => (restored?.image ? URL.createObjectURL(restored.image) : null), [restored]);
  useEffect(() => () => {
    if (restoredImageUrl) URL.revokeObjectURL(restoredImageUrl);
  }, [restoredImageUrl]);

  const sessionDream = restored && restored.dreamKey === dream.key && restoredImageUrl ? { ...dream, imageSrc: restoredImageUrl } : dream;

  return (
    <>
      <div className="dmp-bar" dir={he ? 'rtl' : 'ltr'} lang={he ? 'he' : 'en'}>
        <strong className="dmp-badge">{he ? 'אבטיפוס · נתונים סינתטיים · לא מחובר למערכת' : 'Prototype · synthetic data · not connected'}</strong>
        <label className="dmp-field">
          <span>{he ? 'חלום לדוגמה' : 'Sample dream'}</span>
          <select
            value={dreamKey}
            onChange={(e) => {
              setRestored(null);
              imageRef.current = null;
              setDreamKey(e.target.value);
            }}
          >
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
        <button
          type="button"
          className="dmp-reset"
          onClick={() => {
            setRestored(null);
            imageRef.current = null;
            setRunId((n) => n + 1);
          }}
        >
          {he ? 'איפוס' : 'Reset'}
        </button>
      </div>
      <div className="dmp-bar dmp-bar-demo" dir={he ? 'rtl' : 'ltr'} lang={he ? 'he' : 'en'}>
        <strong className="dmp-badge">{he ? 'הדגמת מסע פתוח (7 ימים, מוצפן):' : 'Open-journey demo (7 days, encrypted):'}</strong>
        <label className="dmp-field">
          <span>{he ? 'חשבון לדוגמה' : 'Pretend account'}</span>
          <select
            value={demoUser}
            onChange={(e) => {
              const next = e.target.value === 'b' ? 'b' : 'a';
              writeSession(SESSION_USER, next);
              setRestored(null);
              imageRef.current = null;
              setDemoUser(next);
              setStatus('');
            }}
          >
            <option value="a">{he ? 'חשבון א' : 'Account A'}</option>
            <option value="b">{he ? 'חשבון ב' : 'Account B'}</option>
          </select>
        </label>
        <button
          type="button"
          className="dmp-reset"
          onClick={async () => {
            await clearAllOpenJourneys();
            setResumable(null);
            setRestored(null);
            imageRef.current = null;
            setStatus(he ? 'יציאה מהחשבון: כל המסעות הפתוחים בדפדפן נמחקו, כולל המפתחות' : 'Signed out: every open journey in this browser was deleted, keys included');
          }}
        >
          {he ? 'יציאה מהחשבון' : 'Sign out'}
        </button>
        <button
          type="button"
          className="dmp-reset"
          onClick={() => {
            const next = timeOffset + 8 * DAY_MS;
            writeSession(SESSION_OFFSET, String(next));
            setTimeOffset(next);
            setStatus(he ? 'השעון קפץ 8 ימים קדימה' : 'The clock jumped 8 days ahead');
          }}
        >
          {he ? '8 ימים אחר כך' : '8 days later'}
        </button>
        {timeOffset > 0 && (
          <button
            type="button"
            className="dmp-reset"
            onClick={() => {
              writeSession(SESSION_OFFSET, null);
              setTimeOffset(0);
              setStatus('');
            }}
          >
            {he ? 'שעון רגיל' : 'Normal clock'}
          </button>
        )}
        <span className="dmp-status" role="status" aria-live="polite">
          {status}
        </span>
      </div>
      {/* A new key = a fresh session: changing the sample dream, Reset, or continuing a stored journey. */}
      <PrototypeSession
        key={`${dream.key}-${runId}`}
        dream={sessionDream}
        reducedMotion={reducedMotion}
        initialExplored={restored && restored.dreamKey === dream.key ? restored.explored : null}
        initialWholeView={restored && restored.dreamKey === dream.key ? restored.wholeViewShown : false}
        onChange={saveJourney}
      />
      <MapDialog open={resumable !== null} onClose={() => setResumable(null)} labelledBy="dmp-resume-title" closeLabel={he ? 'סגירה' : 'Close'}>
        <div className="dm-detail">
          <h2 id="dmp-resume-title" className="dm-dialog-title">
            {he ? 'יש חלום שלא הסתיים' : 'A dream journey is unfinished'}
          </h2>
          <p className="dm-muted">
            {resumable &&
              (he
                ? `נחקרו בו ${resumable.explored.length} רגעים. הוא נשמר מוצפן בדפדפן הזה בלבד, עד ${new Date(resumable.expiresAt).toLocaleDateString('he-IL')}.`
                : `${resumable.explored.length} moments explored. Kept encrypted in this browser only, until ${new Date(resumable.expiresAt).toLocaleDateString('en-GB')}.`)}
          </p>
          <div className="dmp-actions">
            <button type="button" className="dm-btn dm-btn-primary" onClick={continueResume}>
              {he ? 'להמשיך' : 'Continue'}
            </button>
            <button type="button" className="dm-btn" onClick={discardResume}>
              {he ? 'למחוק' : 'Delete'}
            </button>
          </div>
        </div>
      </MapDialog>
    </>
  );
}

/**
 * Holds the state the real journey will hold later, and plays it with synthetic data: exploring a moment and revealing / updating the
 * whole view only wait a moment and then show text written in advance. No request leaves the page: no model, no database, no credit.
 * Every change by the dreamer is handed to onChange, which keeps the open journey in the encrypted browser store.
 */
function PrototypeSession({
  dream,
  reducedMotion,
  initialExplored,
  initialWholeView,
  onChange,
}: {
  dream: MapDream;
  reducedMotion: boolean;
  initialExplored: string[] | null;
  initialWholeView: boolean;
  onChange: (dream: MapDream, explored: string[], shown: WholeView | null) => void;
}) {
  const startExplored = initialExplored ?? dream.initiallyExplored;
  const startShown = initialExplored ? initialWholeView : openWithWholeView;
  const [explored, setExplored] = useState<string[]>(startExplored);
  const [exploringId, setExploringId] = useState<string | null>(null);
  const [shownView, setShownView] = useState<WholeView | null>(() => (startShown ? findView(dream, startExplored) : null));
  const [phase, setPhase] = useState<WholeViewPhase>(startShown ? 'shown' : 'idle');
  const [generations, setGenerations] = useState(startShown ? 1 : 0);
  const [noSample, setNoSample] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const changed = useRef(false);
  // The latest save function, so switching the account or the clock never re-saves by itself: only the dreamer's own steps do.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Saved only after the dreamer actually did something (opening the page alone writes nothing).
  useEffect(() => {
    if (!changed.current) return;
    onChangeRef.current(dream, explored, phase === 'shown' ? shownView : null);
  }, [dream, explored, shownView, phase]);

  const pause = () => new Promise<void>((resolve) => setTimeout(resolve, reducedMotion ? 400 : FAKE_CALL_MS));

  const explore = async (id: string) => {
    if (exploringId || explored.includes(id)) return;
    setExploringId(id);
    await pause();
    changed.current = true;
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
    changed.current = true;
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
