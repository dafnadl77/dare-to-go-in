import type { ArchiveEntry } from './archiveData';
import { formatEntryDayMonth, formatEntryMonth, formatEntryYear } from './archiveData';
import { useDreamImageSrc } from './useDreamImageSrc';
import { useLanguage } from '../i18n/LanguageContext';
import type { AppLanguage } from '../hero/appLanguage';
import './DreamTimeline.css';

interface DreamTimelineProps {
  entries: ArchiveEntry[];
  onOpenEntry: (entry: ArchiveEntry) => void;
  /** Only real saved dreams can be favorited (see ArchiveEntry) — omitted
      entirely (rather than passed a no-op) so a caller that genuinely has
      no favoriting UI yet (there is none currently) doesn't need to fake
      one. */
  onToggleFavorite?: (id: string) => void;
  /** Opens the delete confirmation for one real saved dream (see
      DreamArchive). Omitted → no trash button is rendered. */
  onDeleteEntry?: (entry: ArchiveEntry) => void;
}

interface MonthGroup {
  year: string;
  month: string;
  showYear: boolean;
  items: ArchiveEntry[];
}

/** Entries arrive already sorted newest-first (see archiveData.ts) — this
    only clusters consecutive entries that share a year/month, and marks
    the first group of a new year so the year heading only appears once
    per year. */
function groupByMonth(entries: ArchiveEntry[], language: AppLanguage): MonthGroup[] {
  const groups: MonthGroup[] = [];
  let lastYear: string | null = null;
  for (const entry of entries) {
    const year = formatEntryYear(entry.date);
    const month = formatEntryMonth(entry.date, language);
    const last = groups[groups.length - 1];
    if (last && last.year === year && last.month === month) {
      last.items.push(entry);
    } else {
      groups.push({ year, month, showYear: year !== lastYear, items: [entry] });
      lastYear = year;
    }
  }
  return groups;
}

function DreamCard({
  entry,
  onOpen,
  onToggleFavorite,
  onDeleteEntry,
}: {
  entry: ArchiveEntry;
  onOpen: () => void;
  onToggleFavorite?: (id: string) => void;
  onDeleteEntry?: (entry: ArchiveEntry) => void;
}) {
  const { t, language } = useLanguage();
  const imageSrc = useDreamImageSrc(entry);
  return (
    <span className={`dt-card-wrap${entry.kind === 'real' && onDeleteEntry ? ' dt-card-wrap--deletable' : ''}`}>
      <button type="button" className="dt-card" data-cursor-hover onClick={onOpen} aria-label={`${t('archive.openEntry')} ${entry.title}`}>
        <span className="dt-card-thumb">
          <img className="dt-card-image" src={imageSrc} alt="" loading="lazy" />
        </span>
        <span className="dt-card-body">
          <span className="dt-card-top">
            <span className="dt-card-title">{entry.title}</span>
            <span className="dt-card-date">{formatEntryDayMonth(entry.date, language)}</span>
          </span>
          <span className="dt-card-excerpt">{entry.excerpt}</span>
          {entry.keywords.length > 0 && <span className="dt-card-keywords">{entry.keywords.join(' · ')}</span>}
        </span>
        <span className="dt-card-chevron" aria-hidden="true">
          ›
        </span>
      </button>
      {/* A sibling of .dt-card, not a nested button inside it — buttons
          can't nest in valid HTML. Only real saved dreams carry a
          `favorite` flag (see ArchiveEntry); mock entries render no
          toggle at all rather than a fake/no-op one. */}
      {entry.kind === 'real' && onToggleFavorite && (
        <button
          type="button"
          className={`dt-card-favorite${entry.favorite ? ' dt-card-favorite--active' : ''}`}
          data-cursor-hover
          onClick={() => onToggleFavorite(entry.id)}
          aria-pressed={entry.favorite}
          aria-label={entry.favorite ? t('archive.favoriteRemove') : t('archive.favoriteAdd')}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path
              d="M12 4.5c1.7-2 4.6-2.3 6.4-.5 1.9 1.9 1.9 5 0 6.9L12 17l-6.4-6.1c-1.9-1.9-1.9-5 0-6.9 1.8-1.8 4.7-1.5 6.4.5Z"
              fill={entry.favorite ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
      {/* The card's delete action: a sibling of .dt-card (like the heart), so a
          click here can never open the dream or toggle its favorite. Real
          saved dreams only — a sample dream has nothing to delete. It takes
          focus itself before opening the dialog so cancelling always returns
          focus to this exact button (some browsers don't focus a button on
          click). */}
      {entry.kind === 'real' && onDeleteEntry && (
        <button
          type="button"
          className="dt-card-delete"
          data-cursor-hover
          onClick={(e) => {
            e.currentTarget.focus();
            onDeleteEntry(entry);
          }}
          aria-label={t('archive.deleteDreamAria')}
          title={t('archive.deleteDreamAria')}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 7h14" />
            <path d="M10 4.2h4" />
            <path d="M7 7l.75 11.1a1.6 1.6 0 0 0 1.6 1.5h5.3a1.6 1.6 0 0 0 1.6-1.5L17 7" />
            <path d="M10.2 10.6v5.6M13.8 10.6v5.6" />
          </svg>
        </button>
      )}
    </span>
  );
}

/**
 * MY DREAM ARCHIVE's dream list — clean, editorial horizontal cards
 * grouped by month, replacing the earlier connected-line timeline
 * layout: each real/mock dream is one row (thumbnail, title, short
 * excerpt, date, an affordance chevron), never a "floating blob" or a
 * childish tile. Data-driven and chronological by construction (see
 * archiveData.ts): adding a real saved dream inserts it in the right
 * place automatically, nothing here is sized for exactly N items.
 */
export default function DreamTimeline({ entries, onOpenEntry, onToggleFavorite, onDeleteEntry }: DreamTimelineProps) {
  const { language } = useLanguage();
  const groups = groupByMonth(entries, language);

  return (
    <div className="dt-timeline">
      {groups.map((group, gi) => (
        <div key={`${group.year}-${group.month}-${gi}`} className="dt-month-group">
          <p className="dt-month-heading">
            {group.showYear ? `${group.month} ${group.year}` : group.month}
          </p>
          <div className="dt-card-list">
            {group.items.map((entry) => (
              <DreamCard key={entry.id} entry={entry} onOpen={() => onOpenEntry(entry)} onToggleFavorite={onToggleFavorite} onDeleteEntry={onDeleteEntry} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
