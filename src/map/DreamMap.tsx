import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import DreamStageBackground from '../hero/DreamStageBackground';
import { extractDreamPalette } from '../hero/dreamAccentColor';
import MapLinks from './MapLinks';
import MomentCard from './MomentCard';
import MapDialog from './MapDialog';
import { mapModeFor, orbitColumns, ORBIT_MIN_WIDTH, type MapMode } from './mapLayout';
import { mapStrings } from './mapStrings';
import type { MapConnection, MapDream, MapMoment, MomentStatus, WholeView } from './mapTypes';
import { BackIcon, BookIcon, CompassIcon, HeartIcon, ImageIcon, LinkIcon, MoonIcon, SparkIcon } from './mapIcons';
import './DreamMap.css';

export type WholeViewPhase = 'idle' | 'revealing' | 'shown';

export interface DreamMapProps {
  dream: MapDream;
  /** Explored moment ids, in the order they were explored. */
  explored: string[];
  exploringId: string | null;
  wholeView: WholeView | null;
  wholeViewPhase: WholeViewPhase;
  /** Moments were explored after the shown whole view was written. */
  wholeViewStale: boolean;
  /** A plain line in the whole-view panel's own status line (the summary failed or was held back); the loading words are kept. */
  wholeViewNote?: string | null;
  updatesLeft: number;
  /** Prototype only: the update was asked for a set of moments that has no sample text. */
  noSampleForSet: boolean;
  favorite: boolean;
  /** Forces reduced motion on top of the system setting (the prototype toolbar). */
  reducedMotion: boolean;
  onExplore: (id: string) => void;
  onRevealWhole: () => void;
  onUpdateWhole: () => void;
  onToggleFavorite: () => void;
  onBack: () => void;
  /** The conversation of a moment (doc 102) in the moment's window, in place of its details. Absent: the window is as it was. */
  renderMoment?: (moment: MapMoment, close: () => void) => ReactNode;
  /** The map inside the real dream journey (not yet saved): no way back to the archive and no favourite yet, and once the whole view is
      shown, the way on to keeping or letting go of the dream. Absent: the map is as it was. */
  journey?: { continueLabel: string; onContinue: () => void };
}

/** Orbit or path. Follows the media query and, as a backstop, the page's own size (some emulated or embedded views change the width
    without a resize or media-query event). */
const useMapMode = (): MapMode => {
  const query = `(min-width: ${ORBIT_MIN_WIDTH}px)`;
  const [mode, setMode] = useState<MapMode>(() => mapModeFor(window.innerWidth));
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMode(mapModeFor(window.innerWidth));
    on();
    mq.addEventListener('change', on);
    const observer = new ResizeObserver(on);
    observer.observe(document.documentElement);
    return () => {
      mq.removeEventListener('change', on);
      observer.disconnect();
    };
  }, [query]);
  return mode;
};

function formatDate(iso: string, language: 'he' | 'en'): string {
  const d = new Date(`${iso}T12:00:00`);
  return new Intl.DateTimeFormat(language === 'he' ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'numeric', year: 'numeric' }).format(d);
}

/**
 * THE DREAM MAP: the dream's one picture in the centre, its moments around it as text cards, glowing lines that are built from the
 * real state (a line to every moment; a line between two moments only when the whole view found a link that rests on the dream or
 * on the dreamer's words), the whole view, the links between the moments, and what else can be done with the dream.
 * Desktop (≥1024px): an orbit around the picture. Narrower: a dedicated vertical path, picture first.
 */
