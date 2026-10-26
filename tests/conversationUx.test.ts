import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as X from '../src/hero/exploration';
import * as C from '../src/hero/conversationTurn';
import { CONVERSATIONS } from '../src/map/conversationScript';

/**
 * THREE UX FIXES OF THE CONVERSATION WINDOW (approved 2026-10-26): DARE's response as one bubble (no inner dashed box); the three
 * direction buttons together above the writing box ("זה לא מתאים לי" only when the response holds a suggestion — her choice, behaviour
 * unchanged); "שאלה X מתוך 3" at the top of the window, from the real question count. Written BEFORE the change
 * (docs/upgrade-2026-10/122-ux-tests-before.txt). No network, no AI.
 */

// the window and its words (moved to threadWords.ts when the window learned English, 2026-10-26)
const thread = () => readFileSync('src/map/ConversationThread.tsx', 'utf8') + readFileSync('src/map/threadWords.ts', 'utf8');
const page = () => readFileSync('src/map/ConversationDemo.tsx', 'utf8');

test('1. one bubble: the reply and the suggestion are shown together, with no inner dashed box', () => {
  const t = thread();
  assert.doesNotMatch(t, /className="cv-offer"/, 'no inner box');
  assert.match(t, /className="cv-angle"/, 'the suggestion is a paragraph of the same bubble');
  // "you marked it does not fit" stays, quietly, under it
  assert.match(t, /w\.rejected/);
  // the model is told the suggestion appears in the same message, so the reply does not repeat it
  assert.match(C.buildTurnSystemPrompt('he', 'feminine'), /shown in the same message, right after the reply/i);
  assert.doesNotMatch(readFileSync('src/map/conversation.css', 'utf8'), /\.cv-offer \{/);
});

test('2. the three direction buttons sit together above the writing box; "זה לא מתאים לי" only with a suggestion not yet rejected', () => {
  const t = thread();
  const group = t.slice(t.indexOf('className="cv-steer"'), t.indexOf('<textarea'));
  assert.ok(group.length > 0, 'the group comes before the writing box');
  for (const s of ['w.deepen', 'w.shift', 'w.notForMe', 'p.onReject']) assert.ok(group.includes(s), s);
  assert.match(group, /lastTurn\?\.offer && !lastTurn\.rejected/);
  // the reject button is no longer inside the bubble
  const bubble = t.slice(t.indexOf('<ol className="cv-turns"'), t.indexOf('</ol>'));
  assert.doesNotMatch(bubble, /onReject/);
});

test('3. "שאלה X מתוך 3": from the real count of DARE\'s questions, kept across leaving and coming back', () => {
  const t = thread();
  assert.match(t, /progress: \(n: number\) => `שאלה \$\{n\} מתוך \$\{MAX_QUESTIONS_PER_MOMENT\}`/);
  assert.match(page(), /questionNumber=\{Math\.min\(X\.MAX_QUESTIONS_PER_MOMENT, X\.questionsAsked\(e, moment\.id\)\)\}/);
  const store = CONVERSATIONS.find((c) => c.key === 'store')!;
  const seeds = store.moments.map((m) => ({ label: m.label, excerpt: m.excerpt }));
  const q = (text: string): X.ConversationTurn => ({ role: 'dare', text, move: 'ask' });
  let e = X.beginConversation(X.createExploration('ux', seeds), 'm1', q('איך הוא נראה לך?'), new Date());
  assert.equal(X.questionsAsked(e, 'm1'), 1);
  e = X.addDareTurn(X.addDreamerTurn(e, 'm1', 'מבוגר'), 'm1', { role: 'dare', text: 'מבוגר, כמו מישהו שמכיר את המקום.' });
  assert.equal(X.questionsAsked(e, 'm1'), 1, 'a reply without a question does not move the counter');
  e = X.addDareTurn(X.addDreamerTurn(e, 'm1', 'כן'), 'm1', q('ומה הוא עשה?'));
  assert.equal(X.questionsAsked(e, 'm1'), 2);
  // leaving unanswered and coming back continues the count
  let left = X.beginConversation(X.createExploration('ux2', seeds), 'm2', q('ומה כאן?'), new Date());
  left = X.abandonMoment(left, 'm2');
  left = X.beginConversation(left, 'm2', q('ושוב?'), new Date());
  assert.equal(X.questionsAsked(left, 'm2'), 2);
});
