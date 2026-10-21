# הריצה fix-dev-2: הפלט של המערכת כפי שנשמר, בלי שום עריכה

נוצר אוטומטית מתוך docs/upgrade-2026-10/33-stage3b-fix-eval-fix-dev-2.json (scripts/explorationEvalRaw.ts). כל טקסט כאן מועתק משם מילה במילה; הכותרות ושמות השדות הם של הסקריפט. התשובות של "החולמת" סינתטיות (gpt-4o-mini).

## short (קצר)

**טקסט החלום:** עמדתי בתחנת רכבת ריקה וחיכיתי. הרכבת לא הגיעה.

**חלקי החלום (כפי שהקוד חילק):** s0: עמדתי בתחנת רכבת ריקה וחיכיתי · s1: הרכבת לא הגיעה

**הרגעים שהוצעו, לפי סדר ההצעה (התווית המוצגת ← מה שמודל התוויות החזיר | הטקסט מהחלום | עדיפות):**
m1. הרכבת שלא הגיעה ← הרכבת שלא הגיעה | הרכבת לא הגיעה | 4
m2. עמידה בתחנת רכבת ריקה ← עמידה בתחנת רכבת ריקה | עמדתי בתחנת רכבת ריקה וחיכיתי | 1

### צעד 1: רגע "עמידה בתחנת רכבת ריקה"
- שאלה (נכתבה לרגע הזה; מוקד: detail; נושא: תחנת רכבת ריקה; 1667 ms): איך נראתה התחנה מסביב כשעמדת שם?
- תשובה סינתטית: התחנה הייתה שוממת, בלי אנשים או קול. רק השלטים הישנים והעודה המתמלאת באוויר היו מסביב.
- שאלת הבהרה: לא נשאלה
- התובנה שנשמרה (interpretive):
  - observation: עמדת בתחנת רכבת ריקה.
  - reflection: אמרת שהתחנה הייתה שוממת, בלי אנשים או קול, ורק שלטים ישנים ועודה מתמלאת באוויר היו מסביב.
  - possibility: ייתכן שהשקט והעדר האנשים סביבך התחברו אצלך לתחושת ריקנות או עצירה.
- זמני תגובה: תובנה 4953 ms
- מה הבודק עשה בכל משפט (checked = הוצג כפי שנכתב, quote = הוחלף בציטוט מדויק, drop = הושמט):
  - dream sentences: 0=checked
  - her sentences: 0=checked
  - possibilities: 0=refused (gives her a feeling she did not name ("לבד"); gives her a feeling she did not name ("חוסר")) | 1=passed

### מבט שלם אחרי 1 רגעים (ניסיון 1; 5795 ms; סוג: first-look)
- הודעה: זו התבוננות ראשונה, מתוך רגע אחד. רגעים נוספים יכולים להעמיק אותה.
- overview: 
- connections: []
- recurring: null
- contrast: null
- readings: basis: עמדתי בתחנת רכבת ריקה וחיכיתי | reading: אפשר לראות את העמידה בתחנה הריקה כרגע של עצירה שמבקש התבוננות, לא רק המתנה.
- closingQuestion: (אין: לא עברה את הבדיקות)
- invite: הרכבת שלא הגיעה
- מה הבודק עשה:
  - overview: o0 dream refused (no verb of the part to check the event against) | o1 user refused (repeats what was already shown) | o2 interpretation refused (rests on no sentence that passed the checks)
  - connections: —
  - recurring: —/passed; contrast: —/passed
  - readings: 0 passed
  - closing: refused (places the moment before or after another event ("אחר"); the quoted words are not hers in that moment; gives her a feeling she did not name)

קריאות כפולות שהסקריפט ניסה בכוונה והמערכת סירבה להן (בלי קריאה למודל): 2

## rich (עשיר)

**טקסט החלום:** הייתי בחתונה של חברה. כולם לבשו לבן ואני לבשתי שחור. אחי הקטן נתן לי מפתח ואמר שזה למקום שעוד לא הייתי בו. הלכנו לאורך החוף, והים התרחק ולא חזר. מישהו שר שיר שלא הכרתי, אבל ידעתי את כל המילים. כשהגענו לדלת, המפתח היה קטן מדי.

**חלקי החלום (כפי שהקוד חילק):** s0: הייתי בחתונה של חברה · s1: כולם לבשו לבן ואני לבשתי שחור · s2: אחי הקטן נתן לי מפתח ואמר שזה למקום שעוד לא הייתי בו · s3: הלכנו לאורך החוף · s4: והים התרחק ולא חזר · s5: מישהו שר שיר שלא הכרתי, אבל ידעתי את כל המילים · s6: כשהגענו לדלת, המפתח היה קטן מדי

