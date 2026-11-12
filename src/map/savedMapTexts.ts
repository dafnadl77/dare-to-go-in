import type { ConversationTurn, Exploration, ExploredMoment, WholeViewRecord } from '../hero/exploration';
import { containsHebrew, type AppLanguage } from '../hero/appLanguage';

/**
 * THE SAVED MAP IN THE INTERFACE'S LANGUAGE (2026-11-12). The map's own words (buttons, headings, steps) already follow the interface; its
 * CONTENT — the moments' names, the conversations, the whole view, the dream itself — is saved in the language the journey ran in, and was
 * shown as saved. So a dream saved in Hebrew opened in Hebrew on the English interface.
 *
 * Now the content is translated for display only, with the same mechanism as the rest of the dream's page (translateTexts →
 * /api/dream-translation, the extras key and its limits): the saved dream is never changed and no new dream is made. The same rule as
 * DreamDetail: everything shown follows the interface language, DARE's words and her own, in both directions (her rule, 2026-11-12).
 * Each text is translated once per language and tab
 * (the shared archive cache), so a language switch back and forth, or opening the map again, asks for nothing new.
 */

/** The same rule as needsTranslation (dreamTitleTranslation.ts), kept here so this file stays pure (no network, no storage). */
export function needsTranslation(text: string, language: AppLanguage): boolean {
  if (language === 'en') return containsHebrew(text);
  return !containsHebrew(text) && /[A-Za-z]{3}/.test(text);
}

/** Whose words a text is: DARE's (follows the interface both ways) or hers (translated only on the English interface). */
type Owner = 'dare' | 'hers';

// whose words a text is no longer changes whether it is translated (both follow the interface); kept to show what each field is
const wanted = (text: string | null | undefined, _owner: Owner, language: AppLanguage): text is string =>
  typeof text === 'string' && text.trim() !== '' && needsTranslation(text, language);

/** Every text the saved map can show, with whose words it is. */
function eachText(e: Exploration, sourceText: string, visit: (text: string | null | undefined, owner: Owner) => void): void {
  visit(sourceText, 'hers');
  for (const m of e.moments) {
    visit(m.label, 'dare');
    visit(m.excerpt, 'hers');
  }
  for (const x of Object.values(e.explored)) {
    visit(x.question, 'dare');
    visit(x.answer, 'hers');
    visit(x.followUp?.question, 'dare');
    visit(x.followUp?.answer, 'hers');
    visit(x.insight?.observation, 'dare');
    visit(x.insight?.reflection, 'dare');
    visit(x.insight?.possibility, 'dare');
    for (const t of x.turns ?? []) {
      visit(t.text, t.role === 'dare' ? 'dare' : 'hers');
      visit(t.offer, 'dare');
    }
  }
  const w = e.wholeView;
  if (w) {
    visit(w.overview, 'dare');
    visit(w.recurring, 'dare');
    visit(w.contrast, 'dare');
    visit(w.closingQuestion, 'dare');
    visit(w.notice, 'dare');
    for (const r of w.readings) {
      visit(r.basis, 'hers');
      visit(r.reading, 'dare');
    }
    for (const c of w.connections) {
      visit(c.title, 'dare');
      visit(c.basis, 'hers');
    }
    w.takeaways?.mine.forEach((t) => visit(t, 'hers'));
    w.takeaways?.ideas.forEach((t) => visit(t, 'dare'));
    w.takeaways?.open?.forEach((t) => visit(t, 'dare'));
  }
}

/** The texts this map needs translated for this interface language, each once, in the order they appear. */
export function savedMapTextsToTranslate(e: Exploration, sourceText: string, language: AppLanguage): string[] {
  const out = new Set<string>();
  eachText(e, sourceText, (text, owner) => {
    if (wanted(text, owner, language)) out.add(text);
  });
  return [...out];
}

/**
 * A copy of the saved journey with every text that needs it replaced by its translation (`lookup`); a text with no translation keeps its
 * saved words. The journey it is given is never changed.
 */
export function translatedSavedMap(
  e: Exploration,
  sourceText: string,
  language: AppLanguage,
  lookup: (text: string) => string | null,
): { exploration: Exploration; sourceText: string } {
  const tr = <T extends string | null | undefined>(text: T, owner: Owner): T => (wanted(text, owner, language) ? ((lookup(text) ?? text) as T) : text);
  const turn = (t: ConversationTurn): ConversationTurn => ({ ...t, text: tr(t.text, t.role === 'dare' ? 'dare' : 'hers'), ...(t.offer ? { offer: tr(t.offer, 'dare') } : {}) });
  const explored: Record<string, ExploredMoment> = {};
  for (const [id, x] of Object.entries(e.explored)) {
    explored[id] = {
      ...x,
      question: tr(x.question, 'dare'),
      answer: tr(x.answer, 'hers'),
      followUp: x.followUp ? { ...x.followUp, question: tr(x.followUp.question, 'dare'), answer: tr(x.followUp.answer, 'hers') } : x.followUp,
      insight: x.insight ? { ...x.insight, observation: tr(x.insight.observation, 'dare'), reflection: tr(x.insight.reflection, 'dare'), possibility: tr(x.insight.possibility, 'dare') } : x.insight,
      ...(x.turns ? { turns: x.turns.map(turn) } : {}),
    };
  }
  const w = e.wholeView;
  const wholeView: WholeViewRecord | null = w
    ? {
        ...w,
        overview: tr(w.overview, 'dare'),
        recurring: tr(w.recurring, 'dare'),
        contrast: tr(w.contrast, 'dare'),
        closingQuestion: tr(w.closingQuestion, 'dare'),
        ...(w.notice !== undefined ? { notice: tr(w.notice, 'dare') } : {}),
        readings: w.readings.map((r) => ({ basis: tr(r.basis, 'hers'), reading: tr(r.reading, 'dare') })),
        connections: w.connections.map((c) => ({ ...c, title: tr(c.title, 'dare'), basis: tr(c.basis, 'hers') })),
        ...(w.takeaways
          ? {
              takeaways: {
                mine: w.takeaways.mine.map((t) => tr(t, 'hers')),
                ideas: w.takeaways.ideas.map((t) => tr(t, 'dare')),
                ...(w.takeaways.open ? { open: w.takeaways.open.map((t) => tr(t, 'dare')) } : {}),
              },
            }
          : {}),
      }
    : null;
  return {
    exploration: { ...e, moments: e.moments.map((m) => ({ ...m, label: tr(m.label, 'dare'), excerpt: tr(m.excerpt, 'hers') })), explored, wholeView },
    sourceText: tr(sourceText, 'hers'),
  };
}

