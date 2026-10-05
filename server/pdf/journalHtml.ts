import type { AppLanguage } from '../../src/hero/appLanguage.js';
import { dateLocale } from '../../src/i18n/locale.js';
import { CREATOR_CREDIT, JOURNAL_STRINGS, type JournalStrings } from './journalStrings.js';
import { TOC_MIN_DREAMS, type JournalDocument, type JournalDream, type JournalImage, type JournalPattern } from './journalTypes.js';

/**
 * Builds the Dream Journal as ONE print-ready HTML document (rendered to PDF by headless Chromium, see
 * journalRender.ts). Pure: it only turns the already-validated JournalDocument into markup.
 *
 * Visual language (the approved mockup): a dark cinematic cover and closing page, WHITE ink-friendly inner
 * pages with navy / blue-gray accents and thin editorial rules, full-colour dream images, and the DARE TO GO IN
 * brand in the header/footer of every page.
 *
 * Safety: every piece of user text goes through esc() (never raw markup), the document carries a CSP that
 * allows no scripts and no network (only data: images and fonts), and the only text placed inside CSS
 * (running page headers) is static wording plus digits, escaped with escCss().
 */

export interface JournalAssets {
  /** `@font-face` rules with the fonts embedded as data URIs. */
  fontsCss: string;
  /** Data URI of the cinematic cover/closing artwork (an existing DARE asset). */
  coverArt: string;
}

export interface BuildOptions {
  /** Pass 1 only measures pagination: dream images become same-size empty boxes (identical layout, tiny HTML). */
  placeholderImages: boolean;
  /** Page numbers shown in the Table of Contents; null on the measuring pass. */
  tocPageNumbers: number[] | null;
  /** Per-dream layout adjustments chosen by the measuring passes (see journalRender.ts); defaults when absent. */
  layout?: DreamLayout[];
  /** Measuring pass only: invisible internal links to the start/end of every section, read back from the PDF. */
  probes?: boolean;
}

/** How one dream is laid out. The defaults are the designed look; the renderer only moves away from them to avoid a nearly empty continuation page. */
export interface DreamLayout {
  /** Cap for the dream image's height in mm (its width follows from the aspect ratio: never stretched). */
  imgMaxMm: number;
  /** Slightly tighter spacing between blocks (text size is never reduced). */
  compact: boolean;
}

export const DEFAULT_IMG_MAX_MM = 118;
export const DEFAULT_LAYOUT: DreamLayout = { imgMaxMm: DEFAULT_IMG_MAX_MM, compact: false };

export const INK = '#1c2a4a';
export const BODY = '#2b3547';
export const MUTED = '#6b7a90';
export const RULE = '#d6dde8';
export const TINT = '#eef2f7';
export const ACCENT = '#5f7ba1';

