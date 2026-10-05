import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handleDreamAnalysis, IDEMPOTENCY_KEY_PATTERN, type DreamAnalysisDeps } from '../server/routes/dreamAnalysis.ts';
import { decideIdemStart, startAnalysisAttempt, type IdemStartDecision, type AnalysisStartDeps } from '../server/analysisStart.ts';
import type { CallerIdentity } from '../server/callerIdentity.ts';
import { keyForSubmission, endSubmission, hashText, SUBMISSION_TTL_MS, type SubmissionStore, type StoredSubmission } from '../src/hero/analysisSubmission.ts';
import { hasUnsavedDream } from '../src/hero/unsavedJourney.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// ============================================================================
// A faithful in-memory model of the SQL functions (start_user_attempt_idem,
// complete_user_analysis, cancel_user_attempt). The SQL itself was exercised for
// real against the database in a forced-rollback run (20 scenarios); this model
// lets the ROUTE be tested end to end, counting model calls and spends.
// ============================================================================

interface Attempt {
  id: string;
  owner: string;
  key: string;
  hash: string;
  status: 'processing' | 'succeeded';
  result: Record<string, unknown> | null;
  createdAt: number;
}

class FakeDb {
  balance = new Map<string, number>();
  attempts: Attempt[] = [];
  ledger: { owner: string; delta: number; reason: 'spend' | 'refund'; attempt: string }[] = [];
  now = 1_000_000;
  private seq = 0;

  grant(owner: string, n: number) {
    this.balance.set(owner, (this.balance.get(owner) ?? 0) + n);
  }
  bal(owner: string) {
    return this.balance.get(owner) ?? 0;
  }
  spends(owner: string) {
    return this.ledger.filter((l) => l.owner === owner && l.reason === 'spend').length;
  }
  refunds(owner: string) {
    return this.ledger.filter((l) => l.owner === owner && l.reason === 'refund').length;
  }

  cancel(owner: string, attemptId: string): 'refunded' | 'not_refunded' {
    let out: 'refunded' | 'not_refunded' = 'not_refunded';
    const spent = this.ledger.some((l) => l.attempt === attemptId && l.reason === 'spend' && l.owner === owner);
    const alreadyRefunded = this.ledger.some((l) => l.attempt === attemptId && l.reason === 'refund');
    if (spent && !alreadyRefunded) {
      this.ledger.push({ owner, delta: 1, reason: 'refund', attempt: attemptId });
      this.grant(owner, 1);
      out = 'refunded';
    }
    this.attempts = this.attempts.filter((a) => !(a.id === attemptId && a.owner === owner));
    return out;
  }

  /** Runs to completion synchronously, like the advisory-locked SQL function: same-key callers are serialized. */
  startIdem(owner: string, key: string, hash: string, staleSeconds = 150): IdemStartDecision {
    if (!IDEMPOTENCY_KEY_PATTERN.test(key) || !/^[0-9a-f]{64}$/.test(hash)) return { kind: 'refused', reason: 'invalid_key' };
    const existing = this.attempts.find((a) => a.owner === owner && a.key === key);
    if (existing) {
      if (existing.hash !== hash) return { kind: 'refused', reason: 'conflict' };
      if (existing.status === 'succeeded') {
        return existing.result
          ? { kind: 'replay', attemptId: existing.id, analysis: existing.result }
          : { kind: 'refused', reason: 'expired' };
      }
      if (existing.createdAt > this.now - staleSeconds * 1000) return { kind: 'processing', attemptId: existing.id };
      this.cancel(owner, existing.id); // stale: refund once, then start over
    }
    if (this.bal(owner) < 1) return { kind: 'refused', reason: 'credits_required' };
    this.balance.set(owner, this.bal(owner) - 1);
    const id = `attempt-${++this.seq}`;
    this.attempts.push({ id, owner, key, hash, status: 'processing', result: null, createdAt: this.now });
    this.ledger.push({ owner, delta: -1, reason: 'spend', attempt: id });
    return { kind: 'created', attemptId: id };
  }

  complete(attemptId: string, owner: string, result: Record<string, unknown>): boolean {
    const a = this.attempts.find((x) => x.id === attemptId && x.owner === owner && x.status === 'processing');
    if (!a) return false;
    a.status = 'succeeded';
    a.result = result;
    return true;
  }
}

