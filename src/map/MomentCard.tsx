import type { MapMoment, MomentStatus } from './mapTypes';
import type { MapStrings } from './mapStrings';
import { CheckIcon, ChevronIcon, CompassIcon } from './mapIcons';

interface MomentCardProps {
  moment: MapMoment;
  number: number;
  status: MomentStatus;
  s: MapStrings;
  highlighted: boolean;
  onOpen: (id: string, opener: HTMLElement) => void;
  onPoint: (id: string | null) => void;
  registerRef: (id: string, el: HTMLElement | null) => void;
}

/**
 * One moment: number, title, the line from the dream, the insight's headline and its status. Text only: never a picture.
 * The whole card is one real button that opens the moment's details.
 */
export default function MomentCard({ moment, number, status, s, highlighted, onOpen, onPoint, registerRef }: MomentCardProps) {
  const statusText = status === 'explored' ? s.statusExplored : status === 'exploring' ? s.statusExploring : s.statusUnexplored;
  return (
    <button
      type="button"
      ref={(el) => registerRef(moment.id, el)}
      className="dm-card"
      data-status={status}
      data-highlighted={highlighted ? 'true' : 'false'}
      aria-label={s.momentLabel(number, moment.title, statusText)}
      aria-haspopup="dialog"
      onClick={(e) => onOpen(moment.id, e.currentTarget)}
      onMouseEnter={() => onPoint(moment.id)}
      onMouseLeave={() => onPoint(null)}
      onFocus={() => onPoint(moment.id)}
      onBlur={() => onPoint(null)}
    >
      <span className="dm-card-num" aria-hidden="true">
        {number}
      </span>
      <span className="dm-card-head">
        <span className="dm-card-title">{moment.title}</span>
        <span className="dm-card-chevron">
          <ChevronIcon />
        </span>
      </span>
      {moment.excerpt && <span className="dm-card-excerpt">{moment.excerpt}</span>}
      {status === 'explored' ? (
        <span className="dm-card-insight">{moment.insight.headline}</span>
      ) : (
        <span className="dm-card-hint">
          <CompassIcon />
          {status === 'exploring' ? s.exploring : s.exploreHint}
        </span>
      )}
      <span className="dm-card-status" data-status={status}>
        {status === 'explored' && <CheckIcon />}
        {statusText}
      </span>
    </button>
  );
}
