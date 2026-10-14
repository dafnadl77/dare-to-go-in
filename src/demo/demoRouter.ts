import { emotionNamesForModel, normalizeEmotions } from '../hero/dreamEmotions';

/**
 * The browser-side stand-in for every server DARE talks to, used by demo mode only (see demoFlag.ts / installDemo.ts).
 *
 * The one rule that makes the demo safe: NOTHING here, and nothing that goes through it, reaches a real server.
 *   - every /api/* request is answered here, never sent (so no paid model is ever called),
 *   - every /__demo/* request (the demo's own "Supabase": auth, tables, storage) is answered here from memory,
 *   - a same-origin GET (a picture, the video, a font file) goes to the site as usual, because it is only a static file,
 *   - everything else (any other host, any other method) is refused. In particular the live Supabase project is unreachable.
 * Nothing is persisted: a saved demo dream lives in this page's memory and disappears on reload.
 */

export const DEMO_USER_ID = '00000000-0000-4000-8000-0000000000aa';
const IMAGES = ['/dream-assets/dream-bed-alt.jpg', '/dream-assets/dream-mirror-alt.jpg', '/dream-assets/dream-art-alt.jpg'];
const SAMPLE_IMAGE = '/dream-assets/dream-art-alt.jpg';

type Json = Record<string, unknown>;

export interface DemoNetStats {
  mocked: number;
  passed: number;
  blocked: number;
  log: string[];
}

export interface DemoRouterDeps {
  /** The browser's real fetch, used ONLY for same-origin static GETs. */
  realFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  origin: string;
  /** Milliseconds a "slow" answer takes (the real ones take seconds); tests pass 0. */
  delay?: (ms: number) => Promise<void>;
  now?: () => number;
}

const jsonResponse = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(status === 204 || body === null ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });

const isHebrew = (value: unknown): boolean => /[֐-׿]/.test(typeof value === 'string' ? value : JSON.stringify(value ?? ''));

function joinNames(names: string, he: boolean): string {
  // emotionNamesForModel already joins with commas; the last one gets "and"/"ו".
  const parts = names.split(', ').filter(Boolean);
  if (parts.length < 2) return names;
  const last = parts.pop() as string;
  return he ? `${parts.join(', ')} ו${last}` : `${parts.join(', ')} and ${last}`;
}

/** The fixed content of the six SAMPLE archive dreams (never of a dream the visitor typed). */
function sampleAnalysis(sourceText: string, he: boolean): Json {
  const e = (name: string) => ({ name, explicit: true, confidence: 0.9 });
  return {
    sourceText,
    language: he ? 'he' : 'en',
    summary: he ? 'חלום מומצא על מעוף מעל ים כחול אל בית ישן עם דלת ירוקה.' : 'An invented dream about flying over a blue sea toward an old house with a green door.',
    people: [{ nameOrRole: he ? 'סבתא' : 'Grandmother', explicit: true, confidence: 0.9 }],
    places: [e(he ? 'בית ישן ליד הים' : 'An old house by the sea')],
    objects: [e(he ? 'דלת ירוקה' : 'A green door'), e(he ? 'מפתח זהב' : 'A golden key')],
    actions: [{ action: he ? 'עפה מעל הים' : 'Flying over the sea', target: null, explicit: true, confidence: 0.9 }],
    emotions: [{ emotion: he ? 'התרגשות שקטה' : 'Quiet wonder', explicit: true, confidence: 0.8 }],
    sensoryDetails: {
      visual: [he ? 'אור כחול' : 'Blue light'],
      sounds: [he ? 'גלים רחוקים' : 'Distant waves'],
      physicalSensations: [he ? 'קלילות' : 'Lightness'],
      atmosphere: [he ? 'שלווה' : 'Calm'],
    },
    unusualElements: [he ? 'הבית היה גם בית הילדות וגם חדר במלון' : 'The house was both a childhood home and a hotel room'],
    relationships: [{ from: he ? 'אני' : 'Me', to: he ? 'סבתא' : 'Grandmother', relationship: he ? 'נכד או נכדה' : 'grandchild' }],
    sequence: [
      { order: 1, description: he ? 'עפתי מעל הים' : 'I flew over the sea' },
      { order: 2, description: he ? 'נחתתי ליד הדלת' : 'I landed by the door' },
    ],
    unresolvedDetails: [he ? 'לא ידעתי מה יש מאחורי הדלת' : 'I never learned what was behind the door'],
    emotionalTone: he ? 'מהורהר' : 'contemplative',
    reconstruction: {
      primarySetting: he ? 'בית ישן ליד ים כחול' : 'An old house by a blue sea',
      keyPeople: [he ? 'סבתא' : 'Grandmother'],
      keyObjects: [he ? 'דלת ירוקה' : 'A green door'],
      keyActions: [he ? 'עפה' : 'Flying'],
      visualAtmosphere: [he ? 'אור כחול' : 'Blue light'],
      emotionalAtmosphere: [he ? 'שלווה' : 'Calm'],
    },
    concepts: [],
    conceptVersion: 1,
  };
}

