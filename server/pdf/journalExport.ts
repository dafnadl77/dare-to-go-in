import type { AppLanguage } from '../../src/hero/appLanguage.js';
import type { SavedDream } from '../../src/hero/dreamStorage.js';
import { dreamContentLanguage, titleFromSavedDream } from '../../src/archive/archiveData.js';
import { CONCEPTS, CONCEPT_IDS, conceptLabel, type ConceptId } from '../../src/hero/conceptTaxonomy.js';
import { validatePatternReflectionResult } from '../../src/archive/patternReflectionSchema.js';
import { JOURNAL_STRINGS } from './journalStrings.js';
import { parseDataUriImage, readImageInfo, toDataUri } from './imageInfo.js';
import { JOURNAL_LIMITS, type JournalDocument, type JournalDream, type JournalImage, type JournalPattern } from './journalTypes.js';

/**
 * The Dream Journal export pipeline: validates the request, checks the entitlement, loads ONLY the caller's own
 * stored data, and turns it into a JournalDocument. Everything is read from what DARE already stores; nothing is
 * generated, translated or fetched from the internet (images come only from the caller's own Storage folder or the
 * legacy inline data URI, both validated as real images).
 *
 * All I/O goes through injectable deps so the security properties (ownership, entitlement, limits, no remote
 * images) are testable without a database or a browser.
 */

export type ExportFailure =
  | 'invalid_request'
  | 'entitlement_required'
  | 'not_configured'
  | 'dreams_not_found'
  | 'nothing_to_export'
  | 'export_too_large';

export const FAILURE_STATUS: Record<ExportFailure, number> = {
  invalid_request: 400,
  entitlement_required: 403,
  not_configured: 503,
  dreams_not_found: 404,
  nothing_to_export: 404,
  export_too_large: 413,
};

export interface JournalRequest {
  all: boolean;
  dreamIds: string[];
  language: AppLanguage;
  timeZone: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Strict validation of the untrusted body. Unknown keys are ignored; an owner/user id is never read. */
export function parseJournalRequest(raw: unknown): { ok: true; value: JournalRequest } | { ok: false; reason: 'invalid_request' | 'export_too_large' } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: 'invalid_request' };
  const body = raw as { all?: unknown; dreamIds?: unknown; language?: unknown; timeZone?: unknown };
  const language: AppLanguage | null = body.language === 'he' ? 'he' : body.language === 'en' ? 'en' : null;
  if (!language) return { ok: false, reason: 'invalid_request' };
  const hasAll = body.all === true;
  const hasIds = body.dreamIds !== undefined;
  if (hasAll === hasIds) return { ok: false, reason: 'invalid_request' }; // exactly one of the two
  let dreamIds: string[] = [];
  if (hasIds) {
    if (!Array.isArray(body.dreamIds) || body.dreamIds.length === 0) return { ok: false, reason: 'invalid_request' };
    if (body.dreamIds.length > JOURNAL_LIMITS.maxDreams) return { ok: false, reason: 'export_too_large' };
    for (const id of body.dreamIds) {
      if (typeof id !== 'string' || !UUID.test(id)) return { ok: false, reason: 'invalid_request' };
    }
    dreamIds = Array.from(new Set((body.dreamIds as string[]).map((id) => id.toLowerCase())));
  } else if (body.all !== true) {
    return { ok: false, reason: 'invalid_request' };
  }
  let timeZone = 'UTC';
  if (typeof body.timeZone === 'string' && body.timeZone.length <= 64) {
    try {
      new Intl.DateTimeFormat('en', { timeZone: body.timeZone });
      timeZone = body.timeZone;
    } catch {
      /* an unknown zone falls back to UTC */
    }
  }
  return { ok: true, value: { all: hasAll, dreamIds, language, timeZone } };
}

/** A row of the `dreams` table as stored. */
export interface DreamRow {
  id: string;
  owner_id: string;
  created_at: string;
  favorite?: boolean;
  payload: unknown;
}

export interface PatternRow {
  concept_id: string;
  language: string;
  dream_ids: string[];
  reflection: unknown;
  created_at: string;
}