export default function DreamMap(props: DreamMapProps) {
  const { dream, explored, exploringId, wholeView, wholeViewPhase, wholeViewStale, updatesLeft, noSampleForSet, favorite, reducedMotion } = props;
  const s = mapStrings(dream.language);
  const mode = useMapMode();
  const exploredSet = new Set(explored);
  const ids = useId();

  const statusOf = (m: MapMoment): MomentStatus => (exploredSet.has(m.id) ? 'explored' : exploringId === m.id ? 'exploring' : 'unexplored');
  const numberOf = (id: string) => dream.moments.findIndex((m) => m.id === id) + 1;
  const connections: MapConnection[] = wholeViewPhase === 'shown' && wholeView ? wholeView.connections : [];

  // ---- refs the lines are measured from
  const orbitRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef(new Map<string, HTMLElement>());
  const registerRef = useCallback((id: string, el: HTMLElement | null) => {
    if (el) cardRefs.current.set(id, el);
    else cardRefs.current.delete(id);
  }, []);

  // ---- pointing / focus highlight
  const [pointedMoment, setPointedMoment] = useState<string | null>(null);
  const [activeConnection, setActiveConnection] = useState<string | null>(null);
  const highlightedMoments = new Set<string>();
  if (pointedMoment) highlightedMoments.add(pointedMoment);
  if (activeConnection) {
    const c = connections.find((x) => x.id === activeConnection);
    if (c) highlightedMoments.add(c.from).add(c.to);
  }

  // ---- dialogs
  const [openMoment, setOpenMoment] = useState<string | null>(null);
  const [imageOpen, setImageOpen] = useState(false);
  const openMomentData = dream.moments.find((m) => m.id === openMoment) ?? null;

  // ---- header text
  const [textExpanded, setTextExpanded] = useState(false);
  const dreamTextRef = useRef<HTMLParagraphElement>(null);
  const rereadDream = () => {
    setTextExpanded(true);
    dreamTextRef.current?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
    dreamTextRef.current?.focus({ preventScroll: true });
  };

  // ---- a polite message area (prototype notices)
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 3200);
    return () => clearTimeout(t);
  }, [notice]);

  // ---- this dream's own colours, from its one picture (no extra call)
  const [palette, setPalette] = useState<string[] | null>(null);
  useEffect(() => {
    const img = new Image();
    img.onload = () => setPalette(extractDreamPalette(img, 3).map((c) => `${c.r}, ${c.g}, ${c.b}`));
    img.src = dream.imageSrc;
  }, [dream.imageSrc]);

  const firstUnexplored = dream.moments.find((m) => !exploredSet.has(m.id) && exploringId !== m.id) ?? null;
  const layoutKey = `${dream.key}|${mode}|${explored.join(',')}|${exploringId ?? ''}|${wholeViewPhase}`;

  const style = {
    '--dm-accent-1': palette?.[0] ?? '120, 150, 210',
    '--dm-accent-2': palette?.[1] ?? palette?.[0] ?? '150, 120, 200',
    '--dm-accent-3': palette?.[2] ?? palette?.[0] ?? '210, 180, 130',
  } as CSSProperties;

  const card = (m: MapMoment) => (
    <MomentCard
      key={m.id}
      moment={m}
      number={numberOf(m.id)}
      status={statusOf(m)}
      s={s}
      highlighted={highlightedMoments.has(m.id)}
      onOpen={(id) => setOpenMoment(id)}
      onPoint={setPointedMoment}
      registerRef={registerRef}
    />
  );

  const portal = (
    <div className="dm-portal-wrap">
      <div className="dm-portal" ref={portalRef} data-revealed={wholeViewPhase === 'shown' ? 'true' : 'false'}>
        <img className="dm-portal-img" src={dream.imageSrc} alt={s.dreamImageAlt} />
      </div>
      <button type="button" className="dm-pill" onClick={() => setImageOpen(true)} aria-haspopup="dialog">
        <ImageIcon />
        {s.dreamImage}
      </button>
    </div>
  );

  const columns = orbitColumns(dream.moments.length);

  return (
    <div
      className="dm-root"
      dir={dream.language === 'he' ? 'rtl' : 'ltr'}
      lang={dream.language}
      data-mode={mode}
      data-motion={reducedMotion ? 'reduced' : 'full'}
      data-sensitive={dream.sensitive ? 'true' : 'false'}
      style={style}
    >
      <div className="dm-bg" aria-hidden="true">
        <DreamStageBackground active />
        <div className="dm-bg-tint" />
      </div>

      <div className="dm-page">
        {/* ------------------------------------------------------------ header */}
        <header className="dm-header">
          <div className="dm-heading">
            <div className="dm-title-row">
              <h1 className="dm-title">
                <span>{s.title}</span>
                <span className="dm-moon">
                  <MoonIcon />
                </span>
              </h1>
              <p className="dm-date">{formatDate(dream.date, dream.language)}</p>
            </div>
            <p ref={dreamTextRef} id={`${ids}-text`} className="dm-dream-text" data-expanded={textExpanded ? 'true' : 'false'} tabIndex={-1}>
              {dream.sourceText}
            </p>
            {dream.sourceText.length > 180 && (
              <button type="button" className="dm-text-toggle" aria-expanded={textExpanded} aria-controls={`${ids}-text`} onClick={() => setTextExpanded((v) => !v)}>
                {textExpanded ? s.readLess : s.readMore}
              </button>
            )}
          </div>
          {!props.journey && (
            <button
              type="button"
              className="dm-back"
              onClick={() => {
                props.onBack();
                setNotice(s.protoNoop);
              }}
            >
              <BackIcon />
              {s.backToArchive}
            </button>
          )}
        </header>

        {/* ------------------------------------------------------------ the map */}
        <section className="dm-map" aria-labelledby={`${ids}-moments`}>
          <h2 id={`${ids}-moments`} className="dm-visually-hidden">
            {s.momentsHeading}
          </h2>
          {mode === 'orbit' ? (
            <div className="dm-orbit" ref={orbitRef} data-count={dream.moments.length}>
              <MapLinks
                containerRef={orbitRef}
                portalRef={portalRef}
                cardRefs={cardRefs}
                momentIds={dream.moments.map((m) => m.id)}
                explored={exploredSet}
                connections={connections}
                activeMomentId={pointedMoment}
                activeConnectionId={activeConnection}
                layoutKey={layoutKey}
              />
              <ol className="dm-col dm-col-start" start={1}>
                {columns.start.map((i) => (
                  <li key={dream.moments[i].id}>{card(dream.moments[i])}</li>
                ))}
              </ol>
              <div className="dm-center">
                {portal}
                <p className="dm-progress">{s.progress(explored.length, dream.moments.length)}</p>
              </div>
              <ol className="dm-col dm-col-end" start={columns.start.length + 1}>
                {columns.end.map((i) => (
                  <li key={dream.moments[i].id}>{card(dream.moments[i])}</li>
                ))}
              </ol>
            </div>
          ) : (
            <div className="dm-path">
              {portal}
              <p className="dm-progress">{s.progress(explored.length, dream.moments.length)}</p>
              <ol className="dm-path-list">
                {dream.moments.map((m) => (
                  <li key={m.id} className="dm-path-item" data-status={statusOf(m)}>
                    <span className="dm-path-node" aria-hidden="true" />
                    {card(m)}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>

        {/* ------------------------------------------------------------ whole view, links, more */}
        <div className="dm-lower">
          <section className="dm-panel dm-whole" aria-labelledby={`${ids}-whole`} data-phase={wholeViewPhase}>
            <h2 id={`${ids}-whole`} className="dm-panel-title" tabIndex={-1}>
              <span className="dm-panel-icon dm-panel-icon-glow">
                <SparkIcon />
              </span>
              {s.wholeViewTitle}
            </h2>

            {wholeViewPhase !== 'shown' || !wholeView ? (
              <div className="dm-whole-cta">
                <button type="button" className="dm-btn dm-btn-primary" onClick={props.onRevealWhole} disabled={wholeViewPhase === 'revealing' || explored.length === 0} aria-describedby={`${ids}-whole-status`}>
                  {wholeViewPhase === 'revealing' ? s.revealing : s.revealWhole}
                </button>
                <p id={`${ids}-whole-status`} className="dm-muted" role="status">
                  {wholeViewPhase === 'revealing' ? s.revealing : props.wholeViewNote ?? s.wholeViewIntro(explored.length)}
                </p>
              </div>
            ) : (
              <div className="dm-whole-body" key={wholeView.basedOn.join(',')}>
                <p className="dm-muted dm-reveal" style={{ ['--r' as string]: 0 }}>
                  {s.wholeViewIntro(wholeView.basedOn.length)}
                </p>
                <p className="dm-whole-overview dm-reveal" style={{ ['--r' as string]: 1 }}>
                  {wholeView.overview}
                </p>
                {(wholeView.recurring || wholeView.contrast) && (
                  <dl className="dm-whole-facets dm-reveal" style={{ ['--r' as string]: 2 }}>
                    {wholeView.recurring && (
                      <div>
                        <dt>{s.recurring}</dt>
                        <dd>{wholeView.recurring}</dd>
                      </div>
                    )}
                    {wholeView.contrast && (
                      <div>
                        <dt>{s.contrast}</dt>
                        <dd>{wholeView.contrast}</dd>
                      </div>
                    )}
                  </dl>
                )}
                {wholeView.readings.length > 0 && (
                  <div className="dm-reveal" style={{ ['--r' as string]: 3 }}>
                    <h3 className="dm-sub">{s.readings}</h3>
                    <ul className="dm-readings">
                      {wholeView.readings.map((r) => (
                        <li key={r.basis}>
                          <span className="dm-basis">{r.basis}</span>
                          {r.reading}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {/* "מה לקחתי מהחלום" (doc 117): hers and DARE's kept apart; shown only when there is something, never invented */}
                {wholeView.takeaways && (wholeView.takeaways.mine.length > 0 || wholeView.takeaways.ideas.length > 0 || (wholeView.takeaways.open?.length ?? 0) > 0) && (
                  <div className="dm-takeaways dm-reveal" style={{ ['--r' as string]: 3 }}>
                    <h3 className="dm-sub">{s.takeaways}</h3>
                    {wholeView.takeaways.mine.length > 0 && (
                      <>
                        <p className="dm-muted">{s.takeawaysMine}</p>
                        <ul className="dm-readings">
                          {wholeView.takeaways.mine.map((t) => (
                            <li key={t}>«{t}»</li>
                          ))}
                        </ul>
                      </>
                    )}
                    {wholeView.takeaways.ideas.length > 0 && (
                      <>
                        <p className="dm-muted">{s.takeawaysIdeas}</p>
                        <ul className="dm-readings">
                          {wholeView.takeaways.ideas.map((t) => (
                            <li key={t}>{t}</li>
                          ))}
                        </ul>
                      </>
                    )}
                    {(wholeView.takeaways.open?.length ?? 0) > 0 && (
                      <>
                        <p className="dm-muted">{s.takeawaysOpen}</p>
                        <ul className="dm-readings">
                          {wholeView.takeaways.open!.map((t) => (
                            <li key={t}>{t}</li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                )}
                {/* "what came up" of a conversation (doc 102) may end with no question: no empty heading then */}
                {wholeView.closingQuestion && (
                  <div className="dm-closing dm-reveal" style={{ ['--r' as string]: 4 }}>
                    <h3 className="dm-sub">{s.closingQuestion}</h3>
                    <p>{wholeView.closingQuestion}</p>
                  </div>
                )}
                <p className="dm-grounding dm-reveal" style={{ ['--r' as string]: 5 }}>
                  {s.grounding}
                </p>
                {props.journey && (
                  <div className="dm-whole-cta dm-reveal" style={{ ['--r' as string]: 6 }}>
                    <button type="button" className="dm-btn dm-btn-primary" onClick={props.journey.onContinue}>
                      {props.journey.continueLabel}
                    </button>
                  </div>
                )}
                {(wholeViewStale || noSampleForSet) && (
                  <div className="dm-stale" role="status">
                    <p>{noSampleForSet ? s.noSampleForSet : s.stale}</p>
                    {wholeViewStale && !noSampleForSet && (
                      <>
                        <button type="button" className="dm-btn" onClick={props.onUpdateWhole} disabled={updatesLeft <= 0}>
                          {s.update}
                        </button>
                        <p className="dm-muted">{updatesLeft > 0 ? s.updatesLeft(updatesLeft) : s.noUpdatesLeft}</p>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="dm-panel dm-connections" aria-labelledby={`${ids}-links`}>
            <h2 id={`${ids}-links`} className="dm-panel-title">
              <span className="dm-panel-icon">
                <LinkIcon />
              </span>
              {s.connectionsTitle}
            </h2>
            {dream.moments.length === 1 ? (
              <p className="dm-muted">{s.connectionsOneMoment}</p>
            ) : connections.length === 0 ? (
              <p className="dm-muted">{wholeViewPhase === 'shown' ? s.connectionsNone : s.connectionsEmpty}</p>
            ) : (
              <ul className="dm-link-list">
                {connections.map((c, i) => (
                  <li key={c.id} className="dm-reveal" style={{ ['--r' as string]: i + 2 }}>
                    <button
                      type="button"
                      className="dm-link-item"
                      aria-pressed={activeConnection === c.id}
                      onClick={() => setActiveConnection((v) => (v === c.id ? null : c.id))}
                      onMouseEnter={() => setActiveConnection(c.id)}
                      onMouseLeave={() => setActiveConnection(null)}
                    >
                      <span className="dm-link-nums" aria-hidden="true">
                        {numberOf(c.from)}
                        <span className="dm-link-dash" />
                        {numberOf(c.to)}
                      </span>
                      <span className="dm-link-text">
                        <span className="dm-link-title">{c.title}</span>
                        <span className="dm-link-basis">
                          <span className="dm-visually-hidden">
                            {`${s.linkedMoments} ${numberOf(c.from)}, ${numberOf(c.to)}. ${s.basis}: `}
                          </span>
                          {c.basis}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="dm-panel dm-more" aria-labelledby={`${ids}-more`}>
            <h2 id={`${ids}-more`} className="dm-panel-title">
              <span className="dm-panel-icon">
                <SparkIcon />
              </span>
              {s.moreTitle}
            </h2>
            <ul className="dm-more-list">
              <li>
                <button type="button" className="dm-more-item" onClick={rereadDream}>
                  <BookIcon />
                  {s.rereadDream}
                </button>
              </li>
              {!props.journey && (
                <li>
                  <button type="button" className="dm-more-item" aria-pressed={favorite} onClick={props.onToggleFavorite}>
                    <HeartIcon filled={favorite} />
                    {favorite ? s.favorited : s.favorite}
                  </button>
                </li>
              )}
              <li>
                <button type="button" className="dm-more-item" onClick={() => firstUnexplored && setOpenMoment(firstUnexplored.id)} disabled={!firstUnexplored}>
                  <CompassIcon />
                  {firstUnexplored ? s.exploreAnother : s.allExplored}
                </button>
              </li>
            </ul>
          </section>
        </div>

        <p className="dm-notice" role="status" aria-live="polite">
          {notice}
        </p>
      </div>

      {/* ------------------------------------------------------------ dialogs */}
      <MapDialog open={openMomentData !== null} onClose={() => setOpenMoment(null)} labelledBy={`${ids}-moment-title`} closeLabel={s.close}>
        {openMomentData && props.renderMoment && props.renderMoment(openMomentData, () => setOpenMoment(null))}
        {openMomentData && !props.renderMoment && (
          <MomentDetails
            moment={openMomentData}
            number={numberOf(openMomentData.id)}
            status={statusOf(openMomentData)}
            connections={connections.filter((c) => c.from === openMomentData.id || c.to === openMomentData.id)}
            numberOf={numberOf}
            titleId={`${ids}-moment-title`}
            s={s}
            onExplore={() => {
              props.onExplore(openMomentData.id);
              setOpenMoment(null);
            }}
          />
        )}
      </MapDialog>

      <MapDialog open={imageOpen} onClose={() => setImageOpen(false)} labelledBy={`${ids}-image-title`} closeLabel={s.close} className="dm-dialog-image">
        <h2 id={`${ids}-image-title`} className="dm-dialog-title">
          {s.dreamImage}
        </h2>
        <img className="dm-dialog-img" src={dream.imageSrc} alt={s.dreamImageAlt} />
      </MapDialog>
    </div>
  );
}

interface MomentDetailsProps {
  moment: MapMoment;
  number: number;
  status: MomentStatus;
  connections: MapConnection[];
  numberOf: (id: string) => number;
  titleId: string;
  s: ReturnType<typeof mapStrings>;
  onExplore: () => void;
}

function MomentDetails({ moment, number, status, connections, numberOf, titleId, s, onExplore }: MomentDetailsProps) {
  return (
    <div className="dm-detail">
      <p className="dm-detail-kicker">
        <span className="dm-card-num dm-card-num-inline" aria-hidden="true">
          {number}
        </span>
        <span className="dm-card-status" data-status={status}>
          {status === 'explored' ? s.statusExplored : status === 'exploring' ? s.statusExploring : s.statusUnexplored}
        </span>
      </p>
      <h2 id={titleId} className="dm-dialog-title">
        {moment.title}
      </h2>
      {moment.excerpt && (
        <figure className="dm-detail-excerpt">
          <figcaption>{s.fromTheDream}</figcaption>
          <blockquote>{moment.excerpt}</blockquote>
        </figure>
      )}
      {status === 'explored' ? (
        <>
          <dl className="dm-detail-qa">
            <dt>{s.question}</dt>
            <dd>{moment.question}</dd>
            <dt>{s.yourAnswer}</dt>
            <dd className="dm-own-words">{moment.answer}</dd>
            {moment.followUp && (
              <>
                <dt>{s.followUp}</dt>
                <dd>{moment.followUp.question}</dd>
                <dt>{s.yourAnswer}</dt>
                <dd className={moment.followUp.answer ? 'dm-own-words' : 'dm-muted'}>{moment.followUp.answer ?? s.skipped}</dd>
              </>
            )}
          </dl>
          <div className="dm-detail-insight">
            <h3 className="dm-sub">{s.insight}</h3>
            <p>{moment.insight.full}</p>
          </div>
          {connections.length > 0 && (
            <div>
              <h3 className="dm-sub">{s.linkedMoments}</h3>
              <ul className="dm-detail-links">
                {connections.map((c) => (
                  <li key={c.id}>
                    <strong>
                      {numberOf(c.from)} · {numberOf(c.to)}: {c.title}
                    </strong>
                    <span>{c.basis}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="dm-grounding">{s.grounding}</p>
        </>
      ) : (
        <div className="dm-detail-unexplored">
          <p>{status === 'exploring' ? s.exploring : s.notExploredYet}</p>
          {status === 'unexplored' && (
            <button type="button" className="dm-btn dm-btn-primary" onClick={onExplore}>
              <CompassIcon />
              {s.exploreThis}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