**הרגעים שהוצעו, לפי סדר ההצעה (התווית המוצגת ← מה שמודל התוויות החזיר | הטקסט מהחלום | עדיפות):**
m1. שר שיר ← שיר מוכר שלא הכרתי | מישהו שר שיר שלא הכרתי, אבל ידעתי את כל המילים | 6
m2. האח הקטן נתן מפתח ← המפתח למקום חדש | אחי הקטן נתן לי מפתח ואמר שזה למקום שעוד לא הייתי בו | 4
m3. הליכה לאורך החוף ← הליכה לאורך החוף | הלכנו לאורך החוף, והים התרחק ולא חזר | 4
m4. המפתח קטן מדי ← המפתח קטן מדי | כשהגענו לדלת, המפתח היה קטן מדי | 2
m5. לבוש לבן ושחור ← לבוש לבן ושחור | כולם לבשו לבן ואני לבשתי שחור | 1
m6. חתונה של חברה ← חתונה של חברה | הייתי בחתונה של חברה | -1

### צעד 1: רגע "המפתח קטן מדי"
- שאלה (נכתבה לרגע הזה; מוקד: sense; נושא: המפתח; 870 ms): איך את רואה את המפתח כשאת מחזיקה אותו ליד הדלת?
- תשובה סינתטית: כשאני מחזיקה את המפתח ליד הדלת, אני מרגישה אכזבה. הוא קטן מדי, ואני לא מצליחה להיכנס למקום החדש.
- שאלת הבהרה: לא נשאלה
- התובנה שנשמרה (interpretive):
  - observation: המפתח היה קטן מדי.
  - reflection: אמרת שכשחזקת את המפתח ליד הדלת הרגשת אכזבה, כי הוא היה קטן מדי ולא הצלחת להיכנס למקום החדש.
  - possibility: ייתכן שהתחושה שהמפתח קטן מדי מתחברת אצלך לאכזבה ממגבלה שלא תלויה בך.
- זמני תגובה: תובנה 2188 ms
- מה הבודק עשה בכל משפט (checked = הוצג כפי שנכתב, quote = הוחלף בציטוט מדויק, drop = הושמט):
  - dream sentences: 0=checked
  - her sentences: 0=checked
  - possibilities: 0=refused (gives her a feeling she did not name ("שציפית"); gives her a feeling she did not name ("התאים")) | 1=passed

### צעד 2: רגע "הליכה לאורך החוף"
- שאלה (נכתבה לרגע הזה; מוקד: change; נושא: הים; 1245 ms): איך הים משתנה או נראה בזמן שהוא מתרחק כשאתן הולכות לאורך החוף?
  - מועמדת שנפסלה: מה את שומעת או מרגישה מסביב כשאת הולכת לאורך החוף עם אחיך הקטן? — presupposes something from another part of the dream ("אחיך")
- תשובה סינתטית: הים נראה מרוחק, כמו משהו שהולך לאיבוד. זה מזכיר לי משהו שקרה עם אחי פעם.
- שאלת הבהרה: מה היה המקרה עם אחיך שנזכרת בו כשחשבת על הים שמתרחק?
  - מה חסר (פנימי): מה קרה עם אחיך שגרם לך להיזכר בזה כשראית את הים מתרחק?
  - תשובה סינתטית להבהרה: אני זוכרת את הפעם שהוא עזב והרגשתי שהקשר שלנו מתרחק, בדיוק כמו הים. זה היה קשה לי.
- התובנה הראשונה (interpretive):
  - observation: הים התרחק ולא חזר. «הלכנו לאורך החוף»
  - reflection: אמרת שהים נראה מרוחק, כמו משהו שהולך לאיבוד, וזה הזכיר לך משהו שקרה עם אחיך פעם.
  - possibility: אולי אפשר לראות בריחוק של הים תחושה של התרחקות ממשהו חשוב שלא חזר.
- התובנה שנשמרה (interpretive, אחרי ההבהרה):
  - observation: הים התרחק ולא חזר. «הלכנו לאורך החוף»
  - reflection: אמרת שהים נראה מרוחק, כמו משהו שהולך לאיבוד. אמרת שזה הזכיר לך משהו שקרה עם אחיך פעם. אמרת: «אני זוכרת את הפעם שהוא עזב והרגשתי שהקשר שלנו מתרחק, בדיוק כמו הים. זה היה קשה לי.»
  - possibility: אולי את רואה בהתרחקות הים תמונה שמתחברת אצלך להתרחקות של הקשר עם אחיך.
