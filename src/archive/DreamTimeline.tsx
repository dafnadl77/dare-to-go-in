import type { ArchiveEntry } from './archiveData';
import { formatEntryDayMonth, formatEntryMonth, formatEntryYear } from './archiveData';
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
    per year, exactly like the reference. */
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

/** One month before the oldest entry's month — purely a decorative close
    to the timeline (matches the reference's "JUNE / More dreams from the
    past" footer), not a real pagination control: every saved dream is
    already rendered above, there is nothing further to load. */
function monthBeforeOldest(entries: ArchiveEntry[]): string {
  const oldest = entries[entries.length - 1];
  if (!oldest) return '';
  const prior = new Date(oldest.date);
  prior.setMonth(prior.getMonth() - 1);
  return formatEntryMonth(prior);
}

function TimelineImage({ src, title }: { src: string; title: string }) {
  return (
    <span className="dt-image-wrap">
      <span className="dt-image-glow" style={{ backgroundImage: `url(${src})` }} aria-hidden="true" />
      <img className="dt-image" src={src} alt={title} loading="lazy" />
    </span>
  );
}

function TimelineRow({ entry, onOpen }: { entry: ArchiveEntry; onOpen: () => void }) {
  return (
    <button type="button" className="dt-row" data-cursor-hover onClick={onOpen} aria-label={`Open ${entry.title}`}>
      <TimelineImage src={entry.image} title={entry.title} />
      <span className="dt-node" aria-hidden="true" />
      <span className="dt-meta">
        <span className="dt-date">{formatEntryDayMonth(entry.date)}</span>
        <span className="dt-title">{entry.title}</span>
        <span className="dt-keywords">{entry.keywords.join(' · ')}</span>
      </span>
    </button>
  );
}

/**
 * MY DREAM ARCHIVE's vertical chronological timeline — one continuous line
 * running down the page, each dream a large cinematic image on the left
 * and its date/title/keywords in a narrow column on the right, connected
 * to the line by a small warm node. Data-driven and chronological by
 * construction (see archiveData.ts): adding a real saved dream inserts it
 * in the right place automatically, nothing here is sized for exactly 6
 * items.
 */
export default function DreamTimeline({ entries, onOpenEntry }: DreamTimelineProps) {
  const groups = groupByMonth(entries);
  const closingMonth = monthBeforeOldest(entries);

  return (
    <div className="dt-timeline">
      <div className="dt-line" aria-hidden="true" />
      {groups.map((group, gi) => (
        <div key={`${group.year}-${group.month}-${gi}`} className="dt-month-group">
          {group.showYear && <p className="dt-year">{group.year}</p>}
          <p className="dt-month">{group.month}</p>
          {group.items.map((entry) => (
            <TimelineRow key={entry.id} entry={entry} onOpen={() => onOpenEntry(entry)} />
          ))}
        </div>
      ))}
      {closingMonth && (
        <div className="dt-closing" aria-hidden="true">
          <p className="dt-month dt-month--closing">{closingMonth}</p>
          <p className="dt-closing-note">More dreams from the past</p>
          <span className="dt-closing-chevron">⌄</span>
        </div>
      )}
    </div>
  );
}
