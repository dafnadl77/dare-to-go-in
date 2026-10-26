import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import DreamStageBackground from '../hero/DreamStageBackground';
import { SCENARIOS, SOURCE_LABEL, voice, type LineSource, type Scenario, type Step, type Turn } from './pairConversationScript';
import './DreamMap.css';
import './pairConversation.css';

/**
 * PAIR-AND-QUESTION design page (doc 90 v3): a whole conversation, moment by moment, with the two-details block and the whole view,
 * in the dream map's look (night plates, gold edges, the app's outline buttons, the cloud background). Scripted from saved runs;
 * no model, no network, nothing saved. Development only.
 */

type PairChoice = 'answer' | 'skip' | null;
type PairTurn = Extract<Turn, { kind: 'pair' }>;

const ACCENTS = { '--dm-accent-1': '120, 150, 210', '--dm-accent-2': '150, 120, 200', '--dm-accent-3': '210, 180, 130' };

function readParams() {
  const p = new URLSearchParams(window.location.search);
  const s = p.get('s');
  return {
    key: (SCENARIOS.find((x) => x.key === s)?.key ?? 'store') as Scenario['key'],
    all: p.get('all') === '1',
    sources: p.get('src') === '1',
  };
}

function pairOf(step: Step): PairTurn | undefined {
  return step.turns.find((t): t is PairTurn => t.kind === 'pair');
}

