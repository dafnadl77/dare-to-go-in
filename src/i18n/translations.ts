/**
 * The two complete translation resources for DARE's UI — English and
 * Hebrew. This is the ONLY place static, user-facing interface copy is
 * allowed to live; every screen reads its strings from here via
 * useLanguage()'s t() (see LanguageContext.tsx), never a scattered
 * `appLanguage === 'he' ? '...' : '...'` inline in a component.
 *
 * What does NOT live here:
 * - The dreamer's own words (typed/spoken dream text, their reflection
 *   response) — never translated, never touched.
 * - AI-generated content (dream analysis, reflection output, element
 *   labels) — these come back from the backend already in the requested
 *   language (see dreamReflectionSchema.ts / dreamElementLabelsSchema.ts,
 *   both now parameterized by language) rather than being looked up here.
 * - The DARE / DARE TO GO IN brand mark — always literally English in
 *   both languages, per product decision; never a translation key.
 *
 * `he` is typed as `Translations` (the exact shape of `en`) so a missing
 * Hebrew key is a compile error, not a silent English leak — the one
 * exception is `he-only`-shaped values are never allowed, keeping both
 * resources structurally identical.
 */

export interface Translations {
  hero: {
    dreamPrompt: string;
    myDreamsNav: string;
  };
  hold: {
    holdToTellMe: string;
    holdAria: string;
    idRatherType: string;
    listening: string;
    privacyNote: string;
    imListening: string;
    tellMeEverything: string;
    finishDream: string;
    transcribing: string;
    tellMeWhatHappened: string;
    typingPlaceholder: string;
    back: string;
    imDone: string;
    iThinkIHaveIt: string;
    letMePutItBackTogether: string;
    micErrorGeneric: string;
    micErrorStartFailed: string;
    typeInsteadHint: string;
    transcriptionFailed: string;
    cancelRecording: string;
    cancelTranscription: string;
    cancelTyping: string;
  };
  reconstruction: {
    remembering: string;
    couldntSeeAllOfIt: string;
    restart: string;
    thisIsWhatIFound: string;
    isThisHowItFelt: string;
    yesTakeMeIn: string;
    notQuite: string;
    whatDidIGetWrong: string;
    correctionPlaceholder: string;
    tryAgain: string;
  };
  reflection: {
    thisIsYourDream: string;
    chooseTheMoment: string;
    reflectionQuestionPrefix: string;
    reflectionQuestionSuffix: string;
    writingPlaceholder: string;
    continue: string;
    reflecting: string;
    couldntGatherThoughts: string;
    tryAgain: string;
    whatINotice: string;
    yourAssociation: string;
    onePossibleThread: string;
    aQuestionWorthKeeping: string;
    seeOtherLenses: string;
    hideOtherLenses: string;
    cognitive: string;
    jungian: string;
    psychodynamic: string;
  };
  closing: {
    dontLetItDisappear: string;
    keepThisDream: string;
    letItGo: string;
    theChoiceIsYours: string;
    dreamSaved: string;
    returnToTheRoom: string;
    goToMyDreamArchive: string;
    gone: string;
  };
  archive: {
    backToDare: string;
    dreamArchiveNav: string;
    comingSoon: string;
    myDreams: string;
    constellations: string;
    timeline: string;
    myDreamArchive: string;
    everyDreamLeavesATrace: string;
    moreDreamsFromThePast: string;
    openEntry: string;
  };
  dreamDetail: {
    backToArchive: string;
    detailNav: string;
    returnToTheRoom: string;
    theDream: string;
    whatStoodOut: string;
    yourAssociation: string;
    aPossibleThread: string;
    aQuestionWorthSittingWith: string;
    translating: string;
    translationUnavailable: string;
    disclaimer: string;
    comingSoon: string;
  };
  auth: {
    backToDare: string;
    keepYourDreams: string;
    createArchiveTagline: string;
    welcomeBack: string;
    continueWithGoogle: string;
    or: string;
    emailPlaceholder: string;
    passwordPlaceholder: string;
    createMyArchive: string;
    enterMyArchive: string;
    alreadyHaveArchive: string;
    signIn: string;
    newHere: string;
    createYourArchive: string;
    signingIn: string;
    creatingAccount: string;
    checkingSession: string;
    redirectingToGoogle: string;
    errorInvalidEmail: string;
    errorInvalidCredentials: string;
    errorAccountExists: string;
    errorWeakPassword: string;
    errorNetwork: string;
    errorRateLimited: string;
    errorGeneric: string;
    signedInAs: string;
    signOut: string;
    checkYourEmailTitle: string;
    checkYourEmailMessage: string;
  };
  footer: {
    designedDevelopedPrefix: string;
    dafnaName: string;
    privacyPolicy: string;
    accessibilityStatement: string;
    termsOfUse: string;
    legalNavAriaLabel: string;
  };
  languageSwitcher: {
    en: string;
    he: string;
    ariaLabel: string;
  };
  a11y: {
    controlAriaLabel: string;
    panelTitle: string;
    textSize: string;
    increaseText: string;
    decreaseText: string;
    highContrast: string;
    underlineLinks: string;
    reduceMotion: string;
    reset: string;
    close: string;
  };
}