export interface ExportDeps {
  hasEntitlement(userId: string): Promise<boolean | null>;
  /** The caller's own dreams (RLS-scoped). `ids === null` means all of them. null = could not be loaded. */
  loadDreams(userId: string, ids: string[] | null): Promise<DreamRow[] | null>;
  /** Bytes of an object in the caller's own storage folder, or null. Only called with a path already validated as `${userId}/<uuid>.jpg`. */
  downloadImage(path: string): Promise<Uint8Array | null>;
  loadPatterns(userId: string): Promise<PatternRow[] | null>;
}

export type ExportBuild = { ok: true; document: JournalDocument } | { ok: false; reason: ExportFailure };

const IMAGE_PATH = (userId: string) => new RegExp(`^${userId.replace(/[^0-9a-f-]/gi, '')}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.jpg$`, 'i');

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
function optional(value: unknown): string | null {
  const text = str(value).trim();
  return text ? text : null;
}

/** Reconstructs just enough of a SavedDream (read-only) to reuse the Archive's own title derivation. */
function asSavedDream(row: DreamRow, payload: Record<string, unknown>): SavedDream {
  return { id: row.id, createdAt: row.created_at, ...(payload as object) } as SavedDream;
}

function safeTitle(dream: SavedDream, language: AppLanguage): string {
  try {
    return titleFromSavedDream(dream, language);
  } catch {
    return JOURNAL_STRINGS[language].untitled;
  }
}

function safeContentLanguage(dream: SavedDream): AppLanguage {
  try {
    return dreamContentLanguage(dream);
  } catch {
    return 'en';
  }
}

async function loadImage(
  userId: string,
  payload: Record<string, unknown>,
  deps: ExportDeps,
  budget: { bytes: number },
): Promise<JournalImage | null | 'too_large'> {
  let bytes: Uint8Array | null = null;
  let info = null as ReturnType<typeof readImageInfo>;
  const path = payload.dreamImagePath;
  if (typeof path === 'string' && path) {
    // The path is user-writable JSON: only the caller's own folder is ever read (no other user's, no traversal).
    if (!IMAGE_PATH(userId).test(path)) return null;
    bytes = await deps.downloadImage(path);
    info = bytes ? readImageInfo(bytes) : null;
  } else if (payload.dreamImageDataUrl) {
    // Legacy inline image: accepted only as a base64 data URI of a real image, never as a URL.
    const parsed = parseDataUriImage(payload.dreamImageDataUrl, JOURNAL_LIMITS.maxSingleImageBytes);
    if (parsed) {
      bytes = parsed.bytes;
      info = parsed.info;
    }
  }
  if (!bytes || !info) return null;
  if (bytes.length > JOURNAL_LIMITS.maxSingleImageBytes) return null;
  budget.bytes += bytes.length;
  if (budget.bytes > JOURNAL_LIMITS.maxTotalImageBytes) return 'too_large';
  return { dataUri: toDataUri(bytes, info.mime), width: info.width, height: info.height };
}

