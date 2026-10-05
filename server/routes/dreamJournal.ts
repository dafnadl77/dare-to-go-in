import { errorResult, type HandlerResult } from '../httpResult.js';
import { verifyBearerToken, type RequestHeaders, type VerifyBearerResult } from '../callerIdentity.js';
import { getSupabaseUserScopedClient } from '../supabaseUserScopedClient.js';
import { DREAM_JOURNAL_EXPORT, hasEntitlement } from '../entitlements.js';
import { renderJournalPdf } from '../pdf/journalRender.js';
import {
  FAILURE_STATUS,
  buildJournalDocument,
  parseJournalRequest,
  type DreamRow,
  type ExportDeps,
  type ExportFailure,
  type PatternRow,
} from '../pdf/journalExport.js';
import { JOURNAL_LIMITS, type JournalDocument } from '../pdf/journalTypes.js';
import { PATTERN_REFLECTION_PROMPT_VERSION } from '../../src/archive/patternReflectionSchema.js';
import { CONCEPT_TAXONOMY_VERSION } from '../../src/hero/conceptTaxonomy.js';

/** A normal JSON result, or the finished PDF (sent as a download, never stored). */
export type JournalHandlerResult = HandlerResult | { status: 200; pdf: Uint8Array };

export const FAILURE_MESSAGES: Record<ExportFailure, string> = {
  invalid_request: 'The export request is not valid.',
  entitlement_required: 'Dream Journal export is included with the DIVE IN package.',
  not_configured: 'Dream Journal export is not available right now.',
  dreams_not_found: 'Some of the selected dreams could not be found in your archive.',
  nothing_to_export: 'There are no saved dreams to export yet.',
  export_too_large: 'This export is too large. Please choose fewer dreams.',
};

export interface DreamJournalDeps {
  verifyBearer: (authorizationHeader: string) => Promise<VerifyBearerResult>;
  /** Builds the I/O for ONE verified caller. */
  exportDeps: (userId: string, accessToken: string) => ExportDeps | null;
  render: (document: JournalDocument) => Promise<{ pdf: Uint8Array }>;
}

function bearerToken(header: string): string | null {
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() || null : null;
}

/**
 * The real I/O. The caller's OWN verified session (anon key + their token) does every read, so Row Level Security
 * is the boundary for dreams, pattern reflections and the dream-images bucket exactly as it is in the browser.
 * The only privileged call is the entitlement check (service role, owner = the verified user).
 */
export function realExportDeps(_userId: string, accessToken: string): ExportDeps | null {
  const client = getSupabaseUserScopedClient(accessToken);
  if (!client) return null;
  return {
    hasEntitlement: (id) => hasEntitlement(id, DREAM_JOURNAL_EXPORT),
    async loadDreams(id, ids) {
      let query = client.from('dreams').select('id, owner_id, created_at, favorite, payload').eq('owner_id', id);
      if (ids) query = query.in('id', ids);
      const { data, error } = await query.order('created_at', { ascending: true }).limit(JOURNAL_LIMITS.maxDreams + 1);
      return error ? null : ((data ?? []) as DreamRow[]);
    },
    async downloadImage(path) {
      const { data, error } = await client.storage.from('dream-images').download(path);
      if (error || !data) return null;
      return new Uint8Array(await data.arrayBuffer());
    },
    async loadPatterns(id) {
      const { data, error } = await client
        .from('pattern_reflections')
        .select('concept_id, language, dream_ids, reflection, created_at')
        .eq('owner_id', id)
        .eq('prompt_version', PATTERN_REFLECTION_PROMPT_VERSION)
        .eq('concept_version', CONCEPT_TAXONOMY_VERSION)
        .order('created_at', { ascending: false })
        .limit(200);
      return error ? null : ((data ?? []) as PatternRow[]);
    },
  };
}

const realDeps: DreamJournalDeps = {
  verifyBearer: verifyBearerToken,
  exportDeps: realExportDeps,
  render: renderJournalPdf,
};

/** One export at a time per account per instance (each one launches a browser): a second answers 429. */
const inFlight = new Set<string>();

/**
 * POST /api/dream-journal: the Dream Journal PDF.
 *  - Authenticated only; the account is ALWAYS the verified token's user (no owner/user id is read from the body).
 *  - Authorized server-side: the `dream_journal_export` entitlement (granted by DIVE IN) is checked in the database;
 *    hiding a button is never the protection.
 *  - Every selected dream must be owned by the caller; one foreign/unknown id fails the whole request identically.
 *  - Generated on demand and streamed back; nothing is stored, no public URL exists. No AI is called.
 *  - Never logs dream content, only reason codes.
 */
export async function handleDreamJournal(
  rawBody: unknown,
  requestHeaders: RequestHeaders,
  deps: DreamJournalDeps = realDeps,
): Promise<JournalHandlerResult> {
  const authHeader = requestHeaders.authorization;
  if (!authHeader) return errorResult(401, 'not_authenticated', 'Exporting your journal requires being signed in.');
  const verified = await deps.verifyBearer(authHeader);
  if (!verified.ok) return errorResult(verified.status, verified.reason, verified.message);
  const token = bearerToken(authHeader);
  if (!token) return errorResult(401, 'not_authenticated', 'Malformed Authorization header.');

  const parsed = parseJournalRequest(rawBody);
  if (!parsed.ok) return errorResult(FAILURE_STATUS[parsed.reason], parsed.reason, FAILURE_MESSAGES[parsed.reason]);

  if (inFlight.has(verified.userId)) return errorResult(429, 'export_in_progress', 'Your journal is already being prepared. Please wait a moment.');
  inFlight.add(verified.userId);
  try {
    const exportDeps = deps.exportDeps(verified.userId, token);
    if (!exportDeps) return errorResult(503, 'not_configured', FAILURE_MESSAGES.not_configured);
    const built = await buildJournalDocument(verified.userId, parsed.value, exportDeps);
    if (!built.ok) return errorResult(FAILURE_STATUS[built.reason], built.reason, FAILURE_MESSAGES[built.reason]);
    try {
      const { pdf } = await deps.render(built.document);
      return { status: 200, pdf };
    } catch (err) {
      console.error(`dream_journal_render_failed error=${err instanceof Error ? err.name : 'unknown'}`);
      return errorResult(500, 'export_failed', 'The journal could not be created. Please try again.');
    }
  } finally {
    inFlight.delete(verified.userId);
  }
}
