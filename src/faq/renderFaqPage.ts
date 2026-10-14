import { FAQ_EMAIL, FAQ_ITEMS, FAQ_PAGE, SITE_ORIGIN, type FaqLang } from './faqContent';

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const STYLE = `
:root{color-scheme:dark;--ink:#f4f0e8;--bg:#060706;--line:rgba(244,240,232,.28)}
*{box-sizing:border-box;margin:0;padding:0}
html{background:var(--bg)}
body{min-height:100vh;color:var(--ink);font-family:'Heebo','Assistant',system-ui,sans-serif;font-size:1.05rem;line-height:1.75;background:radial-gradient(120% 70% at 50% 0%,#101a3a 0%,#0a0f26 38%,#060706 100%) fixed}
a{color:#fff}
a:focus-visible{outline:2px solid var(--ink);outline-offset:3px;border-radius:4px}
.skip{position:absolute;inset-inline-start:-999px;top:0;background:#000;color:#fff;padding:.6rem 1rem;z-index:10}
.skip:focus{inset-inline-start:.5rem;top:.5rem}
header{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.6rem 1.4rem;padding:1.1rem max(20px,5vw)}
.brand{font-family:'Fraunces',Georgia,serif;font-size:1.3rem;letter-spacing:.08em;text-decoration:none;color:var(--ink);direction:ltr}
nav{display:flex;flex-wrap:wrap;align-items:center;gap:.2rem 1.1rem}
nav a{font-size:1rem;font-weight:600;text-decoration:none;padding:.35em .2em}
nav a:hover,nav a[aria-current=page]{text-decoration:underline;text-underline-offset:.3em}
main{max-width:46rem;margin:0 auto;padding:1.6rem max(20px,5vw) 3rem}
h1{font-size:clamp(1.9rem,5vw,2.8rem);font-weight:500;line-height:1.2;text-wrap:balance}
.lead{margin-top:.8rem}
.toc{margin-top:1.6rem;padding-block:1rem;border-block:1px solid var(--line)}
.toc h2{font-size:.95rem;font-weight:600;letter-spacing:.06em;margin-bottom:.4rem}
.toc ol{padding-inline-start:1.4rem}
.toc a{font-size:1rem}
article{margin-top:2.2rem;scroll-margin-top:1rem}
h2.q{font-size:1.25rem;font-weight:600;line-height:1.4;text-wrap:balance}
article p{margin-top:.5rem}
footer{max-width:46rem;margin:0 auto;padding:1.4rem max(20px,5vw) 2.4rem;border-top:1px solid var(--line);display:flex;flex-wrap:wrap;gap:.4rem 1.4rem;font-size:1rem}
footer a{font-weight:600}
@media (prefers-reduced-motion:no-preference){html{scroll-behavior:smooth}}
`.trim();

export function renderFaqPage(lang: FaqLang): string {
  const p = FAQ_PAGE[lang];
  const other: FaqLang = lang === 'he' ? 'en' : 'he';
  const dir = lang === 'he' ? 'rtl' : 'ltr';
  const url = `${SITE_ORIGIN}${p.path}`;
  const app = (view: string) => `/?view=${view}`;
  const items = FAQ_ITEMS.map(
    (item) => `<article id="${item.id}"><h2 class="q">${esc(item.q[lang])}</h2><p>${esc(item.a[lang])}</p></article>`,
  ).join('\n');
  const toc = FAQ_ITEMS.map((item) => `<li><a href="#${item.id}">${esc(item.q[lang])}</a></li>`).join('');
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', name: 'DARE TO GO IN', url: SITE_ORIGIN, logo: `${SITE_ORIGIN}/icon-512.png`, email: FAQ_EMAIL },
      { '@type': 'WebSite', name: 'DARE TO GO IN', url: SITE_ORIGIN, inLanguage: ['he', 'en'] },
    ],
  });

  return `<!doctype html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#060706">
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.description)}">
<link rel="canonical" href="${url}">
<link rel="alternate" hreflang="he" href="${SITE_ORIGIN}${FAQ_PAGE.he.path}">
<link rel="alternate" hreflang="en" href="${SITE_ORIGIN}${FAQ_PAGE.en.path}">
<link rel="alternate" hreflang="x-default" href="${SITE_ORIGIN}${FAQ_PAGE.he.path}">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400&family=Heebo:wght@400;500;600&display=swap" rel="stylesheet">
<style>${STYLE}</style>
<script type="application/ld+json">${jsonLd}</script>
</head>
<body>
<a class="skip" href="#content">${lang === 'he' ? 'דילוג לתוכן' : 'Skip to content'}</a>
<header>
<a class="brand" href="/" data-app-link>${esc(p.home)}</a>
<nav aria-label="${lang === 'he' ? 'ניווט ראשי' : 'Main'}">
<a href="${app('archive')}" data-app-link>${esc(p.nav.myDreams)}</a>
<a href="${app('pricing')}" data-app-link>${esc(p.nav.packages)}</a>
<a href="${app('about')}" data-app-link>${esc(p.nav.about)}</a>
<a href="${p.path}" aria-current="page">${esc(p.nav.faq)}</a>
<a href="${p.nav.langHref}" hreflang="${other}" lang="${other}">${esc(p.nav.langLabel)}</a>
</nav>
</header>
<main id="content">
<h1>${esc(p.h1)}</h1>
<p class="lead">${esc(p.lead)}</p>
<nav class="toc" aria-label="${esc(p.jump)}"><h2>${esc(p.jump)}</h2><ol>${toc}</ol></nav>
${items}
</main>
<footer>
<a href="${app('privacy')}" data-app-link>${esc(p.footer.privacy)}</a>
<a href="${app('accessibility')}" data-app-link>${esc(p.footer.accessibility)}</a>
<a href="${app('terms')}" data-app-link>${esc(p.footer.terms)}</a>
<a href="mailto:${FAQ_EMAIL}">${esc(p.footer.contact)}</a>
<a href="/" data-app-link>${esc(p.footer.backToApp)}</a>
</footer>
<script src="/faq-lang.js" defer></script>
</body>
</html>
`;
}

export function renderSitemap(): string {
  const urls = ['/', FAQ_PAGE.he.path, FAQ_PAGE.en.path];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${SITE_ORIGIN}${u}</loc></url>`).join('\n')}\n</urlset>\n`;
}

export function renderRobots(): string {
  return `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`;
}

/** Sets the app's language to the page's own language when a visitor follows a link from this page into the app. */
export const FAQ_LANG_SCRIPT = `// Generated with the FAQ pages (src/faq/renderFaqPage.ts). A link from a FAQ page into the app opens the app in the page's own language.
document.addEventListener('click', function (event) {
  var link = event.target instanceof Element ? event.target.closest('a[data-app-link]') : null;
  if (!link) return;
  try {
    window.localStorage.setItem('dare-language', document.documentElement.lang === 'en' ? 'en' : 'he');
  } catch (e) {}
});
`;
