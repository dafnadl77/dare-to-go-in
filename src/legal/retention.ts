/**
 * The facts the Privacy Policy and the Terms quote about retention, age and fonts. One place, so the wording can only claim what is true.
 *
 * BACKUP_RETENTION_VERIFIED stays FALSE until someone has looked at the Backblaze B2 bucket (Lifecycle Settings, file versions) and
 * confirmed that old backups are really deleted after BACKUP_RETENTION_DAYS. While it is false the documents say only that backup copies
 * are kept "for a limited period" and never print the number of days. Flip it to true ONLY with that evidence (see
 * docs/upgrade-2026-10/18-launch-legal-prep.md, section "B2 verification"). A test enforces both directions.
 *
 * GOOGLE_FONTS_SELF_HOSTED stays FALSE until the fonts are served from daretogoin.com itself and the CSP no longer allows
 * fonts.googleapis.com / fonts.gstatic.com. While it is false the Privacy Policy tells the reader that Google Fonts receives their IP address.
 */
export const MIN_AGE = 18;

export const BACKUP_RETENTION_DAYS = 35;
export const BACKUP_RETENTION_VERIFIED = false;

export const GOOGLE_FONTS_SELF_HOSTED = false;

/** Temporary analysis result: cleared by a database job that runs every 10 minutes (supabase/migrations/20261005_purge_expired_analysis_results.sql). */
export const ANALYSIS_RESULT_HOURS = 2;

/** The free-dream cookie (server/trialIdentity.ts: COOKIE_MAX_AGE_SECONDS = 365 days). */
export const TRIAL_COOKIE_NAME = 'dare_trial';

/** OpenAI's published retention for API request records kept for abuse monitoring (developers.openai.com, "Your data"). */
export const OPENAI_ABUSE_LOG_DAYS = 30;

/** Contact answer time we commit to for privacy requests. Needs a lawyer's confirmation against the Privacy Protection Regulations. */
export const REQUEST_ANSWER_DAYS = 30;
