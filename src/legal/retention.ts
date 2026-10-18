/**
 * The facts the Privacy Policy and the Terms quote about retention, age and fonts. One place, so the wording can only claim what is true.
 *
 * BACKUP_RETENTION_VERIFIED stays FALSE until BOTH are confirmed in Backblaze B2: (1) Object Lock is OFF for the bucket (a locked file version is
 * never deleted by a lifecycle rule) and (2) the first deletions were seen (the oldest backups, from about 19 September 2026, are hidden around
 * 24 October and deleted around 25-26 October). While it is false the documents say only that a copy of a deleted dream may remain in the backups
 * and that an automatic deletion period is being set; they never print a number of days. Flip it to true ONLY with that evidence (see
 * docs/upgrade-2026-10/18-launch-legal-prep.md). A test enforces both directions.
 *
 * GOOGLE_FONTS_SELF_HOSTED is true: the fonts are served from /fonts (public/fonts) and the CSP no longer allows fonts.googleapis.com or
 * fonts.gstatic.com. A test keeps the flag, the pages and the CSP in step.
 */
export const MIN_AGE = 18;

/** The two Backblaze B2 lifecycle rules set on 2026-10-18 (prefixes `database/` and `storage/dream-images/`). */
export const BACKUP_HIDE_AFTER_DAYS = 34;
export const BACKUP_DELETE_AFTER_HIDING_DAYS = 1;
/**
 * The honest worst case, not the 35 that was asked for: B2 applies its rules once a day (docs: "Rules are applied once per day"), so a file is hidden
 * at the first daily run AFTER day 34 and deleted at the first daily run AFTER one more day: 34 + 1 + 2 = 37 days after upload. Hidden files can still be
 * downloaded by file id until they are deleted. To guarantee 35 days, set the rules to 32 + 1 (32 + 1 + 2 = 35) and change the two numbers above.
 */
export const BACKUP_RETENTION_DAYS = BACKUP_HIDE_AFTER_DAYS + BACKUP_DELETE_AFTER_HIDING_DAYS + 2;
export const BACKUP_RETENTION_VERIFIED = false;

export const GOOGLE_FONTS_SELF_HOSTED = true;

/** Temporary analysis result: cleared by a database job that runs every 10 minutes (supabase/migrations/20261005_purge_expired_analysis_results.sql). */
export const ANALYSIS_RESULT_HOURS = 2;

/** The free-dream cookie (server/trialIdentity.ts: COOKIE_MAX_AGE_SECONDS = 365 days). */
export const TRIAL_COOKIE_NAME = 'dare_trial';

/** OpenAI's published retention for API request records kept for abuse monitoring (developers.openai.com, "Your data"). */
export const OPENAI_ABUSE_LOG_DAYS = 30;

/** Contact answer time we commit to for privacy requests. Needs a lawyer's confirmation against the Privacy Protection Regulations. */
export const REQUEST_ANSWER_DAYS = 30;
