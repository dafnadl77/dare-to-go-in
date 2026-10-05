# Dream Journal PDF: rollout runbook

Status: **built, validated on Vercel Preview, intentionally NOT deployed.** Nothing here has touched production.

Release branch: `release/dream-journal-pdf` (main + the Dream Journal commits, no preview-only code).
Preview branch: `preview/dream-journal-pdf` (same work plus the fixture harness; **never merge it**, it exists only as evidence).

## What is ready

- `POST /api/dream-journal`: verified bearer only, server-side `dream_journal_export` entitlement, RLS-scoped reads, ownership re-check,
  on-demand streaming, nothing stored. Bounds: 60 dreams, **32 MB total images**, 6 MB per image.
- Archive UI: "Export Dream Journal" dialog (locked DIVE IN message / export all / choose dreams / retry on failure).
- Entitlement model: `PACKAGE_ENTITLEMENTS` (`dive_in_25` only) in `server/entitlements.ts`; `account_entitlements` table in the migration below.

## Migrations

| File | Production state |
|---|---|
| `supabase/migrations/20261005_purge_expired_analysis_results.sql` (pg_cron purge) | **Already applied.** Only the git commit `abbdb9e` is unpushed. |
| `supabase/migrations/20261006_account_entitlements.sql` | **NOT applied.** Rollback-validated (15 scenarios). Apply only at GO LIVE. |

## Known constraints (from the Vercel Preview run)

- Hobby plan allows 12 functions; the project has exactly 12 (including `api/dream-journal.ts`). Pro is required before adding the payment webhook.
- 60 dreams with realistic images: about 22 s warm, about 25-31 s cold, about 1.3 GB peak of about 2.3 GB. `maxDuration` is 60 s.
- Streaming works; PDFs of 25-44 MB downloaded intact. `Content-Length` is sent so a cut-off response fails instead of saving a bad file.

## GO LIVE WITH PAYMENTS: steps, in order

1. **Upgrade Vercel to Pro** (lifts the 12-function cap; needed for the payment webhook function).
2. **Re-verify the branch**: `git fetch`, make sure `release/dream-journal-pdf` contains current `main`; run `npm test`, `npx tsc -b`, `npm run build`.
   Confirm no preview code: `git grep -n previewHarness -- api server tests` must print nothing.
3. **Production DB baseline** (read-only): row counts and fingerprints of `dreams`, `dream_credits`, `credit_ledger`, `dream_attempts`, trial tables, `pattern_reflections`.
4. **Apply `20261006_account_entitlements.sql`** (after a fresh forced-rollback dry run). Verify: table + RLS with no policies, `grant_entitlement`/`has_entitlement`
   executable by `service_role` only, `delete_account_data`/`account_data_remaining` updated, baseline unchanged.
5. **Publish**: fast-forward `main` to `release/dream-journal-pdf` and push once. This is a single production deployment and also publishes the cron commit `abbdb9e`
   (do NOT re-apply that migration). Wait for READY + alias.
6. **Verify live (no real data)**: `POST /api/dream-journal` without a token returns 401; the live bundle contains the export dialog; `/api/credits` reports `entitlements.dreamJournalExport: false`.
7. **Grow / payment webhook** (separate task): on a verified DIVE IN purchase, call `grant_entitlement(owner, 'dream_journal_export', 'purchase', <payment ref>)` for each entry
   of `PACKAGE_ENTITLEMENTS[package]`; idempotent. GO DEEPER and EXPLORE grant none.
8. **Real-account smoke test** (needs explicit approval first): grant the entitlement to a dedicated test account only, export a small journal in EN and HE,
   confirm the PDF opens, then remove that test grant.
9. Delete `preview/dream-journal-pdf` once it is no longer needed.
