import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as S from '../src/hero/explorationSchema.ts';

/**
 * THE ONE CHANGE OF doc 83: the instructions for the possibilities of a moment's insight, and nothing else. Written BEFORE the change
 * (docs/upgrade-2026-10/84-fix83-tests-before.txt). The prompt taught the echo "‹detail›, ואמרת ש‹her words›. אולי יש קשר בין השניים";
 * 34 of the 49 candidates of acc2-1 were built that way. The checker files are locked: her decision, "do not change the safety
 * mechanisms or weaken checks".
 */

const PROMPTS = (['feminine', 'masculine', 'neutral'] as const).map((a) => S.buildMomentReplySystemPrompt('he', a));
const TAILS = [/אולי יש קשר בין השניים/, /אולי שווה לשים לב לשני הדברים יחד/, /אולי יש קשר בין שני הדברים/];
const lines = (p: string) => p.split('\n');

test('the reply prompt no longer offers the empty tail as a model: it appears only inside the instruction that forbids it', () => {
  for (const p of PROMPTS)
    for (const tail of TAILS)
      for (const l of lines(p).filter((x) => tail.test(x))) assert.match(l, /^NEVER/, `taught, not forbidden: ${l.slice(0, 120)}`);
});

test('the prompt asks for the link itself in words, a link she did not make herself, and three different kinds of relation', () => {
  for (const p of PROMPTS) {
    assert.match(p, /name WHAT joins the two details/);
    assert.match(p, /a link she already made herself in her answer is an echo/i);
    assert.match(p, /three candidates use three different kinds of relation/i);
  }
});

test('the good insight examples of the prompt do not end in the empty tail', () => {
  for (const e of S.ABOUT_HER_EXAMPLES.filter((x) => x.where === 'insight')) for (const tail of TAILS) assert.doesNotMatch(e.good, tail, e.good);
});

test('the safety mechanisms are untouched: the two checker files are byte for byte as before the change', () => {
  const hash = (f: string) => createHash('sha256').update(readFileSync(new URL(`../src/hero/${f}`, import.meta.url))).digest('hex');
  assert.equal(hash('claimCheck.ts'), '3698818615010227bb1cd9d1c6d2cf4fc69b36e0900231dcbb2af6972b87ba1d');
  assert.equal(hash('interpretationCheck.ts'), 'c3db23802d28672245ba99870cb8efabd0bebabaedc40961da78457fcfb8176a');
});

test('the new prompt carries nothing of the acceptance dreams it will be tested on (doc 74), nor of the earlier ones', () => {
  const dreams = ['37-dev-dreams.json', '37-sealed-dreams.json', '47-acceptance-dreams.json', '74-acceptance-dreams-2.json'].flatMap(
    (f) => (JSON.parse(readFileSync(new URL(`../docs/upgrade-2026-10/${f}`, import.meta.url), 'utf8')) as { text: string }[]).map((d) => d.text),
  );
  for (const p of PROMPTS)
    for (const d of dreams)
      for (const part of d.split(/[,.!?]\s*/).filter((x) => x.split(/\s+/).length >= 4)) assert.ok(!p.includes(part.trim()), `leaks: ${part}`);
});