- זמני תגובה: תובנה 2193 ms, תובנה מעודכנת 2736 ms
- מה הבודק עשה בכל משפט (checked = הוצג כפי שנכתב, quote = הוחלף בציטוט מדויק, drop = הושמט):
  - [first]
    - dream sentences: 0=quote (the dreamer did this, the sentence says someone else did) | 1=checked
    - her sentences: 0=checked
    - possibilities: 0=passed | 1=passed
  - [refreshed]
    - dream sentences: 0=quote (the dreamer did this, the sentence says someone else did) | 1=checked
    - her sentences: 0=checked | 1=checked | 2=quote (words she did not say ("שנזכרת"); words she did not say ("ביניכם"))
    - possibilities: 0=passed | 1=passed

### צעד 3: רגע "האח הקטן נתן מפתח"
- שאלה (נכתבה לרגע הזה; מוקד: feeling; נושא: המפתח; 1221 ms): מה את שומעת או מרגישה כשאחיך הקטן נותן לך את המפתח?
  - מועמדת שנפסלה: איך את רואה את המפתח שהוא נתן לך ביד שלך? — repeats a question already asked; asks again about the same thing in the same way (sense)
- תשובה סינתטית: כשאחי נותן לי את המפתח, אני מרגישה תקווה אך גם אכזבה. יש משהו שמעורר געגוע, כמו שאני מחפשת מקום חדש אבל לא מצליחה למצוא אותו.
- שאלת הבהרה: לא נשאלה
- התובנה שנשמרה (interpretive):
  - observation: «אחי הקטן נתן לי מפתח ואמר שזה למקום שעוד לא הייתי בו»
  - reflection: אמרת שכשאחיך נותן לך את המפתח הרגשת תקווה אך גם אכזבה. אמרת שיש משהו שמעורר געגוע, כמו שחיפשת מקום חדש אבל לא הצלחת למצוא אותו.
  - possibility: ייתכן שהמפתח מידי אחיך עורר בך גם תקווה וגם אכזבה בו זמנית.
- זמני תגובה: תובנה 2677 ms
- מה הבודק עשה בכל משפט (checked = הוצג כפי שנכתב, quote = הוחלף בציטוט מדויק, drop = הושמט):
  - dream sentences: 0=quote (first person in a sentence addressed to the dreamer; names a different doer; says it was done to someone else; the part says to the dreamer)
  - her sentences: 0=checked | 1=checked
  - possibilities: 0=refused (a time word neither the dream nor she used ("אחרי")) | 1=passed

### צעד 4: רגע "לבוש לבן ושחור"
- שאלה (נכתבה לרגע הזה; מוקד: detail; נושא: בגדים; 1211 ms): איזה פרטים את שמה לב אליהם בבגדים הלבנים של כולם ושלך השחור?
- תשובה סינתטית: שאלו אותי על איך שאני נראית, כולם בגדים לבנים ואני בשחור. זה הרגיש לי לא שייך, כאילו אני בודדה בין כולם.
- שאלת הבהרה: לא נשאלה
- התובנה שנשמרה (interpretive):
  - observation: כולם לבשו לבן.
  - reflection: אמרת שזו הרגשה של לא שייכת, כאילו היית בודדה בין כולם.
  - possibility: אולי את רואה את ההבדל בין הבגדים שלך לשל אחרים כתמונה של תחושת בדידות.
- זמני תגובה: תובנה 2315 ms
- מה הבודק עשה בכל משפט (checked = הוצג כפי שנכתב, quote = הוחלף בציטוט מדויק, drop = הושמט):
  - dream sentences: 0=checked | 1=quote (the dreamer did this, the sentence says someone else did)
  - her sentences: 0=checked
  - possibilities: 0=passed | 1=refused (gives her a feeling she did not name ("זרות"))

