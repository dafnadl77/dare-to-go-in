import { existsSync, readFileSync } from 'node:fs';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRef } from 'pdf-lib';
import type { Browser, Page } from 'puppeteer-core';
import { buildJournalHtml, DEFAULT_LAYOUT, hasTableOfContents, type DreamLayout, type JournalAssets } from './journalHtml.js';
import type { JournalDocument } from './journalTypes.js';

/**
 * Renders a JournalDocument to a PDF with headless Chromium (text stays real, selectable text with
 * embedded fonts; Hebrew/RTL is laid out by the browser's own bidi engine; pagination uses CSS
 * fragmentation, named @page rules and page-margin boxes).
 *
 * Table-of-Contents page numbers need the real pagination, so a cheap MEASURING pass (images replaced by
 * identically sized empty boxes) renders first; the TOC links Chromium writes into that PDF are internal
 * destinations, from which the page of every section is read. The REAL pass then prints the same markup with
 * the true numbers, and its own destinations are re-checked against the numbers it printed (re-rendering,
 * at most twice more, if they ever disagree).
 *
 * Privacy/security: the page can load nothing from the network (every request that is not a data: URI is
 * aborted), carries a no-script CSP, and the browser is closed afterwards. Nothing is written to disk.
 */

const FONT_DIR = new URL('./fonts/', import.meta.url);
const ASSET_DIR = new URL('./assets/', import.meta.url);

let cachedAssets: JournalAssets | null = null;

export function loadJournalAssets(): JournalAssets {
  if (cachedAssets) return cachedAssets;
  const face = (family: string, file: string, weight: number) =>
    `@font-face{font-family:'${family}';font-weight:${weight};font-style:normal;src:url(data:font/ttf;base64,${readFileSync(new URL(file, FONT_DIR)).toString('base64')}) format('truetype');}`;
  const fontsCss = [
    face('Fraunces', 'Fraunces-400.ttf', 400),
    face('Heebo', 'Heebo-300.ttf', 300),
    face('Heebo', 'Heebo-400.ttf', 400),
    face('Heebo', 'Heebo-500.ttf', 500),
    face('Heebo', 'Heebo-600.ttf', 600),
  ].join('\n');
  const coverArt = `data:image/jpeg;base64,${readFileSync(new URL('cover-portal.jpg', ASSET_DIR)).toString('base64')}`;
  cachedAssets = { fontsCss, coverArt };
  return cachedAssets;
}

// ---------------------------------------------------------------- browser ----

