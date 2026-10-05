import { getAuthHeader } from '../auth/getAccessToken';
import type { AppLanguage } from '../hero/appLanguage';

/**
 * Client side of the Dream Journal export. Nothing here decides anything: whether the account may export is the
 * SERVER's answer (the `dream_journal_export` entitlement, granted by DIVE IN), the status below only decides which
 * dialog to show, and the export request itself is checked again on the server.
 */

/** 'unknown' = the status could not be determined (offline, server hiccup): the dialog offers a retry instead of guessing. */
export type JournalAccess = 'entitled' | 'locked' | 'unknown';

export async function fetchJournalAccess(): Promise<JournalAccess> {
  try {
    const authHeader = await getAuthHeader();
    if (!authHeader.Authorization) return 'unknown';
    const res = await fetch('/api/credits', { headers: authHeader, cache: 'no-store' });
    if (!res.ok) return 'unknown';
    const data: unknown = await res.json().catch(() => null);
    const flag =
      data && typeof data === 'object'
        ? ((data as { entitlements?: { dreamJournalExport?: unknown } }).entitlements?.dreamJournalExport ?? undefined)
        : undefined;
    return flag === true ? 'entitled' : flag === false ? 'locked' : 'unknown';
  } catch {
    return 'unknown';
  }
}

export type JournalExportError =
  | 'entitlement_required'
  | 'export_too_large'
  | 'dreams_not_found'
  | 'export_in_progress'
  | 'not_authenticated'
  | 'failed';

export type JournalExportResult = { ok: true; blob: Blob } | { ok: false; reason: JournalExportError };

const KNOWN: JournalExportError[] = ['entitlement_required', 'export_too_large', 'dreams_not_found', 'export_in_progress', 'not_authenticated'];

/** Requests the PDF. The body carries only the selection, the language and the time zone: never an owner or user id. */
export async function requestJournalPdf(
  selection: { all: true } | { dreamIds: string[] },
  language: AppLanguage,
): Promise<JournalExportResult> {
  try {
    const authHeader = await getAuthHeader();
    if (!authHeader.Authorization) return { ok: false, reason: 'not_authenticated' };
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const res = await fetch('/api/dream-journal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify({ ...selection, language, timeZone }),
    });
    if (res.ok && (res.headers.get('content-type') ?? '').includes('application/pdf')) {
      return { ok: true, blob: await res.blob() };
    }
    const data: unknown = await res.json().catch(() => null);
    const reason = data && typeof data === 'object' ? (data as { reason?: unknown }).reason : undefined;
    return { ok: false, reason: typeof reason === 'string' && (KNOWN as string[]).includes(reason) ? (reason as JournalExportError) : 'failed' };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

/** Hands the finished PDF to the browser as a download; the object URL is revoked right after. */
export function saveJournalBlob(blob: Blob, date: Date = new Date()): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `DARE-Dream-Journal-${date.toISOString().slice(0, 10)}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