const ANALYSIS = { summary: 'a door by the sea', sourceText: 'I stood at a door by the sea.', language: 'en' };
const KEY_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const KEY_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ALICE = 'user-alice';
const BOB = 'user-bob';

interface Harness {
  db: FakeDb;
  deps: DreamAnalysisDeps;
  modelCalls: { count: number };
  gate: { release: () => void } | null;
}

function harness(opts: { slowModel?: boolean; failModel?: boolean; who?: () => string } = {}): Harness & { gateControl: { open: () => void } } {
  const db = new FakeDb();
  const modelCalls = { count: 0 };
  let openGate: () => void = () => {};
  const gatePromise = new Promise<void>((r) => (openGate = r));
  const who = opts.who ?? (() => ALICE);
  const deps: DreamAnalysisDeps = {
    resolveIdentity: (async () => ({ ok: true, identity: { kind: 'user', userId: who() } as CallerIdentity })) as DreamAnalysisDeps['resolveIdentity'],
    getClient: () => ({}) as never,
    start: {
      startLegacy: async () => ({ ok: false, reason: 'not_configured' }),
      startIdempotent: async (owner, key, hash) => db.startIdem(owner, key, hash),
      sleep: () => new Promise((r) => setTimeout(r, 1)),
    },
    abandon: (async (identity: CallerIdentity, attemptId: string) => {
      if (identity.kind === 'user') db.cancel(identity.userId, attemptId);
    }) as DreamAnalysisDeps['abandon'],
    complete: async (attemptId, owner, result) => db.complete(attemptId, owner, result as Record<string, unknown>),
    runModel: (async () => {
      modelCalls.count += 1;
      if (opts.slowModel) await gatePromise;
      if (opts.failModel) throw new Error('provider failure');
      return { status: 'ok', value: { ...ANALYSIS } };
    }) as DreamAnalysisDeps['runModel'],
  };
  return { db, deps, modelCalls, gate: null, gateControl: { open: () => openGate() } };
}

const post = (deps: DreamAnalysisDeps, body: Record<string, unknown>) =>
  handleDreamAnalysis({ sourceText: 'I stood at a door by the sea.', inputMode: 'text', ...body }, { authorization: 'Bearer x' }, deps);

const bodyOf = (res: { body: unknown }) => res.body as Record<string, unknown>;

// ------------------------------------------------------------ one submission ----

test('one submission = one credit and one model call', async () => {
  const h = harness();
  h.db.grant(ALICE, 3);
  const res = await post(h.deps, { idempotencyKey: KEY_A });
  assert.equal(res.status, 200);
  assert.equal(bodyOf(res).attemptId, 'attempt-1');
  assert.equal(h.db.spends(ALICE), 1);
  assert.equal(h.db.bal(ALICE), 2);
  assert.equal(h.modelCalls.count, 1);
});

test('same key replayed after success: the SAME attempt and result come back, no second credit, NO second model call', async () => {
  const h = harness();
  h.db.grant(ALICE, 3);
  const first = await post(h.deps, { idempotencyKey: KEY_A });
  const replay = await post(h.deps, { idempotencyKey: KEY_A });
  assert.equal(replay.status, 200);
  assert.equal(bodyOf(replay).attemptId, bodyOf(first).attemptId);
  assert.equal(bodyOf(replay).summary, ANALYSIS.summary);
  assert.equal(h.db.spends(ALICE), 1);
  assert.equal(h.db.bal(ALICE), 2);
  assert.equal(h.modelCalls.count, 1, 'a completed replay must not call the model again');
});

test('timeout then retry: the client lost the response but the server finished, so the retry reuses that attempt (no second spend)', async () => {
  const h = harness();
  h.db.grant(ALICE, 1);
  await post(h.deps, { idempotencyKey: KEY_A }); // the server completes; imagine the client never heard back
  const retry = await post(h.deps, { idempotencyKey: KEY_A });
  assert.equal(retry.status, 200);
  assert.equal(h.db.spends(ALICE), 1);
  assert.equal(h.db.bal(ALICE), 0);
  assert.equal(h.modelCalls.count, 1);
  // ... and that replay also works when the balance is now ZERO
  assert.equal(bodyOf(retry).attemptId, 'attempt-1');
});

