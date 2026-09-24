import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * The anonymous trial identity — a server-issued, HMAC-signed, HttpOnly
 * cookie. This is a best-effort PER-BROWSER identity, never a per-human
 * guarantee: clearing cookies or opening an incognito window yields a new
 * trial with a fresh count. That is a documented, accepted v1 limitation
 * (see the architecture note in dreamAttempts.ts), not something this
 * module claims to prevent — deliberately no IP-binding, no
 * fingerprinting.
 *
 * The signature's only job is proving "the server genuinely issued this
 * trialId" (needed for the claim-trial flow — see routes/claimTrial.ts,
 * which must be able to trust the trialId it reads). It is NOT the
 * enforcement mechanism itself: the actual usage counts live in
 * public.dream_attempts, keyed by this id, so a client can't reset their
 * count by editing/discarding the cookie — they can only ever get a
 * brand-new, zero-history identity by clearing cookies entirely.
 */
export const TRIAL_COOKIE_NAME = 'dare_trial';

// ~1 year — long enough that a real returning visitor's trial identity
// survives, short enough to bound how long a signed token stays valid if
// the signing secret is ever rotated for security reasons.
const COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

interface TrialTokenPayload {
  id: string;
  iat: number;
}

const MIN_SECRET_LENGTH = 32;

// Local development only: a random per-process secret so `npm run server`
// works without configuration (cookies simply stop verifying when the dev
// server restarts). Never used when running on Vercel or with NODE_ENV=production.
let devOnlySecret: string | null = null;

function isProductionLike(env: Record<string, string | undefined>): boolean {
  return Boolean(env.VERCEL) || env.NODE_ENV === 'production';
}

/**
 * The signing secret is ONLY the dedicated DARE_TRIAL_COOKIE_SECRET — never
 * derived from another credential (OPENAI_API_KEY) and never a hardcoded
 * string. If it is missing (or too short to be a real secret) in a
 * production-like environment this returns null, and the callers FAIL
 * CLOSED: no trial identity can be minted and no cookie verifies, rather
 * than silently signing with something else.
 */
export function getSigningSecret(env: Record<string, string | undefined> = process.env): string | null {
  const configured = env.DARE_TRIAL_COOKIE_SECRET;
  if (configured && configured.length >= MIN_SECRET_LENGTH) return configured;
  if (isProductionLike(env)) return null;
  if (!devOnlySecret) devOnlySecret = randomUUID() + randomUUID();
  return devOnlySecret;
}

function sign(payloadJson: string, secret: string): string {
  return createHmac('sha256', secret).update(payloadJson).digest('base64url');
}

function encodeToken(payload: TrialTokenPayload, secret: string): string {
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = Buffer.from(payloadJson).toString('base64url');
  return `${payloadB64}.${sign(payloadJson, secret)}`;
}

/** Verifies a token's signature and returns its trialId, or null for
    anything missing/malformed/tampered/expired — the safe default is
    always "treat as no existing trial", never a guess. */
function decodeToken(token: string, secret: string | null = getSigningSecret()): string | null {
  if (!secret) return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const payloadB64 = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!payloadB64 || !signature) return null;

  let payloadJson: string;
  try {
    payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf8');
  } catch {
    return null;
  }

  const expectedSignature = sign(payloadJson, secret);
  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;

  let payload: TrialTokenPayload;
  try {
    payload = JSON.parse(payloadJson);
  } catch {
    return null;
  }
  if (typeof payload.id !== 'string' || !payload.id) return null;
  if (typeof payload.iat !== 'number' || payload.iat <= 0) return null;
  if (Date.now() - payload.iat > COOKIE_MAX_AGE_SECONDS * 1000) return null;

  return payload.id;
}

/** Hand-rolled — the cookie header format is simple enough (`k=v; k2=v2`)
    that a dedicated parsing dependency isn't warranted for reading one
    named value. */
export function readCookie(cookieHeader: string | undefined | null, name: string): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (key === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

/** Reads and verifies the trial cookie from a raw Cookie request header —
    returns the verified trialId, or null if absent/invalid/expired. */
export function readTrialIdFromCookieHeader(
  cookieHeader: string | undefined | null,
  env: Record<string, string | undefined> = process.env,
): string | null {
  const raw = readCookie(cookieHeader, TRIAL_COOKIE_NAME);
  if (!raw) return null;
  return decodeToken(raw, getSigningSecret(env));
}

/** Mints a brand-new signed trial identity and the Set-Cookie header
    value for it, or null when no valid dedicated signing secret is
    configured (fail closed — see getSigningSecret). Does not touch the
    database itself — the caller (dreamAttempts.ts) is responsible for
    creating the matching trial_identities row. */
export function mintTrialCookie(env: Record<string, string | undefined> = process.env): { trialId: string; setCookieHeader: string } | null {
  const secret = getSigningSecret(env);
  if (!secret) return null;
  const trialId = randomUUID();
  const token = encodeToken({ id: trialId, iat: Date.now() }, secret);
  const setCookieHeader = [
    `${TRIAL_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${COOKIE_MAX_AGE_SECONDS}`,
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
  ].join('; ');
  return { trialId, setCookieHeader };
}
