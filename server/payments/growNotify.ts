import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { isIPv4 } from 'node:net';
import { errorResult, okResult, type HandlerResult } from '../httpResult.js';
import { MIN_COMPLETION_SECRET_LENGTH } from './completionAuth.js';
import { parseAmount, type CompletionRequest } from './completionRequest.js';
import { completePaymentOrder, recordPaymentNotice, type CompletionStatus } from './completionStore.js';

/**
 * POST /api/grow-notify: Grow's server-to-server payment notification, received by DARE directly (no Make in between).
 *
 * LOCAL ONLY / NOT ACTIVE. The grant path is closed in code until a real Sandbox notification has been observed AND the order
 * check has been shown never to reach the customer: VERIFIED_SHAPES below is empty, so no mode in any environment can grant.
 * Opening it is a reviewed code change, never an environment variable.
 *
 * Trust, in this order (every failure refuses; the body is not even read before steps 1-3 pass):
 *  1. Mode (GROW_NOTIFY_MODE): unset/unknown = off = 404, as if the route did not exist. On a Vercel Preview, "on" is lowered to
 *     "capture": a Preview never grants (it has no production database keys, and must never get them).
 *  2. Source: the connecting address as Vercel saw it, read ONLY from `x-vercel-forwarded-for`; one valid IPv4 in GROW_NOTIFY_IPS.
 *     This is the ONLY proof that Grow sent it. Empty or malformed list = everything refused.
 *  3. Size: the declared length, then the actual body, at most MAX_BODY_BYTES.
 *  4. Order binding: cField1 = the order id, cField2 = HMAC(GROW_NOTIFY_SECRET or, during a rotation, GROW_NOTIFY_SECRET_PREVIOUS).
 *     It ties the notification to a payment link DARE created. It is NOT proof of payment or of origin.
 *  5. Content: statusCode, transactionId, sum, allPaymentsNum, all required and strictly formatted; contradictory layouts refused.
 *  6. The existing atomic, idempotent complete_payment_order (through completionStore) decides; currency is the constant ILS.
 *
 * Logs carry fixed reason codes, the layout id and DOCUMENTED Grow field names only. A field name that is not in Grow's
 * documentation is only counted (it could be a value that a parser turned into a key). No value is ever logged or returned.
 */

export type GrowNotifyMode = 'off' | 'capture' | 'on';
/** Where the fields sit ("flat" = top level, "wrapped" = under `data`) and how the custom fields are encoded. */
export type GrowShape = 'flat/brackets' | 'flat/nested' | 'wrapped/brackets' | 'wrapped/nested';

/**
 * The shapes OBSERVED in a real Grow Sandbox notification. Empty on purpose: the grant path stays closed until the notification
 * format and the order binding are verified, whatever the mode or environment. Add exactly the observed shape, with a test.
 */
export const VERIFIED_SHAPES: readonly GrowShape[] = [];

export const MAX_BODY_BYTES = 16 * 1024;
const CHECK_DOMAIN = 'dare.grow-notify.v1:';
const ORDER_ID = /^[0-9a-f]{32}$/;
const CHECK = /^[0-9a-f]{32}$/;
const TRANSACTION_ID = /^[A-Za-z0-9_-]{3,64}$/;
const STATUS_CODE = /^\d{1,3}$/;
const PAID_STATUS_CODE = '2';

/** Field names published in Grow's documentation (Server To Server, Payment Request Callback). Only these are ever logged. */
const DOCUMENTED_FIELDS = new Set([
  'err', 'status', 'data', 'statusCode', 'transactionId', 'transactionToken', 'transactionTypeId', 'TransactionTypeId', 'paymentType',
  'sum', 'firstPaymentSum', 'periodicalPaymentSum', 'paymentsNum', 'allPaymentsNum', 'paymentDate', 'asmachta', 'description',
  'fullName', 'payerPhone', 'payerEmail', 'cardSuffix', 'cardType', 'cardTypeCode', 'cardBrand', 'cardBrandCode', 'cardExp',
  'processId', 'processToken', 'paymentLinkProcessId', 'paymentLinkProcessToken', 'cardToken', 'customFields',
  'payerBankAccountDetails', 'productData',
  ...Array.from({ length: 9 }, (_, i) => `customFields[cField${i + 1}]`),
  ...Array.from({ length: 9 }, (_, i) => `cField${i + 1}`),
]);

// ------------------------------------------------------------------------- configuration ----

export function growNotifyMode(env: NodeJS.ProcessEnv = process.env): GrowNotifyMode {
  const raw = (env.GROW_NOTIFY_MODE ?? '').trim();
  return raw === 'capture' || raw === 'on' ? raw : 'off';
}