### מבט שלם אחרי 2 רגעים (ניסיון 1; 4560 ms; סוג: whole)
- overview: 
- connections: [m4→m3] אכזבה ומרחק | «אני מרגישה אכזבה. הוא קטן מדי, ואני לא מצליחה להיכנס למקום החדש.» · «אני זוכרת את הפעם שהוא עזב והרגשתי שהקשר שלנו מתרחק, בדיוק כמו הים. זה היה קשה לי.» — ייתכן ששני הרגעים עוסקים בתחושת אובדן או החמצה, כל אחד בדרך אחרת.
- recurring: null
- contrast: null
- readings: basis: הלכנו לאורך החוף | reading: ייתכן שהים המתרחק משקף משהו מתרחק בחיים שלך, לאו דווקא בקשר עם אחיך.
- closingQuestion: כשאת חושבת על הדלת והמפתח הקטן מדי, איזה מקום חדש היית רוצה להיכנס אליו בחיים שלך?
- invite: שר שיר, האח הקטן נתן מפתח, לבוש לבן ושחור, חתונה של חברה
- מה הבודק עשה:
  - overview: o0 dream refused (states the dreamer's own detail as the dream's ("ליד"); states the dreamer's own detail as the dream's ("הצלחת"); states the dreamer's own detail as the dream's ("להיכנס"); states the dreamer's own detail as the dream's ("למקום"); states the dreamer's own detail as the dream's ("החדש"); adds a negation; no verb of the part to check the event against) | o1 user refused (repeats what was already shown) | o2 dream refused (states the dreamer's own detail as the dream's ("הים"); states the dreamer's own detail as the dream's ("התרחק"); a word the dream does not have ("חזר"); adds a time word the part does not have ("בזמן"); adds a negation; no verb of the part to check the event against) | o3 user refused (repeats what was already shown) | o4 interpretation refused (rests on no sentence that passed the checks)
  - connections: 0 passed
  - recurring: —/passed; contrast: refused ("ברגע" is not in the two moments; "חוסר" is not in the two moments; "יכולת" is not in the two moments; "וברגע" is not in the two moments; "אחר" is not in the two moments; "דיברת" is not in the two moments; "כאב" is not in the two moments)
  - readings: 0 refused (gives her a feeling she did not name ("חסר")) | 1 passed
  - closing: passed

### מבט שלם אחרי 4 רגעים (ניסיון 1; 7757 ms; סוג: whole)
- overview: 
- connections: [m2→m4] האח הקטן נתן מפתח · המפתח קטן מדי | «אני מרגישה תקווה אך גם אכזבה. יש משהו שמעורר געגוע, כמו שאני מחפשת מקום חדש אבל לא מצליחה למצוא אותו.» · «אני מרגישה אכזבה. הוא קטן מדי, ואני לא מצליחה להיכנס למקום החדש.» — ייתכן שאכזבתך מהמפתח קשורה לאכזבה כללית יותר שלך ממגבלות או מהיעדר אפשרות להגיע למקום חדש. ;; [m5→m2] בדידות וגעגוע למקום חדש | «זה הרגיש לי לא שייך, כאילו אני בודדה בין כולם.» · «יש משהו שמעורר געגוע, כמו שאני מחפשת מקום חדש אבל לא מצליחה למצוא אותו.» — אולי תחושת הבדידות קשורה גם לגעגוע שלך למקום חדש או להשתייכות אחרת.
- recurring: null
- contrast: null
- readings: basis: הלכנו לאורך החוף | reading: אפשר לראות את ההתרחקות של הים כרמז לריחוק במערכות יחסים קרובות. ;; basis: כולם לבשו לבן ואני לבשתי שחור | reading: ייתכן שהבחירה ללבוש שחור בין כולם בלבן קשורה לרצון לבדל את עצמך או להרגיש ייחודית.
- closingQuestion: כשאת חושבת על הגעגוע למקום חדש והתחושה של לא שייכת, מה עולה בך לגבי מקומך היום?
- invite: שר שיר, חתונה של חברה
- מה הבודק עשה:
  - overview: o0 dream refused (states the dreamer's own detail as the dream's ("ליד"); states the dreamer's own detail as the dream's ("להיכנס"); states the dreamer's own detail as the dream's ("למקום"); states the dreamer's own detail as the dream's ("החדש"); adds a negation; no verb of the part to check the event against) | o1 user refused (repeats what was already shown) | o2 dream refused (states the dreamer's own detail as the dream's ("אחיך"); no verb of the part to check the event against) | o3 user refused (repeats what was already shown) | o4 dream refused (names a different doer; says it was done to someone else; the part says to the dreamer) | o5 user refused (repeats what was already shown)
  - connections: 0 passed | 1 refused (a time word neither the dream nor she used ("אחר")) | 2 passed
  - recurring: refused ("חוזרת" is not in the moments it names; "מול" is not in the moments it names; "ברגע" is not in the moments it names; "קבלת" is not in the moments it names); contrast: refused ("תחושת" is not in the two moments; "וגעגוע" is not in the two moments; "תחושת" is not in the two moments; "וחוסר" is not in the two moments)
  - readings: 0 passed | 1 passed
  - closing: passed

