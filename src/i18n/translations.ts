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
  breadcrumb: {
    ariaLabel: string;
  };
  hero: {
    dreamPrompt: string;
    myDreamsNav: string;
    aboutNav: string;
    packagesNav: string;
  };
  hold: {
    holdToTellMe: string;
    holdAria: string;
    pressAndHoldHint: string;
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
    analysisFailed: string;
    tryAgain: string;
    editDream: string;
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
    regenFailed: string;
    regenRejected: string;
    regenLimit: string;
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
    saveFailed: string;
    saveRetry: string;
    dreamSaved: string;
    returnToTheRoom: string;
    goToMyDreamArchive: string;
    gone: string;
  };
  archive: {
    backToDare: string;
    dreamArchiveNav: string;
    pageHeading: string;
    pageSubtitle: string;
    newDream: string;
    navAllDreams: string;
    navFavorites: string;
    navInsights: string;
    navSettings: string;
    navComingSoon: string;
    openEntry: string;
    favoriteAdd: string;
    favoriteRemove: string;
    deleteDreamAria: string;
    deleteDialogTitle: string;
    deleteDialogBody: string;
    deleteCancel: string;
    deleteConfirm: string;
    deleteInProgress: string;
    deleteFailed: string;
    emptyFavoritesTitle: string;
    emptyFavoritesBody: string;
    emptyAllDreamsTitle: string;
    emptyAllDreamsBody: string;
    insightsSubtitle: string;
    insightsNotEnough: string;
    insightsEmpty: string;
    insightsAppearsInDreams: string;
    insightsOpenAria: string;
    insightsMotifGoneTitle: string;
    insightsMotifGoneBody: string;
    insightsBackToOverview: string;
    reflectionWhatRepeats: string;
    reflectionPossibleConnection: string;
    reflectionDirectionToExplore: string;
    reflectionQuestion: string;
    reflectionLoading: string;
    reflectionUnavailable: string;
    reflectionDreamCountNote: string;
    settingsSubtitle: string;
    settingsEmailLabel: string;
    settingsLanguageLabel: string;
    settingsAddressLabel: string;
    settingsAddressFeminine: string;
    settingsAddressMasculine: string;
    settingsAddressNeutral: string;
    settingsAddressError: string;
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
    freeDreamUsedNotice: string;
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
    savingYourDream: string;
    saveDreamFailedMessage: string;
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
    signupCheckEmailTitle: string;
    signupCheckEmailBody: string;
    signupCheckEmailBodyNext: string;
    signupCheckEmailSignIn: string;
    signupCheckEmailForgot: string;
    signupCheckEmailDifferent: string;
    forgotPassword: string;
    resetRequestTitle: string;
    resetRequestTagline: string;
    resetRequestSubmit: string;
    resetRequestSending: string;
    resetRequestSentMessage: string;
    backToSignIn: string;
    setNewPasswordTitle: string;
    setNewPasswordTagline: string;
    newPasswordPlaceholder: string;
    confirmPasswordPlaceholder: string;
    passwordsDontMatch: string;
    updatePasswordSubmit: string;
    updatingPassword: string;
    passwordUpdatedTitle: string;
    passwordUpdatedMessage: string;
    continueToArchive: string;
    resetLinkChecking: string;
    resetLinkInvalidTitle: string;
    resetLinkInvalidMessage: string;
    requestNewLink: string;
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
  dreamImport: {
    bannerTitleOne: string;
    bannerTitleMany: string;
    bannerBody: string;
    importButton: string;
    notNowButton: string;
    importing: string;
    importError: string;
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
  about: {
    pageTitle: string;
    pageDescription: string;
    eyebrow: string;
    headline: string;
    paragraphIntro: string;
    paragraphPractice: string;
    paragraphAi: string;
    emphasis: string;
    credit: string;
    privacyLink: string;
  };
  pricing: {
    pageTitle: string;
    pageDescription: string;
    headline: string;
    subtitle: string;
    mostPopular: string;
    freeLabel: string;
    /** "{count} Dreams" — {count} is replaced with the package's real dream count. */
    dreamsCountLabel: string;
    comingSoonNote: string;
    packages: {
      firstDream: { name: string; description: string; cta: string };
      goDeeper: { name: string; description: string; cta: string };
      explore: { name: string; description: string; cta: string };
      diveIn: { name: string; description: string; cta: string };
    };
    features: {
      fullJourney: string;
      guidedReflection: string;
      dreamImage: string;
      saveArchive: string;
      trackThemes: string;
      bilingual: string;
    };
  };
}

export const en: Translations = {
  breadcrumb: {
    ariaLabel: 'Breadcrumb',
  },
  hero: {
    dreamPrompt: 'WHAT DO YOU REMEMBER FROM YOUR DREAM?',
    myDreamsNav: 'MY DREAMS',
    aboutNav: 'ABOUT',
    packagesNav: 'PACKAGES',
  },
  hold: {
    holdToTellMe: 'HOLD TO TELL ME',
    holdAria: 'Hold to tell me about your dream',
    pressAndHoldHint: 'Press and hold while you speak',
    idRatherType: 'I’D RATHER TYPE',
    listening: 'Listening…',
    privacyNote: 'Your dream stays yours.',
    imListening: 'I’M LISTENING.',
    tellMeEverything: 'TELL ME EVERYTHING YOU REMEMBER.',
    finishDream: 'FINISH DREAM',
    transcribing: 'TRANSCRIBING…',
    tellMeWhatHappened: 'TELL ME WHAT HAPPENED.',
    typingPlaceholder: 'Start with whatever you remember.',
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
    analysisFailed: 'Something went wrong while I was putting this together.',
    tryAgain: 'TRY AGAIN',
    editDream: 'EDIT',
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
    regenFailed: 'I couldn’t create a new image this time. Your current image is still here.',
    regenRejected: 'That change couldn’t be turned into an image. Try describing it differently — your current image is still here.',
    regenLimit: 'This dream has reached its limit of new images. You can continue with the one you have.',
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
    saveFailed: "We couldn't save your dream. It's still here — you can try again.",
    saveRetry: 'Try again',
    dreamSaved: 'DREAM SAVED.',
    returnToTheRoom: 'RETURN TO THE ROOM',
    goToMyDreamArchive: 'go to my dream archive',
    gone: 'GONE.',
  },
  archive: {
    backToDare: 'Back to DARE',
    dreamArchiveNav: 'Dream Archive',
    pageHeading: 'My Dreams',
    pageSubtitle: "A space for everything you've dreamed.",
    newDream: 'New Dream',
    navAllDreams: 'All Dreams',
    navFavorites: 'Favorites',
    navInsights: 'Insights',
    navSettings: 'Settings',
    navComingSoon: 'Soon',
    openEntry: 'Open',
    favoriteAdd: 'Add to favorites',
    favoriteRemove: 'Remove from favorites',
    deleteDreamAria: 'Delete dream',
    deleteDialogTitle: 'Delete this dream?',
    deleteDialogBody: 'This action cannot be undone.',
    deleteCancel: 'Cancel',
    deleteConfirm: 'Delete',
    deleteInProgress: 'Deleting…',
    deleteFailed: "We couldn't delete this dream. Please try again.",
    emptyFavoritesTitle: 'No favorites yet',
    emptyFavoritesBody: 'Mark a dream as a favorite to see it here.',
    emptyAllDreamsTitle: 'No dreams saved yet',
    emptyAllDreamsBody: 'Your saved dreams will appear here once you keep your first one.',
    insightsSubtitle: "What keeps recurring in your dreams.",
    insightsNotEnough: 'Save a few more dreams to start seeing recurring themes here.',
    insightsEmpty: "Nothing recurring yet across your saved dreams.",
    insightsAppearsInDreams: 'Appears in {count} dreams',
    insightsOpenAria: 'Open dreams that mention',
    insightsMotifGoneTitle: "These dreams aren't available anymore",
    insightsMotifGoneBody: 'This motif no longer matches any saved dream.',
    insightsBackToOverview: '← Back to Insights',
    reflectionWhatRepeats: 'What repeats',
    reflectionPossibleConnection: 'What may connect them',
    reflectionDirectionToExplore: 'A direction worth exploring',
    reflectionQuestion: 'A question worth keeping',
    reflectionLoading: 'Looking for a thread across these dreams…',
    reflectionUnavailable: "A reflection isn't available for this pattern right now.",
    reflectionDreamCountNote: 'Based on the {n} most recent of {total} dreams.',
    settingsSubtitle: 'Your account.',
    settingsEmailLabel: 'Signed in as',
    settingsLanguageLabel: 'Language',
    settingsAddressLabel: 'How should DARE address me?',
    settingsAddressFeminine: 'Feminine',
    settingsAddressMasculine: 'Masculine',
    settingsAddressNeutral: 'Neutral',
    settingsAddressError: "Couldn't save that just now — please try again.",
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
    freeDreamUsedNotice: 'Your first dream was free. To continue with more dreams, sign in or create an account.',
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
    savingYourDream: 'Saving your dream…',
    saveDreamFailedMessage: 'I couldn’t save your dream. Your words are still safe — let’s try again.',
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
    signupCheckEmailTitle: 'CHECK YOUR EMAIL',
    signupCheckEmailBody: 'If you’re new to DARE, a link to confirm your account is on its way.',
    signupCheckEmailBodyNext: 'Already have an account? Sign in, or reset your password.',
    signupCheckEmailSignIn: 'Sign in',
    signupCheckEmailForgot: 'Forgot password',
    signupCheckEmailDifferent: 'Use a different email',
    forgotPassword: 'Forgot password?',
    resetRequestTitle: 'RESET YOUR PASSWORD',
    resetRequestTagline: 'Enter your email and I’ll send you a link to choose a new one.',
    resetRequestSubmit: 'SEND RESET LINK',
    resetRequestSending: 'Sending…',
    resetRequestSentMessage: 'If an archive exists for {email}, I’ve sent a link to reset the password.',
    backToSignIn: '← Back to sign in',
    setNewPasswordTitle: 'SET A NEW PASSWORD',
    setNewPasswordTagline: 'Choose a new password for your archive.',
    newPasswordPlaceholder: 'New password',
    confirmPasswordPlaceholder: 'Confirm new password',
    passwordsDontMatch: 'Those passwords don’t match.',
    updatePasswordSubmit: 'SET NEW PASSWORD',
    updatingPassword: 'Updating…',
    passwordUpdatedTitle: 'PASSWORD UPDATED',
    passwordUpdatedMessage: 'Your password has been changed.',
    continueToArchive: 'Continue to My Dreams',
    resetLinkChecking: 'Checking your link…',
    resetLinkInvalidTitle: 'LINK EXPIRED',
    resetLinkInvalidMessage: 'This password reset link is invalid or has expired. Request a new one below.',
    requestNewLink: 'Request a new link',
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
  dreamImport: {
    bannerTitleOne: 'Found 1 dream saved in this browser.',
    bannerTitleMany: 'Found {count} dreams saved in this browser.',
    bannerBody: 'Import it into your account? It will stay saved in this browser too — nothing is deleted.',
    importButton: 'Import',
    notNowButton: 'Not now',
    importing: 'Importing…',
    importError: "Couldn't import right now. Try again later.",
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
  about: {
    pageTitle: 'About DARE | DARE TO GO IN',
    pageDescription:
      'Discover DARE TO GO IN — a private AI-powered space for recording, exploring and reflecting on the dreams that stay with you.',
    eyebrow: 'ABOUT DARE',
    headline: 'Some dreams\nstay with us.',
    paragraphIntro: 'DARE TO GO IN is a private space for returning to the dreams that linger.',
    paragraphPractice:
      'Record what you remember.\nFollow the details that stood out.\nExplore the associations they awaken — and, over time, notice the images, people, places and patterns that keep returning.',
    paragraphAi:
      'DARE uses AI to help you reflect, not to tell you what your dreams “mean.”\nThere are no definitive interpretations here.\nNo predictions.\nNo diagnosis.\nJust possibilities, connections, and questions worth sitting with.',
    emphasis: 'Your dreams remain yours.',
    credit: 'Concept, design & development by Dafna Dalmeida.',
    privacyLink: 'Privacy Policy',
  },
  pricing: {
    pageTitle: 'Dream Packages | DARE TO GO IN',
    pageDescription:
      "Choose how many dreams you'd like to explore with DARE TO GO IN — more dreams, deeper insights, a more you.",
    headline: 'Choose Your Journey',
    subtitle: 'MORE DREAMS. DEEPER INSIGHTS. A MORE YOU.',
    mostPopular: 'Most Popular',
    freeLabel: 'Free',
    dreamsCountLabel: '{count} Dreams',
    comingSoonNote: 'Payments are coming soon — thank you for your patience.',
    packages: {
      firstDream: {
        name: 'First Dream',
        description: 'A first step into your inner world.',
        cta: 'Start for Free',
      },
      goDeeper: {
        name: 'Go Deeper',
        description: 'Three dreams. Room to notice what returns.',
        cta: 'Choose Go Deeper',
      },
      explore: {
        name: 'Explore',
        description: 'Go deeper. See more. Discover patterns.',
        cta: 'Choose Explore',
      },
      diveIn: {
        name: 'Dive In',
        description: 'For the curious, the committed, the dreamers.',
        cta: 'Choose Dive In',
      },
    },
    features: {
      fullJourney: 'A complete Dream Journey',
      guidedReflection: 'A guided reflection',
      dreamImage: 'A generated dream image',
      saveArchive: 'Saved to your Dream Archive',
      trackThemes: 'Track recurring themes',
      bilingual: 'Hebrew & English',
    },
  },
};

/**
 * Hebrew copy — written for natural, elegant Hebrew, not word-for-word
 * machine translation. Kept mysterious/intimate/reflective/minimal, never
 * clinical, never childish. Deliberately gender-neutral throughout
 * (impersonal/infinitive constructions) since DARE addresses any dreamer.
 */
export const he: Translations = {
  breadcrumb: {
    ariaLabel: 'ניווט מיקום',
  },
  hero: {
    dreamPrompt: 'מה זכור לך מהחלום?',
    myDreamsNav: 'החלומות שלי',
    aboutNav: 'אודות',
    packagesNav: 'חבילות',
  },
  hold: {
    holdToTellMe: 'לחצי והחזיקי כדי לספר',
    holdAria: 'לחצי והחזיקי כדי לספר על החלום',
    pressAndHoldHint: 'לחצי והחזיקי בזמן שאת מדברת',
    idRatherType: 'אעדיף להקליד',
    listening: 'מקשיב…',
    privacyNote: 'החלום נשאר שלך בלבד.',
    imListening: 'מקשיבים.',
    tellMeEverything: 'ספרו לי הכל, כל מה שזכור.',
    finishDream: 'סיום החלום',
    transcribing: 'מתמלל…',
    tellMeWhatHappened: 'ספרו לי מה קרה.',
    typingPlaceholder: 'התחילו מכל מה שאתם זוכרים.',
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
    analysisFailed: 'משהו השתבש בזמן שניסיתי להרכיב את זה מחדש.',
    tryAgain: 'ניסיון נוסף',
    editDream: 'עריכה',
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
    regenFailed: 'לא הצלחתי ליצור תמונה חדשה הפעם. התמונה הנוכחית עדיין כאן.',
    regenRejected: 'לא הצלחתי להפוך את השינוי הזה לתמונה. נסו לנסח אותו אחרת — התמונה הנוכחית עדיין כאן.',
    regenLimit: 'החלום הזה הגיע למגבלת התמונות החדשות. אפשר להמשיך עם התמונה הקיימת.',
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
    onePossibleThread: 'כיוון שכדאי לחקור',
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
    saveFailed: 'לא הצלחנו לשמור את החלום. הוא עדיין כאן — אפשר לנסות שוב.',
    saveRetry: 'לנסות שוב',
    dreamSaved: 'החלום נשמר.',
    returnToTheRoom: 'חזרה לחדר',
    goToMyDreamArchive: 'מעבר לארכיון החלומות שלי',
    gone: 'חלף.',
  },
  archive: {
    backToDare: 'חזרה ל-DARE',
    dreamArchiveNav: 'ארכיון החלומות',
    pageHeading: 'החלומות שלי',
    pageSubtitle: 'מרחב לכל מה שחלמת.',
    newDream: 'חלום חדש',
    navAllDreams: 'כל החלומות',
    navFavorites: 'מועדפים',
    navInsights: 'תובנות',
    navSettings: 'הגדרות',
    navComingSoon: 'בקרוב',
    openEntry: 'פתחו',
    favoriteAdd: 'הוספה למועדפים',
    favoriteRemove: 'הסרה מהמועדפים',
    deleteDreamAria: 'מחקי את החלום',
    deleteDialogTitle: 'למחוק את החלום?',
    deleteDialogBody: 'לא ניתן לבטל את הפעולה.',
    deleteCancel: 'ביטול',
    deleteConfirm: 'מחיקה',
    deleteInProgress: 'מוחק…',
    deleteFailed: 'לא הצלחנו למחוק את החלום. אפשר לנסות שוב.',
    emptyFavoritesTitle: 'אין עדיין מועדפים',
    emptyFavoritesBody: 'סמנו חלום כמועדף כדי לראות אותו כאן.',
    emptyAllDreamsTitle: 'עדיין לא נשמרו חלומות',
    emptyAllDreamsBody: 'החלומות השמורים שלכם יופיעו כאן ברגע שתשמרו את הראשון.',
    insightsSubtitle: 'מה שחוזר בחלומות שלכם.',
    insightsNotEnough: 'שמרו עוד כמה חלומות כדי לראות כאן נושאים חוזרים.',
    insightsEmpty: 'עדיין אין דבר שחוזר בין החלומות השמורים שלכם.',
    insightsAppearsInDreams: 'מופיע ב-{count} חלומות',
    insightsOpenAria: 'פתחו חלומות שמזכירים את',
    insightsMotifGoneTitle: 'החלומות האלה כבר לא זמינים',
    insightsMotifGoneBody: 'הנושא הזה כבר לא תואם אף חלום שמור.',
    insightsBackToOverview: 'חזרה לתובנות →',
    reflectionWhatRepeats: 'מה חוזר',
    reflectionPossibleConnection: 'מה עשוי לקשר ביניהם',
    reflectionDirectionToExplore: 'כיוון שכדאי לבחון',
    reflectionQuestion: 'שאלה שכדאי לשמור',
    reflectionLoading: 'מחפשים חוט מקשר בין החלומות…',
    reflectionUnavailable: 'השתקפות לא זמינה כרגע עבור הדפוס הזה.',
    reflectionDreamCountNote: 'בהתבסס על {n} מתוך {total} החלומות האחרונים.',
    settingsSubtitle: 'החשבון שלכם.',
    settingsEmailLabel: 'מחוברים בתור',
    settingsLanguageLabel: 'שפה',
    settingsAddressLabel: 'איך לפנות אליי?',
    settingsAddressFeminine: 'לשון נקבה',
    settingsAddressMasculine: 'לשון זכר',
    settingsAddressNeutral: 'ניסוח ניטרלי',
    settingsAddressError: 'השמירה נכשלה כרגע — נסו שוב.',
  },
  dreamDetail: {
    backToArchive: 'חזרה לארכיון החלומות שלי',
    detailNav: 'ניווט בפרטי החלום',
    returnToTheRoom: 'חזרה לחדר',
    theDream: 'החלום',
    whatStoodOut: 'מה שבלט',
    yourAssociation: 'האסוציאציה שלך',
    aPossibleThread: 'כיוון שכדאי לחקור',
    aQuestionWorthSittingWith: 'שאלה להתבוננות פנימה',
    translating: 'מתרגם…',
    translationUnavailable: 'הרשומה המקורית נשמרה בשפה אחרת — התרגום אינו זמין כרגע.',
    disclaimer: 'זו השתקפות, לא אבחנה או פרשנות חד-משמעית.',
    comingSoon: 'זיכרון החלום המלא בדרך.',
  },
  auth: {
    backToDare: 'חזרה ל-DARE',
    keepYourDreams: 'שמרו את החלומות שלכם',
    createArchiveTagline: 'צרו את ארכיון החלומות הפרטי שלכם.',
    freeDreamUsedNotice: 'החלום הראשון שלך היה במתנה. כדי להמשיך לחלומות נוספים, יש להתחבר או ליצור חשבון.',
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
    savingYourDream: 'שומר את החלום שלך…',
    saveDreamFailedMessage: 'לא הצלחתי לשמור את החלום. המילים שלך עדיין בטוחות — ננסה שוב.',
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
    signupCheckEmailTitle: 'בדקי את המייל שלך',
    signupCheckEmailBody: 'אם זו הפעם הראשונה שלך ב-DARE, יישלח אלייך קישור לאישור החשבון.',
    signupCheckEmailBodyNext: 'כבר יש לך חשבון? התחברי או אפסי סיסמה.',
    signupCheckEmailSignIn: 'התחברות',
    signupCheckEmailForgot: 'שכחתי סיסמה',
    signupCheckEmailDifferent: 'שימוש במייל אחר',
    forgotPassword: 'שכחת סיסמה?',
    resetRequestTitle: 'איפוס הסיסמה שלך',
    resetRequestTagline: 'הזינו את כתובת האימייל שלכם ונשלח לכם קישור לבחירת סיסמה חדשה.',
    resetRequestSubmit: 'שליחת קישור לאיפוס',
    resetRequestSending: 'שולח…',
    resetRequestSentMessage: 'אם קיים ארכיון עבור {email}, שלחנו אליו קישור לאיפוס הסיסמה.',
    backToSignIn: '← חזרה להתחברות',
    setNewPasswordTitle: 'בחירת סיסמה חדשה',
    setNewPasswordTagline: 'בחרו סיסמה חדשה לארכיון שלכם.',
    newPasswordPlaceholder: 'סיסמה חדשה',
    confirmPasswordPlaceholder: 'אימות סיסמה חדשה',
    passwordsDontMatch: 'הסיסמאות אינן תואמות.',
    updatePasswordSubmit: 'קביעת סיסמה חדשה',
    updatingPassword: 'מעדכן…',
    passwordUpdatedTitle: 'הסיסמה עודכנה',
    passwordUpdatedMessage: 'הסיסמה שלכם שונתה בהצלחה.',
    continueToArchive: 'מעבר לחלומות שלי',
    resetLinkChecking: 'בודקים את הקישור…',
    resetLinkInvalidTitle: 'הקישור פג תוקף',
    resetLinkInvalidMessage: 'קישור איפוס הסיסמה אינו תקין או שפג תוקפו. בקשו קישור חדש למטה.',
    requestNewLink: 'בקשת קישור חדש',
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
  dreamImport: {
    bannerTitleOne: 'נמצא חלום אחד שנשמר בדפדפן הזה.',
    bannerTitleMany: 'נמצאו {count} חלומות שנשמרו בדפדפן הזה.',
    bannerBody: 'לייבא אותם לחשבון שלך? הם יישארו שמורים גם בדפדפן הזה — שום דבר לא נמחק.',
    importButton: 'ייבוא',
    notNowButton: 'לא עכשיו',
    importing: 'מייבא…',
    importError: 'לא הצלחנו לייבא כרגע. נסו שוב מאוחר יותר.',
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
  about: {
    pageTitle: 'על DARE | DARE TO GO IN',
    pageDescription: 'הכירו את DARE TO GO IN — מרחב פרטי מבוסס AI לתיעוד, חקירה והתבוננות בחלומות שנשארים איתנו.',
    eyebrow: 'על DARE',
    headline: 'יש חלומות שנשארים איתנו.',
    paragraphIntro: 'DARE TO GO IN הוא מרחב פרטי לחזור אל החלומות שנשארים איתנו גם אחרי שהתעוררנו.',
    paragraphPractice:
      'כתבו או הקליטו את מה שאתם זוכרים.\nהתעכבו על הפרטים שבלטו.\nחקרו את האסוציאציות שהם מעוררים — ועם הזמן, שימו לב לדימויים, לאנשים, למקומות ולדפוסים שחוזרים שוב ושוב.',
    paragraphAi:
      'DARE משתמש ב-AI כדי לעזור לכם להתבונן בחלומות שלכם — לא כדי לקבוע מה הם "אומרים".\nאין כאן פירושים מוחלטים.\nאין תחזיות.\nאין אבחנות.\nרק אפשרויות, חיבורים ושאלות ששווה להישאר איתן קצת.',
    emphasis: 'החלומות שלכם נשארים שלכם.',
    credit: 'קונספט, עיצוב ופיתוח: דפנה דלמדה',
    privacyLink: 'מדיניות פרטיות',
  },
  pricing: {
    pageTitle: 'חבילות חלומות | DARE TO GO IN',
    pageDescription: 'בחרו כמה חלומות תרצו לחקור עם DARE TO GO IN — יותר חלומות, תובנות עמוקות יותר, הכרות עמוקה יותר עם עצמכם.',
    headline: 'בחרו את המסע שלכם',
    subtitle: 'יותר חלומות. תובנות עמוקות יותר. הכרות עמוקה יותר עם עצמכם.',
    mostPopular: 'הכי פופולרי',
    freeLabel: 'חינם',
    dreamsCountLabel: '{count} חלומות',
    comingSoonNote: 'אפשרות התשלום תהיה זמינה בקרוב — תודה על הסבלנות.',
    packages: {
      firstDream: {
        name: 'החלום הראשון',
        description: 'צעד ראשון אל העולם הפנימי שלכם.',
        cta: 'להתחיל בחינם',
      },
      goDeeper: {
        name: 'להעמיק',
        description: 'שלושה חלומות. מקום לשים לב למה שחוזר.',
        cta: 'לבחור ב״להעמיק״',
      },
      explore: {
        name: 'לחקור',
        description: 'להעמיק. לראות יותר. לגלות דפוסים.',
        cta: 'לבחור ב״לחקור״',
      },
      diveIn: {
        name: 'לצלול פנימה',
        description: 'לסקרנים, למחויבים, לחולמים.',
        cta: 'לבחור ב״לצלול פנימה״',
      },
    },
    features: {
      fullJourney: 'מסע חלום מלא',
      guidedReflection: 'התבוננות מודרכת',
      dreamImage: 'תמונת חלום ייחודית',
      saveArchive: 'שמירה בארכיון החלומות שלכם',
      trackThemes: 'מעקב אחרי דפוסים חוזרים',
      bilingual: 'עברית ואנגלית',
    },
  },
};
