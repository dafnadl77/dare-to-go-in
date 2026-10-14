import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FAQ_EMAIL, FAQ_ITEMS, FAQ_PAGE } from '../src/faq/faqContent.ts';
import { FAQ_LANG_SCRIPT, renderFaqPage, renderRobots, renderSitemap } from '../src/faq/renderFaqPage.ts';
import { DREAM_PACKAGES } from '../src/pricing/packages.ts';
import { en, he } from '../src/i18n/translations.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('faq: the published files are exactly what the content module generates (run `npm run faq` after editing it)', () => {
  assert.equal(read('public/faq/index.html'), renderFaqPage('he'));
  assert.equal(read('public/en/faq/index.html'), renderFaqPage('en'));
  assert.equal(read('public/sitemap.xml'), renderSitemap());
  assert.equal(read('public/robots.txt'), renderRobots());
  assert.equal(read('public/faq-lang.js'), FAQ_LANG_SCRIPT);
});

test('faq: every question has a non-empty answer in both languages, a unique id, and a recorded source', () => {
  const ids = new Set<string>();
  for (const item of FAQ_ITEMS) {
    assert.ok(!ids.has(item.id), `duplicate id ${item.id}`);
    ids.add(item.id);
    for (const lang of ['he', 'en'] as const) {
      assert.ok(item.q[lang].trim().length > 5, `${item.id} question ${lang}`);
      assert.ok(item.a[lang].trim().length > 20, `${item.id} answer ${lang}`);
    }
    assert.ok(item.source.length > 10, `${item.id} source`);
  }
  assert.equal(FAQ_ITEMS.length, 16);
});

test('faq: Hebrew answers are written in Hebrew and English answers have no Hebrew', () => {
  for (const item of FAQ_ITEMS) {
    assert.match(item.q.he, /[֐-׿]/);
    assert.match(item.a.he, /[֐-׿]/);
    assert.doesNotMatch(item.q.en + item.a.en, /[֐-׿]/, item.id);
  }
});

test('faq: each page is a complete, search-friendly document of its own language', () => {
  for (const lang of ['he', 'en'] as const) {
    const html = renderFaqPage(lang);
    const p = FAQ_PAGE[lang];
    assert.match(html, new RegExp(`<html lang="${lang}" dir="${lang === 'he' ? 'rtl' : 'ltr'}">`));
    assert.match(html, new RegExp(`<link rel="canonical" href="https://daretogoin.com${p.path}">`));
    assert.match(html, /hreflang="he"/);
    assert.match(html, /hreflang="en"/);
    assert.match(html, /hreflang="x-default"/);
    assert.equal((html.match(/<h1>/g) ?? []).length, 1, 'exactly one h1');
    assert.equal((html.match(/<h2 class="q">/g) ?? []).length, FAQ_ITEMS.length);
    assert.doesNotMatch(html, /FAQPage/, 'no FAQPage structured data (not useful for this kind of site)');
    assert.doesNotMatch(html, /<script(?![^>]*(src=|type="application\/ld\+json"))/, 'no inline script (the CSP allows scripts from this site only)');
  }
});

test('faq: every link into the app points at a real view, and the language switch points at the other page', () => {
  const views = ['archive', 'pricing', 'about', 'privacy', 'accessibility', 'terms'];
  for (const lang of ['he', 'en'] as const) {
    const html = renderFaqPage(lang);
    for (const m of html.matchAll(/href="\/\?view=([a-z-]+)"/g)) assert.ok(views.includes(m[1]), m[1]);
    assert.ok(html.includes(`href="${FAQ_PAGE[lang].nav.langHref}"`));
  }
  assert.equal(FAQ_PAGE.he.nav.langHref, FAQ_PAGE.en.path);
  assert.equal(FAQ_PAGE.en.nav.langHref, FAQ_PAGE.he.path);
});

test('faq: the answers agree with the product facts they depend on', () => {
  const legal = read('src/legal/legalContent.ts');
  assert.ok(legal.includes(FAQ_EMAIL), 'the contact address is the one in the Privacy Policy');
  // Free dream: exactly one, and it is the free package.
  const free = DREAM_PACKAGES.find((p) => p.priceIls === null);
  assert.equal(free?.dreamCount, 1);
  const byId = (id: string) => FAQ_ITEMS.find((i) => i.id === id)!;
  assert.match(byId('free-dream').a.en, /one free dream, one per account/);
  // PDF export does not exist in this build: the answer must say so.
  assert.match(byId('pdf').a.en, /not available yet/);
  assert.doesNotMatch(read('src/i18n/translations.ts'), /export (to )?pdf/i);
  // The feelings answers describe exactly what the step does: optional, up to three, same request, no extra charge.
  assert.match(byId('skip-feelings').a.en, /optional/);
  assert.match(byId('how-it-works').a.en, /up to three feelings/);
  assert.match(byId('skip-feelings').a.en, /no extra charge/);
  assert.match(read('src/hero/dreamEmotions.ts'), /MAX_EMOTIONS = 3/);
  // No promise the code cannot keep.
  const all = JSON.stringify(FAQ_ITEMS.map((i) => [i.a.en, i.a.he]));
  assert.doesNotMatch(all, /unlimited|guarantee|forever|ללא הגבלה|לנצח|מבטיח/i);
});

test('faq: the header links to the FAQ in both languages', () => {
  assert.equal(en.hero.faqNav, 'FAQ');
  assert.equal(he.hero.faqNav, 'שאלות');
  const header = read('src/ui/GlobalHeader.tsx');
  assert.match(header, /href=\{language === 'he' \? '\/faq\/' : '\/en\/faq\/'\}/);
});