test('a genuinely NEW dream (new key) spends a new credit; a same-text resubmission after a definitive answer is a new key too', async () => {
  const h = harness();
  h.db.grant(ALICE, 3);
  await post(h.deps, { idempotencyKey: KEY_A });
  const second = await post(h.deps, { idempotencyKey: KEY_B, sourceText: 'A different dream entirely.' });
  assert.equal(second.status, 200);
  assert.equal(bodyOf(second).attemptId, 'attempt-2');
  assert.equal(h.db.spends(ALICE), 2);
  assert.equal(h.db.bal(ALICE), 1);
  assert.equal(h.modelCalls.count, 2);
});

test('zero credits still returns 402 credits_required, with no attempt and no model call', async () => {
  const h = harness();
  const res = await post(h.deps, { idempotencyKey: KEY_A });
  assert.equal(res.status, 402);
  assert.equal(bodyOf(res).reason, 'credits_required');
  assert.equal(h.db.attempts.length, 0);
  assert.equal(h.modelCalls.count, 0);
});

// ------------------------------------------------------------ concurrency ----

test('two CONCURRENT same-key requests: at most one attempt, one credit spend and ONE model call; the duplicate waits and gets the same result', async () => {
  const h = harness({ slowModel: true });
  h.db.grant(ALICE, 5);
  const first = post(h.deps, { idempotencyKey: KEY_A });
  const duplicate = post(h.deps, { idempotencyKey: KEY_A });
  await new Promise((r) => setTimeout(r, 30)); // both are in flight: the first is running the model, the duplicate is polling
  assert.equal(h.db.attempts.length, 1);
  assert.equal(h.db.spends(ALICE), 1);
  assert.equal(h.modelCalls.count, 1);
  h.gateControl.open();
  const [a, b] = await Promise.all([first, duplicate]);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.equal(bodyOf(a).attemptId, bodyOf(b).attemptId);
  assert.equal(h.db.spends(ALICE), 1);
  assert.equal(h.db.bal(ALICE), 4);
  assert.equal(h.modelCalls.count, 1);
});

test('many concurrent same-key requests still make exactly one attempt and one spend', async () => {
  const h = harness({ slowModel: true });
  h.db.grant(ALICE, 9);
  const all = Array.from({ length: 8 }, () => post(h.deps, { idempotencyKey: KEY_A }));
  await new Promise((r) => setTimeout(r, 30));
  h.gateControl.open();
  const results = await Promise.all(all);
  assert.ok(results.every((r) => r.status === 200));
  assert.equal(new Set(results.map((r) => bodyOf(r).attemptId)).size, 1);
  assert.equal(h.db.spends(ALICE), 1);
  assert.equal(h.modelCalls.count, 1);
});

test('a duplicate that outwaits a stuck original answers 409 analysis_in_progress (never spends, never runs the model)', async () => {
  const db = new FakeDb();
  db.grant(ALICE, 2);
  db.startIdem(ALICE, KEY_A, 'a'.repeat(64)); // an original request that is "processing" forever
  const modelCalls = { count: 0 };
  const deps = harness().deps;
  deps.start = { ...deps.start, startIdempotent: async (o, k, h) => db.startIdem(o, k, h) };
  deps.runModel = (async () => {
    modelCalls.count += 1;
    return { status: 'ok', value: ANALYSIS };
  }) as DreamAnalysisDeps['runModel'];
  // same text => same hash as the stuck original
  const res = await handleDreamAnalysis(
    { sourceText: 'x'.repeat(1), inputMode: 'text', idempotencyKey: KEY_A },
    { authorization: 'Bearer x' },
    { ...deps, start: { ...deps.start, startIdempotent: async (o, k) => db.startIdem(o, k, 'a'.repeat(64)) } },
  );
  assert.equal(res.status, 409);
  assert.equal(bodyOf(res).reason, 'analysis_in_progress');
  assert.equal(db.spends(ALICE), 1);
  assert.equal(modelCalls.count, 0);
});

// ------------------------------------------------------------ failure / refund ----

