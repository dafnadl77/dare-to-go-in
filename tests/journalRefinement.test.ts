import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Browser } from 'puppeteer-core';
import { buildJournalHtml, hasTableOfContents } from '../server/pdf/journalHtml.ts';
import { CREATOR_CREDIT, JOURNAL_STRINGS } from '../server/pdf/journalStrings.ts';
import { launchJournalBrowser, loadJournalAssets, renderJournalPdf } from '../server/pdf/journalRender.ts';
import type { JournalDocument } from '../server/pdf/journalTypes.ts';
import { sampleDocument } from './journalFixtures.ts';

/** The refinement pass: pagination (no nearly empty continuation pages), reading scale, the creator credit and the Hebrew Patterns title. */

const CREDIT = 'Created by Dafna Dalmeida · dafnadl.co.il';
const squash = (t: string) => t.replace(/\s+/g, ' ').trim();

let browser: Browser | null = null;
let skipReason = '';
type Rendered = Awaited<ReturnType<typeof renderJournalPdf>> & { texts: string[] };
const rendered = new Map<string, Rendered>();

async function pageTexts(pdf: Uint8Array): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: new Uint8Array(pdf), useSystemFonts: false, isEvalSupported: false });
  const doc = await task.promise;
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const content = await (await doc.getPage(i)).getTextContent();
    out.push(squash(content.items.map((it) => ('str' in it ? it.str : '')).join(' ')));
  }
  await task.destroy();
  return out;
}

async function renderCached(language: 'en' | 'he'): Promise<Rendered> {
  const hit = rendered.get(language);
  if (hit) return hit;
  const result = await renderJournalPdf(sampleDocument(language), { browser: browser! });
  const entry = { ...result, texts: await pageTexts(result.pdf) };
  rendered.set(language, entry);
  return entry;
}

before(async () => {
  try {
    browser = await launchJournalBrowser();
  } catch (error) {
    skipReason = `no Chromium available (${(error as Error).message.slice(0, 60)})`;
  }
});
after(async () => {
  await browser?.close().catch(() => {});
});

const chrome = (name: string, fn: () => Promise<void>) =>
  test(name, { timeout: 120_000 }, async (t) => {
    if (!browser) return t.skip(skipReason);
    await fn();
  });

const htmlOf = (doc: JournalDocument) =>
  buildJournalHtml(doc, loadJournalAssets(), { placeholderImages: false, tocPageNumbers: hasTableOfContents(doc) ? doc.dreams.map((_, i) => i + 3) : null });

// ------------------------------------------------------------------ credit ----

test('credit: the exact same English wording in BOTH languages, never translated, one left-to-right run', () => {
  assert.equal(CREATOR_CREDIT, CREDIT);
  assert.equal(JOURNAL_STRINGS.en.createdBy, JOURNAL_STRINGS.he.createdBy);
  for (const language of ['en', 'he'] as const) {
    const html = htmlOf(sampleDocument(language));
    const credits = html.match(/<p class="credit" dir="ltr">[^<]*<\/p>/g) ?? [];
    assert.equal(credits.length, 2, `${language}: cover + final page`);
    assert.ok(credits.every((c) => c.includes(CREDIT)), language);
    assert.match(html, /\.credit\{[^}]*unicode-bidi:isolate;direction:ltr/);
    assert.ok(!html.includes('נוצר על ידי'), 'the Hebrew translation of the credit is gone');
  }
});

for (const language of ['en', 'he'] as const) {
  chrome(`credit (${language}): extracted PDF text keeps "${CREDIT}" in logical order on the cover and the final page`, async () => {
    const r = await renderCached(language);
    const first = r.texts[0];
    const last = r.texts[r.pageCount - 1];
    assert.ok(first.includes(CREDIT), `cover: ${first.slice(-80)}`);
    assert.ok(last.includes(CREDIT), `final page: ${last.slice(-80)}`);
    for (const text of [first, last]) {
      assert.ok(text.indexOf('dafnadl.co.il') > text.indexOf('Dafna Dalmeida'), 'the domain follows the name');
      assert.ok(!text.includes('ladfnad'), 'the domain is never reversed');
    }
    assert.ok(r.texts.slice(1, r.pageCount - 1).every((t) => !t.includes('dafnadl.co.il')), 'no creator signature on inner pages');
  });
}

// ----------------------------------------------------------------- heading ----

test('heading: the Hebrew Patterns title is the approved wording; the English one is unchanged', () => {
  assert.equal(JOURNAL_STRINGS.he.patternsHeading, 'דפוסים שחוזרים בחלומות שלי');
  assert.equal(JOURNAL_STRINGS.en.patternsHeading, 'Patterns Across My Dreams');
  const he = htmlOf(sampleDocument('he'));
  assert.equal(he.split('דפוסים שחוזרים בחלומות שלי').length - 1, 2, 'one contents row + one section heading');
  assert.ok(!he.includes('דפוסים לאורך החלומות שלי'));
});

chrome('heading: the Hebrew PDF shows the approved wording on the contents page and as the section heading', async () => {
  const r = await renderCached('he');
  assert.ok(r.texts[1].includes('דפוסים שחוזרים בחלומות שלי'), 'contents page');
  assert.ok(r.texts.some((t, i) => i > 1 && t.includes('דפוסים שחוזרים בחלומות שלי')), 'section heading');
  assert.ok(!r.texts.join(' ').includes('דפוסים לאורך החלומות שלי'));
});

