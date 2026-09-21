# Concept backfill for legacy dreams (PREPARED — NOT EXECUTED)

Adds `dreamAnalysis.concepts` and `dreamAnalysis.conceptVersion` to dreams saved before the Concept Layer existed.
Nothing else in a dream is touched. No new table, no schema change, RLS untouched.

Run order (only after the proposal has been reviewed and approved):

1. `01_backup.sql` — run it, save the result as a local JSON file (e.g. `dreams-backup-<date>.json`). Do not continue without that file.
2. `02_apply.template.sql` — the approved id → concepts list is filled in (generated file, kept out of git). Runs in one transaction and aborts unless exactly the expected number of rows change.
3. `03_verify.sql` — checks that every changed dream still equals its backup apart from the two new keys.
4. `04_rollback.sql` — removes only the two added keys (exact inverse, because the apply step is additive). If ever needed, the JSON backup is the last-resort full restore.

Properties: idempotent (a dream that already has `conceptVersion` is skipped), additive only, owner data never crosses accounts (rows are matched by dream id only), concept IDs are the language-independent taxonomy v1.1 IDs.