test('a genuine failure refunds EXACTLY once and frees the key; the retried submission is then a fresh, correctly charged attempt', async () => {
  const h = harness({ failModel: true });
  h.db.grant(ALICE, 2);
  const failed = await post(h.deps, { idempotencyKey: KEY_A });
  assert.equal(failed.status, 500);
  assert.equal(h.db.spends(ALICE), 1);
  assert.equal(h.db.refunds(ALICE), 1);
  assert.equal(h.db.bal(ALICE), 2, 'net zero after the refund');
  assert.equal(h.db.attempts.length, 0, 'the failed attempt (and its key) is gone');
  // the provider recovers; the SAME key is a new, separately charged attempt
  const ok = harness();
  ok.db.grant(ALICE, 2);
  ok.db.ledger.push(...h.db.ledger);
  h.deps.runModel = (async () => ({ status: 'ok', value: ANALYSIS })) as DreamAnalysisDeps['runModel'];
  const retry = await post(h.deps, { idempotencyKey: KEY_A });
  assert.equal(retry.status, 200);
  assert.equal(h.db.spends(ALICE), 2);
  assert.equal(h.db.refunds(ALICE), 1);
  assert.equal(h.db.bal(ALICE), 1, 'one credit consumed in total for one successful analysis');
});

test('a second refund of the same attempt is impossible (no double refund)', () => {
  const db = new FakeDb();
  db.grant(ALICE, 1);
  const created = db.startIdem(ALICE, KEY_A, 'a'.repeat(64));
  assert.equal(created.kind, 'created');
  const id = (created as { attemptId: string }).attemptId;
  assert.equal(db.cancel(ALICE, id), 'refunded');
  assert.equal(db.cancel(ALICE, id), 'not_refunded');
  assert.equal(db.refunds(ALICE), 1);
  assert.equal(db.bal(ALICE), 1);
});

test('a stale "processing" attempt (its request is gone) is refunded once and replaced: net exactly one spend', () => {
  const db = new FakeDb();
  db.grant(ALICE, 3);
  const first = db.startIdem(ALICE, KEY_A, 'a'.repeat(64)) as { attemptId: string };
  db.now += 200_000; // older than the 150s stale window
  const second = db.startIdem(ALICE, KEY_A, 'a'.repeat(64)) as { kind: string; attemptId: string };
  assert.equal(second.kind, 'created');
  assert.notEqual(second.attemptId, first.attemptId);
  assert.equal(db.refunds(ALICE), 1);
  assert.equal(db.spends(ALICE), 2);
  assert.equal(db.bal(ALICE), 2, 'three credits, net one consumed');
  // the abandoned request finishing late can no longer resurrect anything
  assert.equal(db.complete(first.attemptId, ALICE, ANALYSIS), false);
});

test('the same key with DIFFERENT text is refused, never answered with another dream\'s result', async () => {
  const h = harness();
  h.db.grant(ALICE, 2);
  await post(h.deps, { idempotencyKey: KEY_A });
  const res = await post(h.deps, { idempotencyKey: KEY_A, sourceText: 'A completely different dream.' });
  assert.equal(res.status, 409);
  assert.equal(bodyOf(res).reason, 'idempotency_conflict');
  assert.equal(h.db.spends(ALICE), 1);
  assert.equal(h.modelCalls.count, 1);
});

// ------------------------------------------------------------ isolation / forgery ----

test('account A and account B may use the identical client key without collision: each gets its own attempt and pays for its own', async () => {
  let current = ALICE;
  const h = harness({ who: () => current });
  h.db.grant(ALICE, 2);
  h.db.grant(BOB, 2);
  const a = await post(h.deps, { idempotencyKey: KEY_A });
  current = BOB;
  const b = await post(h.deps, { idempotencyKey: KEY_A });
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.notEqual(bodyOf(a).attemptId, bodyOf(b).attemptId);
  assert.equal(h.db.spends(ALICE), 1);
  assert.equal(h.db.spends(BOB), 1);
  assert.equal(h.modelCalls.count, 2);
});