/** The mode that really applies: a Vercel Preview can observe but never grant. */
export function effectiveMode(env: NodeJS.ProcessEnv = process.env): GrowNotifyMode {
  const mode = growNotifyMode(env);
  return mode === 'on' && env.VERCEL_ENV === 'preview' ? 'capture' : mode;
}

/**
 * How a captured notification is answered. Production (and any unknown environment) stays fail-closed with 503, so Grow keeps the
 * notification and retries it once the route can process it. Only an explicit Preview or local development run answers 200 after
 * the capture line is written, so a Sandbox notification is not resent for an hour and a half.
 */
export function captureAcknowledges(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VERCEL_ENV === 'preview' || env.VERCEL_ENV === 'development';
}

function validSecret(secret: string | undefined): string | null {
  return secret && secret.length >= MIN_COMPLETION_SECRET_LENGTH ? secret : null;
}

/** The current secret behind the order check; null when missing or shorter than 32 characters (fail closed). */
export function growNotifySecret(env: NodeJS.ProcessEnv = process.env): string | null {
  return validSecret(env.GROW_NOTIFY_SECRET);
}

/**
 * The secrets a notification's check may be made with: the current one and, during a rotation only, the previous one (so links
 * created before the rotation still complete). The previous one is never used to create a check, and is ignored when invalid or
 * equal to the current one.
 */
export function acceptedSecrets(env: NodeJS.ProcessEnv = process.env): string[] {
  const current = growNotifySecret(env);
  if (!current) return [];
  const previous = validSecret(env.GROW_NOTIFY_SECRET_PREVIOUS);
  return previous && previous !== current ? [current, previous] : [current];
}

/** Grow's published IPv4 addresses. Any malformed entry voids the whole list (fail closed: null = refuse everyone). */
export function parseAllowedIps(raw: string | undefined): ReadonlySet<string> | null {
  const items = (raw ?? '').split(/[\s,]+/).filter(Boolean);
  if (items.length === 0 || items.some((ip) => !isIPv4(ip))) return null;
  return new Set(items);
}

/** The connecting address as Vercel saw it: only `x-vercel-forwarded-for`, exactly one IPv4 (a list or an array is refused). */
export function trustedSourceIp(vercelForwardedFor: string | string[] | undefined | null): string | null {
  if (typeof vercelForwardedFor !== 'string') return null;
  const value = vercelForwardedFor.trim();
  return isIPv4(value) ? value : null;
}

// --------------------------------------------------------------------------- order check ----

/** The order check DARE gives Make for Grow's Custom Field 2. 32 hex characters: no special characters, as Grow requires. */
export function growNotifyCheck(orderId: string, secret: string): string {
  return createHmac('sha256', secret).update(CHECK_DOMAIN + orderId).digest('hex').slice(0, 32);
}

const digest = (s: string) => createHash('sha256').update(s).digest();

/** Constant-time comparison against every accepted secret; all are always computed, so the timing does not tell which matched. */
export function checkMatches(orderId: string, given: string, secrets: readonly string[]): boolean {
  const g = digest(given);
  let ok = false;
  for (const secret of secrets) ok = timingSafeEqual(g, digest(growNotifyCheck(orderId, secret))) || ok;
  return ok;
}

// ------------------------------------------------------------------------------ parsing ----

const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v) && !Buffer.isBuffer(v);

/** A scalar field as text. Numbers are accepted (form parsers and JSON differ); objects, arrays, booleans and empty text are not. */
function text(v: unknown): string | null {
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : null;
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 && t.length <= 128 ? t : null;
}

export interface GrowNotification {
  shape: GrowShape;
  orderId: string | null;
  check: string | null;
  statusCode: string | null;
  transactionId: string | null;
  sum: number | null;
  allPaymentsNum: string | null;
}

export type ReadResult = { ok: true; value: GrowNotification } | { ok: false; reason: 'unrecognized' | 'conflicting_layout' };

const CORE = ['transactionId', 'statusCode', 'sum'];
const hasBracketCustom = (o: Record<string, unknown>) => Object.keys(o).some((k) => k.startsWith('customFields['));

