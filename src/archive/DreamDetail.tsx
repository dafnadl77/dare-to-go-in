import { useEffect, useRef, useState } from 'react';
import DreamStageBackground from '../hero/DreamStageBackground';
import { sanitizeAiTextForDisplay, containsHebrew } from '../hero/appLanguage';
import { normalizeEmotions } from '../hero/dreamEmotions';
import { formatEntryDayMonth, formatEntryYear, titleFromSavedDream, type ArchiveEntry } from './archiveData';
import { cacheLabel, cacheTitle, getCachedLabel, getCachedTitle, needsTranslation, savedTitleSource } from './dreamTitleTranslation';
import { useDreamImageSrc } from './useDreamImageSrc';
import { translateTexts } from './dreamTranslationEngine';
import { useLanguage } from '../i18n/LanguageContext';
import AppFooter from '../legal/AppFooter';
import type { LegalKey } from '../legal/legalContent';
import Breadcrumb from '../ui/Breadcrumb';
import EditorialTitle from '../ui/EditorialTitle';
import { parseExploration } from '../hero/exploration';
import SavedDreamMap from '../map/SavedDreamMap';
import { useAuth } from '../auth/AuthContext';
import { addressPreferenceOfUser } from '../hero/addressPreference';
import { mapStrings } from '../map/mapStrings';
import './DreamDetail.css';

interface DreamDetailProps {
  entry: ArchiveEntry;
  onBack: () => void;
  /** "RETURN TO THE ROOM / HOME" — leaves the archive area entirely, back
      to the main DARE room (the same place HeroDream starts). */
  onGoHome: () => void;
  onOpenLegal: (key: LegalKey) => void;
}

/** THE DREAM / WHAT STOOD OUT / YOUR ASSOCIATION needed a REAL translation
    when the underlying saved value was Hebrew AND the interface itself was
    English-only — there was no guaranteed-English field anywhere else to
    fall back to for the dreamer's own original words (unlike title/
    keywords, which archiveData.ts already keeps safely English via a
    synchronous fallback). Now that the interface itself can be Hebrew,
    this whole mechanism only runs while the ACTIVE UI language is English
    (see the `language !== 'en'` guards below) — per this task's own
    instruction not to auto-translate the dreamer's own words, a Hebrew UI
    simply shows the original text as saved, no translation attempted in
    either direction. `raw` is what gets sent for translation and is NEVER
    rendered directly when it contains Hebrew while the UI is English —
    only `display` is, which is either the original (already English), the
    resolved translation, or a plain loading/error placeholder — so raw
    Hebrew never reaches an English page, even for a moment. */
type FieldKey = 'dream' | 'stoodOut' | 'association' | 'title' | 'thread' | 'question' | 'feelings' | 'summary' | 'linkQuestion' | 'linkAnswer' | 'reading0' | 'reading1' | 'existential';

type TranslationState = 'idle' | 'loading' | 'ready' | 'error';

/**
 * MY DREAM ARCHIVE's dream detail view — opened by clicking a dream in the
 * timeline. No standalone "view a past saved dream" screen existed before
 * this (the app's only existing reconstruction/reflection UI —
 * DreamReconstruction/DreamReflection/DreamClosing — is built around one
 * *live* generation in progress, not replaying a stored record by id), so
 * this is a small, deliberately separate read-only view: same cloud world
 * and typography, its own single centered editorial column. For a real
 * saved dream it renders that dream's own actual stored content — never
 * invented.
 *
 * DYNAMIC-CONTENT NOTE (bilingual UI): DreamReflectionResult (observation,
 * possibleThread, continuityQuestion, groundingStatement, lenses) is
 * generated once, at save time, in whichever language was active THEN
 * (see dreamStorage.ts's `appLanguage` stamp on every SavedDream) — it is
 * never regenerated just because the dreamer is now browsing in a
 * different UI language, since that would mean a second paid AI call and
 * would make the saved record disagree with what was actually kept. Only
 * this screen's own CHROME (headings, buttons, disclaimer) follows the
 * CURRENT UI language; the reflection's own interpretive text stays in
 * whatever language it was actually generated in. A mock dream has no
 * such saved reflection, so it falls back to a placeholder note.
 */