/** A sample reflection written in advance, used only for the sample archive dreams. */
function sampleReflection(he: boolean, emotionIds: unknown, reflectionResponse: unknown): Json {
  const emotions = normalizeEmotions(emotionIds);
  const named = emotions.length ? joinNames(emotionNamesForModel(emotions, he ? 'he' : 'en'), he) : '';
  const written = typeof reflectionResponse === 'string' ? reflectionResponse.trim() : '';
  return {
    observation: he
      ? 'בחלום עפתם מעל ים כחול ונחתתם ליד בית ישן עם דלת ירוקה, וסבתא עמדה לידכם. הבית היה גם בית הילדות וגם חדר במלון, והדלת לא נפתחה.'
      : 'In the dream you flew over a blue sea and landed beside an old house with a green door, with your grandmother nearby. The house was both a childhood home and a hotel room, and the door never opened.',
    personalAssociation: written
      ? he
        ? `כתבתם: “${written}”${stop(written)}`
        : `You wrote: “${written}”${stop(written)}`
      : he
        ? 'כתבתם שהדלת הירוקה מזכירה את הגינה של סבתא.'
        : "You said the green door reminds you of your grandmother's garden.",
    possibleThread: he
      ? 'אולי יש כאן חוט של געגוע לעבר שנשאר סגור ולא ידוע, מקום שאפשר להתקרב אליו בלי להיכנס.'
      : 'One possible thread is a longing for a past that stays closed and unknown, a place you can approach without entering.',
    continuityQuestion: he
      ? 'האם יש משהו בחייכם עכשיו שאתם מתקרבים אליו אבל עוד לא פותחים?'
      : 'Is there something in your life right now that you are approaching but have not yet opened?',
    lenses: {
      cognitive: he ? 'ייתכן שהחלום משקף עיבוד של זיכרונות מהחודשים האחרונים.' : 'The dream may reflect memories being processed from recent months.',
      jungian: he ? 'דלת סגורה יכולה לשמש כאן כסף בין מוכר לבלתי מוכר.' : 'A closed door may stand as a threshold between the known and the unknown.',
      psychodynamic: null,
    },
    confidenceNotes: [],
    groundingStatement: he ? 'זו השתקפות, לא אבחנה או פרשנות חד־משמעית.' : 'This is a reflection, not a diagnosis or a definitive interpretation.',
    emotionReflection: named
      ? he
        ? `בחרתם ${named} (זה הדיווח שלכם אחרי החלום, לא חלק ממה שקרה בו). אולי התחושות האלה מאירות את הדלת הסגורה כמשהו שמתקרבים אליו בעדינות.`
        : `You named ${named} (your own report after the dream, not part of what happened in it). Perhaps those feelings light the closed door as something you approach gently.`
      : null,
    summary: he ? 'דלת ירוקה, גינה של סבתא, וקרבה שעוד לא נפתחת.' : "A green door, a grandmother's garden, and a closeness that has not yet opened.",
  };
}


