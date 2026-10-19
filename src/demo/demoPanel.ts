/**
 * The demo's own little control in the corner: it labels the page as a demo and offers shortcuts, so the feelings screen (and the rest
 * of the new journey) can be reached and tried without playing the whole opening first. Plain DOM, no React, demo mode only.
 *
 * The shortcuts drive the page the way a person would (press the buttons, type into the boxes) and use only the visitor's own text
 * when there is any; a sample dream and a sample association (clearly labelled as such) are used only where nothing was typed.
 */

type Lang = 'he' | 'en';

const TEXT = {
  he: {
    short: 'הדגמה · נתונים מדומים',
    full: 'הדגמה: נתונים מדומים. שום דבר לא נשמר, לא נשלח ולא נחשב בתשלום.',
    title: 'מצב הדגמה',
    intro: 'אפשר להקליד חלום משלך: הטקסט יישמר ויוצג כפי שהוא לאורך המסע. התמונה וההרהור הן דוגמאות מוכנות מראש ומסומנות ככאלה, והן לא מבוססות על החלום שהקלדת. שום דבר לא נשלח לשרת.',
    sampleDream: 'חלום לדוגמה בשדה הכתיבה',
    jump: 'קחו אותי למסך התחושות',
    archive: 'ארכיון לדוגמה',
    close: 'סגירה',
    working: 'מגיעים למסך התחושות…',
    insights: 'תובנות לדוגמה',
    failed: 'לא הצלחתי להגיע למסך התחושות אוטומטית. אפשר להמשיך ידנית.',
    sample: 'חלמתי שאני עפה מעל ים כחול. נחתתי ליד בית ישן, ושם הייתה דלת ירוקה.',
    association: 'אסוציאציה לדוגמה (הדגמה)',
  },
  en: {
    short: 'Demo · made-up data',
    full: 'Demo: made-up data. Nothing is saved, sent or charged.',
    title: 'Demo mode',
    intro: 'You can type a dream of your own: your text is kept and shown exactly as typed throughout the journey. The picture and the reflection are pre-written examples, labelled as such, and are not based on the dream you typed. Nothing is sent to a server.',
    sampleDream: 'Sample dream in the writing box',
    jump: 'Take me to the feelings screen',
    archive: 'Sample archive',
    close: 'Close',
    working: 'Getting to the feelings screen…',
    insights: 'Sample Insights',
    failed: 'I could not reach the feelings screen automatically. You can carry on by hand.',
    sample: 'I dreamed that I was flying over a blue sea. I landed beside an old house, and there was a green door.',
    association: 'A sample association (demo)',
  },
} as const;

/** What the corner label says in the LOCAL test journey (real model, no database): it must never claim the text is made up. */
const BRIDGE_TEXT = {
  he: {
    short: 'בדיקה מקומית · מודל אמיתי',
    full: 'בדיקה מקומית: השאלות והפרשנות נכתבות על ידי מודל אמיתי. התמונה היא תמונת דוגמה. שום דבר לא נשמר, לא נשלח לשרת האמיתי ולא נחשב בתשלום או בקרדיטים.',
    title: 'בדיקה מקומית',
    intro: 'המסע הזה רץ על המחשב שלך מול מודל אמיתי, בלי מסד נתונים, בלי חשבון אמיתי, בלי קרדיטים ובלי תשלום. התמונה היא תמונת דוגמה. החלום והתשובות לא נשמרים מעבר לטעינה מחדש של הדף. מומלץ לכתוב חלום שאינו אישי.',
  },
  en: {
    short: 'Local test · real model',
    full: 'Local test: the questions and the reflection are written by a real model. The picture is a sample. Nothing is saved, sent to the real server, or charged.',
    title: 'Local test',
    intro: 'This journey runs on your computer against a real model, with no database, no real account, no credits and no payment. The picture is a sample. Nothing is kept beyond reloading the page. Please write a dream that is not personal.',
  },
} as const;
let bridgeMode = false;
const T = (l: Lang) => (bridgeMode ? { ...TEXT[l], ...BRIDGE_TEXT[l] } : TEXT[l]);