export async function buildJournalDocument(userId: string, request: JournalRequest, deps: ExportDeps): Promise<ExportBuild> {
  const entitled = await deps.hasEntitlement(userId);
  if (entitled === null) return { ok: false, reason: 'not_configured' };
  if (!entitled) return { ok: false, reason: 'entitlement_required' };

  const rows = await deps.loadDreams(userId, request.all ? null : request.dreamIds);
  if (rows === null) return { ok: false, reason: 'not_configured' };
  // Defense in depth on top of RLS: only rows this user owns can ever count.
  const owned = rows.filter((r) => r && r.owner_id === userId && UUID.test(String(r.id)));
  if (request.all) {
    if (owned.length === 0) return { ok: false, reason: 'nothing_to_export' };
    if (owned.length > JOURNAL_LIMITS.maxDreams) return { ok: false, reason: 'export_too_large' };
  } else {
    // A selection containing ANY id the caller does not own (or that does not exist) fails as a whole, and the
    // answer is the same either way, so it reveals nothing about someone else's data.
    const have = new Set(owned.map((r) => r.id.toLowerCase()));
    if (request.dreamIds.some((id) => !have.has(id))) return { ok: false, reason: 'dreams_not_found' };
  }

  const ordered = [...owned].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const budget = { bytes: 0 };
  let textChars = 0;
  const dreams: JournalDream[] = [];
  for (const row of ordered) {
    const payload = row.payload && typeof row.payload === 'object' ? (row.payload as Record<string, unknown>) : {};
    const saved = asSavedDream(row, payload);
    // The language the dream is actually written in (the Archive's own rule: a stored appLanguage can be stale for older records).
    const language = safeContentLanguage(saved);
    const image = await loadImage(userId, payload, deps, budget);
    if (image === 'too_large') return { ok: false, reason: 'export_too_large' };
    const reflection = (payload.dreamReflection && typeof payload.dreamReflection === 'object' ? payload.dreamReflection : {}) as Record<string, unknown>;
    const dream: JournalDream = {
      id: row.id,
      createdAt: row.created_at,
      language,
      title: safeTitle(saved, language),
      sourceText: str(payload.sourceText),
      selectedElement: optional(payload.selectedElement),
      association: optional(payload.reflectionResponse),
      thread: optional(reflection.possibleThread),
      question: optional(reflection.continuityQuestion),
      image,
    };
    textChars += [dream.title, dream.sourceText, dream.selectedElement, dream.association, dream.thread, dream.question].reduce((n, t) => n + (t?.length ?? 0), 0);
    if (textChars > JOURNAL_LIMITS.maxTotalTextChars) return { ok: false, reason: 'export_too_large' };
    dreams.push(dream);
  }

  const patterns = await buildPatterns(userId, request.language, dreams, deps);
  return { ok: true, document: { language: request.language, timeZone: request.timeZone, dreams, patterns } };
}

/**
 * Only EXISTING stored Pattern Reflections: never generated here. A pattern is included when every dream it was
 * written about is part of this export; per concept the newest stored row wins, preferring the export language.
 */
async function buildPatterns(userId: string, language: AppLanguage, dreams: JournalDream[], deps: ExportDeps): Promise<JournalPattern[]> {
  const rows = await deps.loadPatterns(userId);
  if (!rows || rows.length === 0) return [];
  const inExport = new Map(dreams.map((d) => [d.id.toLowerCase(), d]));
  const best = new Map<ConceptId, { row: PatternRow; rank: number }>();
  for (const row of rows) {
    if (!row || !(CONCEPT_IDS as readonly string[]).includes(row.concept_id)) continue;
    if (row.language !== 'en' && row.language !== 'he') continue;
    if (!Array.isArray(row.dream_ids) || row.dream_ids.length === 0) continue;
    if (!row.dream_ids.every((id) => typeof id === 'string' && inExport.has(id.toLowerCase()))) continue;
    if (!validatePatternReflectionResult(row.reflection)) continue;
    const concept = row.concept_id as ConceptId;
    const rank = (row.language === language ? 1e15 : 0) + new Date(row.created_at).getTime();
    const current = best.get(concept);
    if (!current || rank > current.rank) best.set(concept, { row, rank });
  }
  const patterns: JournalPattern[] = [];
  for (const [concept, { row }] of best) {
    const reflection = validatePatternReflectionResult(row.reflection)!;
    const rowLanguage = row.language as AppLanguage;
    const thumbSource = row.dream_ids.map((id) => inExport.get(id.toLowerCase())).find((d) => d?.image);
    patterns.push({
      id: `${concept}-${rowLanguage}`,
      language: rowLanguage,
      label: conceptLabel(concept, rowLanguage) || CONCEPTS[concept].en,
      whatRepeats: reflection.whatRepeats,
      possibleConnection: reflection.possibleConnection,
      directionToExplore: reflection.directionToExplore,
      question: reflection.question,
      thumbnail: thumbSource?.image ?? null,
    });
  }
  return patterns.sort((a, b) => a.label.localeCompare(b.label));
}