test('forged owner/user data cannot reuse another user\'s key or result: the account is ALWAYS the verified identity', async () => {
  let current = ALICE;
  const h = harness({ who: () => current });
  h.db.grant(ALICE, 2);
  h.db.grant(BOB, 2);
  const alices = await post(h.deps, { idempotencyKey: KEY_A });
  current = BOB; // Bob replays Alice's key and forges every owner field he can think of
  const forged = await post(h.deps, { idempotencyKey: KEY_A, owner_id: ALICE, userId: ALICE, user_id: ALICE, attemptId: bodyOf(alices).attemptId });
  assert.equal(forged.status, 200);
  assert.notEqual(bodyOf(forged).attemptId, bodyOf(alices).attemptId, 'Bob got his OWN attempt, not Alice\'s stored result');
  assert.equal(h.db.spends(BOB), 1);
  assert.equal(h.db.bal(ALICE), 1, 'Alice was not charged by Bob\'s request');
  // the route never reads an owner from the body
  const route = read('server/routes/dreamAnalysis.ts');
  assert.match(route, /startAnalysisAttempt\(resolved\.identity, idempotencyKey, inputHash, deps\.start\)/);
  assert.ok(!/body\.(owner|userId|user_id|owner_id)/.test(route));
});

test('a malformed idempotency key is rejected (400) before anything is spent; a missing key keeps the previous non-idempotent path', async () => {
  const h = harness();
  h.db.grant(ALICE, 2);
  for (const bad of ['short', 'has spaces in it 1234567890', 'x'.repeat(65), 12345, ['a'], { k: 1 }]) {
    const res = await post(h.deps, { idempotencyKey: bad });
    assert.equal(res.status, 400, JSON.stringify(bad));
  }
  assert.equal(h.db.spends(ALICE), 0);
  assert.equal(h.modelCalls.count, 0);
  // no key at all: an older cached client falls to startLegacy (here: refused by the stub), never the idempotent path
  const noKey = await post(h.deps, {});
  assert.equal(noKey.status, 503);
});

// ------------------------------------------------------------ pure decisions ----

test('decideIdemStart maps every database answer and fails closed on anything unrecognized', () => {
  assert.deepEqual(decideIdemStart({ status: 'created', attempt_id: 'x' }), { kind: 'created', attemptId: 'x' });
  assert.deepEqual(decideIdemStart({ status: 'replay', attempt_id: 'x', analysis: { a: 1 } }), { kind: 'replay', attemptId: 'x', analysis: { a: 1 } });
  assert.deepEqual(decideIdemStart({ status: 'processing', attempt_id: 'x' }), { kind: 'processing', attemptId: 'x' });
  for (const [status, reason] of [['credits_required', 'credits_required'], ['conflict', 'conflict'], ['expired', 'expired'], ['invalid_key', 'invalid_key']] as const) {
    assert.deepEqual(decideIdemStart({ status }), { kind: 'refused', reason });
  }
  for (const bad of [null, undefined, 'created', 7, {}, { status: 'created' }, { status: 'replay', attempt_id: 'x' }, { status: 'replay', attempt_id: 'x', analysis: [] }, { status: 'weird' }]) {
    assert.deepEqual(decideIdemStart(bad), { kind: 'refused', reason: 'not_configured' });
  }
});

test('anonymous trials never use the idempotent path: their existing attempt rules are untouched', async () => {
  const calls: string[] = [];
  const deps: AnalysisStartDeps = {
    startLegacy: async () => (calls.push('legacy'), { ok: true, attemptId: 'trial-attempt' }),
    startIdempotent: async () => (calls.push('idem'), { kind: 'created', attemptId: 'nope' }),
    sleep: async () => {},
  };
  const trial: CallerIdentity = { kind: 'trial', trialId: 't1' };
  assert.deepEqual(await startAnalysisAttempt(trial, KEY_A, 'a'.repeat(64), deps), { kind: 'run', attemptId: 'trial-attempt', idempotent: false });
  // even when a client sends a key, an anonymous trial keeps the legacy decision (free dream / 3 technical attempts)
  const refused: AnalysisStartDeps = { ...deps, startLegacy: async () => ({ ok: false, reason: 'free_dream_used' }) };
  assert.deepEqual(await startAnalysisAttempt(trial, KEY_A, 'a'.repeat(64), refused), { kind: 'refused', reason: 'free_dream_used' });
  assert.deepEqual(calls, ['legacy']);
  const route = read('server/routes/dreamAnalysis.ts');
  assert.match(route, /startLegacy: createAttemptForIdentity/);
});

// ------------------------------------------------------------ the migration ----

const migration = read('supabase/migrations/20260925_idempotent_analysis.sql');

