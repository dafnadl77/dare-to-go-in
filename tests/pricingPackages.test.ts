import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DREAM_PACKAGES } from '../src/pricing/packages.ts';
import { en, he } from '../src/i18n/translations.ts';

test('exactly one package is featured ("Most Popular")', () => {
  assert.equal(DREAM_PACKAGES.filter((p) => p.featured).length, 1);
  assert.equal(DREAM_PACKAGES.find((p) => p.featured)?.id, 'explore_10');
});

test('package ids are stable and unique, ready to map onto a future Grow/Make product', () => {
  const ids = DREAM_PACKAGES.map((p) => p.id);
  assert.deepEqual(ids, ['first_dream', 'go_deeper_3', 'explore_10', 'dive_in_25']);
  assert.equal(new Set(ids).size, ids.length);
});

test('exactly one package is free, and it is the only one with no dream-package price', () => {
  const free = DREAM_PACKAGES.filter((p) => p.priceIls === null);
  assert.deepEqual(free.map((p) => p.id), ['first_dream']);
});

test('paid packages have a positive, increasing price as the dream count grows', () => {
  const paid = DREAM_PACKAGES.filter((p) => p.priceIls !== null);
  for (const p of paid) assert.ok((p.priceIls as number) > 0, p.id);
  const sorted = [...paid].sort((a, b) => a.dreamCount - b.dreamCount);
  for (let i = 1; i < sorted.length; i++) {
    assert.ok((sorted[i].priceIls as number) > (sorted[i - 1].priceIls as number), `${sorted[i].id} costs more than ${sorted[i - 1].id}`);
  }
});

test('every package lists at least the baseline real capabilities, and only real capabilities', () => {
  const KNOWN = new Set(['fullJourney', 'guidedReflection', 'dreamImage', 'saveArchive', 'trackThemes', 'bilingual']);
  for (const pkg of DREAM_PACKAGES) {
    for (const f of pkg.features) assert.ok(KNOWN.has(f), `${pkg.id} lists an unknown feature: ${f}`);
    for (const base of ['fullJourney', 'guidedReflection', 'dreamImage', 'saveArchive']) {
      assert.ok(pkg.features.includes(base as never), `${pkg.id} is missing baseline feature ${base}`);
    }
  }
});

test('"track recurring themes" is only offered on multi-dream packages (Insights needs >=2 saved dreams to show anything)', () => {
  for (const pkg of DREAM_PACKAGES) {
    const hasThemes = pkg.features.includes('trackThemes' as never);
    assert.equal(hasThemes, pkg.dreamCount > 1, pkg.id);
  }
});

test('no package promises a capability DARE does not have (no support/unlimited/subscription/refund/expiry language)', () => {
  const forbidden = /priority support|unlimited|subscription|refund|expir/i;
  for (const lang of [en, he] as const) {
    const p = lang.pricing.packages;
    for (const block of [p.firstDream, p.goDeeper, p.explore, p.diveIn]) {
      assert.ok(!forbidden.test(block.description), block.description);
      assert.ok(!forbidden.test(block.cta), block.cta);
    }
    for (const label of Object.values(lang.pricing.features)) assert.ok(!forbidden.test(label), label);
  }
});

test('the pricing translation block is structurally identical between en and he (Translations enforces this at compile time; this checks the actual values are non-empty)', () => {
  for (const lang of [en, he] as const) {
    assert.ok(lang.pricing.headline.trim().length > 0);
    assert.ok(lang.pricing.subtitle.trim().length > 0);
    assert.ok(lang.pricing.dreamsCountLabel.includes('{count}'));
    for (const key of ['firstDream', 'goDeeper', 'explore', 'diveIn'] as const) {
      const block = lang.pricing.packages[key];
      assert.ok(block.name.trim().length > 0, `${key}.name`);
      assert.ok(block.description.trim().length > 0, `${key}.description`);
      assert.ok(block.cta.trim().length > 0, `${key}.cta`);
    }
  }
});

test('the brand mark is never a translation key — pageTitle/pageDescription may legitimately mention it (matching about.pageTitle\'s own "About DARE | DARE TO GO IN" convention), but no heading/label/CTA copy duplicates it', () => {
  for (const lang of [en, he] as const) {
    const p = lang.pricing;
    const renderedLabels = [
      p.headline,
      p.subtitle,
      p.mostPopular,
      p.freeLabel,
      ...Object.values(p.packages).flatMap((block) => [block.name, block.description, block.cta]),
      ...Object.values(p.features),
    ];
    for (const label of renderedLabels) assert.ok(!label.includes('DARE TO GO IN'), label);
  }
});
