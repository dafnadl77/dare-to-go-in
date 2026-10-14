// Generated with the FAQ pages (src/faq/renderFaqPage.ts). A link from a FAQ page into the app opens the app in the page's own language.
document.addEventListener('click', function (event) {
  var link = event.target instanceof Element ? event.target.closest('a[data-app-link]') : null;
  if (!link) return;
  try {
    window.localStorage.setItem('dare-language', document.documentElement.lang === 'en' ? 'en' : 'he');
  } catch (e) {}
});