test('migration: per-account unique key, atomic same-key serialization, spend/refund via the EXISTING functions', () => {
  assert.match(migration, /create unique index if not exists dream_attempts_owner_idem_uidx\s+on public\.dream_attempts \(owner_id, idempotency_key\)\s+where idempotency_key is not null/);
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\('analysis-idem:' \|\| p_owner::text \|\| ':' \|\| p_key, 0\)\)/);
  assert.match(migration, /perform public\.cancel_user_attempt\(a\.id, p_owner\)/);
  assert.match(migration, /update public\.dream_credits\s+set balance = balance - 1, updated_at = now\(\)\s+where owner_id = p_owner and balance >= 1/);
  assert.match(migration, /insert into public\.credit_ledger \(owner_id, delta, reason, attempt_id\)\s+values \(p_owner, -1, 'spend', v_attempt\)/);
  assert.match(migration, /analysis_status = 'processing'/);
  // a replay never spends: it returns before the spend statement
  assert.ok(migration.indexOf("'replay'") < migration.indexOf('set balance = balance - 1'));
  assert.ok(migration.indexOf("'processing'") < migration.indexOf('set balance = balance - 1'));
});

test('migration: service-role only, additive, and it does not touch payment/refund ledger indexes or the anonymous trial functions', () => {
  for (const fn of ['start_user_attempt_idem(uuid, text, text, integer, integer)', 'complete_user_analysis(uuid, uuid, jsonb)']) {
    assert.ok(migration.includes(`revoke all on function public.${fn} from public, anon, authenticated`), fn);
    assert.ok(migration.includes(`grant execute on function public.${fn} to service_role`), fn);
  }
  assert.equal((migration.match(/security definer/g) ?? []).length, 2);
  assert.ok(!/drop (table|index|function)/i.test(migration));
  const code = migration.replace(/^--.*$/gm, '');
  assert.ok(!/(alter table|create[^;]*index[^;]*on|drop)[^;]*credit_ledger/i.test(code), 'no ledger schema or index change');
  assert.ok(!/dream_credits[^;]*(alter|drop)/i.test(code));
  assert.ok(!/create_trial_attempt|complete_trial_attempt|trial_identities/.test(migration.replace(/^--.*$/gm, '')));
  assert.match(migration, /idempotency_key ~ '\^\[A-Za-z0-9_-\]\{16,64\}\$'/);
  // the previous credits migration (payment idempotency indexes) is untouched
  const credits = read('supabase/migrations/20260924_credits_entitlement.sql');
  assert.match(credits, /credit_ledger \(reason, external_ref\) where external_ref is not null/);
  assert.match(credits, /credit_ledger \(attempt_id\) where reason = 'refund'/);
});

test('privacy: stored analysis results are short-lived and removed with the account', () => {
  assert.match(migration, /p_retention_hours integer default 2/);
  assert.match(migration, /set analysis_result = null/);
  // account deletion already deletes every attempt row (which carries the result)
  assert.match(read('supabase/migrations/20260924_account_deletion.sql'), /delete from public\.dream_attempts where owner_id = p_user/);
});

// ------------------------------------------------------------ client submission identity ----

function memoryStore(): SubmissionStore & { snapshot: () => StoredSubmission | null } {
  let value: StoredSubmission | null = null;
  return { read: () => value, write: (v) => (value = v), clear: () => (value = null), snapshot: () => value };
}
let counter = 0;
const gen = () => `generated-key-${String(++counter).padStart(20, '0')}`;

test('retry of the SAME unanswered submission reuses the key (TRY AGAIN, unchanged EDIT, a refresh + re-submit)', () => {
  const store = memoryStore();
  const first = keyForSubmission('I stood at a door by the sea.', store, 1000, gen);
  assert.equal(keyForSubmission('I stood at a door by the sea.', store, 2000, gen), first);
  assert.equal(keyForSubmission('  I stood at a door by the sea.  ', store, 3000, gen), first, 'surrounding whitespace is not a different dream');
});

test('changed text, a definitive answer, or an expired window each produce a NEW key', () => {
  const store = memoryStore();
  const first = keyForSubmission('dream one', store, 1000, gen);
  assert.notEqual(keyForSubmission('dream two', store, 2000, gen), first, 'edited text = a different submission');
  const second = keyForSubmission('dream two', store, 2500, gen);
  endSubmission(store);
  assert.notEqual(keyForSubmission('dream two', store, 3000, gen), second, 'after a definitive answer even identical text is a new dream');
  const third = keyForSubmission('dream three', store, 10_000, gen);
  assert.notEqual(keyForSubmission('dream three', store, 10_000 + SUBMISSION_TTL_MS + 1, gen), third, 'an old unanswered key is not reused after the window');
});

