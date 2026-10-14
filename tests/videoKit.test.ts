import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const dir = new URL('../docs/upgrade-2026-10/video/', import.meta.url);
const read = (name: string) => readFileSync(new URL(name, dir), 'utf8').replace(/\r\n/g, '\n');

interface Cue { start: number; end: number; lines: string[] }

function parseSrt(text: string): Cue[] {
  return text.trim().split(/\n\n+/).map((block) => {
    const [, time, ...lines] = block.split('\n');
    const m = /^(\d\d):(\d\d):(\d\d),(\d{3}) --> (\d\d):(\d\d):(\d\d),(\d{3})$/.exec(time);
    assert.ok(m, `bad timing line: ${time}`);
    const sec = (h: string, mi: string, s: string, ms: string) => Number(h) * 3600 + Number(mi) * 60 + Number(s) + Number(ms) / 1000;
    return { start: sec(m[1], m[2], m[3], m[4]), end: sec(m[5], m[6], m[7], m[8]), lines };
  });
}

test('video kit: both subtitle files follow the 40-second script (ordered, no overlap, at most 42 characters and two lines per cue)', () => {
  const he = parseSrt(read('explainer-he.srt'));
  const en = parseSrt(read('explainer-en.srt'));
  assert.equal(he.length, en.length, 'the same cues in both languages');
  assert.equal(he.length, 9);
  for (const cues of [he, en]) {
    cues.forEach((cue, i) => {
      assert.ok(cue.end > cue.start, `cue ${i + 1} has a positive length`);
      assert.ok(cue.end <= 40, `cue ${i + 1} ends within 40 seconds`);
      if (i > 0) assert.ok(cue.start >= cues[i - 1].end, `cue ${i + 1} does not overlap the previous one`);
      assert.ok(cue.lines.length <= 2, `cue ${i + 1} has at most two lines`);
      for (const line of cue.lines) assert.ok(line.length <= 42, `"${line}" is ${line.length} characters`);
    });
  }
  he.forEach((cue, i) => {
    assert.ok(Math.abs(cue.start - en[i].start) < 0.001 && Math.abs(cue.end - en[i].end) < 0.001, `cue ${i + 1} has the same timing in both languages`);
  });
});

test('video kit: every frame the animatic uses exists in both languages', () => {
  for (const lang of ['he', 'en']) {
    for (let i = 1; i <= 8; i++) {
      assert.ok(existsSync(new URL(`frames/${lang}-0${i}.jpg`, dir)), `${lang}-0${i}.jpg`);
    }
  }
});

test('video kit: nothing in the kit is served by the site (no video in public/) until a final video is approved', () => {
  const pub = new URL('../public/', import.meta.url);
  assert.equal(existsSync(new URL('explainer-draft-he.mp4', pub)), false);
  assert.equal(existsSync(new URL('explainer-draft-en.mp4', pub)), false);
});