export default function PairConversation() {
  const initial = useMemo(readParams, []);
  const [key, setKey] = useState<Scenario['key']>(initial.key);
  const [showAll, setShowAll] = useState(initial.all);
  const [sources, setSources] = useState(initial.sources);
  const [shown, setShown] = useState(1);
  const [choice, setChoice] = useState<PairChoice>(null);
  const [draft, setDraft] = useState('');
  const [typed, setTyped] = useState<string | null>(null);
  const lastStepRef = useRef<HTMLLIElement>(null);
  const firstRender = useRef(true);

  const scenario = SCENARIOS.find((s) => s.key === key)!;
  const v = voice(scenario.address);
  const pairIndex = scenario.steps.findIndex((s) => pairOf(s));
  const pair = pairIndex >= 0 ? pairOf(scenario.steps[pairIndex]) : undefined;

  const effectiveChoice: PairChoice = choice ?? (showAll && pair?.answer ? 'answer' : null);
  const herPairAnswer = pair?.answer ? pair.answer.text : typed;
  const pairAnswered = effectiveChoice === 'answer' && !!herPairAnswer;
  const pairResolved = effectiveChoice === 'skip' || pairAnswered;

  const visible = showAll ? scenario.steps.length : shown;
  const waitingOnPair = pair !== undefined && pairIndex < visible && !pairResolved && !showAll;
  const done = visible >= scenario.steps.length;

  function reset(nextKey: Scenario['key'] = key) {
    setKey(nextKey);
    setShown(1);
    setChoice(null);
    setDraft('');
    setTyped(null);
  }

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (showAll) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    lastStepRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }, [shown, key, showAll]);

  const explored = (upTo: number) =>
    scenario.steps
      .slice(0, upTo)
      .map((s) => s.moment)
      .filter((m) => m !== 'whole');

  function Src({ src }: { src: LineSource }) {
    if (!sources) return null;
    return <span className="pc-src">{SOURCE_LABEL[src]}</span>;
  }

  function renderTurn(turn: Turn, stepIndex: number, i: number) {
    switch (turn.kind) {
      case 'choose': {
        const before = explored(stepIndex);
        return (
          <div className="pc-turn pc-dare" key={i}>
            <p className="pc-dare-text">{stepIndex === 0 ? v.first : v.next}</p>
            <ul className="pc-chips" aria-label="רגעים מהחלום">
              {scenario.labels.map((label) => {
                const state = label === turn.picked ? 'picked' : before.includes(label) ? 'explored' : 'open';
                return (
                  <li key={label} className="pc-chip" data-state={state}>
                    {state === 'explored' && <span aria-hidden="true">✓ </span>}
                    {label}
                    {state === 'explored' && <span className="dm-visually-hidden"> (נחקר)</span>}
                  </li>
                );
              })}
              {stepIndex > 0 && (
                <li className="pc-chip pc-chip-whole" data-state={turn.picked === 'whole' ? 'picked' : 'open'}>
                  המבט השלם
                </li>
              )}
            </ul>
            <Src src={turn.src} />
          </div>
        );
      }
      case 'ask':
        return (
          <div className="pc-turn pc-dare" key={i}>
            <p className="pc-ask">{turn.text}</p>
            <Src src={turn.src} />
          </div>
        );
      case 'answer':
        return (
          <div className="pc-turn pc-her" key={i}>
            <p className="dm-own-words">{turn.text}</p>
            <Src src={turn.src} />
          </div>
        );
      case 'reflect':
        return (
          <div className="pc-turn pc-dare" key={i}>
            {turn.dream && <p className="pc-reflect-dream">{turn.dream}</p>}
            {turn.her && <p className="pc-reflect-her">{turn.her}</p>}
            <Src src={turn.src} />
          </div>
        );
      case 'pair':
        return renderPair(turn, i);
      case 'whole':
        return renderWhole(turn, i);
    }
  }

  function sideLabel(from: 'dream' | 'answer') {
    return from === 'dream' ? 'מהחלום' : 'מהמילים שלך';
  }

  function renderPair(turn: PairTurn, i: number) {
    const answeredHere = effectiveChoice === 'answer';
    return (
      <div className="pc-turn" key={i}>
        <section className="pc-pair" aria-label="שני פרטים, זה ליד זה" data-skipped={effectiveChoice === 'skip' ? 'true' : 'false'}>
          <p className="pc-pair-intro">{turn.intro}</p>
          <div className="pc-pair-sides">
            {[turn.a, turn.b].map((side, n) => (
              <figure className="pc-pair-side" key={n} data-from={side.from}>
                <blockquote>«{side.quote}»</blockquote>
                <figcaption>{sideLabel(side.from)}</figcaption>
              </figure>
            ))}
          </div>
          <p className="pc-pair-question">{turn.question}</p>
          {effectiveChoice === null && (
            <div className="pc-pair-actions">
              <button type="button" className="dm-btn dm-btn-primary" onClick={() => setChoice('answer')}>
                {v.answer}
              </button>
              <button type="button" className="dm-btn" onClick={() => setChoice('skip')}>
                {v.skip}
              </button>
            </div>
          )}
          {answeredHere && !turn.answer && typed === null && (
            <form
              className="pc-pair-write"
              onSubmit={(e) => {
                e.preventDefault();
                if (draft.trim()) setTyped(draft.trim());
              }}
            >
              <label className="dm-visually-hidden" htmlFor="pc-free">
                {v.write}
              </label>
              <textarea id="pc-free" rows={3} placeholder={v.write} value={draft} onChange={(e) => setDraft(e.target.value)} />
              <div className="pc-pair-actions">
                <button type="submit" className="dm-btn dm-btn-primary" disabled={!draft.trim()}>
                  {v.send}
                </button>
                <button type="button" className="dm-btn" onClick={() => setChoice('skip')}>
                  {v.skip}
                </button>
              </div>
            </form>
          )}
          {sources && (
            <p className="pc-src-block">
              <span className="pc-src">{SOURCE_LABEL[turn.src]}</span>
              <span className="pc-src">
                יחס מאומת (לא מוצג):{' '}
                {turn.relation === 'negation' ? 'שלילה בצד אחד' : turn.relation === 'change' ? 'שינוי' : 'רצון שלא הצליח'}
              </span>
              {turn.differentImages && <span className="pc-src">שני דימויים שונים: שאלה פתוחה בלבד</span>}
            </p>
          )}
        </section>
        {answeredHere && herPairAnswer && (
          <>
            <div className="pc-turn pc-her">
              <p className="dm-own-words">{herPairAnswer}</p>
              <Src src={turn.answer ? turn.answer.src : 'demo'} />
            </div>
            <div className="pc-turn pc-dare">
              <p className="pc-reflect-her">{turn.answer ? turn.answer.reflection : `${v.saidPrefix}«${herPairAnswer}»`}</p>
              <Src src={turn.answer ? turn.answer.src : 'demo'} />
            </div>
          </>
        )}
      </div>
    );
  }

  function renderWhole(turn: Extract<Turn, { kind: 'whole' }>, i: number) {
    const lines = pairAnswered ? [...turn.answered] : turn.skipped;
    const extra = pairAnswered && pair && !pair.answer && typed ? `וכשהשניים עמדו יחד, אמרת: «${typed}».` : null;
    return (
      <section className="pc-turn dm-panel pc-whole" key={i} aria-label="המבט השלם">
        <h2 className="dm-panel-title">המבט השלם</h2>
        <div className="pc-whole-body">
          {lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
          {extra && <p>{extra}</p>}
        </div>
        <div className="dm-closing pc-whole-question">
          <p>{turn.question}</p>
        </div>
        {turn.unexplored.length > 0 && (
          <div className="pc-whole-next">
            <p className="dm-sub">רגעים שעוד לא חקרת</p>
            <ul className="pc-chips">
              {turn.unexplored.map((m) => (
                <li key={m} className="pc-chip" data-state={m === turn.invite ? 'invite' : 'open'}>
                  {m}
                </li>
              ))}
            </ul>
          </div>
        )}
        <Src src={turn.src} />
        {extra && <Src src="demo" />}
      </section>
    );
  }

  return (
    <div className="dm-root pc-root" dir="rtl" lang="he" style={ACCENTS as CSSProperties}>
      <div className="dm-bg" aria-hidden="true">
        <DreamStageBackground active />
        <div className="dm-bg-tint" />
      </div>

      <div className="dmp-bar pc-bar">
        <span className="dmp-status">עמוד פיתוח · שני פרטים ושאלה (doc 90) · נתונים שמורים, בלי AI, שום דבר לא נשמר</span>
        <div className="pc-tabs" role="tablist" aria-label="תרחיש">
          {SCENARIOS.map((s) => (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={s.key === key}
              className="pc-tab"
              onClick={() => reset(s.key)}
            >
              {s.tab}
            </button>
          ))}
        </div>
        <label className="pc-toggle">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> הכל בבת אחת
        </label>
        <label className="pc-toggle">
          <input type="checkbox" checked={sources} onChange={(e) => setSources(e.target.checked)} /> מקורות וכללים
        </label>
      </div>

      <main className="pc-page">
        <header className="pc-head">
          <p className="pc-kicker">המסע בחלום</p>
          <h1 className="pc-title">{scenario.title}</h1>
          {sources && (
            <p className="pc-src-block">
              <span className="pc-src">
                ריצה {scenario.runRef} · {scenario.shows}
              </span>
            </p>
          )}
          <details className="pc-dream">
            <summary>החלום שלך</summary>
            <p>{scenario.dreamText}</p>
          </details>
        </header>

        <ol className="pc-log" aria-live="polite">
          {scenario.steps.slice(0, visible).map((step, si) => (
            <li key={`${key}-${si}`} className="pc-step" ref={si === visible - 1 ? lastStepRef : undefined}>
              {step.turns.map((t, ti) => renderTurn(t, si, ti))}
              {sources && <p className="pc-why">{step.why}</p>}
            </li>
          ))}
        </ol>

        {!showAll && (
          <div className="pc-continue">
            {!done && (
              <button
                type="button"
                className="dm-btn dm-btn-primary"
                disabled={waitingOnPair}
                onClick={() => setShown((n) => Math.min(n + 1, scenario.steps.length))}
              >
                {scenario.steps[visible]?.moment === 'whole' ? 'המבט השלם' : 'לרגע הבא'}
              </button>
            )}
            <button type="button" className="dm-btn" onClick={() => reset()}>
              מההתחלה
            </button>
            {waitingOnPair && <p className="dm-muted">אפשר לענות או לדלג, ואז להמשיך.</p>}
          </div>
        )}
      </main>
    </div>
  );
}