קריאות כפולות שהסקריפט ניסה בכוונה והמערכת סירבה להן (בלי קריאה למודל): 8

## sensitive (רגיש)

**טקסט החלום:** רדפו אחריי במסדרון ארוך בבית חולים. הדלתות נסגרו אחת אחרי השנייה. בסוף הגעתי לחדר שבו אבא שלי ישן במיטה, ולא הצלחתי להעיר אותו.

**חלקי החלום (כפי שהקוד חילק):** s0: רדפו אחריי במסדרון ארוך בבית חולים · s1: הדלתות נסגרו אחת אחרי השנייה · s2: בסוף הגעתי לחדר שבו אבא שלי ישן במיטה, ולא הצלחתי להעיר אותו

**הרגעים שהוצעו, לפי סדר ההצעה (התווית המוצגת ← מה שמודל התוויות החזיר | הטקסט מהחלום | עדיפות):**
m1. לחדר שבו אבא ישן ← הגעתי לחדר של אבא | בסוף הגעתי לחדר שבו אבא שלי ישן במיטה, ולא הצלחתי להעיר אותו | 4
m2. רדיפה במסדרון ארוך ← רדיפה במסדרון ארוך | רדפו אחריי במסדרון ארוך בבית חולים | 1
m3. הדלתות נסגרו ← סגירת דלתות רצופה | הדלתות נסגרו אחת אחרי השנייה | 1

### צעד 1: רגע "הדלתות נסגרו"
- שאלה (נכתבה לרגע הזה; מוקד: detail; נושא: הדלתות; 1282 ms): איזה מראה של אחת הדלתות שניסגרו זכור לך במיוחד?
- תשובה סינתטית: לא יודעת.
- שאלה אחרת אחרי "לא יודעת" (נכתבה עכשיו; מוקד: sense; 1543 ms): שמעת קול כשהדלתות נסגרו?
- תשובה סינתטית: לא, לא שמעתי קול. היה שקט ומבולבל, רק רציתי להגיע לאבא שלי.
- שאלת הבהרה: לא נשאלה
- התובנה שנשמרה (interpretive):
  - observation: הדלתות נסגרו אחת אחרי השנייה.
  - reflection: אמרת שלא שמעת קול כשהדלתות נסגרו, והיה שקט ומבולבל, ורק רצית להגיע לאבא שלך.
  - possibility: אולי אפשר לראות בסגירת הדלתות רצף של מחסומים שמופיעים בזה אחר זה.
- זמני תגובה: תובנה 2668 ms
- מה הבודק עשה בכל משפט (checked = הוצג כפי שנכתב, quote = הוחלף בציטוט מדויק, drop = הושמט):
  - dream sentences: 0=checked
  - her sentences: 0=checked
  - possibilities: 0=passed | 1=passed

### צעד 2: רגע "לחדר שבו אבא ישן"
- שאלה (נכתבה לרגע הזה; מוקד: figure; נושא: אבא שלך; 1031 ms): איך נראה אבא שלך כשהוא שוכב במיטה בחדר הזה?
- תשובה סינתטית: אבא שלי נראה שקט ורדום, עם פנים שלוות. זה היה קשה לראות אותו ככה, במצב כזה.
- שאלת הבהרה: לא נשאלה
- התובנה שנשמרה (interpretive):
  - observation: הגעת לחדר שבו אבא שלך ישן במיטה.
  - reflection: אמרת שאבא שלך נראה שקט ורדום, עם פנים שלוות, ושהיה קשה לראות אותו ככה, במצב כזה.
  - possibility: אפשר לראות באי היכולת להעיר אותו קושי ליצור קשר עם מישהו שחשוב לך, במיוחד כשהוא נראה שליו.
- זמני תגובה: תובנה 2153 ms
- מה הבודק עשה בכל משפט (checked = הוצג כפי שנכתב, quote = הוחלף בציטוט מדויק, drop = הושמט):
  - dream sentences: 0=checked | 1=quote (names a different doer) | 2=quote (no verb of the part to check the event against)
  - her sentences: 0=checked
  - possibilities: 0=refused (gives her a feeling she did not name ("חוסר")) | 1=passed

