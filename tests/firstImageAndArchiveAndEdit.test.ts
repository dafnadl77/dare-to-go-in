import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  classifyFirstImageFailure,
  recoveryForFirstImageFailure,
  MAX_FIRST_IMAGE_TRIES,
} from '../src/hero/firstImageRecovery.ts';
import { archiveDisplay, statusWhenFetchStarts, statusWhenFetchFails } from '../src/archive/archiveLoad.ts';
import { createTextDreamInput, dreamInputSourceText } from '../src/hero/dreamInput.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const hero = read('src/hero/HeroDream.tsx');

// =============================================== FIRST IMAGE FAILURE ====

test('a technical failure (including a timeout, which arrives as request_failed) offers RETRY', () => {
  for (const reason of ['request_failed', 'rate_limited', 'billing_issue', 'not_configured', 'invalid_response', 'not_authenticated', undefined, null]) {
    assert.equal(classifyFirstImageFailure(reason), 'failed', String(reason));
    assert.deepEqual(recoveryForFirstImageFailure('failed', 1), { action: 'retry' });
  }
});

test('a moderation rejection is never blindly resent: it offers REPHRASE, not retry', () => {
  assert.equal(classifyFirstImageFailure('content_rejected'), 'rejected');
  assert.deepEqual(recoveryForFirstImageFailure('rejected', 1), { action: 'rephrase' });
});

test('an exhausted allowance can never loop: limit_reached, or the try cap, leaves only RESTART', () => {
  assert.equal(classifyFirstImageFailure('limit_reached'), 'limit');
  assert.deepEqual(recoveryForFirstImageFailure('limit', 1), { action: 'restart' });
  for (const kind of ['failed', 'rejected'] as const) {
    assert.deepEqual(recoveryForFirstImageFailure(kind, MAX_FIRST_IMAGE_TRIES), { action: 'restart' });
  }
  // walk a persistently failing provider: it stops after exactly the cap
  let tries = 1;
  let retries = 0;
  while (recoveryForFirstImageFailure('failed', tries).action === 'retry') {
    tries += 1;
    retries += 1;
    assert.ok(retries < 50, 'must terminate');
  }
  assert.equal(tries, MAX_FIRST_IMAGE_TRIES);
  assert.equal(MAX_FIRST_IMAGE_TRIES, 3, 'matches the server\'s 3 image slots per attempt');
});

test('the retry reuses the SAME attemptId and brief, never re-runs analysis, and cannot spend anything client-side', () => {
  const retry = hero.slice(hero.indexOf('const handleRetryFirstImage'), hero.indexOf('const handleRephraseFirstImage'));
  assert.match(retry, /reconstructionPhase !== 'image-error'/);
  assert.match(retry, /startImageGeneration\(`initial-retry-\$\{firstImageTriesRef\.current\}`, brief, analysisResult\.attemptId\)/);
  assert.ok(!/analyzeDream|runAnalysis|handleDreamCapture|handleGoHome|setAnalysisResult|generateDreamImage|credit/i.test(retry));
  // a retry token is unique per try, so it always fires exactly one request and never collides with 'initial'
  assert.match(hero, /if \(!imageEverSucceededRef\.current\) firstImageTriesRef\.current \+= 1;/);
});