export const en: Translations = {
  hero: {
    dreamPrompt: 'WHAT DO YOU REMEMBER FROM YOUR DREAM?',
    myDreamsNav: 'MY DREAMS',
  },
  hold: {
    holdToTellMe: 'HOLD TO TELL ME',
    holdAria: 'Hold to tell me about your dream',
    idRatherType: 'I’D RATHER TYPE',
    listening: 'LISTENING…',
    privacyNote: 'Your dream stays yours.',
    imListening: 'I’M LISTENING.',
    tellMeEverything: 'TELL ME EVERYTHING YOU REMEMBER.',
    finishDream: 'FINISH DREAM',
    transcribing: 'TRANSCRIBING…',
    tellMeWhatHappened: 'TELL ME WHAT HAPPENED.',
    typingPlaceholder: 'Start with anything you remember...',
    back: '← Back',
    imDone: 'I’M DONE',
    iThinkIHaveIt: 'I THINK I HAVE IT.',
    letMePutItBackTogether: 'LET ME PUT IT BACK TOGETHER.',
    micErrorGeneric: 'I couldn’t access your microphone.',
    micErrorStartFailed: 'I couldn’t start listening.',
    typeInsteadHint: 'Type your dream instead.',
    transcriptionFailed: 'I couldn’t transcribe that. Try again or type your dream.',
    cancelRecording: 'Cancel recording',
    cancelTranscription: 'Cancel transcription',
    cancelTyping: 'Cancel typing',
  },
  reconstruction: {
    remembering: 'REMEMBERING…',
    couldntSeeAllOfIt: 'I COULDN’T SEE ALL OF IT.',
    restart: 'RESTART',
    thisIsWhatIFound: 'THIS IS WHAT I FOUND.',
    isThisHowItFelt: 'IS THIS HOW IT FELT?',
    yesTakeMeIn: 'YES — TAKE ME IN',
    notQuite: 'NOT QUITE',
    whatDidIGetWrong: 'WHAT DID I GET WRONG?',
    correctionPlaceholder: 'Tell me what to change...',
    tryAgain: 'TRY AGAIN',
  },
  reflection: {
    thisIsYourDream: 'THIS IS YOUR DREAM',
    chooseTheMoment: 'Choose the moment that stands out to you',
    reflectionQuestionPrefix: 'WHEN YOU THINK ABOUT',
    reflectionQuestionSuffix: 'NOW —\nWHAT COMES UP?',
    writingPlaceholder: 'TYPE WHAT COMES TO MIND...',
    continue: 'CONTINUE',
    reflecting: 'REFLECTING…',
    couldntGatherThoughts: 'I COULDN’T QUITE GATHER MY THOUGHTS.',
    tryAgain: 'TRY AGAIN',
    whatINotice: 'WHAT I NOTICE',
    yourAssociation: 'YOUR ASSOCIATION',
    onePossibleThread: 'ONE POSSIBLE THREAD',
    aQuestionWorthKeeping: 'A QUESTION WORTH KEEPING',
    seeOtherLenses: 'SEE OTHER LENSES',
    hideOtherLenses: 'HIDE OTHER LENSES',
    cognitive: 'COGNITIVE',
    jungian: 'JUNGIAN',
    psychodynamic: 'PSYCHODYNAMIC',
  },
  closing: {
    dontLetItDisappear: 'DON’T LET IT DISAPPEAR.',
    keepThisDream: 'KEEP THIS\nDREAM',
    letItGo: 'LET IT GO',
    theChoiceIsYours: 'THE CHOICE IS YOURS.',
    dreamSaved: 'DREAM SAVED.',
    returnToTheRoom: 'RETURN TO THE ROOM',
    goToMyDreamArchive: 'go to my dream archive',
    gone: 'GONE.',
  },
  archive: {
    backToDare: 'Back to DARE',
    dreamArchiveNav: 'Dream Archive',
    comingSoon: 'Coming soon',
    myDreams: 'MY DREAMS',
    constellations: 'CONSTELLATIONS',
    timeline: 'TIMELINE',
    myDreamArchive: 'MY DREAM ARCHIVE',
    everyDreamLeavesATrace: 'Every dream leaves a trace.',
    moreDreamsFromThePast: 'More dreams from the past',
    openEntry: 'Open',
  },
  dreamDetail: {
    backToArchive: 'BACK TO MY DREAM ARCHIVE',
    detailNav: 'Dream detail navigation',
    returnToTheRoom: 'RETURN TO THE ROOM',
    theDream: 'The Dream',
    whatStoodOut: 'What Stood Out',
    yourAssociation: 'Your Association',
    aPossibleThread: 'A Possible Thread',
    aQuestionWorthSittingWith: 'A Question Worth Sitting With',
    translating: 'Translating…',
    translationUnavailable: 'Original entry recorded in another language — translation unavailable right now.',
    disclaimer: 'This is a reflection, not a diagnosis or a definitive interpretation.',
    comingSoon: 'The full dream memory is coming soon.',
  },
  auth: {
    backToDare: 'Back to DARE',
    keepYourDreams: 'KEEP YOUR DREAMS',
    createArchiveTagline: 'Create your private dream archive.',
    welcomeBack: 'WELCOME BACK, DREAMER.',
    continueWithGoogle: 'Continue with Google',
    or: 'OR',
    emailPlaceholder: 'Email',
    passwordPlaceholder: 'Password',
    createMyArchive: 'CREATE MY ARCHIVE',
    enterMyArchive: 'ENTER MY ARCHIVE',
    alreadyHaveArchive: 'Already have an archive?',
    signIn: 'Sign in',
    newHere: 'New here?',
    createYourArchive: 'Create your archive',
    signingIn: 'Signing in…',
    creatingAccount: 'Creating your archive…',
    checkingSession: 'One moment…',
    redirectingToGoogle: 'Connecting to Google…',
    errorInvalidEmail: 'That doesn’t look like a valid email address.',
    errorInvalidCredentials: 'That email and password don’t match. Try again, or create a new archive.',
    errorAccountExists: 'An archive already exists for that email. Try signing in instead.',
    errorWeakPassword: 'Choose a password with at least 6 characters.',
    errorNetwork: 'I couldn’t reach the server. Check your connection and try again.',
    errorRateLimited: 'Too many attempts in a short time. Please wait a few minutes and try again.',
    errorGeneric: 'Something went wrong. Please try again.',
    signedInAs: 'Signed in as',
    signOut: 'Sign out',
    checkYourEmailTitle: 'CHECK YOUR EMAIL',
    checkYourEmailMessage: 'I sent a confirmation link to {email}. Open it to finish creating your archive.',
  },
  footer: {
    designedDevelopedPrefix: 'Design, Development & Build:',
    dafnaName: 'Dafna Dalmeida',
    privacyPolicy: 'Privacy Policy',
    accessibilityStatement: 'Accessibility Statement',
    termsOfUse: 'Terms of Use',
    legalNavAriaLabel: 'Legal',
  },
  languageSwitcher: {
    en: 'EN',
    he: 'עברית',
    ariaLabel: 'Change language',
  },
  a11y: {
    controlAriaLabel: 'Accessibility settings',
    panelTitle: 'ACCESSIBILITY',
    textSize: 'Text size',
    increaseText: 'Increase',
    decreaseText: 'Decrease',
    highContrast: 'High contrast',
    underlineLinks: 'Underline links',
    reduceMotion: 'Reduce motion',
    reset: 'Reset',
    close: 'Close',
  },
};

