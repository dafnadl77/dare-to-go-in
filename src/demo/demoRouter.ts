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

/** The one invented dream every demo journey is about. The wording is neutral (it addresses the reader in the plural in Hebrew). */
function analysis(sourceText: string, he: boolean): Json {
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

/** A sample reflection written in advance. In the real product the model writes this; in the demo it never runs. */
export function demoReflection(he: boolean, emotionIds: unknown, reflectionResponse: unknown): Json {
  const emotions = normalizeEmotions(emotionIds);
  const named = emotions.length ? joinNames(emotionNamesForModel(emotions, he ? 'he' : 'en'), he) : '';
  const written = typeof reflectionResponse === 'string' ? reflectionResponse.trim() : '';
  return {
    observation: he
      ? 'בחלום עפתם מעל ים כחול ונחתתם ליד בית ישן עם דלת ירוקה, וסבתא עמדה לידכם. הבית היה גם בית הילדות וגם חדר במלון, והדלת לא נפתחה.'
      : 'In the dream you flew over a blue sea and landed beside an old house with a green door, with your grandmother nearby. The house was both a childhood home and a hotel room, and the door never opened.',
    personalAssociation: written
      ? he
        ? `כתבתם: “${written}”.`
        : `You wrote: “${written}”.`
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

/** The sample dreams differ only in their title, which the archive reads from the setting. */
function demoRowAnalysis(source: string, he: boolean, title: string): Json {
  const base = analysis(source, he);
  return { ...base, summary: title, reconstruction: { ...(base.reconstruction as Json), primarySetting: title } };
}

function savedRow(id: string, he: boolean, title: string, source: string, daysAgo: number, favorite: boolean, image: string | null, now: number, emotions?: string[]): Json {
  const reflection = demoReflection(he, emotions ?? [], he ? 'זה מזכיר לי את הגינה של סבתא' : "It reminds me of my grandmother's garden");
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
    savedRow('a0000001-0000-4000-8000-000000000001', true, 'עפתי מעל הים', 'חלמתי שאני עפה מעל ים כחול אל בית ישן עם דלת ירוקה.', 1, true, IMAGES[0], now, ['longing', 'calm', 'wonder']),
    savedRow('a0000001-0000-4000-8000-000000000002', false, 'Flying toward a green door', 'I was flying over a blue sea toward an old house with a green door.', 2, false, IMAGES[2], now, ['fear', 'excitement']),
    savedRow('a0000001-0000-4000-8000-000000000003', true, 'ים אינסופי', longHe, 5, false, IMAGES[1], now),
    savedRow('a0000001-0000-4000-8000-000000000004', false, 'The corridor', 'A long corridor with many doors.', 9, true, IMAGES[1], now),
    savedRow('a0000001-0000-4000-8000-000000000005', true, 'בית ישן', 'חלמתי על בית ישן.', 14, false, null, now),
    savedRow('a0000001-0000-4000-8000-000000000006', false, 'Golden light over the water', longEn, 20, false, IMAGES[0], now),
  ];
}

const ELEMENT_LABELS_HE = ['דלת ירוקה', 'מפתח זהב', 'בית ישן ליד הים', 'סבתא', 'עפה מעל הים', 'אור כחול'];
const ELEMENT_LABELS_EN = ['GREEN DOOR', 'GOLDEN KEY', 'OLD HOUSE BY THE SEA', 'GRANDMOTHER', 'FLYING OVER THE SEA', 'BLUE LIGHT'];

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
      return jsonResponse({ ...analysis(String(body.sourceText ?? ''), he), attemptId: '11111111-1111-4111-8111-111111111111' });
    }
    if (path === '/api/dream-image') {
      await delay(1500);
      return jsonResponse({ imageDataUrl: await loadSampleImage() });
    }
    if (path === '/api/dream-element-labels') {
      const n = Array.isArray(body.elements) ? body.elements.length : Array.isArray(body.candidates) ? body.candidates.length : 4;
      const labels = he ? ELEMENT_LABELS_HE : ELEMENT_LABELS_EN;
      return jsonResponse({ labels: Array.from({ length: n }, (_, i) => labels[i % labels.length]) });
    }
    if (path === '/api/dream-reflection') {
      await delay(800);
      return jsonResponse(demoReflection(he, body.emotions, body.reflectionResponse));
    }
    if (path === '/api/dream-transcription') {
      await delay(500);
      return jsonResponse({ transcript: he ? 'חלמתי שאני עפה מעל ים כחול אל בית ישן עם דלת ירוקה, וסבתא עמדה ליד הדלת.' : 'I flew over a blue sea toward an old house with a green door, and my grandmother stood by it.' });
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
        for (const row of incoming) if (!rows.some((r) => r.id === row.id)) rows.push({ ...row, owner_id: DEMO_USER_ID });
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
