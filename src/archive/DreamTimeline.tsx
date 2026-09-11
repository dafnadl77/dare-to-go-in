import type { ArchiveEntry } from './archiveData';
import { formatEntryDayMonth, formatEntryMonth, formatEntryYear } from './archiveData';
import { useLanguage } from '../i18n/LanguageContext';
import './DreamTimeline.css';

interface DreamTimelineProps {
  entries: ArchiveEntry[];
  onOpenEntry: (entry: ArchiveEntry) => void;
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
function groupByMonth(entries: ArchiveEntry[]): MonthGroup[] {
  const groups: MonthGroup[] = [];
  let lastYear: string | null = null;
  for (const entry of entries) {
    const year = formatEntryYear(entry.date);
    const month = formatEntryMonth(entry.date);
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

function DreamCard({ entry, onOpen }: { entry: ArchiveEntry; onOpen: () => void }) {
  const { t } = useLanguage();
  return (
    <button type="button" className="dt-card" data-cursor-hover onClick={onOpen} aria-label={`${t('archive.openEntry')} ${entry.title}`}>
      <span className="dt-card-thumb">
        <img className="dt-card-image" src={entry.image} alt="" loading="lazy" />
      </span>
      <span className="dt-card-body">
        <span className="dt-card-top">
          <span className="dt-card-title">{entry.title}</span>
          <span className="dt-card-date">{formatEntryDayMonth(entry.date)}</span>
        </span>
        <span className="dt-card-excerpt">{entry.excerpt}</span>
        {entry.keywords.length > 0 && <span className="dt-card-keywords">{entry.keywords.join(' · ')}</span>}
      </span>
      <span className="dt-card-chevron" aria-hidden="true">
        ›
      </span>
    </button>
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
export default function DreamTimeline({ entries, onOpenEntry }: DreamTimelineProps) {
  const groups = groupByMonth(entries);

  return (
    <div className="dt-timeline">
      {groups.map((group, gi) => (
        <div key={`${group.year}-${group.month}-${gi}`} className="dt-month-group">
          <p className="dt-month-heading">
            {group.showYear ? `${group.month} ${group.year}` : group.month}
          </p>
          <div className="dt-card-list">
            {group.items.map((entry) => (
              <DreamCard key={entry.id} entry={entry} onOpen={() => onOpenEntry(entry)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
