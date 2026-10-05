import { readFileSync } from 'node:fs';
import { readImageInfo, toDataUri } from '../server/pdf/imageInfo.ts';
import type { JournalDocument, JournalDream, JournalImage, JournalPattern } from '../server/pdf/journalTypes.ts';

/**
 * DEMO DATA ONLY. Invented dreams and the site's own artwork, used for the sample PDFs and the tests.
 * No real user's dream is ever used here.
 */

const asset = (name: string): JournalImage => {
  const bytes = new Uint8Array(readFileSync(new URL(`../public/dream-assets/${name}`, import.meta.url)));
  const info = readImageInfo(bytes);
  if (!info) throw new Error(`fixture image is not a valid image: ${name}`);
  return { dataUri: toDataUri(bytes, info.mime), width: info.width, height: info.height };
};

export function fixtureImages() {
  return {
    sea: asset('about-portal.jpg'),
    art: asset('dream-art-alt.jpg'),
    bed: asset('dream-bed-alt.jpg'),
    mirror: asset('dream-mirror-alt.jpg'),
    scene: asset('pricing-scene-explore.jpg'),
  };
}

const EN_LONG = [
  'I was standing at the bottom of a staircase that had no visible end. The steps were made of something pale and slightly warm, like sandstone, and each one was a little wider than the one before it, so that looking up felt like looking along a road.',
  'I started to climb. At first it was easy, and I counted the steps out loud, but somewhere around the two hundredth I noticed that I was no longer counting, and that the numbers had turned into the names of people I had not thought about for years. Each name arrived with a small, clear feeling: relief, embarrassment, a sudden homesickness for a room I could not place.',
  'Halfway up there was a landing with a window, and through it I could see the sea at night, very flat, with a single path of light across it. A woman was sitting on the sill with her back to me. I knew that I knew her, but I could not see her face and I did not want to turn her around. She said, without looking, that the stairs only continue while you keep walking.',
  'I tried to stop and rest, and the landing began to tilt very gently, the way a boat does, so I went on. The air got colder and cleaner. My hands were holding something small that I could not look at, and I understood that I was not supposed to put it down.',
  'Near the top the steps became narrow again, and the walls on both sides were covered with open doors, hundreds of them, each showing a different room with a lamp lit inside. Nobody was in any of the rooms. I felt, very strongly, that I was being waited for, and that nothing was wrong.',
  'I woke before I reached the end. For a few minutes I could still feel the cold of the stone under my palms and the weight of the small thing I had been carrying.',
].join('\n\n');

const HE_LONG = [
  'עמדתי בתחתית גרם מדרגות שלא נראה לו סוף. המדרגות היו עשויות ממשהו בהיר וחמים קלות, כמו אבן חול, וכל אחת הייתה רחבה מעט יותר מקודמתה, כך שהמבט כלפי מעלה הרגיש כמו מבט לאורך דרך.',
  'התחלתי לטפס. בהתחלה זה היה קל, וספרתי את המדרגות בקול, אבל איפשהו סביב המאתיים הבחנתי שאני כבר לא סופרת, ושהמספרים הפכו לשמות של אנשים שלא חשבתי עליהם שנים. כל שם הגיע עם תחושה קטנה וברורה: הקלה, מבוכה, געגוע פתאומי לחדר שלא הצלחתי למקם.',
  'באמצע הדרך הייתה פודסט עם חלון, ודרכו ראיתי את הים בלילה, שטוח מאוד, עם שביל אור יחיד על פניו. אישה ישבה על אדן החלון כשגבה אליי. ידעתי שאני מכירה אותה, אבל לא ראיתי את פניה ולא רציתי להפנות אותה אליי. היא אמרה, בלי להסתכל, שהמדרגות ממשיכות רק כל עוד ממשיכים ללכת.',
  'ניסיתי לעצור ולנוח, והפודסט התחילה להתנדנד בעדינות, כמו סירה, אז המשכתי. האוויר נעשה קר ונקי יותר. בידיי החזקתי משהו קטן שלא יכולתי להביט בו, והבנתי שאסור לי להניח אותו.',
  'קרוב לראש המדרגות הצטמצמו שוב, והקירות משני הצדדים היו מכוסים בדלתות פתוחות, מאות מהן, וכל אחת הראתה חדר אחר עם מנורה דולקת. אף אחד לא היה באף אחד מהחדרים. הרגשתי, בעוצמה רבה, שמחכים לי, ושאין שום דבר רע.',
  'התעוררתי לפני שהגעתי לסוף. עוד כמה דקות הרגשתי את קור האבן בכפות הידיים ואת משקל הדבר הקטן שנשאתי.',
].join('\n\n');

