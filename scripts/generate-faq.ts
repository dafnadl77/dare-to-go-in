import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FAQ_LANG_SCRIPT, renderFaqPage, renderRobots, renderSitemap } from '../src/faq/renderFaqPage.ts';
import { FAQ_PAGE } from '../src/faq/faqContent.ts';

/** Writes the static FAQ pages, sitemap and robots into public/ (served as-is by Vercel). Run with: npm run faq */
const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const files: Array<[string, string]> = [
  [`${FAQ_PAGE.he.path}index.html`, renderFaqPage('he')],
  [`${FAQ_PAGE.en.path}index.html`, renderFaqPage('en')],
  ['/sitemap.xml', renderSitemap()],
  ['/robots.txt', renderRobots()],
  ['/faq-lang.js', FAQ_LANG_SCRIPT],
];
for (const [path, content] of files) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content, 'utf8');
  console.log(`wrote public${path}`);
}
