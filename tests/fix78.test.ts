import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as C from '../src/hero/claimCheck.ts';
import * as I from '../src/hero/interpretationCheck.ts';
import * as S from '../src/hero/explorationSchema.ts';
import * as G from './fixtures/goldenSet.ts';
import { segmentDream } from '../src/hero/dreamSegments.ts';

/**
 * THE LAST SHORT ROUND BEFORE THE ACCEPTANCE RUN (her decision after doc 78): only the two shown items the independent re-review found
 * not sound, C1 and C9 — the model's real texts of acc-1. Written BEFORE the fixes (docs/upgrade-2026-10/79-fix78-tests-before.txt).
 */

const ACC = JSON.parse(readFileSync(new URL('../docs/upgrade-2026-10/33-stage3b-fix-eval-acc-1.json', import.meta.url), 'utf8'));
const J = (plan: string) => ACC.journeys.find((j: { plan: string }) => j.plan === plan);
const sources = (plan: string, upTo: number) => {
  const j = J(plan);
  const segs = segmentDream(j.text);
  const steps = j.steps.slice(0, upTo) as { momentText: string; answer: string }[];
  return { language: 'he' as const, sourceText: j.text, segments: segs, allowed: segs.filter((s) => steps.some((st) => st.momentText.includes(s.text) || s.text.includes(st.momentText))).map((s) => s.id), answers: steps.map((st) => st.answer) };
};
const whole = (plan: string, n: number, part: 'overview' | 'readings', k = 0) =>
  (J(plan).wholeViews.find((w: { afterMoments: number }) => w.afterMoments === n).report.texts[part][k] as string).replace('[interpretation] ', '').replace(/^s\d+: /, '');
const line = (t: string, s: ReturnType<typeof sources> | ReturnType<typeof G.sourcesOf>) => C.verifyInterpretation(t, [], new Set(), s as never, { requireBasis: false });

// ------------------------------------------------------------------------------------------------ C1: the empty frame

// (corrected after the first fix: an existing test of phase 2 — her binding note 3, "a refusal for an unfounded claim is separate from a
// low quality rating" — showed the empty frame is quality, not safety. So the whole view does not SHOW it, for a quality reason, and a
// possibility rates it 0; the line check itself does not refuse it.)
const firstLook = (plan: string) => {
  const j = J(plan);
  const segs = segmentDream(j.text);
  const st = j.steps[0];
  const id = (j.moments as { id: string; label: string }[]).find((m) => m.label === st.moment)!.id;
  const explored = [{ id, label: st.moment, segments: segs.filter((s) => st.momentText.includes(s.text) || s.text.includes(st.momentText)).map((s) => s.id), answers: [st.answer], question: st.question.text, insight: st.insight }];
  const t = j.wholeViews.find((w: { afterMoments: number }) => w.afterMoments === 1).report.texts;
  const raw = S.parseWholeView({
    overview: t.overview.filter((o: string) => o.startsWith('[interpretation]')).map((o: string) => ({ source: 'interpretation', segment: 0, action: '', actor: '', target: '', moment: '', quote: '', basis: [id], text: o.replace('[interpretation] ', '') })),
    connections: [], recurring: { element: '', quotes: [], text: '' }, contrast: { quotes: [], text: '' },
    readings: t.readings.map((r: string) => ({ segment: Number(/^s(\d+):/.exec(r)?.[1] ?? -1), text: r.replace(/^s\d+: /, '') })),
    closing: { text: t.closing, moment: '', quote: '' },
  })!;
  return C.assembleWhole(raw, { language: 'he', sourceText: j.text, segments: segs, explored, unexplored: [], previous: null, maxReadings: 2 } as never);
};

test('C1. "אולי יש משהו בכך ש…" (acc-2, first look) is not shown: an empty frame, a quality reason and not a safety one', () => {
  const { report } = firstLook('acc-2');
  assert.ok(report.overview[0].reasons.some((x) => /empty/.test(x) && /quality/.test(x)), JSON.stringify(report.overview));
  const r4 = G.R_EMPTY[0];
  const v = I.verifyCandidate({ text: r4.text, card: null }, G.sourcesOf(r4.dream));
  assert.equal(v.safety.ok, true, 'R4 makes no unfounded claim');
  assert.equal(v.quality.level, 0, 'R4 is rated 0, never shown as a possibility');
});

test('C1. no harm: "אולי יש קשר בין…", "אולי שווה לשים לב…" and G1 are not empty frames', () => {
  for (const t of ['אולי יש קשר בין הבדידות שתיארת לבין ספל התה החם.', 'אולי שווה לשים לב לשני הדברים יחד.', G.G_REAL[0].text]) assert.ok(!/(?<![א-ת])(?:ש)?יש\s+משהו\s+ב\S+/.test(t), t);
  assert.ok(firstLook('acc-1').report.overview.every((o) => !o.reasons.some((x) => /empty/.test(x))), 'an opening without the frame');
});

// ------------------------------------------------------------------------------------------------ C9: seeing an image as something that "shows"

test('C9. "אפשר לראות בספל התה החם רגע שמדגיש את האפשרות לחמימות…" (acc-3, whole view) gives the image a meaning', () => {
  const r = line(whole('acc-3', 3, 'readings'), sources('acc-3', 3));
  assert.ok(r.some((x) => /psychological meaning/.test(x)), r.join('; '));
});

test('C9. no harm: G1 ("לראות את תחנת האוטובוס… כמקום שבו הבדידות והגעגוע נמצאים") and plain seeing keep passing that check', () => {
  assert.ok(!line(G.G_REAL[0].text, G.sourcesOf('acc3')).some((x) => /psychological meaning/.test(x)));
  assert.ok(!line('אולי ראית שהאדים מהספל ירדו אל החול, כמו שתיארת.', G.sourcesOf('acc3')).some((x) => /psychological meaning/.test(x)));
});
