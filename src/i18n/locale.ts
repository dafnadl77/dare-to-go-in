import type { AppLanguage } from '../hero/appLanguage';

/** The BCP-47 locale backing Intl/Date formatting for each app language —
    kept in this one place so no component hard-codes 'en-US' itself. */
export function dateLocale(language: AppLanguage): string {
  return language === 'he' ? 'he-IL' : 'en-US';
}
