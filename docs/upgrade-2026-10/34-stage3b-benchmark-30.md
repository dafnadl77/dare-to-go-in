# 34. מדד: 30 הליקויים של final-5 מול הבדיקות החדשות

נוצר אוטומטית (scripts/benchmark30.ts), בלי קריאת מודל. כל משפט נלקח מילה במילה מ-29-stage3b-eval-final-5.json, ונבדק בבדיקה שתראה אותו עכשיו, עם ההצהרה הנוחה ביותר שמודל יכול לתת (החלק הנכון בחלום, הפועל והמבצע האמיתיים, ציטוט אמיתי). "נתפס" פירושו שהבעיה עצמה מכשילה את המשפט, ולכן הוא לא יוצג כפי שהוא. אימות מילים ודקדוק אינו הוכחה לנכונות.

**נתפס: 24 · חלקית: 4 · לא נתפס: 2** (מתוך 30)

| # | שכבה | המשפט / הליקוי | תוצאה | למה |
|---|---|---|---|---|
| 1 | בחירת רגעים | רגעים כפולים על אותו משפט (אבא / חדר / לא הצלחתי להעיר) | נתפס | רגע הוא משפט של החלום; שני רגעים לא חולקים חלק (מבני, לא בדיקת ניסוח) |
| 2 | בחירת רגעים | רגעים מרכזיים חסרים (הרכבת שלא הגיעה, השיר, הלבן מול השחור, הדלתות) | נתפס | כל אחד מהם הוא עכשיו רגע משלו |
| 3 | תוויות | תוויות בגוף ראשון: חיכיתי לרכבת, אחי הקטן, לא הצלחתי להעיר | נתפס | חיכיתי לרכבת → בתחנת רכבת ריקה; אחי הקטן → האח הקטן; לא הצלחתי להעיר → לחדר שבו אבא ישן |
| 4 | שאלה | מה מזכיר הרגע שבו המפתח שניתן בדלת מתגלה כקטן מדי? | נתפס | presupposes something from another part of the dream ("שניתן") |
| 5 | שאלה | כשאחי הקטן נתן לך את המפתח למקום שעוד לא היית בו, מה היה הרגע הזה בשבילך בשיחה או בקשר ביניכם? | נתפס | too long (at most 16 words); first person in a question to the dreamer (e.g. "אחי" instead of "אחיך"); too many words that are in neither the dream nor her answers ("בשיחה", "בקשר", "ביניכם") |
| 6 | שאלה שנכתבה מראש | מה עולה כשחושבים על זה שתיארת את תחנת הרכבת כתחנת רכבת ריקה? / מה עולה כשחושבים על אבא כשהוא ישן בחדר בבית החולים... | חלקית | הראשונה: עוברת (מסורבלת, אבל כל מילה שלה מהרגע: סגנון אינו נבדק); השנייה: presupposes something from another part of the dream ("בבית"); presupposes something from another part of the dream ("החולים"). ובכל מקרה שאלות שנכתבו מראש כבר לא נשאלות. |
| 7 | שאלה מזמינה פרטים | מה ראית שנשאר במקום שבו המים היו קודם? / מה שמעת או ראית שם שגרם לך לשים לב להבדל הזה? | חלקית | השאלות נפסלות (places the moment before or after another event ("קודם"); too long (at most 16 words)), אבל לא בגלל ש"הן מזמינות פרטים". ההגנה האמיתית היא בשכבות: פרט מהתשובה לא יכול להפוך לעובדת חלום (שורות 10, 12, 15) |
| 8 | שאלה | מה נשאר פתוח או לא פתור בשבילך ברגע שבו לא הצלחת להעיר את אבא, אחרי כל מה שקרה במסדרון? | נתפס | too long (at most 16 words); places the moment before or after another event ("אחרי") |
| 9 | מה החלום מראה | המפתח הגיע בסוף הדרך אחרי הליכה משותפת לאורך החוף, והוא לא התאים לדלת. | נתפס | adds a time word the part does not have ("בסוף"); a word the dream does not have ("הדרך"); adds a time word the part does not have ("אחרי") |
| 10 | מה החלום מראה | הים התרחק והשאיר רק חול רטוב עם שלוליות קטנות, במקום שהיה מלא מים קודם. זה קרה אחרי הליכה משותפת עם אחיך לאורך החוף. | נתפס | a word the dream does not have ("והשאיר"); states the dreamer's own detail as the dream's ("חול"); states the dreamer's own detail as the dream's ("רטוב") |
| 11 | מה החלום מראה | המפתח ניתן לפני תחילת המסע לאורך החוף, ובידי אחיך היה תפקיד בפתיחת הדרך למקום חדש. | נתפס | adds a time word the part does not have ("לפני"); a word the dream does not have ("תחילת"); a word the dream does not have ("המסע") |
| 12 | מה החלום מראה | הייתה חתונה שבה כל הנוכחים לבשו לבן ורק את לבשת שחור, ובזמן הזה התנגנה מוזיקה לא מוכרת שידעת את המילים שלה. | נתפס | brings in another part of the dream ("חתונה"); a word the dream does not have ("הנוכחים"); adds a time word the part does not have ("ובזמן") |
| 13 | מה החלום מראה | אחרי כל הריצה והדלתות הנסגרות, רק בחדר של אבא היה שקט והוא לא התעורר, גם כשניסית להעיר אותו. | נתפס | adds a time word the part does not have ("אחרי"); states the dreamer's own detail as the dream's ("הריצה"); brings in another part of the dream ("והדלתות") |
| 14 | מה החלום מראה | הדלתות במסדרון נסגרות בזו אחר זו לפני שהגעת לחדר של אבא, וברגע הזה לא מתרחש שינוי – אבא ממשיך לישון. | נתפס | brings in another part of the dream ("הדלתות"); brings in another part of the dream ("במסדרון"); brings in another part of the dream ("נסגרות") |
| 15 | מה החלום מראה | בבית החולים עברת במסדרון ארוך ומאיים לפני שהגעת לחדר של אבא, וכל הזמן הזה רדפו אחריך. | נתפס | a word the dream does not have ("עברת"); states the dreamer's own detail as the dream's ("ומאיים"); adds a time word the part does not have ("לפני") |
| 16 | מה אמרת | אמרת שחשבת על חרדה ולחץ, זה הזכיר לך תקופה קשה ורצית לדעת שהוא בסדר. | נתפס | words she did not say ("שחשבת"); words she did not say ("ורצית") |
| 17 | מה אמרת | אמרת שהרגשת פחד ונעימות של חוסר אונים... | לא נתפס | כל מילה שלה (הצירוף המוזר "נעימות" בא מהסימולטור). הבודק לא יודע שצירוף אינו הגיוני |
| 18 | אפשרות | אולי כשהים נסוג ונשאר רק חול רטוב, התחושה שלך שלבד וגעגוע לאחיך מדגישה... | נתפס | broken Hebrew ("ש" glued to a word that cannot take it) |
| 19 | אפשרות | "מדגיש תחושת מאמץ" / "הדגישה את החולשה" | נתפס | a time word neither the dream nor she used ("עד"); gives her a feeling she did not name ("מאמץ"); gives her a feeling she did not name ("החולשה") |
| 20 | אפשרות | אולי עצם זה שאחיך נתן לך את המפתח מדגיש... המפתח פותח מסע, אבל גם מדגיש את הכאב על מה שחסר. | נתפס | a sentence states as fact what can only be a possibility (every sentence must be hedged); gives her a feeling she did not name ("שחסר") |
| 21 | מבט שלם (רגע אחד) | מבט ראשון שחוזר על התובנה ומוסיף "בלי תנועה" | חלקית | התוצאה: factual-summary. "בלי תנועה" נפסל כעובדה שלא בחלום; משפט שחוזר על התובנה נפסל; בלי אפשרות חדשה אין "התבוננות ראשונה". אבל "ערך מוסף" עצמו לא נמדד: אפשרות מסויגת חדשה ודלה עוברת |
| 22 | מבט שלם | שני רגעים שמופיעים אחרי דרך משותפת עם אחיך. | נתפס | states the dreamer's own detail as the dream's ("שני"); states the dreamer's own detail as the dream's ("שמופיעים"); adds a time word the part does not have ("אחרי") |
| 23 | מבט שלם | קריאה על "כולם לבשו לבן, אני לבשתי שחור" כשהרגע לא נחקר | נתפס | rests on a part of the dream that was not explored |
| 24 | מבט שלם | איך את פוגשת היום את המקומות שבהם "אין לך מקום" כמו שהרגשת בדלת? | לא נתפס | הציטוט שלה מאותו רגע, והדלת היא אותו רגע. בקריאה חוזרת, הליקוי עצמו מוטל בספק |
| 25 | מבט שלם | בחתונה, את בלבוש אחר ושרה שיר לא מוכר, זרה מתוך שמחה. | נתפס | words she did not say ("בחתונה"); words she did not say ("אחר"); words she did not say ("ושרה") |
| 26 | מבט שלם | "זרה מתוך שמחה", "תמיד", "מתחילת המסע ועד סופו" | חלקית | "תמיד" ו"מתחילת המסע ועד סופו": a sentence states as fact what can only be a possibility (every sentence must be hedged); a time word neither the dream nor she used ("תמיד"). "מתוך" במקום "בתוך" עובר (אותן מילים, משמעות אחרת) |
| 27 | מבט שלם | תחושת זרות חוזרת: בחתונה, מול הדלת, וגם מול אחיך. | נתפס | "זרות" is not in what was quoted for m1; "זרות" is not in what was quoted for m3; brings in a part of the dream it does not cite ("חוזרת") |
| 28 | מבט שלם | בחתונה הרגשת זרה אבל שייכת פנימה דרך השיר... | נתפס | brings in a part of the dream it does not cite ("בחתונה"); brings in a part of the dream it does not cite ("השיר"); states as fact what the moments do not say ("פנימה", "דרך", "התחושות", "נעות") |
| 29 | מבט שלם | קשר "המעבר לבלי מענה" על בסיס "לא יודעת" | נתפס | the second end does not rest on its own moment (or rests on "I don't know") |
| 30 | מבט שלם | הרצון לדעת שהוא בסדר פגש שקט בלתי משתנה. | נתפס | words she did not say ("הרצון"); words she did not say ("פגש"); gives her a feeling she did not name ("שקט") |