test('only a hash of the dream is stored client-side, never the text, and the key matches the server format', () => {
  const store = memoryStore();
  const text = 'A very private dream about my family and the sea.';
  const key = keyForSubmission(text, store, 1, () => crypto.randomUUID());
  assert.match(key, IDEMPOTENCY_KEY_PATTERN);
  const stored = JSON.stringify(store.snapshot());
  assert.ok(!stored.includes('private') && !stored.includes('family'));
  assert.equal(hashText(text), hashText(`  ${text}\n`));
  assert.notEqual(hashText(text), hashText(`${text}!`));
});

test('HeroDream wiring: the key is created per submission, reused for TRY AGAIN, dropped only on a definitive answer, and never retried automatically', () => {
  const hero = read('src/hero/HeroDream.tsx');
  assert.match(hero, /keyForSubmission\(dreamInputSourceText\(input\), submissionStore\)/);
  assert.match(hero, /analyzeDream\(input, idempotencyKey\)/);
  assert.match(hero, /if \(!uncertain\) endSubmission\(submissionStore\);/);
  assert.match(hero, /const uncertain = result\.status === 'error' && result\.uncertain === true;/);
  // an abandoned journey does not drop an unanswered key (re-sending the same dream then replays it)
  const goHome = hero.slice(hero.indexOf('const handleGoHome'), hero.indexOf('const handleGoHome') + 700);
  assert.ok(!/endSubmission/.test(goHome));
  const client = read('src/hero/dreamAnalysis.ts');
  assert.match(client, /JSON\.stringify\(\{ sourceText, inputMode: dreamInput\.inputMode, idempotencyKey \}\)/);
  assert.equal((client.match(/uncertain: true/g) ?? []).length, 3, 'timeout/disconnect, platform error page, unusable 200');
  assert.match(client, /uncertain: reason === 'analysis_in_progress'/);
});

// ------------------------------------------------------------ navigation protection ----

test('before a dream is submitted there is no warning', () => {
  assert.equal(hasUnsavedDream({ analysisOk: false, insideStep: 'prompt', paidAnalysisInFlight: false }), false);
});

test('a paid submission in progress, and the timeout/uncertain state, keep the warning active', () => {
  assert.equal(hasUnsavedDream({ analysisOk: false, insideStep: 'prompt', paidAnalysisInFlight: true }), true);
});

test('a successful analysis continues into the existing unsaved-dream protection, and confirmed save / let-go removes it', () => {
  assert.equal(hasUnsavedDream({ analysisOk: true, insideStep: 'reflection', paidAnalysisInFlight: false }), true);
  assert.equal(hasUnsavedDream({ analysisOk: true, insideStep: 'saved', paidAnalysisInFlight: false }), false);
  assert.equal(hasUnsavedDream({ analysisOk: true, insideStep: 'gone', paidAnalysisInFlight: false }), false);
});

test('a definitive (refunded) failure removes the protection; signed-out visitors are never warned for an analysis', () => {
  // definitive failure: the server answered and released/refunded the attempt => not pending, not uncertain, no result
  assert.equal(hasUnsavedDream({ analysisOk: false, insideStep: 'prompt', paidAnalysisInFlight: false }), false);
  const hero = read('src/hero/HeroDream.tsx');
  assert.match(hero, /const paidAnalysisInFlight = !!user && \(analysisPending \|\| analysisUncertain\);/);
});

test('the uncertain state tells a signed-in dreamer that retrying will not charge again (both languages)', () => {
  const tr = read('src/i18n/translations.ts');
  assert.equal(tr.split('analysisUncertain:').length - 1, 3); // interface + en + he
  assert.match(read('src/hero/HoldToRemember.tsx'), /t\(analysisUncertain \? 'hold\.analysisUncertain' : 'hold\.analysisFailed'\)/);
  assert.match(read('src/hero/HeroDream.tsx'), /analysisUncertain=\{!!user && analysisUncertain\}/);
});