/**
 * Hebrew copy — written for natural, elegant Hebrew, not word-for-word
 * machine translation. Kept mysterious/intimate/reflective/minimal, never
 * clinical, never childish. Deliberately gender-neutral throughout
 * (impersonal/infinitive constructions) since DARE addresses any dreamer.
 */
export const he: Translations = {
  hero: {
    dreamPrompt: 'מה זכור לך מהחלום?',
    myDreamsNav: 'החלומות שלי',
  },
  hold: {
    holdToTellMe: 'לחצו והחזיקו כדי לספר',
    holdAria: 'החזיקו כדי לספר על החלום',
    idRatherType: 'אעדיף להקליד',
    listening: 'הקשבה…',
    privacyNote: 'החלום נשאר שלך בלבד.',
    imListening: 'מקשיבים.',
    tellMeEverything: 'ספרו לי הכל, כל מה שזכור.',
    finishDream: 'סיום החלום',
    transcribing: 'מתמלל…',
    tellMeWhatHappened: 'ספרו לי מה קרה.',
    typingPlaceholder: 'התחילו מכל מה שאתם זוכרים...',
    back: '← חזרה',
    imDone: 'סיימתי',
    iThinkIHaveIt: 'נדמה שיש לי את זה.',
    letMePutItBackTogether: 'מרכיבים את זה מחדש.',
    micErrorGeneric: 'לא הצלחתי לגשת אל המיקרופון.',
    micErrorStartFailed: 'לא הצלחתי להתחיל להקשיב.',
    typeInsteadHint: 'אפשר להקליד את החלום במקום זאת.',
    transcriptionFailed: 'לא הצלחתי לתמלל את זה. נסו שוב או הקלידו את החלום.',
    cancelRecording: 'ביטול הקלטה',
    cancelTranscription: 'ביטול תמלול',
    cancelTyping: 'ביטול הקלדה',
  },
  reconstruction: {
    remembering: 'היזכרות…',
    couldntSeeAllOfIt: 'לא הצלחתי לראות את הכל.',
    restart: 'התחלה מחדש',
    thisIsWhatIFound: 'זה מה שמצאתי.',
    isThisHowItFelt: 'כך זה הרגיש?',
    yesTakeMeIn: 'כן — קחו אותי פנימה',
    notQuite: 'לא בדיוק',
    whatDidIGetWrong: 'במה טעיתי?',
    correctionPlaceholder: 'ספרו מה לשנות...',
    tryAgain: 'נסו שוב',
  },
  reflection: {
    thisIsYourDream: 'זהו החלום שלך',
    chooseTheMoment: 'בחרו את הרגע שבולט לכם',
    reflectionQuestionPrefix: 'כשחושבים על',
    reflectionQuestionSuffix: 'עכשיו —\nמה עולה?',
    writingPlaceholder: 'כתבו מה שעולה לראש...',
    continue: 'המשך',
    reflecting: 'התבוננות…',
    couldntGatherThoughts: 'המחשבות לא הסתדרו הפעם.',
    tryAgain: 'נסו שוב',
    whatINotice: 'מה שבולט',
    yourAssociation: 'האסוציאציה שלך',
    onePossibleThread: 'חוט אפשרי אחד',
    aQuestionWorthKeeping: 'שאלה שכדאי לשמור',
    seeOtherLenses: 'זוויות נוספות',
    hideOtherLenses: 'הסתרת הזוויות',
    cognitive: 'קוגניטיבי',
    jungian: 'יונגיאני',
    psychodynamic: 'פסיכודינמי',
  },
  closing: {
    dontLetItDisappear: 'אל תתנו לזה להיעלם.',
    keepThisDream: 'לשמור\nעל החלום',
    letItGo: 'שחררו אותו',
    theChoiceIsYours: 'הבחירה בידך.',
    dreamSaved: 'החלום נשמר.',
    returnToTheRoom: 'חזרה לחדר',
    goToMyDreamArchive: 'מעבר לארכיון החלומות שלי',
    gone: 'חלף.',
  },
  archive: {
    backToDare: 'חזרה ל-DARE',
    dreamArchiveNav: 'ארכיון החלומות',
    comingSoon: 'בקרוב',
    myDreams: 'החלומות שלי',
    constellations: 'מערכות כוכבים',
    timeline: 'ציר זמן',
    myDreamArchive: 'ארכיון החלומות שלי',
    everyDreamLeavesATrace: 'כל חלום משאיר עקבות.',
    moreDreamsFromThePast: 'עוד חלומות מהעבר',
    openEntry: 'פתחו',
  },
  dreamDetail: {
    backToArchive: 'חזרה לארכיון החלומות שלי',
    detailNav: 'ניווט בפרטי החלום',
    returnToTheRoom: 'חזרה לחדר',
    theDream: 'החלום',
    whatStoodOut: 'מה שבלט',
    yourAssociation: 'האסוציאציה שלך',
    aPossibleThread: 'חוט אפשרי',
    aQuestionWorthSittingWith: 'שאלה לשבת עמה',
    translating: 'מתרגם…',
    translationUnavailable: 'הרשומה המקורית נשמרה בשפה אחרת — התרגום אינו זמין כרגע.',
    disclaimer: 'זו השתקפות, לא אבחנה או פרשנות חד-משמעית.',
    comingSoon: 'זיכרון החלום המלא בדרך.',
  },
  auth: {
    backToDare: 'חזרה ל-DARE',
    keepYourDreams: 'שמרו את החלומות שלכם',
    createArchiveTagline: 'צרו את ארכיון החלומות הפרטי שלכם.',
    welcomeBack: 'ברוכים השבים, חולמים.',
    continueWithGoogle: 'המשך עם Google',
    or: 'או',
    emailPlaceholder: 'אימייל',
    passwordPlaceholder: 'סיסמה',
    createMyArchive: 'יצירת הארכיון שלי',
    enterMyArchive: 'כניסה לארכיון שלי',
    alreadyHaveArchive: 'כבר יש לך ארכיון?',
    signIn: 'התחברות',
    newHere: 'מגיעים לראשונה?',
    createYourArchive: 'יצירת ארכיון',
    signingIn: 'מתחברים…',
    creatingAccount: 'יוצרים את הארכיון שלך…',
    checkingSession: 'רגע…',
    redirectingToGoogle: 'מתחברים אל Google…',
    errorInvalidEmail: 'זו לא נראית ככתובת אימייל תקינה.',
    errorInvalidCredentials: 'האימייל והסיסמה לא תואמים. נסו שוב, או צרו ארכיון חדש.',
    errorAccountExists: 'כבר קיים ארכיון עבור האימייל הזה. נסו להתחבר במקום זאת.',
    errorWeakPassword: 'בחרו סיסמה בת 6 תווים לפחות.',
    errorNetwork: 'לא הצלחתי להגיע לשרת. בדקו את החיבור ונסו שוב.',
    errorRateLimited: 'יותר מדי ניסיונות בזמן קצר. המתינו כמה דקות ונסו שוב.',
    errorGeneric: 'משהו השתבש. נסו שוב.',
    signedInAs: 'מחוברים בתור',
    signOut: 'התנתקות',
    checkYourEmailTitle: 'בדקו את תיבת המייל',
    checkYourEmailMessage: 'נשלח קישור אישור אל {email}. פתחו אותו כדי להשלים את יצירת הארכיון.',
  },
  footer: {
    designedDevelopedPrefix: 'עיצוב, פיתוח ובנייה:',
    dafnaName: 'דפנה דלמדה',
    privacyPolicy: 'מדיניות פרטיות',
    accessibilityStatement: 'הצהרת נגישות',
    termsOfUse: 'תנאי שימוש',
    legalNavAriaLabel: 'משפטי',
  },
  languageSwitcher: {
    en: 'EN',
    he: 'עברית',
    ariaLabel: 'שינוי שפה',
  },
  a11y: {
    controlAriaLabel: 'הגדרות נגישות',
    panelTitle: 'נגישות',
    textSize: 'גודל טקסט',
    increaseText: 'הגדלה',
    decreaseText: 'הקטנה',
    highContrast: 'ניגודיות גבוהה',
    underlineLinks: 'קו תחתון לקישורים',
    reduceMotion: 'הפחתת תנועה',
    reset: 'איפוס',
    close: 'סגירה',
  },
};