const LOCAL_CHROME_CANDIDATES = [
  process.env.DARE_CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter((p): p is string => !!p);

export async function launchJournalBrowser(): Promise<Browser> {
  const puppeteer = (await import('puppeteer-core')).default;
  const onServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
  if (!onServerless) {
    const local = LOCAL_CHROME_CANDIDATES.find((p) => existsSync(p));
    if (local) return puppeteer.launch({ executablePath: local, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  }
  const chromium = (await import('@sparticuz/chromium')).default;
  return puppeteer.launch({
    executablePath: await chromium.executablePath(),
    args: chromium.args,
    headless: 'shell',
  });
}

// ------------------------------------------------------- reading the TOC ----

export interface LinkDestination {
  /** 1-based page. */
  page: number;
  /** PDF user-space y of the destination (points from the page bottom), when the destination states one. */
  y: number | null;
}

/** Page numbers (1-based) that the internal (#anchor) links of a Chromium-made PDF point at, in document order. */
export async function readInternalLinkPages(pdfBytes: Uint8Array): Promise<number[]> {
  return (await readInternalLinkDestinations(pdfBytes)).map((d) => d.page);
}

/** The (page, y) every internal (#anchor) link of a Chromium-made PDF points at, in page order then document order. */
export async function readInternalLinkDestinations(pdfBytes: Uint8Array): Promise<LinkDestination[]> {
  const pdf = await PDFDocument.load(pdfBytes, { updateMetadata: false });
  const pages = pdf.getPages();
  const refToIndex = new Map<PDFRef, number>();
  pages.forEach((p, i) => refToIndex.set(p.ref, i + 1));
  const out: LinkDestination[] = [];

  const destArray = (dest: unknown): PDFArray | null => {
    if (dest instanceof PDFArray) return dest;
    return null;
  };
  const resolveNamed = (name: string): PDFArray | null => {
    const catalog = pdf.catalog;
    const dests = catalog.lookupMaybe(PDFName.of('Dests'), PDFDict);
    const direct = dests?.lookup(PDFName.of(name));
    if (direct instanceof PDFArray) return direct;
    if (direct instanceof PDFDict) return destArray(direct.lookup(PDFName.of('D')));
    const names = catalog.lookupMaybe(PDFName.of('Names'), PDFDict)?.lookupMaybe(PDFName.of('Dests'), PDFDict);
    const walk = (node: PDFDict | undefined): PDFArray | null => {
      if (!node) return null;
      const arr = node.lookupMaybe(PDFName.of('Names'), PDFArray);
      if (arr) {
        for (let i = 0; i + 1 < arr.size(); i += 2) {
          const key = arr.lookup(i);
          if (key && String((key as { decodeText?: () => string }).decodeText?.() ?? key) === name) {
            const val = arr.lookup(i + 1);
            if (val instanceof PDFArray) return val;
            if (val instanceof PDFDict) return destArray(val.lookup(PDFName.of('D')));
          }
        }
      }
      const kids = node.lookupMaybe(PDFName.of('Kids'), PDFArray);
      if (kids) {
        for (let i = 0; i < kids.size(); i += 1) {
          const found = walk(kids.lookup(i, PDFDict));
          if (found) return found;
        }
      }
      return null;
    };
    return walk(names);
  };

  for (const page of pages) {
    const annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
    if (!annots) continue;
    for (let i = 0; i < annots.size(); i += 1) {
      const annot = annots.lookup(i, PDFDict);
      if (annot.get(PDFName.of('Subtype')) !== PDFName.of('Link')) continue;
      let dest = annot.lookup(PDFName.of('Dest'));
      if (!dest) {
        const action = annot.lookupMaybe(PDFName.of('A'), PDFDict);
        if (action && action.get(PDFName.of('S')) === PDFName.of('GoTo')) dest = action.lookup(PDFName.of('D'));
      }
      let arr = destArray(dest);
      if (!arr && dest) {
        const name = (dest as { decodeText?: () => string; asString?: () => string }).decodeText?.() ?? (dest as { asString?: () => string }).asString?.();
        if (typeof name === 'string') arr = resolveNamed(name);
      }
      if (!arr) continue; // external (URI) links and anything unresolved are not TOC entries
      const target = arr.get(0);
      if (target instanceof PDFRef) {
        const idx = refToIndex.get(target);
        if (idx) {
          const y = arr.size() > 3 ? arr.lookup(3) : null;
          out.push({ page: idx, y: y instanceof PDFNumber ? y.asNumber() : null });
        }
      }
    }
  }
  return out;
}

// ------------------------------------------------------------------ render ----

/**
 * A page that can load NOTHING from the network: every request that is not a data: URI is aborted. This is the only way
 * the renderer ever opens a page. `onBlocked` is only for diagnostics (e.g. the Preview check) and receives the URL.
 */
export async function createLockedPage(browser: Browser, onBlocked?: (url: string) => void): Promise<Page> {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.startsWith('data:') || url === 'about:blank') void req.continue();
    else {
      onBlocked?.(url);
      void req.abort('blockedbyclient');
    }
  });
  return page;
}

async function printHtml(browser: Browser, html: string): Promise<Uint8Array> {
  const page = await createLockedPage(browser);
  try {
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate('document.fonts.ready.then(() => true)');
    return await page.pdf({
      preferCSSPageSize: true,
      printBackground: true,
      tagged: true,
      displayHeaderFooter: false,
    });
  } finally {
    await page.close().catch(() => {});
  }
}

const MAX_REAL_PASSES = 3;

// ------------------------------------------------- avoiding nearly empty pages ----

