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
  closedNote: 'This moment is done. You can go back to the dream map or see what came up.',
  progress: (n: number) => `Question ${n} of ${MAX_QUESTIONS_PER_MOMENT}`,
  finish: 'Finish and see what came up',
  writing: 'DARE is writing…',
  fromTheDream: 'From the dream',
  waiting: (finish: boolean) => `DARE is waiting for your answer. You can also go to another moment${finish ? ', or finish' : ''}.`,
  open: (finish: boolean) => (finish ? 'You can keep writing, go to another moment or finish.' : 'You can keep writing or go to another moment.'),
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
  closedNote: 'החקירה של הרגע הזה הסתיימה. אפשר לעבור למפת החלום או לראות מה עלה.',
  progress: (n: number) => `שאלה ${n} מתוך ${MAX_QUESTIONS_PER_MOMENT}`,
  finish: 'לסיים ולראות מה עלה',
  writing: 'DARE כותבת…',
  fromTheDream: 'מהחלום',
  // what the window says matches what it offers: "or finish" only when finishing is there
  waiting: (finish: boolean) => `DARE מחכה לתשובה שלך. אפשר גם לעבור לרגע אחר${finish ? ', או לסיים' : ''}.`,
  open: (finish: boolean) => (finish ? 'אפשר להמשיך לכתוב, לעבור לרגע אחר או לסיים.' : 'אפשר להמשיך לכתוב או לעבור לרגע אחר.'),
  done: 'כבר דיברנו על הרגע הזה.',
});

/** The window's words in the journey's language; the buttons' own words are also what her bubble says when she presses them. */
export const threadWords = (address: Address, language: 'he' | 'en' = 'he') => (language === 'en' ? wordsEn : words(address));
