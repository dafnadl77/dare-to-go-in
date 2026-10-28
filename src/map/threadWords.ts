import { MAX_QUESTIONS_PER_MOMENT } from '../hero/exploration';

/** The words of a moment's conversation window (ConversationThread.tsx), in the journey's language. */

type Address = 'masculine' | 'feminine' | 'neutral';

const wordsEn = {
  write: 'Write here, in your own words',
  send: 'Send',
  notForMe: "This doesn't fit me",
  deepen: 'Keep going this way',
  shift: 'Change direction',
  steerLabel: 'Direction of the conversation',
  rejected: "You marked that this doesn't fit you",
  moveOn: 'Another moment',
  toMap: 'Back to the dream map',
  closedNote: (moveOn: boolean) => (moveOn ? 'This moment is done. You can go to another moment or see what came up.' : 'This moment is done. You can see what came up.'),
  progress: (n: number) => `Question ${n} of ${MAX_QUESTIONS_PER_MOMENT}`,
  finish: 'Finish and see what came up',
  writing: 'DARE is writing…',
  fromTheDream: 'From the dream',
  waiting: (finish: boolean, moveOn = true) =>
    `DARE is waiting for your answer.${moveOn ? ` You can also go to another moment${finish ? ', or finish' : ''}.` : finish ? ' You can also finish.' : ''}`,
  open: (finish: boolean, moveOn = true) =>
    moveOn ? (finish ? 'You can keep writing, go to another moment or finish.' : 'You can keep writing or go to another moment.') : finish ? 'You can keep writing or finish.' : 'You can keep writing.',
  keys: 'Enter sends. Shift+Enter starts a new line.',
  done: 'We already talked about this moment.',
};

const words = (address: Address) => ({
  write: address === 'masculine' ? 'כתוב כאן, במילים שלך' : address === 'feminine' ? 'כתבי כאן, במילים שלך' : 'אפשר לכתוב כאן, במילים שלך',
  send: 'שליחה',
  notForMe: 'זה לא מתאים לי',
  deepen: 'להמשיך בכיוון',
  shift: 'לשנות כיוון',
  steerLabel: 'כיוון השיחה',
  rejected: address === 'masculine' ? 'סימנת שזה לא מתאים לך' : address === 'feminine' ? 'סימנת שזה לא מתאים לך' : 'סומן שזה לא מתאים',
  moveOn: 'לרגע אחר',
  toMap: 'מעבר למפת החלום',
  closedNote: (moveOn: boolean) => (moveOn ? 'החקירה של הרגע הזה הסתיימה. אפשר לעבור לרגע אחר או לראות מה עלה.' : 'החקירה של הרגע הזה הסתיימה. אפשר לראות מה עלה.'),
  progress: (n: number) => `שאלה ${n} מתוך ${MAX_QUESTIONS_PER_MOMENT}`,
  finish: 'לסיים ולראות מה עלה',
  writing: 'DARE כותבת…',
  fromTheDream: 'מהחלום',
  // what the window says matches what it offers: "or finish" only when finishing is there
  waiting: (finish: boolean, moveOn = true) =>
    `DARE מחכה לתשובה שלך.${moveOn ? ` אפשר גם לעבור לרגע אחר${finish ? ', או לסיים' : ''}.` : finish ? ' אפשר גם לסיים.' : ''}`,
  open: (finish: boolean, moveOn = true) =>
    moveOn ? (finish ? 'אפשר להמשיך לכתוב, לעבור לרגע אחר או לסיים.' : 'אפשר להמשיך לכתוב או לעבור לרגע אחר.') : finish ? 'אפשר להמשיך לכתוב או לסיים.' : 'אפשר להמשיך לכתוב.',
  keys: 'Enter לשליחה, Shift+Enter לשורה חדשה.',
  done: 'כבר דיברנו על הרגע הזה.',
});

/** The window's words in the journey's language; the buttons' own words are also what her bubble says when she presses them. */
export const threadWords = (address: Address, language: 'he' | 'en' = 'he') => (language === 'en' ? wordsEn : words(address));