function dream(partial: Partial<JournalDream> & Pick<JournalDream, 'id' | 'createdAt' | 'language' | 'title' | 'sourceText'>): JournalDream {
  return { selectedElement: null, association: null, thread: null, question: null, image: null, ...partial };
}

export function sampleDocument(language: 'en' | 'he'): JournalDocument {
  const img = fixtureImages();
  const en = language === 'en';
  const dreams: JournalDream[] = en
    ? [
        dream({
          id: 'sample-1', createdAt: '2024-03-12T21:10:00Z', language: 'en', title: 'A Path in the Mountains', image: img.art,
          sourceText: 'I was walking on a narrow path in the mountains. The air was clear and I felt both nervous and excited. At the top there was a beautiful view, and I felt a sense of peace.',
          selectedElement: 'The path',
          association: 'It reminds me of the walks I took with my father, when the only goal was to arrive somewhere high and quiet.',
          thread: 'The climb may be holding the mix of nervousness and excitement you named, and the view at the top the calm you felt once you arrived.',
          question: 'Where in your waking life are you walking a narrow path that you are also quietly looking forward to finishing?',
        }),
        dream({
          id: 'sample-2', createdAt: '2024-04-03T07:40:00Z', language: 'en', title: 'The Stairs That Kept Going', image: img.bed,
          sourceText: EN_LONG, selectedElement: 'The woman at the window',
          association: 'She felt like someone I had lost touch with. I think I was afraid that if I saw her face I would have to say something.',
          thread: 'The dream may be circling something you keep carrying without setting it down, and a presence that tells you it only continues while you keep walking.',
          question: 'What are you carrying right now that you have decided you are not allowed to put down?',
        }),
        dream({
          id: 'sample-3', createdAt: '2024-06-20T23:05:00Z', language: 'en', title: 'The White Cat',
          sourceText: 'I saw a white cat sitting at the entrance of a house. It looked at me calmly, and when I approached, it walked inside and I followed.',
          selectedElement: 'The cat',
          question: 'What would it mean to follow something calm into a place you have not been before?',
        }),
        dream({
          id: 'sample-4', createdAt: '2024-09-02T05:15:00Z', language: 'en', title: 'The Ocean at Night', image: img.mirror,
          sourceText: 'I was standing by the ocean at night. The waves were strong but I felt calm. The moon was bright and I felt a deep connection to something larger than myself.',
          selectedElement: 'The moon', thread: 'A strong sea and a steady feeling may sit side by side here, as they sometimes do in waking life.',
        }),
        dream({
          id: 'sample-5', createdAt: '2025-01-18T06:30:00Z', language: 'en', title: 'The Open Door', image: img.scene,
          sourceText: 'A door at the end of a corridor was open, and warm light came through it. I did not go in. I just stood there and watched the light move.',
        }),
        dream({
          id: 'sample-6', createdAt: '2025-09-09T04:50:00Z', language: 'he', title: 'בית ליד הים', image: img.sea,
          sourceText: 'חלמתי על בית ישן ליד הים. החלונות היו פתוחים והווילונות נעו ברוח. ישבתי בפנים והקשבתי לגלים.',
          selectedElement: 'הווילונות',
          association: 'הם מזכירים לי את הבית של סבתא, תמיד היה שם משב רוח.',
          thread: 'ייתכן שהחלום נוגע בגעגוע למקום שבו הרגשת שקט ובטוחה.',
          question: 'איפה בחיים שלך עכשיו אפשר לפתוח חלון קטן ולתת לאוויר להיכנס?',
        }),
      ]
    : [
        dream({
          id: 'sample-1', createdAt: '2024-03-12T21:10:00Z', language: 'he', title: 'שביל בהרים', image: img.art,
          sourceText: 'הלכתי בשביל צר בהרים. האוויר היה צלול והרגשתי גם מתח וגם התרגשות. בפסגה נפתח נוף יפה, והרגשתי שלווה.',
          selectedElement: 'השביל',
          association: 'זה מזכיר לי טיולים עם אבא שלי, כשכל המטרה הייתה להגיע למקום גבוה ושקט.',
          thread: 'ייתכן שהטיפוס נושא את תערובת המתח וההתרגשות שציינת, והנוף שבפסגה את השלווה שהרגשת כשהגעת.',
          question: 'איפה בחיים שלך עכשיו את הולכת בשביל צר שאת גם מצפה בשקט לסיים?',
        }),
        dream({
          id: 'sample-2', createdAt: '2024-04-03T07:40:00Z', language: 'he', title: 'המדרגות שלא נגמרו', image: img.bed,
          sourceText: HE_LONG, selectedElement: 'האישה בחלון',
          association: 'היא הרגישה כמו מישהי שאיבדתי איתה קשר. אני חושבת שפחדתי שאם אראה את פניה אצטרך להגיד משהו.',
          thread: 'ייתכן שהחלום מתעכב סביב משהו שאת ממשיכה לשאת בלי להניח אותו, ונוכחות שאומרת לך שזה נמשך רק כל עוד את הולכת.',
          question: 'מה את נושאת עכשיו שהחלטת שאסור לך להניח?',
        }),
        dream({
          id: 'sample-3', createdAt: '2024-06-20T23:05:00Z', language: 'he', title: 'החתול הלבן',
          sourceText: 'ראיתי חתול לבן יושב בכניסה לבית. הוא הסתכל עליי ברוגע, וכשהתקרבתי הוא נכנס פנימה ואני אחריו.',
          selectedElement: 'החתול',
          question: 'מה יהיה אם תלכי אחרי משהו רגוע אל מקום שעוד לא היית בו?',
        }),
        dream({
          id: 'sample-4', createdAt: '2024-09-02T05:15:00Z', language: 'he', title: 'האוקיינוס בלילה', image: img.mirror,
          sourceText: 'עמדתי ליד האוקיינוס בלילה. הגלים היו חזקים אבל הרגשתי רגועה. הירח היה בהיר והרגשתי חיבור עמוק למשהו גדול ממני.',
          selectedElement: 'הירח', thread: 'ים חזק ותחושה יציבה עשויים לשבת כאן זה לצד זה, כמו שקורה לפעמים בחיים.',
        }),
        dream({
          id: 'sample-5', createdAt: '2025-01-18T06:30:00Z', language: 'he', title: 'הדלת הפתוחה', image: img.scene,
          sourceText: 'דלת בקצה מסדרון הייתה פתוחה, ואור חם נכנס דרכה. לא נכנסתי. רק עמדתי והסתכלתי איך האור זז.',
        }),
        dream({
          id: 'sample-6', createdAt: '2025-09-09T04:50:00Z', language: 'en', title: 'A House by the Sea', image: img.sea,
          sourceText: 'I dreamed of an old house by the sea. The windows were open and the curtains moved in the wind. I sat inside and listened to the waves.',
          selectedElement: 'The curtains',
          question: 'Where in your life right now could you open a small window and let some air in?',
        }),
      ];
  const patterns: JournalPattern[] = en
    ? [
        {
          id: 'p1', language: 'en', label: 'Water and the sea', thumbnail: img.mirror,
          whatRepeats: 'Water, shorelines and night skies appear in several of these dreams, usually with a calm that sits next to something large or strong.',
          possibleConnection: 'It may be that the sea is where you meet feelings that are bigger than you, without needing to resolve them.',
          directionToExplore: 'Notice the moments in a week when you feel calm beside something strong, and what is around you then.',
          question: 'When is it that you feel most steady while something around you is moving?',
        },
        {
          id: 'p2', language: 'en', label: 'Doors, houses and rooms', thumbnail: img.scene,
          whatRepeats: 'Open doors, lit rooms and houses by the water return, often with you standing at the threshold rather than inside.',
          possibleConnection: 'The threshold may be the place in these dreams where you are deciding whether to go further.',
          directionToExplore: 'Pay attention to where in your waking life you are standing at a doorway you are in no hurry to cross.',
          question: 'What would you want to find in the room if you went in?',
        },
      ]
    : [
        {
          id: 'p1', language: 'he', label: 'מים וים', thumbnail: img.mirror,
          whatRepeats: 'מים, חופים ושמי לילה מופיעים בכמה מהחלומות, בדרך כלל עם רוגע שיושב לצד משהו גדול או חזק.',
          possibleConnection: 'ייתכן שהים הוא המקום שבו את פוגשת רגשות גדולים ממך, בלי צורך לפתור אותם.',
          directionToExplore: 'שימי לב לרגעים בשבוע שבהם את מרגישה רגועה לצד משהו חזק, ומה סביבך אז.',
          question: 'מתי את מרגישה הכי יציבה בזמן שמשהו סביבך נע?',
        },
        {
          id: 'p2', language: 'he', label: 'דלתות, בתים וחדרים', thumbnail: img.scene,
          whatRepeats: 'דלתות פתוחות, חדרים מוארים ובתים ליד המים חוזרים, לעיתים קרובות כשאת עומדת בסף ולא בפנים.',
          possibleConnection: 'ייתכן שהסף הוא המקום בחלומות האלה שבו את מחליטה אם להמשיך הלאה.',
          directionToExplore: 'שימי לב איפה בחיים את עומדת בפתח שאין לך כל כך מהר לעבור.',
          question: 'מה היית רוצה למצוא בחדר אם היית נכנסת?',
        },
      ];
  return { language, timeZone: 'Asia/Jerusalem', dreams, patterns };
}
