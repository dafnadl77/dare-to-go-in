import type { AppLanguage } from '../../src/hero/appLanguage.js';
import { en as enTranslations, he as heTranslations } from '../../src/i18n/translations.js';

/**
 * The static wording of the Dream Journal itself (cover, contents, closing). Labels that already
 * exist in the app (the sections of a dream, the pattern fields) are REUSED from the app's own
 * translations so the PDF and the Archive never drift apart. None of this is dream content.
 */
export interface JournalStrings {
  brand: string;
  coverTitleLines: [string, string];
  coverSubtitle: string;
  createdBy: string;
  creatorSite: string;
  toc: string;
  headerLabel: string;
  patternsHeaderLabel: string;
  patternsHeading: string;
  patternsIntro: string;
  closingTitle: string;
  closingBody: string;
  /** Section labels of one dream (reused from dreamDetail). */
  theDream: string;
  whatStoodOut: string;
  yourAssociation: string;
  possibleThread: string;
  worthSittingWith: string;
  disclaimer: string;
  /** Pattern field labels (reused from the Archive). */
  whatRepeats: string;
  whatMayConnect: string;
  directionToExplore: string;
  questionToKeep: string;
  untitled: string;
}

const BRAND = 'DARE TO GO IN';
const CREATOR_SITE = 'dafnadl.co.il';
/** The creator credit is NEVER translated: identical in every language (rendered as one left-to-right run). */
const CREATED_BY = 'Created by Dafna Dalmeida';
export const CREATOR_CREDIT = `${CREATED_BY} · ${CREATOR_SITE}`;

export const JOURNAL_STRINGS: Record<AppLanguage, JournalStrings> = {
  en: {
    brand: BRAND,
    coverTitleLines: ['My', 'Dream Journal'],
    coverSubtitle: 'A collection of my dreams, insights and inner journeys',
    createdBy: CREATED_BY,
    creatorSite: CREATOR_SITE,
    toc: 'Table of Contents',
    headerLabel: 'My Dreams',
    patternsHeaderLabel: 'Patterns',
    patternsHeading: 'Patterns Across My Dreams',
    patternsIntro: 'Looking at these dreams together, some themes return. They are possibilities to reflect on, not conclusions.',
    closingTitle: 'Thank you for exploring your dreams.',
    closingBody: 'May you continue to listen to your inner world and follow the paths that feel true to you.',
    theDream: enTranslations.dreamDetail.theDream,
    whatStoodOut: enTranslations.dreamDetail.whatStoodOut,
    yourAssociation: enTranslations.dreamDetail.yourAssociation,
    possibleThread: enTranslations.dreamDetail.aPossibleThread,
    worthSittingWith: enTranslations.dreamDetail.aQuestionWorthSittingWith,
    disclaimer: enTranslations.dreamDetail.disclaimer,
    whatRepeats: enTranslations.archive.reflectionWhatRepeats,
    whatMayConnect: enTranslations.archive.reflectionPossibleConnection,
    directionToExplore: enTranslations.archive.reflectionDirectionToExplore,
    questionToKeep: enTranslations.archive.reflectionQuestion,
    untitled: 'Untitled dream',
  },
  he: {
    brand: BRAND,
    coverTitleLines: ['יומן', 'החלומות שלי'],
    coverSubtitle: 'אוסף החלומות, התובנות והמסעות הפנימיים שלי',
    createdBy: CREATED_BY,
    creatorSite: CREATOR_SITE,
    toc: 'תוכן העניינים',
    headerLabel: 'החלומות שלי',
    patternsHeaderLabel: 'דפוסים',
    patternsHeading: 'דפוסים שחוזרים בחלומות שלי',
    patternsIntro: 'כשמסתכלים על החלומות יחד, כמה נושאים חוזרים. אלה אפשרויות להתבוננות, לא מסקנות.',
    closingTitle: 'תודה שחקרתם את החלומות שלכם.',
    closingBody: 'שתמשיכו להקשיב לעולם הפנימי שלכם ולעקוב אחרי הדרכים שמרגישות נכונות לכם.',
    theDream: heTranslations.dreamDetail.theDream,
    whatStoodOut: heTranslations.dreamDetail.whatStoodOut,
    yourAssociation: heTranslations.dreamDetail.yourAssociation,
    possibleThread: heTranslations.dreamDetail.aPossibleThread,
    worthSittingWith: heTranslations.dreamDetail.aQuestionWorthSittingWith,
    disclaimer: heTranslations.dreamDetail.disclaimer,
    whatRepeats: heTranslations.archive.reflectionWhatRepeats,
    whatMayConnect: heTranslations.archive.reflectionPossibleConnection,
    directionToExplore: heTranslations.archive.reflectionDirectionToExplore,
    questionToKeep: heTranslations.archive.reflectionQuestion,
    untitled: 'חלום ללא כותרת',
  },
};