/** The A4 text area of a dream page (margins 26mm top / 24mm bottom / 20mm sides, see journalHtml.ts). */
const PT_PER_MM = 72 / 25.4;
const PAGE_TEXT_TOP_Y = 841.89 - 26 * PT_PER_MM;
const PAGE_TEXT_HEIGHT_MM = 297 - 26 - 24;
const PAGE_TEXT_HEIGHT_PT = PAGE_TEXT_HEIGHT_MM * PT_PER_MM;
const CONTENT_WIDTH_MM = 170;
/** The dream image is never made smaller than this to win space. */
const MIN_IMG_MM = 62;
/** A dream's last page counts as "nearly empty" up to this share of the text area (about 80 mm of content). */
const NEARLY_EMPTY_FILL = 0.45;
/** Extra millimetres taken off the image beyond the measured spill (line granularity and keep-together slack). */
const FIT_SLACK_MM = 5;
const MAX_FIT_ROUNDS = 4;
/** Growing a shortened image back: at most this many bisection rounds, and only while the gap is worth it. */
const GROW_ROUNDS = 2;
const GROW_MIN_GAP_MM = 6;

interface SectionSpan {
  startPage: number;
  endPage: number;
  /** Share (0..1) of the last page's text area the section's content reaches. */
  endFill: number;
}

interface Measurement {
  sections: SectionSpan[];
  /** Start page of every dream, then of the Patterns section when there is one: exactly the Table of Contents numbers. */
  tocNumbers: number[];
}

/** Prints the markup with empty image boxes and invisible probe links, and reads where every section starts and ends. */
async function measureLayout(browser: Browser, doc: JournalDocument, assets: JournalAssets, layout: DreamLayout[]): Promise<Measurement> {
  const pdf = await printHtml(browser, buildJournalHtml(doc, assets, { placeholderImages: true, tocPageNumbers: null, layout, probes: true }));
  const expected = doc.dreams.length * 2 + (doc.patterns.length ? 1 : 0);
  const dests = (await readInternalLinkDestinations(pdf)).slice(0, expected);
  if (dests.length !== expected) throw new Error('journal layout probes were not found');
  const sections: SectionSpan[] = doc.dreams.map((_, i) => {
    const start = dests[i * 2];
    const end = dests[i * 2 + 1];
    const fill = end.y === null ? 1 : Math.min(1, Math.max(0, (PAGE_TEXT_TOP_Y - end.y) / PAGE_TEXT_HEIGHT_PT));
    return { startPage: start.page, endPage: Math.max(end.page, start.page), endFill: fill };
  });
  const tocNumbers = doc.dreams.map((_, i) => dests[i * 2].page);
  if (doc.patterns.length) tocNumbers.push(dests[expected - 1].page);
  return { sections, tocNumbers };
}

interface FitState {
  layout: DreamLayout;
  attempts: number;
  settled: boolean;
  /** True once the current (adjusted) layout is known to keep the dream within its page. */
  fits: boolean;
  /** An effective image height (mm) known to spill under the current spacing, the upper bound when growing the image back. */
  tooTallMm: number | null;
}

/**
 * A dream that spills a small remainder (a reflection question, a disclaimer) onto an otherwise EMPTY extra page is
 * refitted: first the image gets just as short as needed (never stretched, never below MIN_IMG_MM), then the spacing
 * between blocks tightens a little. Text size is never touched. If a dream cannot be made to fit, it is returned to the
 * designed layout (a continuation page is fine when the content really needs one). Returns whether anything changed.
 */
function refit(doc: JournalDocument, measured: Measurement, states: FitState[]): boolean {
  let changed = false;
  doc.dreams.forEach((dream, i) => {
    const state = states[i];
    const span = measured.sections[i];
    if (state.settled) return;
    const spills = span.endPage > span.startPage;
    if (!spills || span.endFill > NEARLY_EMPTY_FILL) {
      state.settled = true; // fits on its page(s) as designed, or genuinely needs the continuation page
      state.fits = !spills;
      return;
    }
    if (state.attempts >= MAX_FIT_ROUNDS) {
      state.layout = { ...DEFAULT_LAYOUT };
      state.settled = true;
      changed = true;
      return;
    }
    state.attempts += 1;
    const spillMm = span.endFill * PAGE_TEXT_HEIGHT_MM + FIT_SLACK_MM;
    const image = dream.image;
    const currentMm = image ? Math.min(state.layout.imgMaxMm, CONTENT_WIDTH_MM / (image.width / image.height)) : 0;
    if (image && currentMm - spillMm >= MIN_IMG_MM) {
      state.tooTallMm = currentMm;
      state.layout = { ...state.layout, imgMaxMm: Math.floor(currentMm - spillMm) };
      changed = true;
    } else if (!state.layout.compact) {
      state.tooTallMm = null;
      state.layout = { ...state.layout, compact: true };
      changed = true;
    } else if (image && currentMm > MIN_IMG_MM + 0.5) {
      state.tooTallMm = currentMm;
      state.layout = { ...state.layout, imgMaxMm: MIN_IMG_MM };
      changed = true;
    } else {
      state.layout = { ...DEFAULT_LAYOUT };
      state.settled = true;
      changed = true;
    }
  });
  return changed;
}