/** Reads the fields DARE needs from one documented layout. Two layouts at once (or two custom-field encodings) are refused. */
export function readNotification(body: unknown): ReadResult {
  if (!isPlainObject(body)) return { ok: false, reason: 'unrecognized' };
  let level: 'flat' | 'wrapped';
  let fields: Record<string, unknown>;
  const flatSignals = CORE.some((k) => Object.prototype.hasOwnProperty.call(body, k)) || hasBracketCustom(body);
  if (isPlainObject(body.data)) {
    if (flatSignals) return { ok: false, reason: 'conflicting_layout' };
    level = 'wrapped';
    fields = body.data;
  } else if (flatSignals) {
    level = 'flat';
    fields = body;
  } else {
    return { ok: false, reason: 'unrecognized' };
  }
  let encoding: 'brackets' | 'nested';
  let custom: (name: string) => unknown;
  if (isPlainObject(fields.customFields)) {
    if (hasBracketCustom(fields)) return { ok: false, reason: 'conflicting_layout' };
    encoding = 'nested';
    const cf = fields.customFields;
    custom = (name) => (Object.prototype.hasOwnProperty.call(cf, name) ? cf[name] : undefined);
  } else {
    encoding = 'brackets';
    custom = (name) => fields[`customFields[${name}]`];
  }
  const own = (name: string) => (Object.prototype.hasOwnProperty.call(fields, name) ? fields[name] : undefined);
  const sumText = text(own('sum'));
  return {
    ok: true,
    value: {
      shape: `${level}/${encoding}`,
      orderId: text(custom('cField1')),
      check: text(custom('cField2')),
      statusCode: text(own('statusCode')),
      transactionId: text(own('transactionId')),
      sum: sumText === null ? null : parseAmount(sumText),
      allPaymentsNum: text(own('allPaymentsNum')),
    },
  };
}

/**
 * What the capture log may say about the body: its kind, the DOCUMENTED field names present (top level and under `data` /
 * `customFields`), and how many other names there were. An undocumented name is never written: a malformed body can turn a value
 * (a phone, an e-mail, the check) into a key.
 */
export function describeBody(body: unknown): string {
  if (body === undefined || body === null) return 'kind=none';
  if (typeof body === 'string') return 'kind=text';
  if (Buffer.isBuffer(body)) return 'kind=bytes';
  if (Array.isArray(body)) return 'kind=array';
  if (!isPlainObject(body)) return 'kind=other';
  const known: string[] = [];
  let unknown = 0;
  const visit = (prefix: string, obj: Record<string, unknown>, depth: number) => {
    for (const k of Object.keys(obj)) {
      if (!DOCUMENTED_FIELDS.has(k)) {
        unknown += 1;
        continue;
      }
      known.push(prefix + k);
      if (depth < 1 && (k === 'data' || k === 'customFields') && isPlainObject(obj[k])) visit(`${k}.`, obj[k] as Record<string, unknown>, depth + 1);
    }
  };
  visit('', body, 0);
  return `kind=object fields=${known.sort().join(',') || '-'} other=${unknown}`;
}