const lang = (): Lang => (document.documentElement.lang === 'en' ? 'en' : 'he');
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function setValue(el: HTMLTextAreaElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

const $ = <T extends Element>(selector: string): T | null => document.querySelector<T>(selector);

/** Opens the writing screen if the page is still on the opening, and returns the writing box. */
async function openWriting(): Promise<HTMLTextAreaElement | null> {
  const existing = $<HTMLTextAreaElement>('.central-typing-textarea');
  if (existing && existing.tabIndex === 0) return existing;
  for (let i = 0; i < 100; i++) {
    const link = $<HTMLButtonElement>('.htr-type-link');
    if (link) {
      link.click();
      break;
    }
    await sleep(200);
  }
  for (let i = 0; i < 50; i++) {
    const area = $<HTMLTextAreaElement>('.central-typing-textarea');
    if (area && area.tabIndex === 0) return area;
    await sleep(200);
  }
  return null;
}

async function fillSampleDream(): Promise<void> {
  const area = await openWriting();
  if (area && !area.value.trim()) setValue(area, T(lang()).sample);
  area?.focus();
}

/** Plays the journey forward until the feelings screen is showing. Stops there and leaves the choosing to the visitor. */
async function jumpToFeelings(): Promise<boolean> {
  const t = T(lang());
  const deadline = Date.now() + 120_000;
  let wroteDream = false;
  let lastAction = '';
  let lastAt = 0;
  const act = async (name: string, run: () => void, settleMs = 0) => {
    if (name === lastAction && Date.now() - lastAt < 2500) return;
    lastAction = name;
    lastAt = Date.now();
    if (settleMs) await sleep(settleMs);
    run();
  };
  while (Date.now() < deadline) {
    if ($('.de-chips')) return true;
    if ($('.dream-reflection')) {
      const association = $<HTMLTextAreaElement>('.dr-response-textarea');
      if (association) {
        await act('association', () => {
          if (!association.value.trim()) setValue(association, t.association);
          $<HTMLButtonElement>('.dream-reflection .dr-choice')?.click();
        }, 900);
      } else if ($('.da-choice')) {
        await act('moment', () => $<HTMLButtonElement>('.da-choice')?.click(), 900);
      }
    } else if ($('.dr-choice--yes')) {
      await act('image', () => $<HTMLButtonElement>('.dr-choice--yes')?.click(), 600);
    } else {
      const area = $<HTMLTextAreaElement>('.central-typing-textarea');
      // Once the dream has been sent the writing panel can linger for a moment: never send it a second time.
      if (wroteDream) {
        /* wait for the picture */
      } else if (area && area.tabIndex === 0) {
        await act('write', () => {
          if (!area.value.trim()) setValue(area, t.sample);
          wroteDream = true;
          $<HTMLButtonElement>('.central-typing-actions .central-done')?.click();
        }, 600);
      } else {
        await act('open', () => $<HTMLButtonElement>('.htr-type-link')?.click());
      }
    }
    await sleep(250);
  }
  return false;
}

export function mountDemoPanel(options: { bridge?: boolean } = {}): void {
  bridgeMode = options.bridge === true;
  const root = document.createElement('div');
  root.id = 'demo-badge';
  Object.assign(root.style, { position: 'fixed', right: '10px', bottom: '10px', zIndex: '70', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px', maxWidth: 'calc(100vw - 20px)' } satisfies Partial<CSSStyleDeclaration>);

  const style = document.createElement('style');
  style.textContent = `
    #demo-badge button { font: 500 15px/1.3 'Heebo','Assistant',system-ui,sans-serif; color: #f4f0e8; background: rgba(5,7,16,.9); border: 1px solid rgba(244,240,232,.5); border-radius: 999px; padding: 7px 14px; cursor: pointer; }
    #demo-badge button:hover { border-color: rgba(244,240,232,.9); }
    #demo-badge button:focus-visible { outline: 2px solid #f4f0e8; outline-offset: 2px; }
    #demo-badge .demo-menu { width: min(340px, calc(100vw - 20px)); background: rgba(5,7,16,.94); border: 1px solid rgba(244,240,232,.45); border-radius: 16px; padding: 14px; color: #f4f0e8; font: 400 15px/1.55 'Heebo','Assistant',system-ui,sans-serif; display: flex; flex-direction: column; gap: 8px; }
    #demo-badge .demo-menu[hidden] { display: none; }
    #demo-badge .demo-menu strong { font-weight: 600; }
    #demo-badge .demo-menu button { border-radius: 12px; text-align: start; }
    #demo-badge .demo-status { font-size: 15px; color: #f4f0e8; min-height: 1.2em; }
  `;
  root.appendChild(style);

  const menu = document.createElement('div');
  menu.className = 'demo-menu';
  menu.id = 'demo-menu';
  menu.hidden = true;
  menu.setAttribute('role', 'group');

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.setAttribute('aria-controls', 'demo-menu');
  toggle.setAttribute('aria-expanded', 'false');

  const title = document.createElement('strong');
  const intro = document.createElement('p');
  intro.style.margin = '0';
  const bSample = document.createElement('button');
  const bJump = document.createElement('button');
  const bArchive = document.createElement('button');
  const bInsights = document.createElement('button');
  // The one control a reviewer needs most is never hidden in the menu: a visible button next to the label.
  const jumpMain = document.createElement('button');
  jumpMain.type = 'button';
  jumpMain.id = 'demo-jump';
  jumpMain.style.borderColor = 'rgba(244,240,232,.95)';
  jumpMain.style.fontWeight = '600';
  const bClose = document.createElement('button');
  const status = document.createElement('div');
  status.className = 'demo-status';
  status.setAttribute('role', 'status');
  for (const b of [bSample, bJump, bArchive, bInsights, bClose]) b.type = 'button';
  menu.append(title, intro, bSample, bJump, bArchive, bInsights, status, bClose);
  root.append(menu, jumpMain, toggle);

  const setOpen = (open: boolean) => {
    menu.hidden = !open;
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) bJump.focus();
  };
  toggle.addEventListener('click', () => setOpen(!!menu.hidden));
  bClose.addEventListener('click', () => {
    setOpen(false);
    toggle.focus();
  });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) {
      e.stopPropagation();
      setOpen(false);
      toggle.focus();
    }
  });

  bSample.addEventListener('click', async () => {
    setOpen(false);
    await fillSampleDream();
  });
  let jumping = false;
  const runJump = async () => {
    if (jumping) return;
    jumping = true;
    jumpMain.disabled = true;
    jumpMain.textContent = T(lang()).working;
    status.textContent = T(lang()).working;
    const ok = await jumpToFeelings();
    status.textContent = ok ? '' : T(lang()).failed;
    jumping = false;
    jumpMain.disabled = false;
    apply();
    if (ok) setOpen(false);
  };
  bJump.addEventListener('click', runJump);
  jumpMain.addEventListener('click', runJump);
  bArchive.addEventListener('click', () => {
    window.location.href = `${window.location.pathname}?demo=1&view=archive`;
  });
  bInsights.addEventListener('click', () => {
    window.location.href = `${window.location.pathname}?demo=1&view=archive&goto=insights`;
  });

  const apply = () => {
    const t = T(lang());
    toggle.textContent = `${t.short} ▴`;
    toggle.title = t.full;
    toggle.setAttribute('aria-label', `${t.full} ${t.title}`);
    title.textContent = t.title;
    intro.textContent = t.intro;
    bSample.textContent = t.sampleDream;
    bJump.textContent = t.jump;
    bArchive.textContent = t.archive;
    bInsights.textContent = t.insights;
    if (!jumping) jumpMain.textContent = `${t.jump} ${lang() === 'he' ? '←' : '→'}`;
    bClose.textContent = t.close;
    root.dir = lang() === 'he' ? 'rtl' : 'ltr';
  };
  apply();
  new MutationObserver(apply).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  document.body.appendChild(root);

  // The jump button is shown only where it can help: on the opening and the early journey, never once the feelings screen or later is reached.
  const syncJump = () => {
    const onJourney = !!document.querySelector('.hero-dream');
    const past = !!document.querySelector('.de-chips, .dr-thought, .dc-title');
    jumpMain.hidden = !onJourney || past;
  };
  syncJump();
  window.setInterval(syncJump, 600);

  // Direct links: ?goto=feelings runs the jump on arrival; ?goto=insights opens the Insights page of the sample archive.
  const goto = new URLSearchParams(window.location.search).get('goto');
  if (goto === 'feelings') {
    void sleep(1500).then(() => runJump());
  } else if (goto === 'insights') {
    void (async () => {
      for (let i = 0; i < 60; i++) {
        const items = document.querySelectorAll<HTMLButtonElement>('.ar-nav-item');
        if (items.length >= 3 && document.querySelector('.dt-card')) {
          items[2].click();
          return;
        }
        await sleep(300);
      }
    })();
  }
}
