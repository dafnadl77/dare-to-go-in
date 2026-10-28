import DreamMap from './DreamMap';
import ConversationThread from './ConversationThread';
import { mapFromExploration } from './fromExploration';
import { mapStrings } from './mapStrings';
import type { Exploration } from '../hero/exploration';
import type { AddressPreference } from '../hero/addressPreference';
import type { MapMoment } from './mapTypes';
import './DreamJourneyMap.css';

/**
 * THE MAP OF A SAVED DREAM (2026-10-28): the approved map, drawn from the journey saved with the dream — its moments, each moment's
 * conversation as it was, the whole view and what she took from it. Read-only: nothing is asked of DARE, nothing is spent, nothing is
 * saved. Back leads to the archive; the dream's other page, "summary and reflection", is one click away.
 */

interface SavedDreamMapProps {
  exploration: Exploration;
  sourceText: string;
  imageSrc: string;
  /** YYYY-MM-DD */
  date: string;
  language: 'he' | 'en';
  address: AddressPreference;
  onBack: () => void;
  onShowSummary: () => void;
}

const noop = () => {};

export default function SavedDreamMap({ exploration, sourceText, imageSrc, date, language, address, onBack, onShowSummary }: SavedDreamMapProps) {
  const s = mapStrings(language);
  const m = mapFromExploration(exploration, { key: exploration.attemptId, language, date, sourceText, imageSrc });

  // a moment's window: its saved conversation, read-only (no writing box, no buttons that ask DARE)
  const renderMoment = (moment: MapMoment) => {
    const entry = exploration.explored[moment.id];
    return (
      <ConversationThread
        title={moment.title}
        excerpt={moment.excerpt}
        turns={entry?.turns ?? []}
        address={address}
        language={language}
        pending={false}
        draft=""
        onDraft={noop}
        onSend={noop}
        onReject={noop}
        onMoveOn={noop}
        explored={entry?.status === 'explored'}
        titleId={`sdm-${moment.id}-title`}
      />
    );
  };

  return (
    <div className="dj-map">
      <DreamMap
        dream={m.dream}
        explored={m.explored}
        exploringId={null}
        wholeView={m.wholeView}
        wholeViewPhase={m.wholeView ? 'shown' : 'idle'}
        wholeViewStale={false}
        updatesLeft={0}
        noSampleForSet={false}
        favorite={false}
        reducedMotion={false}
        onExplore={noop}
        onRevealWhole={noop}
        onUpdateWhole={noop}
        onToggleFavorite={noop}
        onBack={onBack}
        renderMoment={renderMoment}
        archive={{ summaryLabel: s.summaryLink, onShowSummary }}
      />
    </div>
  );
}