export interface RenderResult {
  pdf: Uint8Array;
  pageCount: number;
  /** The page numbers printed in the Table of Contents (empty when there is none). */
  tocPageNumbers: number[];
  passes: number;
  /** The layout chosen for each dream (the defaults unless a nearly empty continuation page had to be avoided). */
  layouts: DreamLayout[];
}

export async function renderJournalPdf(doc: JournalDocument, deps: { browser?: Browser; assets?: JournalAssets } = {}): Promise<RenderResult> {
  const assets = deps.assets ?? loadJournalAssets();
  const browser = deps.browser ?? (await launchJournalBrowser());
  try {
    let passes = 0;
    const states: FitState[] = doc.dreams.map(() => ({ layout: { ...DEFAULT_LAYOUT }, attempts: 0, settled: false, fits: false, tooTallMm: null }));
    const layouts = () => states.map((x) => x.layout);
    let measured = await measureLayout(browser, doc, assets, layouts());
    passes += 1;
    for (let round = 0; round < MAX_FIT_ROUNDS + 1; round += 1) {
      if (!refit(doc, measured, states)) break;
      measured = await measureLayout(browser, doc, assets, layouts());
      passes += 1;
    }
    // The fitting layouts above may have cut the image more than necessary (a keep-together block moves whole, so the
    // measured spill overstates what is needed): grow each shortened image back by bisection, keeping what still fits.
    for (let round = 0; round < GROW_ROUNDS; round += 1) {
      const trial = states.map((st) => (st.fits && st.tooTallMm !== null && st.tooTallMm - st.layout.imgMaxMm > GROW_MIN_GAP_MM ? Math.floor((st.layout.imgMaxMm + st.tooTallMm) / 2) : null));
      if (trial.every((t) => t === null)) break;
      const trialMeasure = await measureLayout(browser, doc, assets, states.map((st, i) => (trial[i] === null ? st.layout : { ...st.layout, imgMaxMm: trial[i]! })));
      passes += 1;
      let rejected = false;
      states.forEach((st, i) => {
        if (trial[i] === null) return;
        const span = trialMeasure.sections[i];
        if (span.endPage > span.startPage) {
          st.tooTallMm = trial[i];
          rejected = true;
        } else {
          st.layout = { ...st.layout, imgMaxMm: trial[i]! };
        }
      });
      measured = rejected ? await measureLayout(browser, doc, assets, layouts()) : trialMeasure;
      if (rejected) passes += 1;
    }
    const layout = layouts();
    let numbers: number[] | null = hasTableOfContents(doc) ? measured.tocNumbers : null;
    for (let attempt = 0; attempt < MAX_REAL_PASSES; attempt += 1) {
      const pdf = await printHtml(browser, buildJournalHtml(doc, assets, { placeholderImages: false, tocPageNumbers: numbers, layout }));
      passes += 1;
      const pageCount = (await PDFDocument.load(pdf, { updateMetadata: false })).getPageCount();
      if (!numbers) return { pdf, pageCount, tocPageNumbers: [], passes, layouts: layout };
      const actual = await readInternalLinkPages(pdf);
      if (actual.length === numbers.length && actual.every((n, i) => n === numbers![i])) return { pdf, pageCount, tocPageNumbers: numbers, passes, layouts: layout };
      numbers = actual;
    }
    throw new Error('journal pagination did not stabilize');
  } finally {
    if (!deps.browser) await browser.close().catch(() => {});
  }
}