/** The visitor's own words, cut into short phrases WITHOUT changing a word (only the cut points and trailing punctuation go). */
export function phrasesFromDream(text: string, max = 6): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const tidy = (p: string) => p.replace(/^[\s,;:.!?\-–—"'“”«»()]+|[\s,;:.!?\-–—"'“”«»()]+$/g, '').trim();
  const clip = (p: string) => {
    const words = p.split(' ');
    return words.length > 8 ? `${words.slice(0, 8).join(' ')}…` : p;
  };
  let parts = clean.split(/(?<=[.!?…])\s+|[,;:—–]\s*|\s-\s/).map(tidy).filter((p) => p.length >= 2);
  const words = clean.split(' ');
  if (parts.length < 3 && words.length >= 6) {
    const size = Math.max(2, Math.ceil(words.length / 4));
    parts = [];
    for (let i = 0; i < words.length; i += size) parts.push(tidy(words.slice(i, i + size).join(' ')));
    parts = parts.filter((p) => p.length >= 2);
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts.map(clip)) {
    const key = p.toLowerCase();
    if (!p || seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out.slice(0, max);
}

/** A whole-word excerpt of the visitor's text, for quoting it back unchanged. */
export function excerptOf(text: string, maxChars: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxChars) return clean;
  const cut = clean.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > maxChars / 2 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

/**
 * The "analysis" of a dream the visitor TYPED: nothing is understood or invented. The dream text is theirs, unchanged, and the
 * "moments" to choose from are short pieces of their own sentence. Every other field stays empty so nothing foreign can appear.
 */
export function typedAnalysis(sourceText: string, he: boolean): Json {
  const phrases = phrasesFromDream(sourceText);
  const title = phrases[0] ?? excerptOf(sourceText, 40);
  return {
    sourceText,
    language: he ? 'he' : 'en',
    summary: excerptOf(sourceText, 120),
    people: [],
    places: [],
    objects: [],
    actions: [],
    emotions: [],
    sensoryDetails: { visual: [], sounds: [], physicalSensations: [], atmosphere: [] },
    unusualElements: phrases,
    relationships: [],
    sequence: [],
    unresolvedDetails: [],
    emotionalTone: null,
    reconstruction: { primarySetting: title, keyPeople: [], keyObjects: [], keyActions: [], visualAtmosphere: [], emotionalAtmosphere: [] },
    concepts: [],
    conceptVersion: 1,
  };
}

/** A full stop after a closing quote, unless the quoted words already end with one. */
const stop = (quoted: string): string => (/[.!?…]$/.test(quoted.trim()) ? "" : ".");

const DEMO_TAG = { he: 'דוגמת הדגמה', en: 'demo example' } as const;

/**
 * The reflection for a dream the visitor typed. What belongs to them is quoted back UNCHANGED (their dream, the moment they chose,
 * their association, the feelings they picked). Everything else is plainly pre-written placeholder text, tagged as such, and the
 * grounding line under the reflection says so too. In the real product the model writes all of this from the dream; here it never runs.
 */
export function demoReflection(he: boolean, input: { sourceText?: unknown; selectedElement?: unknown; emotions?: unknown; reflectionResponse?: unknown }): Json {
  const emotions = normalizeEmotions(input.emotions);
  const named = emotions.length ? joinNames(emotionNamesForModel(emotions, he ? 'he' : 'en'), he) : '';
  const text = typeof input.sourceText === 'string' ? input.sourceText.trim() : '';
  const moment = typeof input.selectedElement === 'string' ? input.selectedElement.trim() : '';
  const written = typeof input.reflectionResponse === 'string' ? input.reflectionResponse.trim() : '';
  const tag = he ? DEMO_TAG.he : DEMO_TAG.en;
  return {
    observation: he ? `בחלום שתיארתם: “${excerptOf(text, 220)}”${stop(text)}` : `In the dream you described: “${excerptOf(text, 220)}”${stop(text)}`,
    personalAssociation: written
      ? he
        ? `כתבתם: “${written}”.`
        : `You wrote: “${written}”.`
      : moment
        ? he
          ? `בחרתם להתעכב על: “${moment}”.`
          : `You chose to stay with: “${moment}”.`
        : he
          ? 'לא כתבתם אסוציאציה.'
          : 'You did not write an association.',
    possibleThread: he
      ? `(${tag}) כאן יופיע חוט אפשרי שהמודל כותב מתוך החלום שלכם. בהדגמה זה טקסט מוכן מראש, שלא מבוסס על מה שהקלדתם.`
      : `(${tag}) Here a possible thread, written by the model from your dream, would appear. In the demo this is pre-written text that is not based on what you typed.`,
    continuityQuestion: he
      ? `(${tag}) כאן תופיע שאלה להתבוננות שנכתבת מתוך החלום שלכם. בהדגמה זו שאלה מוכנה מראש.`
      : `(${tag}) Here a question to sit with, written from your dream, would appear. In the demo it is a pre-written question.`,
    lenses: { cognitive: null, jungian: null, psychodynamic: null },
    confidenceNotes: [],
    groundingStatement: he
      ? 'נתוני הדגמה: ההרהור כתוב מראש ואינו מבוסס על החלום שהקלדתם. רק הציטוטים הם שלכם. זו השתקפות, לא אבחנה.'
      : 'Demo data: this reflection is pre-written and is not based on the dream you typed. Only the quotes are yours. It is a reflection, not a diagnosis.',
    emotionReflection: named
      ? he
        ? `בחרתם ${named} (זה הדיווח שלכם אחרי החלום, לא חלק ממה שקרה בו). (${tag}) כאן יופיע הרהור על התחושות האלה בהקשר לחלום שלכם.`
        : `You named ${named} (your own report after the dream, not part of what happened in it). (${tag}) Here a reflection on those feelings, in the context of your dream, would appear.`
      : null,
    summary: excerptOf(moment || text, 90) || null,
  };
}

/** Draws a clear "demo image" band onto the sample picture, so a picture that was NOT made from the visitor's dream cannot pass for one. */
async function markDemoImage(dataUrl: string, he: boolean): Promise<string> {
  try {
    const img = new Image();
    // (not decode(): it can stall while a page is in the background; load fires reliably, with a time limit as a last resort)
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('image'));
      setTimeout(() => reject(new Error('image timeout')), 4000);
      img.src = dataUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0);
    const bandHeight = Math.max(48, Math.round(canvas.height * 0.075));
    ctx.fillStyle = 'rgba(5, 7, 16, 0.82)';
    ctx.fillRect(0, canvas.height - bandHeight, canvas.width, bandHeight);
    ctx.fillStyle = '#f4f0e8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.direction = he ? 'rtl' : 'ltr';
    ctx.font = `500 ${Math.round(bandHeight * 0.46)}px Heebo, Assistant, system-ui, sans-serif`;
    ctx.fillText(he ? 'תמונת הדגמה · לא נוצרה מהחלום שהקלדתם' : 'Demo image · not made from the dream you typed', canvas.width / 2, canvas.height - bandHeight / 2);
    return canvas.toDataURL('image/jpeg', 0.9);
  } catch {
    return dataUrl;
  }
}

/** The sample dreams differ only in their title, which the archive reads from the setting. */
function demoRowAnalysis(source: string, he: boolean, title: string): Json {
  const base = sampleAnalysis(source, he);
  return { ...base, summary: title, reconstruction: { ...(base.reconstruction as Json), primarySetting: title } };
}

function savedRow(id: string, he: boolean, title: string, source: string, daysAgo: number, favorite: boolean, image: string | null, now: number, emotions?: string[]): Json {
  const reflection = sampleReflection(he, emotions ?? [], he ? 'זה מזכיר לי את הגינה של סבתא' : "It reminds me of my grandmother's garden");
  if (!emotions) {
    reflection.emotionReflection = null;
    reflection.summary = null;
  }
  const payload: Json = {
    sourceText: source,
    inputMode: 'text',
    dreamAnalysis: demoRowAnalysis(source, he, title),
    dreamImageDataUrl: image,
    dreamImagePath: null,
    selectedElement: he ? 'דלת ירוקה' : 'GREEN DOOR',
    reflectionResponse: he ? 'זה מזכיר לי את הגינה של סבתא' : "It reminds me of my grandmother's garden",
    dreamReflection: reflection,
    corrections: [],
    appLanguage: he ? 'he' : 'en',
  };
  if (emotions) payload.emotions = emotions;
  return { id, owner_id: DEMO_USER_ID, created_at: new Date(now - daysAgo * 86400000).toISOString(), favorite, payload };
}

/** Six invented dreams. Two carry feelings and the new "in short" line, four read exactly as dreams saved before the feelings step existed. */
export function demoInitialRows(now: number): Json[] {
  const longHe = 'חלמתי שאני עפה מעל ים כחול ועצום, ואור זהוב נשפך מהאופק. '.repeat(8);
  const longEn = 'I dreamed that I was flying over an enormous blue sea while golden light spilled from the horizon. '.repeat(7);
  return [
    savedRow('a0000001-0000-4000-8000-000000000001', true, 'דוגמה · עפתי מעל הים', 'חלמתי שאני עפה מעל ים כחול אל בית ישן עם דלת ירוקה.', 1, true, IMAGES[0], now, ['longing', 'calm', 'wonder']),
    savedRow('a0000001-0000-4000-8000-000000000002', false, 'Sample · Flying toward a green door', 'I was flying over a blue sea toward an old house with a green door.', 2, false, IMAGES[2], now, ['fear', 'excitement']),
    savedRow('a0000001-0000-4000-8000-000000000003', true, 'דוגמה · ים אינסופי', longHe, 5, false, IMAGES[1], now),
    savedRow('a0000001-0000-4000-8000-000000000004', false, 'Sample · The corridor', 'A long corridor with many doors.', 9, true, IMAGES[1], now),
    savedRow('a0000001-0000-4000-8000-000000000005', true, 'דוגמה · בית ישן', 'חלמתי על בית ישן.', 14, false, null, now),
    savedRow('a0000001-0000-4000-8000-000000000006', false, 'Sample · Golden light over the water', longEn, 20, false, IMAGES[0], now),
  ];
}

function demoSession(userMetadata: Json, now: number): Json {
  const exp = Math.floor(now / 1000) + 7 * 86400;
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const accessToken = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: DEMO_USER_ID, role: 'authenticated', aud: 'authenticated', exp })}.demo`;
  return {
    access_token: accessToken,
    refresh_token: 'demo-refresh-token',
    token_type: 'bearer',
    expires_in: 7 * 86400,
    expires_at: exp,
    user: demoUser(userMetadata),
  };
}

function demoUser(userMetadata: Json): Json {
  return {
    id: DEMO_USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'demo@example.test',
    email_confirmed_at: '2026-01-01T00:00:00.000Z',
    app_metadata: { provider: 'email' },
    user_metadata: userMetadata,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

export function createDemoRouter(deps: DemoRouterDeps) {
  const delay = deps.delay ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = deps.now ?? (() => Date.now());
  const stats: DemoNetStats = { mocked: 0, passed: 0, blocked: 0, log: [] };
  const rows: Json[] = demoInitialRows(now());
  let userMetadata: Json = { displayName: 'Demo' };
  let sampleImage: Promise<string> | null = null;
  /** The picture shown for the most recent demo dream (the sample, with its "demo image" band), kept for the dream that gets saved. */
  let lastMarkedImage: string | null = null;

  const note = (kind: 'mocked' | 'passed' | 'blocked', line: string) => {
    stats[kind] += 1;
    if (stats.log.length < 400) stats.log.push(`${kind} ${line}`);
  };

  /** The sample picture as a data URL, read once from the site's own static file. */
  const loadSampleImage = (): Promise<string> => {
    if (!sampleImage) {
      sampleImage = deps
        .realFetch(`${deps.origin}${SAMPLE_IMAGE}`)
        .then((res) => res.blob())
        .then(
          (blob) =>
            new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result));
              reader.onerror = () => reject(reader.error);
              reader.readAsDataURL(blob);
            }),
        );
    }
    return sampleImage;
  };

  async function api(path: string, method: string, body: Json): Promise<Response> {
    const he = body.language === 'he' || (body.language !== 'en' && isHebrew(body));
    if (path === '/api/credits') {
      if (method === 'GET') return jsonResponse({ balance: 3, purchasedPackage: 'go_deeper_3', grantedCredits: 3, grantCount: 1, freeDreamUsed: true, freeGranted: 0, freeDream: 'used' });
      return jsonResponse({ reason: 'request_failed', message: 'Payments are switched off in the demo. Nothing was charged.' }, 503);
    }
    if (path === '/api/trial-session' || path === '/api/claim-trial') return jsonResponse({ ok: true });
    if (path === '/api/delete-account') return jsonResponse({ reason: 'request_failed', message: 'Accounts cannot be deleted in the demo.' }, 503);
    if (path === '/api/dream-analysis') {
      await delay(600);
      const text = String(body.sourceText ?? '');
      return jsonResponse({ ...typedAnalysis(text, isHebrew(text)), attemptId: '11111111-1111-4111-8111-111111111111' });
    }
    if (path === '/api/dream-image') {
      await delay(1500);
      const marked = await markDemoImage(await loadSampleImage(), he);
      lastMarkedImage = marked;
      return jsonResponse({ imageDataUrl: marked });
    }
    if (path === '/api/dream-element-labels') {
      // The moments are the visitor's own phrases: the labels are those same words, unchanged.
      const elements = Array.isArray(body.elements) ? body.elements.map((e) => String(e)) : [];
      return jsonResponse({ labels: elements });
    }
    if (path === '/api/dream-reflection') {
      await delay(800);
      const analysisBody = body.dreamAnalysis && typeof body.dreamAnalysis === 'object' ? (body.dreamAnalysis as Json) : {};
      return jsonResponse(
        demoReflection(he, { sourceText: analysisBody.sourceText, selectedElement: body.selectedElement, emotions: body.emotions, reflectionResponse: body.reflectionResponse }),
      );
    }
    if (path === '/api/dream-transcription') {
      // The demo cannot turn a recording into words, and it will not pretend to: the dreamer falls back to typing, as when transcription fails.
      return jsonResponse({ reason: 'request_failed', message: 'Voice transcription is not available in the demo. Type the dream instead.' }, 503);
    }
    if (path === '/api/dream-translation') {
      const texts = Array.isArray(body.texts) ? body.texts : [];
      return jsonResponse({ translations: texts.map((t) => String(t)) });
    }
    if (path === '/api/pattern-reflection') return jsonResponse({ reason: 'request_failed', message: 'Pattern reflections are not part of the demo.' }, 503);
    return jsonResponse({ reason: 'request_failed', message: 'Not part of the demo.' }, 404);
  }

  function filterRows(params: URLSearchParams): Json[] {
    let result = rows.slice();
    for (const [key, value] of params.entries()) {
      if (value.startsWith('eq.') && (key === 'id' || key === 'owner_id')) result = result.filter((r) => String(r[key]) === value.slice(3));
      else if (key === 'id' && value.startsWith('in.(')) {
        const ids = value.slice(4, -1).split(',').map((s) => s.replace(/"/g, ''));
        result = result.filter((r) => ids.includes(String(r.id)));
      }
    }
    if ((params.get('order') ?? '').startsWith('created_at')) {
      const desc = (params.get('order') ?? '').endsWith('.desc');
      result.sort((a, b) => (String(a.created_at) < String(b.created_at) ? -1 : 1) * (desc ? -1 : 1));
    }
    return result;
  }

  async function supabase(path: string, method: string, search: string, headers: Headers, body: unknown): Promise<Response> {
    const params = new URLSearchParams(search);
    const prefer = headers.get('Prefer') ?? '';
    const wantsRepresentation = prefer.includes('return=representation');
    const single = (headers.get('Accept') ?? '').includes('vnd.pgrst.object');

    if (path === '/auth/v1/user') {
      if (method === 'PUT') {
        const data = (body as { data?: Json } | null)?.data;
        if (data && typeof data === 'object') userMetadata = { ...userMetadata, ...data };
      }
      return jsonResponse(demoUser(userMetadata));
    }
    if (path === '/auth/v1/token') return jsonResponse(demoSession(userMetadata, now()));
    if (path === '/auth/v1/logout') return jsonResponse(null, 204);
    if (path.startsWith('/auth/v1/')) return jsonResponse({ code: 400, error_code: 'demo_mode', msg: 'Accounts are switched off in the demo.' }, 400);

    if (path === '/rest/v1/dreams') {
      if (method === 'GET') {
        const found = filterRows(params);
        if (single) {
          return found.length ? jsonResponse(found[0]) : jsonResponse({ code: 'PGRST116', message: 'The result contains 0 rows' }, 406);
        }
        return jsonResponse(found, 200, { 'Content-Range': found.length ? `0-${found.length - 1}/${found.length}` : '*/0' });
      }
      if (method === 'POST') {
        const incoming = (Array.isArray(body) ? body : [body]).filter((r): r is Json => !!r && typeof r === 'object');
        for (const row of incoming) {
          if (rows.some((r) => r.id === row.id)) continue;
          const payload = row.payload && typeof row.payload === 'object' ? { ...(row.payload as Json) } : null;
          if (payload && payload.dreamImagePath && lastMarkedImage) {
            payload.dreamImageDataUrl = lastMarkedImage;
            payload.dreamImagePath = null;
          }
          rows.push({ ...row, ...(payload ? { payload } : {}), owner_id: DEMO_USER_ID });
        }
        return wantsRepresentation ? jsonResponse(incoming, 201) : jsonResponse(null, 201);
      }
      if (method === 'PATCH') {
        const found = filterRows(params);
        const patch = (body && typeof body === 'object' ? body : {}) as Json;
        for (const row of found) Object.assign(row, patch);
        return wantsRepresentation ? jsonResponse(found, 200) : jsonResponse(null, 204);
      }
      if (method === 'DELETE') {
        const found = filterRows(params);
        for (const row of found) rows.splice(rows.indexOf(row), 1);
        return wantsRepresentation ? jsonResponse(found, 200) : jsonResponse(null, 204);
      }
    }
    if (path.startsWith('/rest/v1/')) {
      if (method === 'GET') return jsonResponse([], 200, { 'Content-Range': '*/0' });
      return wantsRepresentation ? jsonResponse([], 201) : jsonResponse(null, 204);
    }

    if (path.startsWith('/storage/v1/object/sign/')) {
      // The picture of every demo dream is the same sample file. The extra "../" steps climb out of /__demo/storage/v1 (where the
      // Supabase client resolves this) onto the site's own static folder, so the <img> loads it as an ordinary same-site file.
      return jsonResponse({ signedURL: `/../../../..${SAMPLE_IMAGE}?demo=1` });
    }
    if (path.startsWith('/storage/v1/object/')) {
      if (method === 'DELETE') return jsonResponse([]);
      return jsonResponse({ Key: path.slice('/storage/v1/object/'.length), Id: 'demo' });
    }
    return jsonResponse({ message: 'Not found in the demo.' }, 404);
  }

  async function handle(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const request = input instanceof Request ? input : null;
    const rawUrl = request ? request.url : String(input);
    const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
    let url: URL;
    try {
      url = new URL(rawUrl, deps.origin);
    } catch {
      note('blocked', `${method} ${rawUrl}`);
      return jsonResponse({ reason: 'demo_blocked', message: 'Blocked in demo mode.' }, 403);
    }
    const sameOrigin = url.origin === deps.origin;
    const headers = new Headers(init?.headers ?? request?.headers);

    if (sameOrigin && (url.pathname.startsWith('/api/') || url.pathname === '/api')) {
      note('mocked', `${method} ${url.pathname}`);
      let body: Json = {};
      const text = init?.body ?? (request ? await request.clone().text().catch(() => '') : '');
      if (typeof text === 'string' && text) {
        try {
          const parsed: unknown = JSON.parse(text);
          if (parsed && typeof parsed === 'object') body = parsed as Json;
        } catch {
          /* a body that is not JSON is simply ignored */
        }
      }
      return api(url.pathname, method, body);
    }

    if (sameOrigin && url.pathname.startsWith('/__demo/')) {
      note('mocked', `${method} ${url.pathname}`);
      let body: unknown = null;
      const text = init?.body ?? (request ? await request.clone().text().catch(() => '') : '');
      if (typeof text === 'string' && text) {
        try {
          body = JSON.parse(text);
        } catch {
          body = null;
        }
      }
      return supabase(url.pathname.slice('/__demo'.length), method, url.search, headers, body);
    }

    if (sameOrigin && (method === 'GET' || method === 'HEAD')) {
      note('passed', `${method} ${url.pathname}`);
      return deps.realFetch(input, init);
    }

    note('blocked', `${method} ${url.origin}${url.pathname}`);
    return jsonResponse({ reason: 'demo_blocked', message: 'Blocked in demo mode: the demo does not talk to any server.' }, 403);
  }

  return { handle, stats, loadSampleImage, seedSession: () => demoSession(userMetadata, now()) };
}
