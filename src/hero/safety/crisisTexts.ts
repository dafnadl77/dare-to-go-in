import type { AddressPreference } from '../addressPreference.js';
import type { AppLanguage } from '../appLanguage.js';

/**
 * The fixed words of the distress path (doc 106, section ד, approved 2026-10-24). Written here, shown by code — never by the model —
 * so they are there even when no model or network is. Every level in every form of address.
 *
 * To verify before a public opening (doc 106): ERAN's and SAHAR's hours and SAHAR's chat address.
 */

export type CrisisLevel = 'uncertain' | 'concern' | 'after-not-immediate' | 'danger' | 'threat';
export interface CrisisContact {
  label: string;
  number: string;
  href: string;
}
export interface CrisisContent {
  lines: string[];
  contacts: CrisisContact[];
  /** What she can answer; none when the dream exploration stops here. */
  choices: { id: 'dream' | 'also-now' | 'in-danger' | 'not-immediate'; label: string }[];
}

const tel = (label: string, number: string): CrisisContact => ({ label, number, href: `tel:${number}` });
const HE = { mda: tel('מד"א', '101'), police: tel('משטרה', '100'), eran: tel('ער"ן — עזרה ראשונה נפשית', '1201') };
const EN = { mda: tel('Magen David Adom (ambulance)', '101'), police: tel('Police', '100'), eran: tel('ERAN — emotional first aid', '1201') };

/** The few words that change with her address; everything else is the same for everyone. */
const forms = (a: AddressPreference) => ({
  safe: a === 'masculine' ? 'אתה בטוח כרגע?' : a === 'feminine' ? 'את בטוחה כרגע?' : 'האם יש סכנה כרגע?',
  feelNow: a === 'masculine' ? 'משהו שאתה מרגיש' : a === 'feminine' ? 'משהו שאת מרגישה' : 'משהו שמרגישים',
  trust: a === 'masculine' ? 'שאתה סומך עליו' : a === 'feminine' ? 'שאת סומכת עליו' : 'שאפשר לסמוך עליו',
  ifYou: a === 'masculine' ? 'אם אתה בסכנה עכשיו' : a === 'feminine' ? 'אם את בסכנה עכשיו' : 'אם יש סכנה עכשיו',
  turn: a === 'masculine' ? 'פנה עכשיו לאדם קרוב, או בקש ממישהו להיות איתך' : a === 'feminine' ? 'פני עכשיו לאדם קרוב, או בקשי ממישהו להיות איתך' : 'כדאי לפנות עכשיו לאדם קרוב, או לבקש ממישהו להיות לצידך',
  forYou: a === 'masculine' ? 'אם קשה לך עכשיו' : a === 'feminine' ? 'אם קשה לך עכשיו' : 'אם קשה עכשיו',
});

export function crisisContent(level: CrisisLevel, address: AddressPreference, language: AppLanguage): CrisisContent {
  if (language !== 'he') {
    if (level === 'uncertain')
      return { lines: ['I want to be sure: is this something from the dream, or something you feel now, in your day-to-day life too?'], contacts: [], choices: [{ id: 'dream', label: 'From the dream' }, { id: 'also-now', label: 'Now too' }] };
    if (level === 'concern')
      return {
        lines: ['Thank you for telling me. What you wrote matters, and I want to take it seriously. Are you safe right now?', "You don't have to face this alone. You can talk now, free and anonymously, with ERAN at 1201 (Israel). If there is someone close you trust, this is a good time to reach out to them."],
        contacts: [EN.eran],
        choices: [{ id: 'in-danger', label: "I'm in danger now" }, { id: 'not-immediate', label: "I'm not in immediate danger" }],
      };
    if (level === 'after-not-immediate') return { lines: ['All right. We can go back to the dream, or stop here. ERAN, 1201, is there at any hour.'], contacts: [EN.eran], choices: [] };
    if (level === 'danger')
      return { lines: ['If you are in danger now, please get help right away.', 'If you can, reach out now to someone close, or ask someone to be with you.', 'The dream exploration stops here.'], contacts: [EN.mda, EN.police, EN.eran], choices: [] };
    return { lines: ["I can't help with that. If someone is in danger, contact the police right away. If this is hard for you right now, you can talk with ERAN."], contacts: [EN.police, EN.eran], choices: [] };
  }
  const f = forms(address);
  if (level === 'uncertain')
    return { lines: [`רציתי לוודא: זה משהו מהחלום, או ${f.feelNow} גם עכשיו, ביום-יום?`], contacts: [], choices: [{ id: 'dream', label: 'זה מהחלום' }, { id: 'also-now', label: 'גם עכשיו' }] };
  if (level === 'concern')
    return {
      lines: [
        `תודה ששיתפת. מה שכתבת חשוב, ואני רוצה להתייחס אליו ברצינות. ${f.safe}`,
        `לא חייבים להתמודד עם זה לבד. אפשר לדבר עכשיו, בחינם ובאנונימיות, עם ער"ן בטלפון 1201, או בצ'אט של סה"ר. ואם יש מישהו קרוב ${f.trust}, זה זמן טוב לפנות אליו.`,
      ],
      contacts: [HE.eran],
      choices: [{ id: 'in-danger', label: 'אני בסכנה עכשיו' }, { id: 'not-immediate', label: 'אני לא בסכנה מיידית' }],
    };
  if (level === 'after-not-immediate') return { lines: ['בסדר. אפשר לחזור לחלום, או לעצור כאן. ער"ן 1201 זמין בכל שעה.'], contacts: [HE.eran], choices: [] };
  if (level === 'danger')
    return { lines: [`${f.ifYou}, חשוב לפנות מיד לעזרה.`, `אם אפשר, ${f.turn}.`, 'חקירת החלום נעצרת כאן.'], contacts: [HE.mda, HE.police, HE.eran], choices: [] };
  return { lines: [`אני לא יכולה לעזור בזה. אם מישהו בסכנה, פנו מיד למשטרה. ${f.forYou}, אפשר לדבר עם ער"ן.`], contacts: [HE.police, HE.eran], choices: [] };
}
