/**
 * What her last words bring from her own world, so that the next turn gives it weight (2026-11-07). Five kinds, kept apart: being reminded of
 * something, a work (film, book, song), a memory of her own, a wish, and an outright statement about her waking life. Only that last one is a
 * link to her life: a memory, a film or a childhood wish is never read as one. A negated mention ("זה לא מזכיר לי") does not count.
 */
export type BroughtKind = 'association' | 'reference' | 'memory' | 'wish' | 'life';
type Kind = BroughtKind;
const H = '(?<![א-ת])'; // a Hebrew word starts here (a prefix letter is added by each pattern when it may occur)
const E = '(?![א-ת])';
const NEG = new RegExp(`${H}(?:לא|אין|בלי|שום)\\s+(?:\\S+\\s+){0,2}$`);

const he: Record<Kind, RegExp[]> = {
  // the root ז-כ-ר in its forms of being reminded, not "I remember that the door…", which only recalls the dream; and other ways of saying it
  association: [
    new RegExp(`${H}[ושכ]?(?:הזכיר|הזכירה|הזכירו|מזכיר|מזכירה|מזכירים|מזכירות|יזכיר|תזכיר|נזכר|נזכרת|נזכרתי|נזכרנו)${E}`),
    new RegExp(`${H}(?:זה|זו|זאת|זה\\s+היה)\\s+(?:קצת\\s+|ממש\\s+)?(?:כמו|דומה\\s+ל)`),
    new RegExp(`${H}(?:חשבתי|חשבה|חשב|חושבת|חושב)\\s+(?:מיד\\s+|ישר\\s+)?על${E}`),
    new RegExp(`${H}(?:עלה|עלתה|עלו|עולה|עולים|קפץ|קפצה|קופץ|קופצת)\\s+(?:לי|בי)(?:\\s+(?:מיד|ישר))?\\s+(?:ה|את|ש|זיכרון|זכרון|תמונה)`),
    new RegExp(`${H}(?:מעלה|העלה|העלתה|העלו)\\s+(?:לי|בי|אצלי)${E}`),
    new RegExp(`${H}(?:קשור|קשורה|קשורים|מתקשר|מתקשרת)\\s+(?:אצלי|אצלי\\s+ל|לי\\s+ל)`),
  ],
  reference: [new RegExp(`${H}[בהלמכו]{0,2}(?:סרט|סדרה|ספר|שיר|אגדה|מעשייה|הצגה|ציור|משחק)(?:\\s+של|\\s+ה|\\s+\\S|${E})`)],
  // her own past, said as hers
  memory: [
    new RegExp(`${H}[בשמהו]{0,2}ילדות(?:\\s+שלי)?${E}`),
    new RegExp(`${H}(?:כש|בתור\\s+|כ)(?:הייתי\\s+)?(?:ילדה|ילד|קטנה|קטן|נערה|נער|צעירה|צעיר)${E}`),
    new RegExp(`${H}(?:היה|הייתה|היו)\\s+לי\\s+(?:פעם|בעבר)`),
    new RegExp(`${H}(?:פעם|לפני\\s+שנים)\\s+(?:הייתי|היה\\s+לי|גרתי|הלכתי|ראיתי|קרה\\s+לי)`),
    new RegExp(`${H}[של]{0,2}(?:סבתא|סבא|אמא|אבא|אחות|אח)\\s+שלי${E}`),
  ],
  wish: [
    new RegExp(`${H}חלום\\s+(?:ה?ילדות|ה?חיים|ישן)${E}`),
    new RegExp(`${H}(?:תמיד|כל\\s+החיים|מאז\\s+ומתמיד)\\s+(?:רציתי|חלמתי|ביקשתי|קיוויתי|רצה|רצתה)`),
    new RegExp(`${H}(?:הייתי|היית)\\s+(?:כל\\s+כך\\s+)?(?:רוצה|מתה|מת)${E}`),
    new RegExp(`${H}(?:משאלה|משאלות|פנטזיה|פנטזיות)\\s+(?:שלי|של\\s+ילדות|מילדות)`),
    new RegExp(`${H}חלמתי\\s+על\\s+זה\\s+(?:כשהייתי|בתור|מאז)`),
  ],
  // waking life, said outright
  life: [
    new RegExp(`${H}(?:בחיים\\s+שלי|בחיים\\s+האמיתיים|בעבודה(?:\\s+שלי)?|בבית\\s+שלי|בזוגיות|בתקופה\\s+(?:הזאת|הזו|האחרונה)|בזמן\\s+האחרון|לאחרונה|עכשיו\\s+בחיים|היום\\s+בחיים)${E}`),
    new RegExp(`${H}(?:זה\\s+)?(?:קורה|קרה|קורים)\\s+לי\\s+(?:גם\\s+)?(?:בחיים|בעבודה|עכשיו|לאחרונה|הרבה)`),
    new RegExp(`${H}(?:ככה|כך)\\s+(?:אני\\s+)?(?:מרגישה|מרגיש)\\s+(?:גם\\s+)?(?:בחיים|בעבודה|עכשיו|לאחרונה)`),
  ],
};
const en: Record<Kind, RegExp[]> = {
  association: [/\b(?:remind(?:s|ed)?\s+me|made\s+me\s+think\s+of|makes\s+me\s+think\s+of|brought\s+to\s+mind|brings\s+to\s+mind|i\s+thought\s+of|it\s+was\s+(?:just\s+)?like|i\s+associate)\b/i],
  reference: [/\b(?:the\s+)?(?:movie|film|book|novel|series|song|fairy\s+tale|painting|game)\b/i],
  memory: [/\b(?:when\s+i\s+was\s+(?:a\s+)?(?:kid|child|little|young)|my\s+childhood|as\s+a\s+(?:kid|child)|my\s+(?:mother|father|grandmother|grandfather|sister|brother))\b/i],
  wish: [/\b(?:childhood\s+dream|i\s+always\s+wanted|i\s+always\s+dreamed|i(?:'d|\s+would)\s+love\s+to|my\s+wish|a\s+wish\s+of\s+mine)\b/i],
  life: [/\b(?:in\s+my\s+life|in\s+real\s+life|at\s+work|my\s+job|these\s+days|lately|right\s+now\s+in\s+my|happens\s+to\s+me)\b/i],
};
export function herBrought(text: string): BroughtKind[] {
  const out = new Set<Kind>();
  for (const table of [he, en]) {
    for (const kind of Object.keys(table) as Kind[]) {
      for (const r of table[kind]) {
        const m = r.exec(text);
        if (!m) continue;
        const before = text.slice(0, m.index);
        if (NEG.test(before) || /\b(?:not|never|doesn't|didn't|nothing)\s+(?:\S+\s+){0,2}$/i.test(before)) continue;
        out.add(kind);
      }
    }
  }
  return [...out].sort();
}