export function bodySize(body: unknown): number {
  if (body === undefined || body === null) return 0;
  if (typeof body === 'string') return Buffer.byteLength(body);
  if (Buffer.isBuffer(body)) return body.length;
  try {
    return Buffer.byteLength(JSON.stringify(body));
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

// ------------------------------------------------------------------------------ handler ----

export interface GrowNotifyRequest {
  method: string | undefined;
  /** The value of `x-vercel-forwarded-for` exactly as received. No other address header is ever passed in. */
  vercelForwardedFor: string | string[] | undefined | null;
  contentType: string | string[] | undefined | null;
  contentLength: string | string[] | undefined | null;
  /** Read only after the source and the declared size passed. A throwing reader counts as an unrecognized body. */
  readBody: () => unknown;
}

export interface GrowNotifyDeps {
  env: NodeJS.ProcessEnv;
  complete: (request: CompletionRequest) => Promise<CompletionStatus | null>;
  recordNotice: (orderId: string, providerStatus: string) => Promise<void>;
  /** Fixed to VERIFIED_SHAPES in production; tests pass a shape to exercise the (still closed) grant path. */
  verifiedShapes: readonly GrowShape[];
  log: (line: string) => void;
}

const realDeps = (): GrowNotifyDeps => ({
  env: process.env,
  complete: completePaymentOrder,
  recordNotice: recordPaymentNotice,
  verifiedShapes: VERIFIED_SHAPES,
  log: (line) => console.error(line),
});

const received = (): HandlerResult => okResult({ received: true });
const refused = (): HandlerResult => errorResult(403, 'forbidden', 'Forbidden.');

function contentTypeName(raw: string | string[] | undefined | null): string {
  if (typeof raw !== 'string') return 'none';
  const t = raw.split(';')[0].trim().toLowerCase();
  return ['application/x-www-form-urlencoded', 'multipart/form-data', 'application/json', 'text/plain'].includes(t) ? t : 'other';
}

export async function handleGrowNotify(req: GrowNotifyRequest, deps: GrowNotifyDeps = realDeps()): Promise<HandlerResult> {
  const mode = effectiveMode(deps.env);
  if (mode === 'off') return errorResult(404, 'not_found', 'Not found.');
  if (req.method !== 'POST') return errorResult(405, 'request_failed', 'Method not allowed.');

  // 2. Source, before the body is read.
  const allowed = parseAllowedIps(deps.env.GROW_NOTIFY_IPS);
  if (!allowed) {
    deps.log('grow_notify_rejected reason=ip_list_not_configured');
    return refused();
  }
  const ip = trustedSourceIp(req.vercelForwardedFor);
  if (!ip || !allowed.has(ip)) {
    deps.log('grow_notify_rejected reason=source');
    return refused();
  }

  // 3. Declared size, still before the body is read; then the actual size.
  if (req.contentLength !== undefined && req.contentLength !== null) {
    const declared = typeof req.contentLength === 'string' && /^\d{1,9}$/.test(req.contentLength.trim()) ? Number(req.contentLength) : NaN;
    if (!(declared <= MAX_BODY_BYTES)) {
      deps.log('grow_notify_rejected reason=too_large');
      return errorResult(413, 'too_large', 'Request too large.');
    }
  }
  let body: unknown;
  try {
    body = req.readBody();
  } catch {
    body = undefined;
  }
  if (bodySize(body) > MAX_BODY_BYTES) {
    deps.log('grow_notify_rejected reason=too_large');
    return errorResult(413, 'too_large', 'Request too large.');
  }

  const secrets = acceptedSecrets(deps.env);
  if (secrets.length === 0) {
    deps.log('grow_notify_rejected reason=secret_not_configured');
    return errorResult(503, 'not_configured', 'Not available.');
  }

  const captureAnswer = (): HandlerResult => (captureAcknowledges(deps.env) ? received() : errorResult(503, 'not_enabled', 'Not processed.'));
  const type = contentTypeName(req.contentType);

  const read = readNotification(body);
  if (!read.ok) {
    deps.log(`grow_notify_unrecognized mode=${mode} reason=${read.reason} type=${type} ${describeBody(body)}`);
    return mode === 'capture' ? captureAnswer() : errorResult(400, 'invalid_request', 'Not recognized.');
  }
  const n = read.value;

  // 4. Order binding.
  if (!n.orderId || !ORDER_ID.test(n.orderId) || !n.check || !CHECK.test(n.check) || !checkMatches(n.orderId, n.check, secrets)) {
    deps.log(`grow_notify_rejected reason=order_binding shape=${n.shape}`);
    return refused();
  }

  // 5. Content.
  let invalid: string | null = null;
  if (!n.statusCode || !STATUS_CODE.test(n.statusCode)) invalid = 'status';
  else if (!n.transactionId || !TRANSACTION_ID.test(n.transactionId)) invalid = 'transaction';
  else if (n.sum === null) invalid = 'sum';
  else if (n.allPaymentsNum !== '1') invalid = 'payments';

  const verified = deps.verifiedShapes.includes(n.shape);
  if (mode === 'capture' || !verified) {
    // Observation only: nothing is written, nothing is granted.
    const verdict = invalid ? `reject_${invalid}` : n.statusCode === PAID_STATUS_CODE ? 'would_complete' : 'would_record_notice';
    deps.log(`grow_notify_capture mode=${mode} shape=${n.shape} shape_verified=${verified} verdict=${verdict} type=${type} ${describeBody(body)}`);
    return captureAnswer();
  }

  if (invalid) {
    deps.log(`grow_notify_rejected reason=invalid_${invalid} shape=${n.shape}`);
    return errorResult(400, 'invalid_request', 'Not valid.');
  }
  const orderId = n.orderId;
  const statusCode = n.statusCode as string;

  if (statusCode !== PAID_STATUS_CODE) {
    // Not paid: grant nothing, close nothing; only the last status is remembered (best effort).
    await deps.recordNotice(orderId, `grow:${statusCode}`).catch(() => undefined);
    deps.log('grow_notify_result outcome=not_paid');
    return received();
  }

  // 6. The existing atomic, idempotent completion.
  const outcome = await deps.complete({ orderId, transactionId: n.transactionId as string, amount: n.sum as number, currency: 'ILS', providerStatus: `grow:${statusCode}` });
  if (outcome === null) {
    deps.log('grow_notify_result outcome=store_unavailable');
    return errorResult(503, 'not_configured', 'Not available right now.');
  }
  deps.log(`grow_notify_result outcome=${outcome}`);
  if (outcome === 'invalid') return errorResult(400, 'invalid_request', 'Not valid.');
  // granted / duplicate: done. Every other outcome granted nothing and is kept for manual review by the database function.
  return received();
}