export default function DreamDetail({ entry, onBack, onGoHome, onOpenLegal }: DreamDetailProps) {
  const { t, language } = useLanguage();
  const imageSrc = useDreamImageSrc(entry);
  const { user } = useAuth();
  // A dream saved from the dream map journey has two pages (2026-10-28): this one ("summary and reflection") and its map.
  const [screen, setScreen] = useState<'summary' | 'map'>('summary');
  const bgVideoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    bgVideoRef.current?.play().catch(() => {});
  }, [screen]);

  useEffect(() => {
    // on the map page Escape belongs to the map's own windows
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && screen === 'summary') onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack, screen]);

  const reflection = entry.kind === 'real' ? entry.savedDream.dreamReflection : null;
  const sourceTextRaw = entry.kind === 'real' ? entry.savedDream.sourceText : null;
  const associationRaw = entry.kind === 'real' ? entry.savedDream.reflectionResponse : null;
  const selectedElementRaw = entry.kind === 'real' ? entry.savedDream.selectedElement : null;

  // The title is derived from the saved record in the language the dream was
  // SAVED in — never from entry.title, which App keeps as a snapshot from the
  // moment the dream was opened and so goes stale on a language switch.
  const savedDream = entry.kind === 'real' ? entry.savedDream : null;
  const ownTitle = savedDream ? savedTitleSource(savedDream) : entry.title;
  const currentLanguageTitle = savedDream ? titleFromSavedDream(savedDream, language) : entry.title;
  const threadRaw = reflection?.possibleThread ?? null;
  const questionRaw = reflection?.continuityQuestion ?? null;
  // Only dreams saved with the optional feelings step have these; every older dream simply shows none of them.
  const feelingsRaw = reflection?.emotionReflection && reflection.emotionReflection.trim() ? reflection.emotionReflection : null;
  const summaryRaw = reflection?.summary && reflection.summary.trim() ? reflection.summary : null;
  const namedFeelings = normalizeEmotions(savedDream?.emotions);
  // The optional second question and its answer (only when the dreamer answered it), the other readings and the existential angle (only newer dreams have them).
  const linkQuestionRaw = savedDream?.linkQuestion && savedDream.linkResponse ? savedDream.linkQuestion : null;
  const linkAnswerRaw = savedDream?.linkQuestion && savedDream.linkResponse ? savedDream.linkResponse : null;
  const readingsRaw = (reflection?.alternativeReadings ?? []).map((r) => r.reading).filter((r) => r.trim()).slice(0, 2);
  const existentialRaw = reflection?.existentialLens?.text && reflection.existentialLens.text.trim() ? reflection.existentialLens.text : null;
  // The journey saved with a dream map dream: its map is drawn from it, read-only. Every other dream has no map and reads as before.
  const journey = savedDream?.exploration ? parseExploration(savedDream.exploration) : null;
  const ms = mapStrings(language === 'he' ? 'he' : 'en');

  const [translationState, setTranslationState] = useState<TranslationState>('idle');
  const [translated, setTranslated] = useState<Partial<Record<FieldKey, string>>>({});

  useEffect(() => {
    setTranslationState('idle');
    setTranslated({});
    if (entry.kind !== 'real') return;

    const items: { key: FieldKey; text: string }[] = [];
    // The dreamer's own words: only the English UI ever force-translates
    // them — see the module comment above.
    if (language === 'en') {
      if (sourceTextRaw && containsHebrew(sourceTextRaw)) items.push({ key: 'dream', text: sourceTextRaw });
      if (associationRaw && containsHebrew(associationRaw)) items.push({ key: 'association', text: associationRaw });
      if (linkAnswerRaw && containsHebrew(linkAnswerRaw)) items.push({ key: 'linkAnswer', text: linkAnswerRaw });
    }
    // AI-generated/derived fields (title, "what stood out" label, direction to
    // explore, question to keep) follow the active UI language in either
    // direction — including labels saved in the other language by older records.
    if (selectedElementRaw && needsTranslation(selectedElementRaw, language) && !getCachedLabel(selectedElementRaw, language)) {
      items.push({ key: 'stoodOut', text: selectedElementRaw });
    }
    // Shared with the archive list (dreamTitleTranslation.ts): a title it already
    // translated is not requested again.
    if (needsTranslation(ownTitle, language) && !getCachedTitle(ownTitle, language)) items.push({ key: 'title', text: ownTitle });
    if (threadRaw && needsTranslation(threadRaw, language)) items.push({ key: 'thread', text: threadRaw });
    if (questionRaw && needsTranslation(questionRaw, language)) items.push({ key: 'question', text: questionRaw });
    if (feelingsRaw && needsTranslation(feelingsRaw, language)) items.push({ key: 'feelings', text: feelingsRaw });
    if (summaryRaw && needsTranslation(summaryRaw, language)) items.push({ key: 'summary', text: summaryRaw });
    if (linkQuestionRaw && needsTranslation(linkQuestionRaw, language)) items.push({ key: 'linkQuestion', text: linkQuestionRaw });
    readingsRaw.forEach((reading, i) => {
      if (needsTranslation(reading, language)) items.push({ key: i === 0 ? 'reading0' : 'reading1', text: reading });
    });
    if (existentialRaw && needsTranslation(existentialRaw, language)) items.push({ key: 'existential', text: existentialRaw });
    if (items.length === 0) return;

    let cancelled = false;
    setTranslationState('loading');
    const texts = items.map((i) => i.text);
    // One silent retry for a transient failure (network blip, cold start, rate
    // limit); a definite failure (not signed in, not configured, billing) is not retried.
    const request = async () => {
      const first = await translateTexts(texts, language);
      const retryable = first.status === 'error' && ['request_failed', 'invalid_response', 'rate_limited'].includes(first.reason);
      if (!retryable) return first;
      await new Promise((resolve) => setTimeout(resolve, 1200));
      return cancelled ? first : translateTexts(texts, language);
    };
    request().then((result) => {
      const titleIndex = items.findIndex((item) => item.key === 'title');
      if (result.status === 'ok' && titleIndex >= 0) cacheTitle(ownTitle, language, result.translations[titleIndex]);
      const labelIndex = items.findIndex((item) => item.key === 'stoodOut');
      if (result.status === 'ok' && labelIndex >= 0 && selectedElementRaw) cacheLabel(selectedElementRaw, language, result.translations[labelIndex]);
      if (cancelled) return;
      if (result.status === 'ok') {
        const next: Partial<Record<FieldKey, string>> = {};
        items.forEach((item, i) => {
          next[item.key] = result.translations[i];
        });
        setTranslated(next);
        setTranslationState('ready');
      } else {
        setTranslationState('error');
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.id, language]);

  /** Resolves one field to safe, displayable text. On the English UI this
      is the only function allowed to decide what actually reaches the
      page for a field that might be Hebrew in storage (translate it, or
      show a loading/error placeholder while that's pending) — matching
      the original English-only behavior exactly. On the Hebrew UI (or any
      non-English UI) this never translates in either direction: the
      dreamer's own words are shown exactly as saved, per this task's
      explicit instruction not to auto-translate user content. */
  function resolve(key: FieldKey, raw: string | null): string | null {
    if (!raw) return null;
    if (language !== 'en') return raw;
    if (!containsHebrew(raw)) return sanitizeAiTextForDisplay(raw);
    if (translationState === 'ready') return translated[key]?.trim() ? translated[key]! : t('dreamDetail.translationUnavailable');
    if (translationState === 'error') return t('dreamDetail.translationUnavailable');
    return null; // loading — see the *-loading placeholder rendered below
  }

  /** Same idea for the AI-generated fields, which follow the UI language in
      both directions. Null only while the translation is pending (a loading
      placeholder is rendered). Whenever a translation is unavailable — the
      request failed, or came back empty/unusable — the SAVED text is shown
      exactly as stored: a section never renders empty, never as leftover
      punctuation (stripping the wrong-language letters used to leave just
      "." or "?"), and never stays stuck on the placeholder. */
  function resolveAi(key: FieldKey, raw: string): string | null {
    if (!needsTranslation(raw, language)) return raw;
    if (translationState === 'ready') return translated[key]?.trim() ? translated[key]! : raw;
    if (translationState === 'error') return raw;
    return null;
  }

  const dreamText = sourceTextRaw ? resolve('dream', sourceTextRaw) : null;
  const stoodOutText = selectedElementRaw
    ? needsTranslation(selectedElementRaw, language)
      ? (getCachedLabel(selectedElementRaw, language) ?? resolveAi('stoodOut', selectedElementRaw))
      : sanitizeAiTextForDisplay(selectedElementRaw)
    : entry.kind === 'real'
      ? entry.stoodOut
      : null;
  const associationText = associationRaw
    ? resolve('association', associationRaw)
    : reflection
      ? sanitizeAiTextForDisplay(reflection.personalAssociation)
      : null;
  const threadText = threadRaw ? resolveAi('thread', threadRaw) : null;
  const questionText = questionRaw ? resolveAi('question', questionRaw) : null;
  const feelingsText = feelingsRaw ? resolveAi('feelings', feelingsRaw) : null;
  const summaryText = summaryRaw ? resolveAi('summary', summaryRaw) : null;
  const linkQuestionText = linkQuestionRaw ? resolveAi('linkQuestion', linkQuestionRaw) : null;
  const linkAnswerText = linkAnswerRaw ? resolve('linkAnswer', linkAnswerRaw) : null;
  const readingTexts = readingsRaw.map((reading, i) => resolveAi(i === 0 ? 'reading0' : 'reading1', reading));
  const existentialText = existentialRaw ? resolveAi('existential', existentialRaw) : null;
  // Same cache as the archive list, so the two always show the same title.
  const displayTitle = needsTranslation(ownTitle, language) ? (getCachedTitle(ownTitle, language) ?? currentLanguageTitle) : ownTitle;

  // the dream's map page: drawn from what was saved, nothing asked of DARE and nothing spent
  if (journey && savedDream && screen === 'map') {
    return (
      <SavedDreamMap
        exploration={journey}
        sourceText={savedDream.sourceText}
        imageSrc={imageSrc}
        date={savedDream.createdAt.slice(0, 10)}
        language={language === 'he' ? 'he' : 'en'}
        address={addressPreferenceOfUser(user)}
        onBack={onBack}
        onShowSummary={() => setScreen('summary')}
      />
    );
  }

  return (
    <div className="dream-detail">
      <DreamStageBackground ref={bgVideoRef} active />
      <div className="dd-night-tint" aria-hidden="true" />

      {/* The entrance animation lives here, deliberately NOT on
          .dream-detail itself — see DreamDetail.css for why: a CSS
          animation resolving `filter: none` still interpolates to
          blur(0px) at rest, which still creates a containing block for
          position:fixed descendants (the fixed cloud background),
          trapping it against this element's own scrolling box instead of
          the true viewport. Keeping the animation on a sibling of it
          fixes that structurally. .dd-back moved in-flow below (no
          longer fixed) once the shared GlobalHeader (App.tsx) started
          occupying the same top-start corner on every screen — it's
          unaffected by the containing-block issue since it was never the
          thing at risk here (that was always about position:fixed
          descendants specifically). */}
      <div className="dd-scene">
        <div className="dd-column">
          <button type="button" className="dd-back" onClick={onBack} aria-label={t('dreamDetail.backToArchive')}>
            <span className="dd-back-arrow" aria-hidden="true">
              ←
            </span>
            {t('dreamDetail.backToArchive')}
          </button>
          <Breadcrumb
            ariaLabel={t('breadcrumb.ariaLabel')}
            items={[{ label: t('archive.pageHeading'), onClick: onBack }, { label: displayTitle }]}
          />
          <div className="dd-hero">
            <span className="dd-image-wrap">
              <span className="dd-image-glow" style={{ backgroundImage: `url(${imageSrc})` }} aria-hidden="true" />
              <img className="dd-image" src={imageSrc} alt={displayTitle} />
            </span>
            <p className="dd-date">
              {formatEntryDayMonth(entry.date)} {formatEntryYear(entry.date)}
            </p>
            <h1 className="dd-title">
              <EditorialTitle text={displayTitle} />
            </h1>
            {/* a dream map dream: its other page */}
            {journey && (
              <button type="button" className="dd-end-link" onClick={() => setScreen('map')}>
                {ms.dreamMapLink}
              </button>
            )}
          </div>

          {reflection ? (
            <div className="dd-narrative">
              <section className="dd-block">
                <p className="dd-eyebrow">
                  <EditorialTitle text={t('dreamDetail.theDream')} />
                </p>
                {dreamText ? (
                  <p className="dd-body">{dreamText}</p>
                ) : (
                  <p className="dd-body dd-body--loading">{t('dreamDetail.translating')}</p>
                )}
              </section>

              {(stoodOutText || (selectedElementRaw && needsTranslation(selectedElementRaw, language))) && (
                <section className="dd-block">
                  <p className="dd-eyebrow">
                    <EditorialTitle text={t('dreamDetail.whatStoodOut')} />
                  </p>
                  {stoodOutText ? (
                    <p className="dd-body dd-body--stood-out">{stoodOutText}</p>
                  ) : (
                    <p className="dd-body dd-body--loading">{t('dreamDetail.translating')}</p>
                  )}
                </section>
              )}

              <section className="dd-block">
                <p className="dd-eyebrow">
                  <EditorialTitle text={t('dreamDetail.yourAssociation')} />
                </p>
                {associationText ? (
                  <p className="dd-body">{associationText}</p>
                ) : (
                  <p className="dd-body dd-body--loading">{t('dreamDetail.translating')}</p>
                )}
              </section>

              {linkQuestionRaw && linkAnswerRaw && (
                <section className="dd-block">
                  <p className="dd-eyebrow">
                    <EditorialTitle text={t('dreamDetail.theOtherQuestion')} />
                  </p>
                  {linkQuestionText ? <p className="dd-body dd-body--question">{linkQuestionText}</p> : <p className="dd-body dd-body--loading">{t('dreamDetail.translating')}</p>}
                  {linkAnswerText ? <p className="dd-body">{linkAnswerText}</p> : <p className="dd-body dd-body--loading">{t('dreamDetail.translating')}</p>}
                </section>
              )}

              {(namedFeelings.length > 0 || feelingsRaw) && (
                <section className="dd-block">
                  <p className="dd-eyebrow">
                    <EditorialTitle text={t('dreamDetail.yourFeelings')} />
                  </p>
                  {namedFeelings.length > 0 && (
                    <p className="dd-body dd-body--feelings">{namedFeelings.map((id) => t(`reflection.emotions.${id}`)).join(' · ')}</p>
                  )}
                  {feelingsRaw &&
                    (feelingsText ? (
                      <p className="dd-body">{feelingsText}</p>
                    ) : (
                      <p className="dd-body dd-body--loading">{t('dreamDetail.translating')}</p>
                    ))}
                </section>
              )}

              <section className="dd-block">
                <p className="dd-eyebrow">
                  <EditorialTitle text={t('dreamDetail.aPossibleThread')} />
                </p>
                {threadText ? (
                  <p className="dd-body dd-body--thread">{threadText}</p>
                ) : (
                  <p className="dd-body dd-body--loading">{t('dreamDetail.translating')}</p>
                )}
              </section>

              {(readingsRaw.length > 0 || existentialRaw) && (
                <section className="dd-block">
                  <p className="dd-eyebrow">
                    <EditorialTitle text={t('dreamDetail.otherPerspectives')} />
                  </p>
                  {readingsRaw.map((_reading, i) =>
                    readingTexts[i] ? (
                      <p className="dd-body" key={`reading-${i}`}>
                        {readingTexts[i]}
                      </p>
                    ) : (
                      <p className="dd-body dd-body--loading" key={`reading-${i}`}>
                        {t('dreamDetail.translating')}
                      </p>
                    ),
                  )}
                  {existentialRaw &&
                    (existentialText ? (
                      <p className="dd-body">
                        <span className="dd-eyebrow">{t('dreamDetail.existentialAngle')}</span> {existentialText}
                      </p>
                    ) : (
                      <p className="dd-body dd-body--loading">{t('dreamDetail.translating')}</p>
                    ))}
                </section>
              )}

              <section className="dd-block">
                <p className="dd-eyebrow">
                  <EditorialTitle text={t('dreamDetail.aQuestionWorthSittingWith')} />
                </p>
                {questionText ? (
                  <p className="dd-body dd-body--question">{questionText}</p>
                ) : (
                  <p className="dd-body dd-body--loading">{t('dreamDetail.translating')}</p>
                )}
              </section>

              {summaryRaw && (
                <section className="dd-block">
                  <p className="dd-eyebrow">
                    <EditorialTitle text={t('dreamDetail.inShort')} />
                  </p>
                  {summaryText ? (
                    <p className="dd-body">{summaryText}</p>
                  ) : (
                    <p className="dd-body dd-body--loading">{t('dreamDetail.translating')}</p>
                  )}
                </section>
              )}

              <p className="dd-disclaimer">{t('dreamDetail.disclaimer')}</p>
            </div>
          ) : (
            <p className="dd-mock-note">{t('dreamDetail.comingSoon')}</p>
          )}

          <nav className="dd-end-nav" aria-label={t('dreamDetail.detailNav')}>
            <button type="button" className="dd-end-link" onClick={onBack}>
              {t('dreamDetail.backToArchive')}
            </button>
            <span className="dd-end-divider" aria-hidden="true" />
            {journey && (
              <>
                <button type="button" className="dd-end-link" onClick={() => setScreen('map')}>
                  {ms.dreamMapLink}
                </button>
                <span className="dd-end-divider" aria-hidden="true" />
              </>
            )}
            <button type="button" className="dd-end-link" onClick={onGoHome}>
              {t('dreamDetail.returnToTheRoom')}
            </button>
          </nav>

          <AppFooter onNavigate={onOpenLegal} />
        </div>
      </div>
    </div>
  );
}
