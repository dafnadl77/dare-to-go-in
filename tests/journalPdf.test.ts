import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import type { Browser } from 'puppeteer-core';
import { buildJournalHtml, hasTableOfContents } from '../server/pdf/journalHtml.ts';
import { JOURNAL_STRINGS } from '../server/pdf/journalStrings.ts';
import { launchJournalBrowser, loadJournalAssets, renderJournalPdf, readInternalLinkPages } from '../server/pdf/journalRender.ts';
import type { JournalDocument, JournalDream } from '../server/pdf/journalTypes.ts';
import { entitlementsForPackage, PACKAGE_ENTITLEMENTS } from '../server/entitlements.ts';
import { DREAM_PACKAGES } from '../src/pricing/packages.ts';
import { fixtureImages, sampleDocument } from './journalFixtures.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// ---------------------------------------------------------------- Chrome (optional) ----

let browser: Browser | null = null;
const skipReason = { value: '' };
const rendered = new Map<string, { pdf: Uint8Array; pageCount: number; tocPageNumbers: number[]; texts: string[] }>();

async function pageTexts(pdf: Uint8Array): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: new Uint8Array(pdf), useSystemFonts: false, isEvalSupported: false });
  const doc = await task.promise;
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    out.push(content.items.map((it) => ('str' in it ? it.str : '')).join(' ').replace(/\s+/g, ' ').trim());
  }
  await task.destroy();
  return out;
}

async function renderCached(key: string, doc: JournalDocument) {
  const hit = rendered.get(key);
  if (hit) return hit;
  const result = await renderJournalPdf(doc, { browser: browser! });
  const entry = { pdf: result.pdf, pageCount: result.pageCount, tocPageNumbers: result.tocPageNumbers, texts: await pageTexts(result.pdf) };
  rendered.set(key, entry);
  return entry;
}

before(async () => {
  try {
    browser = await launchJournalBrowser();
  } catch (error) {
    skipReason.value = `no Chromium available for real PDF rendering (${(error as Error).message.slice(0, 60)})`;
  }
});
after(async () => {
  await browser?.close().catch(() => {});
});

const chrome = (name: string, fn: () => Promise<void>) =>
  test(name, { timeout: 120_000 }, async (t) => {
    if (!browser) return t.skip(skipReason.value);
    await fn();
  });

// ---------------------------------------------------------------- pure HTML structure ----

const assets = () => loadJournalAssets();
const htmlOf = (doc: JournalDocument) => buildJournalHtml(doc, assets(), { placeholderImages: false, tocPageNumbers: hasTableOfContents(doc) ? doc.dreams.map((_, i) => i + 3) : null });

