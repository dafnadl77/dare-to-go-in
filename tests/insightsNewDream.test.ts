import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getArchiveEntries, getRecurringInsights } from '../src/archive/archiveData.ts';
import type { SavedDream } from '../src/hero/dreamStorage.ts';

/** A saved dream built from invented data: only the fields Insights reads. `entities` are literal motifs (objects), `concepts` the semantic ones. */
function dream(id: string, day: number, concepts: string[], entities: string[] = [], feelings = false): SavedDream {
  return {
    id,
    createdAt: new Date(Date.UTC(2026, 9, day, 12, 0, 0)).toISOString(),
    favorite: false,
    sourceText: `invented dream ${id}`,
    inputMode: 'text',
    dreamImageDataUrl: null,
    selectedElement: `Element of ${id}`,
    reflectionResponse: '',
    dreamReflection: { observation: `Observation of ${id}` },
    dreamAnalysis: {
      summary: `Invented ${id}`,
      people: [],
      places: [],
      objects: entities.map((name) => ({ name, description: null, explicit: true, confidence: 0.9 })),
      actions: [],
      emotions: [],
      concepts,
      conceptVersion: 1,
      reconstruction: { keyPeople: [], keyObjects: [], keyActions: [], emotionalAtmosphere: [], primarySetting: `Setting ${id}` },
    },
    ...(feelings ? { emotions: ['wonder'] } : {}),
  } as unknown as SavedDream;
}

const rowsOf = (dreams: SavedDream[]) => getRecurringInsights(getArchiveEntries(dreams, 'en')) ?? [];

test('insights: a new dream that shares a concept with older dreams is counted in that row immediately, once, and the older dreams stay', () => {
  const old = [
    dream('d1', 1, ['role_identity']),
    dream('d2', 2, ['performance_attention']),
    dream('d3', 3, ['role_identity', 'celebration']),
    dream('d4', 4, ['public_figures']),
  ];
  const before = rowsOf(old);
  const roleBefore = before.find((r) => r.conceptId === 'role_identity');
  assert.equal(roleBefore?.count, 2);

  const queen = dream('queen', 5, ['role_identity', 'authority_power'], [], true);
  const after = rowsOf([...old, queen]);
  const role = after.find((r) => r.conceptId === 'role_identity');
  assert.equal(role?.count, 3, 'counted at once');
  assert.deepEqual(role?.dreams.map((d) => d.id), ['queen', 'd3', 'd1'], 'newest first, no duplicates, older dreams untouched');
  assert.equal(after.filter((r) => r.conceptId === 'role_identity').length, 1, 'one row, not two');
});

test('insights: a new dream whose themes no other dream shares is not listed (a recurring-themes page) until another dream shares one', () => {
  const old = [dream('d1', 1, ['animals']), dream('d2', 2, ['water'])];
  const lone = dream('lone', 3, ['authority_power']);
  assert.ok(!rowsOf([...old, lone]).some((r) => r.dreams.some((d) => d.id === 'lone')));
  const partner = dream('partner', 4, ['authority_power']);
  const rows = rowsOf([...old, lone, partner]);
  const row = rows.find((r) => r.conceptId === 'authority_power');
  assert.deepEqual(row?.dreams.map((d) => d.id), ['partner', 'lone']);
});

test('insights: with many long-standing recurring themes, a new dream\'s row is never pushed off the page by older, higher-count rows', () => {
  // Fourteen literal motifs and ten concepts that recur in all of six older dreams: they fill the page and outrank anything that recurs only twice.
  const shared = Array.from({ length: 14 }, (_, i) => `motif ${String.fromCharCode(97 + i)}`);
  const sharedConcepts = ['family', 'children', 'childhood', 'friends_social', 'romance_love', 'marriage_weddings', 'death_loss', 'body_health', 'past_memory', 'money_wealth'];
  const old = Array.from({ length: 6 }, (_, i) => dream(`o${i + 1}`, i + 1, sharedConcepts, shared));
  const withOne = dream('queen-link', 7, ['role_identity'], ['Queen']);
  const before = dream('older-queen', 0, ['role_identity'], ['Queen']);
  const fresh = dream('fresh', 8, ['role_identity', 'authority_power'], ['Queen']);
  const rows = rowsOf([before, ...old, withOne, fresh]);
  const rowsWithFresh = rows.filter((r) => r.dreams.some((d) => d.id === 'fresh'));
  assert.ok(rowsWithFresh.length >= 2, `the new dream appears in the rows it belongs to (found ${rowsWithFresh.length})`);
  assert.ok(rows.some((r) => r.conceptId === 'role_identity' && r.dreams.some((d) => d.id === 'fresh')));
  assert.ok(rows.some((r) => r.label.toLowerCase() === 'queen' && r.dreams.some((d) => d.id === 'fresh')), 'its literal motif row is shown too');
});