export function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** For text placed inside a CSS string literal: only a conservative character set survives. */
export function escCss(text: string): string {
  return text.replace(/[^\p{L}\p{N} .,/\-–·]/gu, '').replace(/"/g, '');
}

function paragraphs(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function textBlock(text: string): string {
  return paragraphs(text)
    .map((p) => `<p class="text" dir="auto">${esc(p)}</p>`)
    .join('');
}

function safeTimeZone(tz: string): string {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

export function formatDate(iso: string, language: AppLanguage, timeZone: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(dateLocale(language), { day: 'numeric', month: 'long', year: 'numeric', timeZone: safeTimeZone(timeZone) }).format(d);
}

export function formatRange(dreams: JournalDream[], language: AppLanguage, timeZone: string): string {
  const times = dreams.map((d) => new Date(d.createdAt).getTime()).filter((t) => !Number.isNaN(t));
  if (times.length === 0) return '';
  const fmt = new Intl.DateTimeFormat(dateLocale(language), { month: 'long', year: 'numeric', timeZone: safeTimeZone(timeZone) });
  const a = fmt.format(new Date(Math.min(...times)));
  const b = fmt.format(new Date(Math.max(...times)));
  return a === b ? a : `${a} – ${b}`;
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

const dirOf = (language: AppLanguage) => (language === 'he' ? 'rtl' : 'ltr');
/** Scopes direction-specific typography to ONE section (never inherited by a nested section of the other direction). */
const rtlClass = (language: AppLanguage) => (language === 'he' ? ' rtl' : '');

/** An image box that reserves the exact aspect ratio (so nothing is ever stretched) and is capped in height. */
function figure(image: JournalImage, size: { maxHeightMm: number } | { widthMm: number }, placeholder: boolean, className: string, alt: string): string {
  const ratio = (image.width / image.height).toFixed(5);
  const width = 'widthMm' in size ? `${size.widthMm}mm` : `min(100%, calc(${size.maxHeightMm}mm * ${ratio}))`;
  const style = `aspect-ratio:${image.width} / ${image.height};width:${width}`;
  return placeholder
    ? `<div class="${className} fig-empty" style="${style}"></div>`
    : `<div class="${className}" style="${style}"><img src="${image.dataUri}" width="${image.width}" height="${image.height}" alt="${esc(alt)}"></div>`;
}

/** `index` (e.g. "01 / 08") is wrapped in a left-to-right ISOLATE so it reads the same in a right-to-left header. */
function pageRule(name: string, language: AppLanguage, s: JournalStrings, headerLabel: string, index?: string): string {
  const labelContent = index ? `${escCss(headerLabel)}\\2003\\2066 ${escCss(index)}\\2069` : escCss(headerLabel);
  const rtl = language === 'he';
  const brandSide = rtl ? 'right' : 'left';
  const labelSide = rtl ? 'left' : 'right';
  const numberSide = rtl ? 'left' : 'right';
  const headRule = `background:linear-gradient(${RULE},${RULE}) no-repeat 0 calc(100% - 7mm) / 100% .4pt;`;
  const common = `font-family:'Fraunces','Heebo',serif;font-size:7pt;letter-spacing:.2em;color:${MUTED};direction:${dirOf(language)};`;
  return `@page ${name}{
  @top-${brandSide}{content:"${escCss(s.brand)}";${common}vertical-align:bottom;padding-bottom:10.2mm;${headRule}}
  @top-center{content:"";${headRule}}
  @top-${labelSide}{content:"${labelContent}";font-family:'Heebo',sans-serif;font-size:7.5pt;letter-spacing:0;color:${MUTED};direction:${dirOf(language)};vertical-align:bottom;padding-bottom:10.2mm;${headRule}}
  @bottom-center{content:"${escCss(s.brand)}";${common}vertical-align:top;padding-top:5mm;}
  @bottom-${numberSide}{content:counter(page);font-family:'Heebo',sans-serif;font-size:8pt;color:${MUTED};direction:ltr;vertical-align:top;padding-top:5mm;}
}`;
}

function css(assets: JournalAssets, dreams: JournalDream[], patterns: JournalPattern[], language: AppLanguage): string {
  const s = JOURNAL_STRINGS[language];
  const total = dreams.length;
  const w = String(total).length < 2 ? 2 : String(total).length;
  const rules: string[] = [pageRule('toc', language, s, s.headerLabel), pageRule('patterns', language, s, s.patternsHeaderLabel)];
  dreams.forEach((d, i) => {
    const ds = JOURNAL_STRINGS[d.language];
    rules.push(pageRule(`dream-${i}`, d.language, ds, ds.headerLabel, `${pad(i + 1, w)} / ${pad(total, w)}`));
  });
  void patterns;
  return `${assets.fontsCss}
:root{--art:url(${assets.coverArt});}
@page{size:210mm 297mm;margin:26mm 20mm 24mm 20mm;}
@page cover{margin:0;}
@page closing{margin:0;}
${rules.join('\n')}
*{box-sizing:border-box;}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
body{margin:0;background:#fff;color:${BODY};font-family:'Heebo',sans-serif;font-size:10pt;line-height:1.7;}
h1,h2,h3,p{margin:0;}
h1,h2,.cover-sub,.closing-body{text-wrap:balance;}
a{color:inherit;text-decoration:none;}

/* ---------- dark cinematic pages (cover + closing) ---------- */
.dark{position:relative;width:210mm;height:296.6mm;overflow:hidden;background-color:#060b19;background-image:linear-gradient(180deg,rgba(4,8,20,.80) 0%,rgba(4,8,20,.38) 38%,rgba(4,8,20,.52) 68%,rgba(3,6,16,.93) 100%),var(--art);background-size:cover;background-position:center;color:#f4f0e8;break-after:page;}
.closing{break-after:auto;background-image:linear-gradient(180deg,rgba(4,8,20,.88) 0%,rgba(4,8,20,.52) 45%,rgba(3,6,16,.9) 100%),var(--art);}
.dark-in{position:absolute;inset:0;padding:26mm 24mm 22mm;display:flex;flex-direction:column;justify-content:space-between;align-items:center;text-align:center;}
.brand{font-family:'Fraunces','Heebo',serif;font-size:12pt;letter-spacing:.34em;text-transform:uppercase;direction:ltr;}
.brand.small{font-size:10pt;letter-spacing:.3em;}
.cover-title{font-family:'Fraunces','Heebo',serif;font-weight:400;font-size:46pt;line-height:1.06;margin-top:6mm;}
.cover-title span{display:block;}
.rtl .cover-title{font-family:'Heebo',sans-serif;font-weight:300;font-size:42pt;line-height:1.12;}
.cover-sub{margin-top:10mm;font-size:12pt;line-height:1.55;max-width:112mm;margin-inline:auto;font-weight:300;color:#e6e2da;}
.cover-range{margin-top:9mm;font-size:11.5pt;letter-spacing:.04em;color:#e6e2da;font-weight:300;}
.credit{unicode-bidi:isolate;direction:ltr;text-align:center;margin-top:3mm;font-size:9.5pt;color:#d9d5cc;font-weight:300;letter-spacing:.02em;}
.closing-title{font-family:'Fraunces','Heebo',serif;font-size:36pt;line-height:1.14;max-width:150mm;margin-inline:auto;}
.rtl .closing-title{font-family:'Heebo',sans-serif;font-weight:300;font-size:34pt;}
.closing-rule{width:30mm;height:.5pt;background:#f4f0e8;opacity:.7;margin:9mm auto 8mm;}
.closing-body{font-size:12pt;line-height:1.6;max-width:118mm;margin-inline:auto;font-weight:300;color:#e6e2da;}

/* ---------- white inner pages ---------- */
.toc{page:toc;}
.toc h1{font-family:'Fraunces','Heebo',serif;font-weight:400;font-size:25pt;color:${INK};margin-bottom:9mm;line-height:1.2;}
.toc.rtl h1{font-family:'Heebo',sans-serif;font-weight:500;}
.toc-row{display:flex;align-items:baseline;gap:4mm;padding:2.1mm 0;break-inside:avoid;color:${BODY};font-size:10.5pt;}
.toc-row .no{color:${MUTED};font-size:9pt;min-width:7mm;direction:ltr;text-align:start;font-variant-numeric:tabular-nums;}
.toc-row .ttl{flex:0 1 auto;color:${INK};}
.toc-row .lead{flex:1 1 auto;border-bottom:.5pt dotted ${RULE};transform:translateY(-1mm);min-width:6mm;}
.toc-row .pg{min-width:7mm;text-align:end;color:${MUTED};font-size:9.5pt;direction:ltr;font-variant-numeric:tabular-nums;}
.toc-sep{height:.4pt;background:${RULE};margin:5mm 0 3mm;}
.toc-note{margin-top:9mm;font-size:9pt;line-height:1.55;color:${MUTED};break-inside:avoid;}
.toc-strip{margin-top:10mm;height:20mm;border-radius:2mm;background-image:var(--art);background-size:cover;background-position:center 62%;break-inside:avoid;}

.dream{padding:0;}
.dream .title{font-family:'Fraunces','Heebo',serif;font-weight:400;font-size:28pt;line-height:1.18;color:${INK};break-after:avoid;overflow-wrap:anywhere;}
.dream.rtl .title{font-family:'Heebo',sans-serif;font-weight:500;font-size:26pt;}
.dream .date{margin-top:2mm;margin-bottom:7mm;font-size:10.5pt;color:${MUTED};break-after:avoid;}
.fig{display:block;margin:0 auto 9mm;border-radius:2.2mm;overflow:hidden;break-inside:avoid;background:${TINT};}
.fig img{display:block;width:100%;height:100%;}
.fig-empty{background:${TINT};}
.block{margin-top:8mm;}
.label{font-family:'Fraunces','Heebo',serif;font-weight:400;font-size:15.5pt;color:${INK};margin-bottom:2.8mm;break-after:avoid;}
.dream.rtl .label{font-family:'Heebo',sans-serif;font-weight:600;font-size:14.5pt;}
.text{font-size:11pt;line-height:1.74;color:${BODY};white-space:pre-line;orphans:3;widows:3;overflow-wrap:anywhere;}
.text + .text{margin-top:3.2mm;}
.chip{display:inline-block;background:${TINT};color:#3b4b69;border-radius:5mm;padding:1.4mm 4.8mm;font-size:10.8pt;line-height:1.5;overflow-wrap:anywhere;}
.quote{background:${TINT};border-radius:3mm;padding:5.5mm 6.5mm;break-inside:avoid;}
.quote .text{color:${INK};font-size:11.2pt;}
.disclaimer{margin-top:8mm;padding-top:3.5mm;border-top:.4pt solid ${RULE};font-size:9pt;line-height:1.55;color:${MUTED};break-inside:avoid;}
.end{height:0;overflow:hidden;}
/* compact: only the spacing between blocks tightens, never the text size (used to avoid a nearly empty continuation page) */
.dream.compact .date{margin-bottom:5mm;}
.dream.compact .fig{margin-bottom:6.5mm;}
.dream.compact .block{margin-top:5mm;}
.dream.compact .label{margin-bottom:2.2mm;}
.dream.compact .text{line-height:1.64;}
.dream.compact .quote{padding:4.2mm 6mm;}
.dream.compact .disclaimer{margin-top:4.5mm;padding-top:2.8mm;}
.probes{position:absolute;top:0;left:0;width:4px;height:4px;overflow:visible;}
.probes a{display:block;position:absolute;left:0;top:0;width:3px;height:3px;}

.patterns{page:patterns;}
.patterns h1{font-family:'Fraunces','Heebo',serif;font-weight:400;font-size:24pt;color:${INK};line-height:1.2;margin-bottom:3.5mm;}
.patterns.rtl > h1{font-family:'Heebo',sans-serif;font-weight:500;}
.patterns .intro{font-size:10pt;color:${BODY};margin-bottom:8mm;}
.pattern{display:flex;gap:6mm;align-items:flex-start;padding:5mm 0;border-top:.4pt solid ${RULE};break-inside:avoid;}
.pattern .thumb{flex:0 0 34mm;width:34mm;border-radius:2mm;overflow:hidden;background:${TINT};}
.pattern .thumb img{display:block;width:100%;height:100%;}
.pattern .body{flex:1 1 auto;min-width:0;}
.pattern h2{font-family:'Fraunces','Heebo',serif;font-weight:400;font-size:13.5pt;color:${INK};margin-bottom:2mm;}
.pattern.rtl h2{font-family:'Heebo',sans-serif;font-weight:600;font-size:12.5pt;}
.pattern .mini{font-size:7.8pt;letter-spacing:.06em;color:${ACCENT};text-transform:uppercase;margin-top:2.6mm;font-weight:500;}
.pattern.rtl .mini{letter-spacing:0;text-transform:none;font-size:8.5pt;}
.pattern .text{font-size:9.4pt;line-height:1.62;}
`;
}

function probeLinks(doc: JournalDocument): string {
  const links = doc.dreams.flatMap((_, i) => [`<a href="#d-${i}"></a>`, `<a href="#e-${i}"></a>`]);
  if (doc.patterns.length) links.push('<a href="#patterns"></a>');
  return `<div class="probes">${links.join('')}</div>`;
}

function cover(language: AppLanguage, range: string, probes: string): string {
  const s = JOURNAL_STRINGS[language];
  return `<section class="dark cover${rtlClass(language)}" dir="${dirOf(language)}" style="page:cover">
${probes}<div class="dark-in">
<div class="brand">${esc(s.brand)}</div>
<div><h1 class="cover-title"><span>${esc(s.coverTitleLines[0])}</span><span>${esc(s.coverTitleLines[1])}</span></h1>
<p class="cover-sub">${esc(s.coverSubtitle)}</p>${range ? `<p class="cover-range">${esc(range)}</p>` : ''}</div>
<div><div class="brand small">${esc(s.brand)}</div><p class="credit" dir="ltr">${esc(CREATOR_CREDIT)}</p></div>
</div></section>`;
}

function closing(language: AppLanguage): string {
  const s = JOURNAL_STRINGS[language];
  return `<section class="dark closing${rtlClass(language)}" dir="${dirOf(language)}" style="page:closing">
<div class="dark-in">
<div class="brand">${esc(s.brand)}</div>
<div><h2 class="closing-title">${esc(s.closingTitle)}</h2><div class="closing-rule"></div><p class="closing-body">${esc(s.closingBody)}</p></div>
<div><div class="brand small">${esc(s.brand)}</div><p class="credit" dir="ltr">${esc(CREATOR_CREDIT)}</p></div>
</div></section>`;
}

function toc(doc: JournalDocument, numbers: number[] | null): string {
  const s = JOURNAL_STRINGS[doc.language];
  const w = String(doc.dreams.length).length < 2 ? 2 : String(doc.dreams.length).length;
  const num = (i: number) => (numbers && Number.isFinite(numbers[i]) ? String(numbers[i]) : '88');
  const rows = doc.dreams
    .map(
      (d, i) =>
        `<a class="toc-row" href="#d-${i}"><span class="no">${pad(i + 1, w)}</span><span class="ttl" dir="auto">${esc(d.title)}</span><span class="lead"></span><span class="pg">${num(i)}</span></a>`,
    )
    .join('');
  const patternRow = doc.patterns.length
    ? `<div class="toc-sep"></div><a class="toc-row" href="#patterns"><span class="ttl">${esc(s.patternsHeading)}</span><span class="lead"></span><span class="pg">${num(doc.dreams.length)}</span></a>`
    : '';
  return `<section class="toc${rtlClass(doc.language)}" dir="${dirOf(doc.language)}" style="page:toc"><h1>${esc(s.toc)}</h1>${rows}${patternRow}${hasReflections(doc) ? `<p class="toc-note">${esc(s.disclaimer)}</p>` : ''}<div class="toc-strip"></div></section>`;
}

/** Whether the journal contains reflections (a stored possible thread or question) that deserve the one-time note. */
function hasReflections(doc: JournalDocument): boolean {
  return doc.dreams.some((d) => d.thread || d.question);
}

function dreamSection(d: JournalDream, index: number, timeZone: string, placeholder: boolean, layout: DreamLayout, closingNote: string | null): string {
  const s = JOURNAL_STRINGS[d.language];
  const date = formatDate(d.createdAt, d.language, timeZone);
  const parts: string[] = [];
  parts.push(`<h1 class="title" dir="auto">${esc(d.title || s.untitled)}</h1>`);
  if (date) parts.push(`<p class="date">${esc(date)}</p>`);
  if (d.image) parts.push(figure(d.image, { maxHeightMm: layout.imgMaxMm }, placeholder, 'fig', d.title));
  if (d.sourceText.trim()) parts.push(`<div class="block"><h2 class="label">${esc(s.theDream)}</h2>${textBlock(d.sourceText)}</div>`);
  if (d.selectedElement) parts.push(`<div class="block"><h2 class="label">${esc(s.whatStoodOut)}</h2><span class="chip" dir="auto">${esc(d.selectedElement)}</span></div>`);
  if (d.association) parts.push(`<div class="block"><h2 class="label">${esc(s.yourAssociation)}</h2>${textBlock(d.association)}</div>`);
  if (d.thread) parts.push(`<div class="block"><h2 class="label">${esc(s.possibleThread)}</h2>${textBlock(d.thread)}</div>`);
  if (d.question) parts.push(`<div class="block"><h2 class="label">${esc(s.worthSittingWith)}</h2><div class="quote">${textBlock(d.question)}</div></div>`);
  if (closingNote) parts.push(`<p class="disclaimer">${esc(closingNote)}</p>`);
  parts.push(`<div class="end" id="e-${index}"></div>`);
  return `<section class="dream${rtlClass(d.language)}${layout.compact ? ' compact' : ''}" id="d-${index}" dir="${dirOf(d.language)}" style="page:dream-${index}">${parts.join('')}</section>`;
}

function patternsSection(doc: JournalDocument, placeholder: boolean): string {
  const s = JOURNAL_STRINGS[doc.language];
  const items = doc.patterns
    .map((p) => {
      const ps = JOURNAL_STRINGS[p.language];
      const thumb = p.thumbnail ? figure(p.thumbnail, { widthMm: 34 }, placeholder, 'thumb', '') : '<div class="thumb" style="height:0;border:0;flex-basis:0;width:0"></div>';
      return `<div class="pattern${rtlClass(p.language)}" dir="${dirOf(p.language)}">${thumb}<div class="body"><h2 dir="auto">${esc(p.label)}</h2>
<p class="mini">${esc(ps.whatRepeats)}</p>${textBlock(p.whatRepeats)}
<p class="mini">${esc(ps.whatMayConnect)}</p>${textBlock(p.possibleConnection)}
<p class="mini">${esc(ps.directionToExplore)}</p>${textBlock(p.directionToExplore)}
<p class="mini">${esc(ps.questionToKeep)}</p>${textBlock(p.question)}</div></div>`;
    })
    .join('');
  return `<section class="patterns${rtlClass(doc.language)}" id="patterns" dir="${dirOf(doc.language)}" style="page:patterns"><h1>${esc(s.patternsHeading)}</h1><p class="intro">${esc(s.patternsIntro)}</p>${items}</section>`;
}

/** Whether a Table of Contents is worth including for this export. */
export function hasTableOfContents(doc: JournalDocument): boolean {
  return doc.dreams.length >= TOC_MIN_DREAMS;
}

export function buildJournalHtml(doc: JournalDocument, assets: JournalAssets, options: BuildOptions): string {
  const language = doc.language;
  const s = JOURNAL_STRINGS[language];
  const range = formatRange(doc.dreams, language, doc.timeZone);
  const body = [
    cover(language, range, options.probes ? probeLinks(doc) : ''),
    hasTableOfContents(doc) ? toc(doc, options.tocPageNumbers) : '',
    ...doc.dreams.map((d, i) => dreamSection(d, i, doc.timeZone, options.placeholderImages, options.layout?.[i] ?? DEFAULT_LAYOUT, !hasTableOfContents(doc) && i === doc.dreams.length - 1 && hasReflections(doc) ? s.disclaimer : null)),
    doc.patterns.length ? patternsSection(doc, options.placeholderImages) : '',
    closing(language),
  ].join('\n');
  return `<!doctype html>
<html lang="${language}" dir="${dirOf(language)}"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'">
<title>${esc(`${s.brand} — ${s.coverTitleLines.join(' ')}`)}</title>
<style>${css(assets, doc.dreams, doc.patterns, language)}</style></head><body>
${body}
</body></html>`;
}