### צעד 3: רגע "רדיפה במסדרון ארוך"
- שאלה (נכתבה לרגע הזה; מוקד: detail; נושא: המסדרון הארוך; 1072 ms): איך נראה המסדרון הארוך שרדפו אחריך בו?
- תשובה סינתטית: המסדרון היה צר וארוך, עם אור עמום. היו בו דלתות סגורות שהיו סוגרות אחת אחרי השנייה, וזה גרם לי להרגיש כל כך לחוץ.
- שאלת הבהרה: לא נשאלה
- התובנה שנשמרה (interpretive):
  - observation: רדפו אחריך במסדרון ארוך בבית חולים.
  - reflection: אמרת שהמסדרון היה צר וארוך, עם אור עמום, ובו דלתות סגורות שהיו סוגרות אחת אחרי השנייה, וזה גרם לך להרגיש כל כך לחוץ.
  - possibility: אולי אפשר לראות ברדיפה במסדרון תחושה של רדיפה או לחץ בסביבה לא מוכרת או מאיימת.
- זמני תגובה: תובנה 2628 ms
- מה הבודק עשה בכל משפט (checked = הוצג כפי שנכתב, quote = הוחלף בציטוט מדויק, drop = הושמט):
  - dream sentences: 0=checked
  - her sentences: 0=checked
  - possibilities: 0=passed | 1=passed

### מבט שלם אחרי 3 רגעים (ניסיון 1; 6769 ms; סוג: whole)
- overview: 
- connections: [m2→m3] לחץ וסגירה במסדרון | «זה גרם לי להרגיש כל כך לחוץ.» · «היה שקט ומבולבל, רק רציתי להגיע לאבא שלי.» — אולי הלחץ במסדרון והשקט המבולבל בסגירת הדלתות קשורים לאותו מסע לעבר משהו חשוב.
- recurring: null
- contrast: null
- readings: basis: הדלתות נסגרו אחת אחרי השנייה | reading: ייתכן שסגירת הדלתות אחת אחרי השנייה מבטאת תהליך שבו אפשרויות נסגרות או נחסמות בדרך למטרה.
- closingQuestion: אילו רגעים בחיים שלך מזכירים את התחושה של רצון עז להגיע למישהו, ותחושת מחסום בדרך?
- invite: —
- מה הבודק עשה:
  - overview: o0 dream refused (a word the dream does not have ("בבית"); a word the dream does not have ("החולים"); no verb of the part to check the event against) | o1 user refused (repeats what was already shown) | o2 dream refused (no verb of the part to check the event against) | o3 user refused (repeats what was already shown) | o4 dream refused (no verb of the part to check the event against) | o5 user refused (repeats what was already shown)
  - connections: 0 passed | 1 refused (gives her a feeling she did not name ("חיפוש"))
  - recurring: refused ("קושי" is not in what was quoted for m1; "קושי" is not in what was quoted for m2; "הופיע" is not in the moments it names; "בדרך" is not in the moments it names; "בתחושת" is not in the moments it names; "חוסר" is not in the moments it names; "האונים" is not in the moments it names; "מול" is not in the moments it names); contrast: refused ("ובחדר" is not in the two moments; "קשה" is not in the two moments)
  - readings: 0 passed | 1 refused (gives her a feeling she did not name ("ובטוח"))
  - closing: passed

קריאות כפולות שהסקריפט ניסה בכוונה והמערכת סירבה להן (בלי קריאה למודל): 7

## עלות, קריאות, ניסיונות כתיבה מחדש וזמנים (נמדד)

| שלב | קריאות שהמשתמשת מחכה להן | תשובות מהמודל | כתיבות מחדש | חציון המתנה | מקסימום | עלות |
|---|---|---|---|---|---|---|
| analysis | — | 4 | — | — | — | $0.0037 |
| labels | — | 3 | — | — | — | $0.0005 |
| moment-question | 8 | 8 | 0 | 1216 ms | 1667 ms | $0.0326 |
| simulated-dreamer | — | 10 | — | — | — | $0.0005 |
| moment-reply | 8 | 9 | 1 | 2472 ms | 4953 ms | $0.0546 |
| whole-view | 4 | 5 | 1 | 6282 ms | 7757 ms | $0.0659 |
| moment-reply-refresh | 1 | 1 | 0 | 2736 ms | 2736 ms | $0.0064 |
| moment-question-alt | 1 | 1 | 0 | 1543 ms | 1543 ms | $0.0037 |

**סך הכול בריצה:** $0.1679 (41 תשובות מהמודל). מתוך זה הסימולטור: $0.0005.
**לפי מסע:** short: $0.0327 · rich: $0.0011 · sensitive: $0.0810 · #3: $0.0532
