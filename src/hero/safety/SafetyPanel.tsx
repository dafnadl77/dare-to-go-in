import { crisisContent, type CrisisContent, type CrisisLevel } from './crisisTexts';
import type { AddressPreference } from '../addressPreference';
import type { AppLanguage } from '../appLanguage';
import './safety.css';

/**
 * The distress path on screen (doc 106): the fixed words, the numbers as phone links, and — only where the journey may go on — what she
 * can answer. Shown by code, in place of the answer box; DARE's conversation does not continue until she answers, and after immediate
 * danger or a threat it does not continue at all.
 */
export default function SafetyPanel(p: { level: CrisisLevel; address: AddressPreference; language: AppLanguage; onChoice?: (id: CrisisContent['choices'][number]['id']) => void }) {
  const c = crisisContent(p.level, p.address, p.language);
  const stops = p.level === 'danger' || p.level === 'threat';
  return (
    <section className="sf-panel" data-level={p.level} role={stops ? 'alert' : 'status'} dir={p.language === 'he' ? 'rtl' : 'ltr'}>
      {c.lines.map((l) => (
        <p key={l}>{l}</p>
      ))}
      {c.contacts.length > 0 && (
        <ul className="sf-contacts">
          {c.contacts.map((x) => (
            <li key={x.number}>
              <a href={x.href} className="sf-call">
                <span className="sf-number">{x.number}</span>
                <span>{x.label}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {c.choices.length > 0 && p.onChoice && (
        <div className="sf-choices">
          {c.choices.map((x) => (
            <button key={x.id} type="button" className="dm-btn" onClick={() => p.onChoice?.(x.id)}>
              {x.label}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