test('design: dark cover and dark final page, every inner page is white (ink-friendly)', () => {
  const css = htmlOf(sampleDocument('en'));
  assert.match(css, /@page cover\{margin:0;\}/);
  assert.match(css, /@page closing\{margin:0;\}/);
  assert.match(css, /body\{margin:0;background:#fff;/);
  assert.match(css, /\.dark\{[^}]*background-color:#060b19/);
  // inner @page rules carry no background colour: the paper stays white
  const innerPageRules = css.match(/@page (?!cover|closing)[^{]*\{[\s\S]*?\n\}/g) ?? [];
  assert.ok(innerPageRules.length > 0);
  assert.ok(innerPageRules.every((r) => !/background(-color)?:\s*#(0|1|2)/i.test(r)));
  assert.equal((css.match(/<section class="dark (?:cover|closing)/g) ?? []).length, 2, 'exactly the cover and the final page are dark');
});

test('design: the creator credit sits on the cover and the final page only; dream pages carry no big signature', () => {
  for (const language of ['en', 'he'] as const) {
    const s = JOURNAL_STRINGS[language];
    const html = htmlOf(sampleDocument(language));
    assert.equal(html.split(s.createdBy).length - 1, 2, `${language}: credit appears exactly on cover + closing`);
    assert.equal(html.split(s.creatorSite).length - 1, 2);
    const firstDream = html.indexOf('<section class="dream');
    const lastDark = html.lastIndexOf('<section class="dark closing');
    const between = html.slice(firstDream, lastDark);
    assert.ok(!between.includes(s.createdBy), 'no credit between the first dream and the final page');
  }
});

test('design: the DARE TO GO IN brand is in every inner page header/footer rule and on the cover and the final page', () => {
  const html = htmlOf(sampleDocument('en'));
  const brandedPageRules = (html.match(/@page (toc|patterns|dream-\d+)\{/g) ?? []).length;
  assert.ok(brandedPageRules >= 4);
  assert.equal((html.match(/content:"DARE TO GO IN"/g) ?? []).length, brandedPageRules * 2, 'header + footer brand per inner page rule');
  assert.ok((html.match(/DARE TO GO IN/g) ?? []).length >= brandedPageRules * 2 + 2);
});

test('design: Hebrew sets real RTL text with Heebo, English stays LTR, and a dream keeps its own direction', () => {
  const he = htmlOf(sampleDocument('he'));
  assert.match(he, /<html[^>]*lang="he"[^>]*dir="rtl"|<html[^>]*dir="rtl"[^>]*lang="he"/);
  const en = htmlOf(sampleDocument('en'));
  assert.match(en, /<html[^>]*lang="en"[^>]*dir="ltr"|<html[^>]*dir="ltr"[^>]*lang="en"/);
  const mixed = sampleDocument('he');
  assert.ok(mixed.dreams.some((d) => d.language === 'en'), 'the Hebrew sample includes an English dream (mixed archive)');
  assert.match(he, /class="[^"]*\brtl\b[^"]*"/);
  assert.match(he, /class="dream(?:(?!").)*\bltr\b|dir="ltr"/);
});

test('safety: dream text is HTML-escaped, a hostile title/field cannot inject markup, scripts or remote loads', () => {
  const evil = '<script>alert(1)</script><img src="http://169.254.169.254/x"><style>@import url(https://evil.example/a.css)</style>"\' & </div>';
  const dream: JournalDream = { id: 'x', createdAt: '2025-01-01T00:00:00Z', language: 'en', title: evil, sourceText: evil, selectedElement: evil, association: evil, thread: evil, question: evil, image: null };
  const doc: JournalDocument = { language: 'en', timeZone: 'UTC', dreams: [dream], patterns: [{ id: 'p', language: 'en', label: evil, whatRepeats: evil, possibleConnection: evil, directionToExplore: evil, question: evil, thumbnail: null }] };
  const html = htmlOf(doc);
  assert.ok(!html.includes('<script>alert'), 'no script element from content');
  assert.ok(!html.includes('<img src="http://'), 'no remote image from content');
  assert.ok(!/<style>@import/.test(html));
  assert.ok(!html.includes('</div>"\''), 'quotes and tags are escaped');
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /default-src 'none'/);
  assert.ok(!/script-src[^;"]*(?:'unsafe-inline'|https?:)/.test(html), 'scripts are not allowed by the CSP');
  const external = html.match(/(?:src|href)="(https?:)?\/\/[^"]+"/g) ?? [];
  assert.deepEqual(external, [], 'the document references nothing external');
});

test('structure: a table of contents only when there are enough dreams; Patterns only when pattern data exists', () => {
  const imgs = fixtureImages();
  const base = sampleDocument('en');
  const few: JournalDocument = { ...base, dreams: base.dreams.slice(0, 2), patterns: [] };
  assert.equal(hasTableOfContents(few), false);
  assert.ok(!htmlOf(few).includes(JOURNAL_STRINGS.en.toc));
  assert.equal(hasTableOfContents(base), true);
  assert.ok(htmlOf(base).includes(JOURNAL_STRINGS.en.toc));

  assert.ok(!htmlOf({ ...base, patterns: [] }).includes(JOURNAL_STRINGS.en.patternsHeading));
  assert.ok(htmlOf(base).includes(JOURNAL_STRINGS.en.patternsHeading));
  assert.ok(imgs.sea.width > 0);
});

test('structure: an empty field never produces an empty heading', () => {
  const sparse: JournalDream = { id: 's', createdAt: '2025-01-01T00:00:00Z', language: 'en', title: 'Only words', sourceText: 'Just the words.', selectedElement: null, association: null, thread: null, question: null, image: null };
  const html = htmlOf({ language: 'en', timeZone: 'UTC', dreams: [sparse], patterns: [] });
  const s = JOURNAL_STRINGS.en;
  assert.ok(html.includes(s.theDream));
  for (const label of [s.whatStoodOut, s.yourAssociation, s.possibleThread, s.worthSittingWith]) assert.ok(!html.includes(label), `no "${label}" heading without content`);
});

test('structure: no AI, no network: the journal modules import neither an AI client nor a payment SDK', () => {
  for (const f of ['journalHtml', 'journalRender', 'journalExport', 'journalStrings', 'journalTypes', 'imageInfo']) {
    assert.ok(!/from 'openai'|@anthropic-ai|stripe/i.test(read(`server/pdf/${f}.ts`)), f);
  }
});

// ---------------------------------------------------------------- real rendering (Chrome) ----

chrome('render EN: real multipage PDF, branded and numbered, cover + TOC + dreams + patterns + dark final page', async () => {
  const r = await renderCached('en', sampleDocument('en'));
  assert.ok(r.pageCount >= 8, `pages: ${r.pageCount}`);
  assert.equal(r.texts.length, r.pageCount);
  const s = JOURNAL_STRINGS.en;
  assert.ok(r.texts.every((t) => t.replace(/\s/g, '').includes('DARETOGOIN')), 'DARE TO GO IN is on EVERY page');
  assert.ok(r.texts[0].includes('Dream Journal') && r.texts[0].includes(s.createdBy) && r.texts[0].includes(s.creatorSite), 'cover');
  assert.ok(r.texts[1].includes(s.toc), 'page 2 is the table of contents');
  const last = r.texts[r.pageCount - 1];
  assert.ok(last.includes(s.closingTitle) && last.includes(s.createdBy) && last.includes(s.creatorSite), 'dark final page with credit');
  for (let i = 1; i < r.pageCount - 1; i += 1) {
    assert.ok(!r.texts[i].includes(s.createdBy), `page ${i + 1} (inner) carries no creator signature`);
    assert.match(r.texts[i], new RegExp(`(^|\\s)${i + 1}(\\s|$)`), `inner page ${i + 1} shows its page number`);
  }
  assert.ok(r.texts.some((t) => t.includes(s.patternsHeading)));
});

chrome('render EN: the PDF is real selectable text (not rasterized), with tagged structure and bounded size', async () => {
  const r = await renderCached('en', sampleDocument('en'));
  const joined = r.texts.join(' ');
  assert.ok(joined.includes('A Path in the Mountains'));
  assert.ok(joined.includes('I was walking on a narrow path in the mountains'));
  assert.ok(r.pdf.length > 20_000 && r.pdf.length < 12 * 1024 * 1024, `${r.pdf.length} bytes`);
  assert.equal(String.fromCharCode(...r.pdf.slice(0, 5)), '%PDF-');
  const raw = Buffer.from(r.pdf).toString('latin1');
  assert.match(raw, /\/StructTreeRoot/);
});

chrome('render EN: A4 pages, every page the same size, no JavaScript embedded', async () => {
  const r = await renderCached('en', sampleDocument('en'));
  const pdf = await PDFDocument.load(r.pdf, { updateMetadata: false });
  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();
    assert.ok(Math.abs(width - 595.3) < 1 && Math.abs(height - 841.9) < 1.5, `${width}x${height}`);
  }
  assert.ok(!/\/JavaScript|\/JS\b|\/OpenAction|\/Launch/.test(Buffer.from(r.pdf).toString('latin1')));
});

chrome('render EN: table of contents numbers match the real pages the dreams start on', async () => {
  const r = await renderCached('en', sampleDocument('en'));
  assert.ok(r.tocPageNumbers.length >= 3);
  assert.deepEqual(r.tocPageNumbers, await readInternalLinkPages(r.pdf), 'the numbers printed equal the link destinations');
  const toc = r.texts[1];
  for (const n of r.tocPageNumbers) assert.ok(new RegExp(`(^|\\s)${n}(\\s|$)`).test(toc), `TOC lists page ${n}`);
  assert.ok(r.tocPageNumbers.every((n, i) => i === 0 || n > r.tocPageNumbers[i - 1]), 'strictly increasing');
  assert.ok(r.tocPageNumbers.every((n) => n >= 3 && n < r.pageCount));
});

chrome('render EN: the long dream paginates across pages; no text is lost or clipped', async () => {
  const doc = sampleDocument('en');
  const r = await renderCached('en', doc);
  const long = doc.dreams.reduce((a, b) => (b.sourceText.length > a.sourceText.length ? b : a));
  const joined = r.texts.join(' ');
  const words = long.sourceText.split(/\s+/);
  assert.ok(words.length > 150);
  const lastWords = words.slice(-8).join(' ');
  assert.ok(joined.includes(lastWords), 'the ending of the long dream is present');
  assert.ok(joined.includes(words.slice(0, 8).join(' ')));
  const pagesWithLong = r.texts.filter((t) => t.includes(words[20]) || t.includes(words[words.length - 10]));
  assert.ok(pagesWithLong.length >= 2, 'the long dream runs onto a second page');
});

chrome('render EN: images keep their aspect ratio (no distortion) and a dream without an image still renders', async () => {
  const doc = sampleDocument('en');
  const html = htmlOf(doc);
  assert.ok(doc.dreams.some((d) => d.image === null), 'fixture has a dream with a missing image');
  for (const d of doc.dreams.filter((x) => x.image)) {
    const ratio = d.image!.width / d.image!.height;
    assert.ok(html.includes(`aspect-ratio:${d.image!.width} / ${d.image!.height}`) || html.includes(`aspect-ratio:${ratio} `), `aspect box for ${d.id}`);
  }
  const boxes = [...html.matchAll(/aspect-ratio:(\d+) \/ (\d+);[^"]*"><img src="[^"]+" width="(\d+)" height="(\d+)"/g)];
  assert.ok(boxes.length >= 3, 'image boxes found');
  assert.ok(boxes.every((m) => m[1] === m[3] && m[2] === m[4]), 'every image sits in a box with exactly its own aspect ratio (it is scaled, never stretched)');
  const r = await renderCached('en', doc);
  assert.ok(r.pageCount > 0);
});

chrome('render HE: real RTL text, logical order, own-direction sections, branding on every page', async () => {
  const doc = sampleDocument('he');
  const r = await renderCached('he', doc);
  const s = JOURNAL_STRINGS.he;
  assert.ok(r.texts.every((t) => t.replace(/\s/g, '').includes('DARETOGOIN')), 'DARE TO GO IN is on EVERY page');
  assert.ok(r.texts[0].includes('החלומות שלי') && r.texts[0].includes(s.createdBy) && r.texts[0].includes(s.creatorSite));
  assert.ok(r.texts[1].includes(s.toc));
  const last = r.texts[r.pageCount - 1];
  assert.ok(last.includes(s.closingTitle) && last.includes(s.createdBy));
  const joined = r.texts.join(' ');
  const first = doc.dreams.find((d) => d.language === 'he')!;
  assert.ok(joined.includes(first.sourceText.split(/\s+/).slice(0, 5).join(' ')), 'Hebrew extracts in LOGICAL order (not visually reversed)');
  assert.ok(!joined.includes([...first.sourceText.split(/\s+/).slice(0, 5)].reverse().join(' ')));
  const enDream = doc.dreams.find((d) => d.language === 'en');
  if (enDream) assert.ok(joined.includes(enDream.sourceText.split(/\s+/).slice(0, 5).join(' ')), 'the English dream in the Hebrew journal stays English');
  assert.deepEqual(r.tocPageNumbers, await readInternalLinkPages(r.pdf));
});

chrome('render HE: fonts are embedded (Heebo + Fraunces), so Hebrew glyphs never fall back to a missing font', async () => {
  const r = await renderCached('he', sampleDocument('he'));
  const raw = Buffer.from(r.pdf).toString('latin1');
  assert.match(raw, /Heebo/i);
  assert.ok(!/\/BaseFont\s*\/(Times|Arial|Helvetica)\b/.test(raw), 'no unembedded base-14 fallback');
});

chrome('render: a one-dream journal has no TOC, and a pattern-less journal has no Patterns page', async () => {
  const base = sampleDocument('en');
  const r = await renderCached('single', { ...base, dreams: base.dreams.slice(0, 1), patterns: [] });
  const s = JOURNAL_STRINGS.en;
  assert.ok(!r.texts.some((t) => t.includes(s.toc)));
  assert.ok(!r.texts.some((t) => t.includes(s.patternsHeading)));
  assert.deepEqual(r.tocPageNumbers, []);
  assert.ok(r.texts[0].includes('Dream Journal'));
  assert.ok(r.texts[r.pageCount - 1].includes(s.closingTitle));
});

chrome('render: a hostile document cannot make the renderer reach the network (remote image/CSS in content is inert)', async () => {
  const evil = '<img src="http://127.0.0.1:9/pwn.png"><link rel=stylesheet href="http://127.0.0.1:9/x.css">';
  const dream: JournalDream = { id: 'x', createdAt: '2025-01-01T00:00:00Z', language: 'en', title: 'T', sourceText: `plain ${evil}`, selectedElement: null, association: null, thread: null, question: null, image: null };
  const r = await renderCached('evil', { language: 'en', timeZone: 'UTC', dreams: [dream], patterns: [] });
  assert.ok(r.texts.join(' ').includes('<img src='), 'the markup is shown as literal text');
});

// ---------------------------------------------------------------- entitlement mapping ----

test('packages: ONLY DIVE IN (25 dreams, ₪279) grants the journal export; GO DEEPER, EXPLORE and the free dream do not', () => {
  assert.deepEqual(entitlementsForPackage('dive_in_25'), ['dream_journal_export']);
  for (const id of ['first_dream', 'go_deeper_3', 'explore_10'] as const) assert.deepEqual(entitlementsForPackage(id), [], id);
  assert.deepEqual(Object.keys(PACKAGE_ENTITLEMENTS).sort(), DREAM_PACKAGES.map((p) => p.id).sort(), 'every package is mapped explicitly');
  const dive = DREAM_PACKAGES.find((p) => p.id === 'dive_in_25')!;
  assert.equal(dive.dreamCount, 25);
  assert.equal(dive.priceIls, 279);
  assert.ok(dive.features.includes('journalExport'));
  for (const p of DREAM_PACKAGES.filter((x) => x.id !== 'dive_in_25')) assert.ok(!p.features.includes('journalExport'), p.id);
});

test('client: nothing in the browser can grant or alter entitlements or credits; the dialog only reads status', () => {
  const client = [read('src/archive/journalExport.ts'), read('src/archive/ExportJournalDialog.tsx')].join('\n');
  assert.ok(!/grant_entitlement|account_entitlements|\.rpc\(|supabase\.from\(|localStorage|sessionStorage/.test(client));
  assert.ok(!/owner_id|user_id|userId/.test(read('src/archive/journalExport.ts').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')), 'the request body carries no user id');
  const credits = read('server/routes/credits.ts');
  assert.match(credits, /entitlements/);
  assert.ok(!/grant_entitlement/.test(credits + read('server/index.ts') + read('server/routes/dreamJournal.ts')), 'no route can grant an entitlement (Grow will, later, from a verified webhook)');
});

// ---------------------------------------------------------------- migration + deletion ----

test('migration: durable entitlement table, locked to the server, idempotent grant, deleted with the account', () => {
  const sql = read('supabase/migrations/20261006_account_entitlements.sql');
  assert.match(sql, /create table if not exists public\.account_entitlements/i);
  assert.match(sql, /owner_id\s+uuid not null references auth\.users \(id\) on delete cascade/i);
  assert.match(sql, /check \(entitlement in \('dream_journal_export'\)\)/i);
  assert.match(sql, /primary key \(owner_id, entitlement\)/i);
  assert.match(sql, /alter table public\.account_entitlements enable row level security/i);
  assert.ok(!/create policy[^;]*account_entitlements/i.test(sql), 'no client policy at all');
  assert.match(sql, /revoke all on public\.account_entitlements from public, anon, authenticated/i);
  assert.match(sql, /function public\.grant_entitlement/i);
  assert.match(sql, /already_granted/);
  assert.match(sql, /function public\.has_entitlement/i);
  assert.match(sql, /grant execute on function public\.(grant_entitlement|has_entitlement)[^;]*to service_role/i);
  assert.ok(!/to (anon|authenticated|public)\s*;/i.test(sql.replace(/revoke[^;]*;/gi, '')), 'functions are not granted to clients');
  assert.match(sql, /delete from public\.account_entitlements/i, 'account deletion removes it');
  assert.match(sql, /account_data_remaining/i);
  // it never touches credits, ledger, attempts, trial data or dreams
  // (outside the re-created account-deletion function, which keeps its existing, already-reviewed behaviour)
  const beforeDeletion = sql.slice(0, sql.search(/function public\.delete_account_data/i));
  assert.ok(beforeDeletion.length > 500);
  assert.ok(!/(update|insert into|alter table|drop table|truncate)\s+public\.(dream_credits|credit_ledger|dream_attempts|anon_|dreams\b|trial_)/i.test(beforeDeletion));
  assert.ok(!/(drop table|truncate)/i.test(sql), 'nothing is dropped or truncated anywhere');
});

test('migration: purchase grants require a payment reference, so the entitlement can never be invented from nothing', () => {
  const sql = read('supabase/migrations/20261006_account_entitlements.sql');
  assert.match(sql, /source[^;]*in \('purchase', ?'admin', ?'backfill'\)/i);
  assert.match(sql, /external_ref/i);
});

test('export endpoint is wired: vercel function limits, express route, credits status, no stored PDF', () => {
  const vercel = JSON.parse(read('vercel.json'));
  assert.ok(vercel.functions['api/dream-journal.ts'].maxDuration >= 30);
  assert.ok(vercel.functions['api/dream-journal.ts'].memory >= 1024);
  assert.match(read('server/index.ts'), /\/api\/dream-journal/);
  assert.match(read('server/routes/credits.ts'), /dreamJournalExport/);
});