test('a successful retry continues the normal journey (reconstructing -> imaging -> reveal) with the existing effects', () => {
  const retry = hero.slice(hero.indexOf('const handleRetryFirstImage'), hero.indexOf('const handleRephraseFirstImage'));
  assert.match(retry, /setReconstructionPhase\('reconstructing'\)/);
  // the existing 'reconstructing' effect hands a successful result to 'imaging'
  assert.match(hero, /if \(imageResult\.status === 'ok'\) \{\s*setIncomingImageUrl\(imageResult\.imageDataUrl\);\s*setReconstructionPhase\('imaging'\);/);
  assert.match(hero, /if \(result\.status === 'ok'\) imageEverSucceededRef\.current = true;/);
});

test('moderation rejection uses the existing correction path on the same attempt (no verbatim resend)', () => {
  const rephrase = hero.slice(hero.indexOf('const handleRephraseFirstImage'), hero.indexOf('// Tells App whether'));
  assert.match(rephrase, /firstImageRecovery\.action !== 'rephrase'/);
  assert.match(rephrase, /setReconstructionPhase\('correcting'\)/);
  assert.ok(!/startImageGeneration|generateDreamImage/.test(rephrase), 'rephrase itself sends nothing');
  // and the existing correction submit regenerates on the same attempt, going back to image-error if it fails with no image
  assert.match(hero, /startImageGeneration\(`correction-\$\{correctionCountRef\.current\}`, newBrief, analysisResult\.attemptId\)/);
  assert.match(hero, /\} else \{\s*setReconstructionPhase\('image-error'\);/);
});

test('the already-correct regeneration-after-success behavior is untouched', () => {
  assert.match(hero, /else if \(displayedImageUrl && analysisResult\?\.status === 'ok'\)/);
  assert.match(hero, /setReconstructionPhase\('reveal'\)/);
});

test('first-image recovery UI is localized in both languages and always keeps Restart available', () => {
  const ui = read('src/hero/DreamReconstruction.tsx');
  const block = ui.slice(ui.indexOf("phase === 'image-error'"), ui.indexOf("phase === 'reveal'"));
  assert.match(block, /imageRecovery === 'retry' && \(/);
  assert.match(block, /imageRecovery === 'rephrase' && \(/);
  assert.match(block, /onClick=\{onReturnToRoom\}/);
  assert.match(block, /role="alert"/);
  const tr = read('src/i18n/translations.ts');
  for (const k of ['imageFailedRetry', 'imageRejected', 'imageExhausted', 'rephrase', 'howToDescribeDifferently']) {
    assert.equal(tr.split(`${k}:`).length - 1, 3, k); // interface + en + he
  }
});

// ============================================== ARCHIVE LOAD / ERROR ====

test('while LOADING the empty state is never shown, whatever the (still empty) list looks like', () => {
  assert.equal(archiveDisplay('loading', 0), 'loading');
  assert.equal(archiveDisplay('loading', 5), 'loading');
});

test('only a SUCCESSFUL fetch that returned zero dreams shows the real empty state', () => {
  assert.equal(archiveDisplay('ready', 0), 'empty');
  assert.equal(archiveDisplay('ready', 3), 'list');
});

test('a FAILED fetch shows the error (with Retry), never the empty state', () => {
  assert.equal(archiveDisplay('error', 0), 'error');
  assert.equal(archiveDisplay('error', 4), 'error');
});

test('retry recovers: error -> loading -> ready', () => {
  let status = statusWhenFetchFails('loading'); // first load failed
  assert.equal(status, 'error');
  status = 'loading'; // Retry pressed
  assert.equal(archiveDisplay(status, 0), 'loading');
  status = 'ready'; // second fetch succeeded
  assert.equal(archiveDisplay(status, 2), 'list');
});

test('a refetch while a list is on screen never flashes loading, and a failed background refetch never hides the list', () => {
  assert.equal(statusWhenFetchStarts('ready'), 'ready');
  assert.equal(statusWhenFetchFails('ready'), 'ready');
  assert.equal(statusWhenFetchStarts('loading'), 'loading');
  assert.equal(statusWhenFetchStarts('error'), 'loading');
  assert.equal(statusWhenFetchFails('error'), 'error');
});

test('the archive really renders through the lifecycle: loading, error+Retry, then empty/list; Insights too; strings in both languages', () => {
  const archive = read('src/archive/DreamArchive.tsx');
  assert.match(archive, /const display = archiveDisplay\(loadStatus, visibleEntries\.length\);/);
  assert.match(archive, /display === 'loading' \? \(/);
  assert.match(archive, /display === 'error' \? \(/);
  assert.match(archive, /onClick=\{retryLoad\}/);
  assert.match(archive, /setLoadStatus\('ready'\)/);
  assert.match(archive, /setLoadStatus\(statusWhenFetchFails\)/);
  // the fetch error is no longer swallowed into an empty list: the catch changes the status
  const effect = archive.slice(archive.indexOf('setLoadStatus(statusWhenFetchStarts)'), archive.indexOf('const retryLoad'));
  assert.match(effect, /\.catch\(\(err\) => \{[\s\S]*setLoadStatus\(statusWhenFetchFails\)/);
  // the real empty state is only inside the 'empty' branch
  assert.match(archive, /display === 'empty' \? \(\s*<div className="ar-empty-state">/);
  const tr = read('src/i18n/translations.ts');
  for (const k of ['loading', 'loadErrorTitle', 'loadErrorBody', 'loadRetry']) assert.equal(tr.split(`    ${k}:`).length - 1, 3, k);
});

// ========================================================= EDIT DREAM ====

test('the exact original dream text is what EDIT restores (verbatim, including spacing and punctuation)', () => {
  const original = '  I was in a house by the sea,\nand the door would not open…  ';
  const captured = createTextDreamInput(original);
  assert.equal(dreamInputSourceText(captured), original);
});

test('EDIT puts the captured text back into the typing field and restores the typing mode; it creates and saves nothing', () => {
  const hold = read('src/hero/HoldToRemember.tsx');
  const editButton = hold.slice(hold.indexOf("t('hold.editDream')") - 520, hold.indexOf("t('hold.editDream')"));
  assert.match(editButton, /setEntry\(capturedDreamText\);/);
  assert.match(editButton, /onTypedTranscriptChange\(capturedDreamText\);/);
  assert.match(editButton, /setCentralMode\('typing'\);/);
  assert.ok(!/onDreamCapture|saveDream|onRequireAuthForSave/.test(editButton), 'EDIT itself submits and saves nothing');
  assert.match(hero, /capturedDreamText=\{dreamInputRef\.current \? dreamInputSourceText\(dreamInputRef\.current\) : ''\}/);
});
