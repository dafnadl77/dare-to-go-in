import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
// ---------------------------------------------------- client error mapping ----
// (dreamImage.ts pulls in the Supabase browser client, which needs Vite's env, so
// its mapping is asserted structurally rather than by importing it.)

test('failure classes reach the client as distinct reasons: moderation, limit, transient', () => {
  const client = read('src/hero/dreamImage.ts');
  const known = client.slice(client.indexOf('const KNOWN_REASONS'));
  for (const r of ['content_rejected', 'limit_reached', 'request_failed']) assert.ok(known.includes("'" + r + "'"), r);
  assert.ok(client.includes('KNOWN_REASONS.includes(errData.reason as ImageErrorReason)'));
  assert.ok(read('server/routes/dreamImage.ts').includes("errorResult(422, 'content_rejected'"));
});

test('a successful generation still resolves to the new image (client contract unchanged)', () => {
  assert.ok(read('src/hero/dreamImage.ts').includes("return { status: 'ok', imageDataUrl: "));
});

// ------------------------------------------------ regeneration state machine ----

const hero = read('src/hero/HeroDream.tsx').replace(/\r\n/g, '\n');
const regenEffect = hero.slice(hero.indexOf("if (reconstructionPhase !== 'regenerating') return;"), hero.indexOf("// 'imaging': the real cross-dissolve"));
const failedBranch = regenEffect.slice(regenEffect.indexOf('else if (displayedImageUrl'));

test('successful regeneration is unchanged: incoming image then imaging', () => {
  assert.match(regenEffect, /if \(imageResult\.status === 'ok'\) \{\s*setIncomingImageUrl\(imageResult\.imageDataUrl\);\s*setReconstructionPhase\('imaging'\);/);
});

test('failed regeneration keeps the previous image, returns to reveal, and never hits the image-error dead end', () => {
  assert.match(failedBranch, /else if \(displayedImageUrl && analysisResult\?\.status === 'ok'\)/);
  assert.match(failedBranch, /setReconstructionPhase\('reveal'\)/);
  const failureOnly = failedBranch.split('} else {')[0];
  assert.ok(!/setDisplayedImageUrl|setIncomingImageUrl|image-error/.test(failureOnly));
  // image-error only remains for the impossible no-previous-image case
  assert.ok(failedBranch.split('} else {')[1].includes("'image-error'"));
});

test('failed regeneration stays on the same attempt: no new analysis, no home reset, correction undone', () => {
  assert.ok(!/analyzeDream|runAnalysis|handleGoHome|setAnalysisResult|startImageGeneration/.test(failedBranch));
  assert.match(failedBranch, /corrections\.slice\(0, -1\)/);
  assert.match(failedBranch, /buildReconstructionBrief\(analysisResult\.analysis, restored\)/);
});

test('moderation, limit and transient failures each get a distinct notice; internals are never shown', () => {
  assert.match(regenEffect, /'limit_reached' \? 'limit' : imageResult\.reason === 'content_rejected' \? 'rejected' : 'failed'/);
  const ui = read('src/hero/DreamReconstruction.tsx');
  const notice = ui.slice(ui.indexOf('regenNotice && ('), ui.indexOf('regenNotice && (') + 400);
  assert.ok(!/imageResult|\.message/.test(notice));
});

test('image limit preserves the last image and removes the impossible retry (NOT QUITE)', () => {
  const ui = read('src/hero/DreamReconstruction.tsx').replace(/\r\n/g, '\n');
  assert.match(ui, /regenNotice !== 'limit' && \(\s*<button[^>]*dr-choice--no/);
  assert.match(ui, /dr-choice--yes"[^>]*onClick=\{onYes\}/);
});

test('every regeneration notice exists in both languages', () => {
  const tr = read('src/i18n/translations.ts');
  for (const k of ['regenFailed', 'regenRejected', 'regenLimit']) assert.equal(tr.split(`${k}:`).length - 1, 3, k); // interface + en + he
});

// -------------------------------------------------- server quota / refunds ----

const route = read('server/routes/dreamImage.ts').replace(/\r\n/g, '\n');

test('the reservation happens BEFORE the provider call, and a limit rejection never calls the provider or refunds', () => {
  const reserve = route.indexOf('reserveImageAttempt(attemptId');
  const call = route.indexOf('client.images.generate');
  const limit = route.indexOf("'limit_reached'");
  assert.ok(reserve > 0 && reserve < limit && limit < call);
  assert.ok(!route.slice(limit - 200, limit + 200).includes('refundImageAttempt'));
});

test('every failure that delivers no image refunds; moderation is the one deliberate, documented non-refund', () => {
  const tryPart = route.slice(route.indexOf('try {'), route.indexOf('} catch (err)'));
  assert.ok(tryPart.includes('refundImageAttempt(attemptId)')); // provider returned no image
  const catchPart = route.slice(route.indexOf('} catch (err)'));
  const moderation = catchPart.slice(catchPart.indexOf('safety|moderation'), catchPart.indexOf("request_failed', 'The image generation request failed"));
  assert.ok(!/await refundImageAttempt/.test(moderation.split('return withHeaders')[0]));
  assert.match(moderation, /content_rejected/);
  assert.match(moderation, /abuse/);
  // every other errorResult return is immediately preceded by a refund
  const others = catchPart.match(/([^\n]*\n\s*)return withHeaders\(\s*errorResult\(/g) ?? [];
  const unrefunded = others.filter((m) => !m.includes('refundImageAttempt'));
  assert.equal(unrefunded.length, 1, 'only the moderation return may be unrefunded');
});

test('a success consumes exactly one reservation and refunds nothing', () => {
  const afterImage = route.slice(route.indexOf('const image = response.data'), route.indexOf('} catch (err)'));
  assert.equal(afterImage.split('refundImageAttempt').length - 1, 1); // only the no-image-data branch
  assert.match(afterImage, /return withHeaders\(okResult\(\{ imageDataUrl/);
});

test('refunds cannot be forged: no client-reachable refund surface', () => {
  const bodyDecl = route.slice(route.indexOf('const body ='), route.indexOf('const body =') + 120);
  assert.ok(!/refund/i.test(bodyDecl));
  for (const f of ['src/hero/dreamImage.ts', 'src/hero/HeroDream.tsx', 'server/routes/dreamAnalysis.ts', 'server/routes/dreamReflection.ts']) {
    assert.ok(!/refund_image_attempt|refundImageAttempt/.test(read(f)), f);
  }
  assert.match(read('server/dreamAttempts.ts'), /callRefundFn\('refund_image_attempt', attemptId\)/);
});