// ------------------------------------------------------------- typography ----

test('typography: dream pages read larger while the cover, final page, contents and Patterns keep their approved sizes', () => {
  const html = htmlOf(sampleDocument('en'));
  assert.match(html, /\.text\{font-size:11pt;line-height:1\.74;/);
  assert.match(html, /\.dream \.title\{[^}]*font-size:28pt/);
  assert.match(html, /\.label\{[^}]*font-size:15\.5pt/);
  assert.match(html, /\.cover-title\{[^}]*font-size:46pt/);
  assert.match(html, /\.closing-title\{[^}]*font-size:36pt/);
  assert.match(html, /\.pattern \.text\{font-size:9\.4pt/);
  assert.match(html, /\.toc-row\{[^}]*font-size:10\.5pt/);
});

test('typography: compact spacing (used to avoid a nearly empty page) only tightens space, never the text size', () => {
  const html = htmlOf(sampleDocument('en'));
  const compactRules = html.match(/\.dream\.compact[^{]*\{[^}]*\}/g) ?? [];
  assert.ok(compactRules.length >= 5);
  assert.ok(compactRules.every((r) => !/font-size/.test(r)));
});

test('note: the reflection disclaimer appears ONCE per journal, not on every dream page', () => {
  for (const language of ['en', 'he'] as const) {
    const s = JOURNAL_STRINGS[language];
    const html = htmlOf(sampleDocument(language));
    assert.equal(html.split(s.disclaimer).length - 1, 1, language);
    assert.match(html, /class="toc-note"/);
  }
  const base = sampleDocument('en');
  const few: JournalDocument = { ...base, dreams: base.dreams.slice(0, 2), patterns: [] };
  const html = htmlOf(few);
  assert.equal(html.split(JOURNAL_STRINGS.en.disclaimer).length - 1, 1, 'no contents page: the single note closes the last dream');
  assert.ok(html.indexOf(JOURNAL_STRINGS.en.disclaimer) > html.indexOf('id="d-1"'));
  const bare: JournalDocument = { ...base, dreams: base.dreams.slice(0, 3).map((d) => ({ ...d, thread: null, question: null })), patterns: [] };
  assert.ok(!htmlOf(bare).includes(JOURNAL_STRINGS.en.disclaimer), 'no reflections, no note');
});

// ------------------------------------------------------------- pagination ----

for (const language of ['en', 'he'] as const) {
  chrome(`pagination (${language}): no dream leaves a nearly empty continuation page; only the genuinely long dream continues`, async () => {
    const doc = sampleDocument(language);
    const r = await renderCached(language);
    const starts = [...r.tocPageNumbers];
    const patternsStart = doc.patterns.length ? starts.pop()! : r.pageCount;
    const pagesOf = doc.dreams.map((_, i) => (i + 1 < doc.dreams.length ? starts[i + 1] : patternsStart) - starts[i]);
    const longest = doc.dreams.reduce((best, d, i) => (d.sourceText.length > doc.dreams[best].sourceText.length ? i : best), 0);
    pagesOf.forEach((n, i) => {
      if (i === longest) assert.ok(n >= 2, 'the long dream paginates naturally');
      else assert.equal(n, 1, `dream ${i + 1} fits one page (no wasted continuation page)`);
    });
    doc.dreams.forEach((_, i) => {
      for (let page = starts[i] + 1; page < starts[i] + pagesOf[i]; page += 1) assert.ok(r.texts[page - 1].length > 450, `dream ${i + 1}: continuation page ${page} carries real content`);
    });
    assert.equal(starts[1] - starts[0], 1, 'the first dream (the reported case) is a single page');
  });

  chrome(`pagination (${language}): only the image and the spacing give way, never the text`, async () => {
    const doc = sampleDocument(language);
    const r = await renderCached(language);
    assert.equal(r.layouts.length, doc.dreams.length);
    assert.ok(r.layouts.every((l) => l.imgMaxMm >= 62 && l.imgMaxMm <= 118), 'an image never gets shorter than 62 mm');
    assert.deepEqual(r.layouts[1], { imgMaxMm: 118, compact: false }, 'the long dream keeps the designed layout');
    assert.ok(r.layouts[0].imgMaxMm < 118 || r.layouts[0].compact, 'the first dream was refitted onto one page');
    const joined = r.texts.join(' ');
    for (const d of doc.dreams) assert.ok(joined.includes(squash(d.sourceText).split(' ').slice(-6).join(' ')), `the end of "${d.title}" is present`);
  });
}

chrome('pagination: a journal whose dreams all fit is left exactly as designed (no needless shrinking)', async () => {
  const base = sampleDocument('en');
  const short = { ...base, dreams: [base.dreams[3], base.dreams[4]], patterns: [] };
  const r = await renderJournalPdf(short, { browser: browser! });
  assert.ok(r.layouts.every((l) => l.imgMaxMm === 118 && !l.compact));
  assert.equal(r.pageCount, 4, 'cover + two dream pages + final page');
});
