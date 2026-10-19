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
    faqNav: string;
    faqNavAria: string;
    packagesNav: string;
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
    micDenied: string;
    micNoDevice: string;
    writeYourDream: string;
    writeSomethingFirst: string;
    liveWordsUnavailable: string;
    liveWordsKept: string;
    micRecheck: string;
    transcriptionRateLimited: string;
    micBusy: string;
    micInsecure: string;
    micUnsupported: string;
    micFormat: string;
    micTimeout: string;
    transcriptionTooLarge: string;
    transcriptionNetwork: string;
    transcriptionTimeout: string;
    retryTranscription: string;
    typeInsteadHint: string;
    transcriptionFailed: string;
    transcriptionFreeDreamUsed: string;
    transcriptionSessionExpired: string;
    transcriptionCreditsRequired: string;
    transcriptionSignInRequired: string;
    cancelRecording: string;
    cancelTranscription: string;
    cancelTyping: string;
    analysisFailed: string;
    analysisUncertain: string;
    tryAgain: string;
    editDream: string;
  };
  leaveDream: {
    title: string;
    body: string;
    stay: string;
    leave: string;
  };
  reconstruction: {
    remembering: string;
    couldntSeeAllOfIt: string;
    restart: string;
    thisIsWhatIFound: string;
    yesTakeMeIn: string;
    notQuite: string;
    whatDidIGetWrong: string;
    correctionPlaceholder: string;
    tryAgain: string;
    regenFailed: string;
    regenRejected: string;
    regenLimit: string;
    imageFailedRetry: string;
    imageRejected: string;
    imageExhausted: string;
    rephrase: string;
    howToDescribeDifferently: string;
  };
  reflection: {
    momentQuestion: string;
    momentHint: string;
    chosenMoment: string;
    /** The optional "which feeling stayed with you?" step. */
    emotionsTitle: string;
    emotionsDescription: string;
    emotionsContinue: string;
    emotionsSkip: string;
    /** The optional second question about the chosen moment: the way to skip it. */
    linkSkip: string;
    /** Label of the optional existential perspective inside the other perspectives. */
    existential: string;
    /** "{count}" is replaced with how many feelings are chosen so far (the limit is shown in the text). */
    emotionsCount: string;
    emotionsGroupAria: string;
    /** Labels of the interpretation's feelings node and its closing one-line summary. */
    theFeelingsYouNamed: string;
    inShort: string;
    emotions: {
      fear: string;
      joy: string;
      calm: string;
      love: string;
      longing: string;
      confusion: string;
      anger: string;
      sadness: string;
      wonder: string;
      freedom: string;
      helplessness: string;
      excitement: string;
    };
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
    jungianInfoAria: string;
    jungianInfo: string;
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
    loading: string;
    loadErrorTitle: string;
    loadErrorBody: string;
    loadRetry: string;
    settingsDeleteHeading: string;
    settingsDeleteBody: string;
    settingsDeleteButton: string;
    deleteAccountTitle: string;
    deleteAccountBody: string;
    deleteAccountTypePrompt: string;
    deleteAccountInputLabel: string;
    deleteAccountConfirm: string;
    deleteAccountFailed: string;
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
    greeting: string;
    greetingNoName: string;
    settingsNameLabel: string;
    settingsNameEmpty: string;
    settingsNameAdd: string;
    settingsNameEdit: string;
    settingsNameSave: string;
    settingsNameCancel: string;
    settingsNameError: string;
    settingsEmailLabel: string;
    settingsPlanLabel: string;
    settingsPlanSeveral: string;
    settingsFreeDreamLabel: string;
    settingsFreeDreamAvailable: string;
    settingsFreeDreamUsed: string;
    settingsAccountTypeLabel: string;
    settingsOwnerValue: string;
    settingsDreamsLabel: string;
    settingsDreamsUnlimited: string;
    purchasesTitle: string;
    purchasesIntro: string;
    purchasesLanguage: string;
    purchasesLoading: string;
    purchasesError: string;
    purchasesEmpty: string;
    purchasesRef: string;
    purchasesCredits: string;
    purchasesNoAccount: string;
    purchasesCopy: string;
    purchasesCopied: string;
    purchasesCopyFailed: string;
    purchasesMail: string;
    unlimitedTitle: string;
    unlimitedIntro: string;
    unlimitedEmailLabel: string;
    unlimitedEmailPlaceholder: string;
    unlimitedGrantButton: string;
    unlimitedGranting: string;
    unlimitedGranted: string;
    unlimitedAlready: string;
    unlimitedOwnerAccount: string;
    unlimitedNotRegistered: string;
    unlimitedInvalid: string;
    unlimitedError: string;
    unlimitedForbidden: string;
    unlimitedListTitle: string;
    unlimitedListLoading: string;
    unlimitedListError: string;
    unlimitedListEmpty: string;
    unlimitedColEmail: string;
    unlimitedColDate: string;
    unlimitedRevoke: string;
    unlimitedRevokeConfirm: string;
    unlimitedRevokeKeep: string;
    unlimitedRevokeNote: string;
    unlimitedRevoked: string;
    unlimitedRevokeMissing: string;
    settingsDreamsPurchasedLabel: string;
    settingsDreamsRemainingLabel: string;
    balanceLoading: string;
    balanceError: string;
    balanceRetry: string;
    balanceOwner: string;
    balanceRemaining: string;
    balanceOne: string;
    balanceAcross: string;
    balanceOneAcross: string;
    balanceAcrossOf: string;
    balanceOneAcrossOf: string;
    balanceAcrossFreeOf: string;
    balanceFreeAvailable: string;
    balanceNone: string;
    balanceFreeUsed: string;
    balanceFreeNone: string;
    balanceBuyMore: string;
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
    /** The feelings the dreamer named, and the dream's one-line summary (both only when the dream has them). */
    yourFeelings: string;
    inShort: string;
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
    startDreamTagline: string;
    startDreamSigninTagline: string;
    freeDreamUsedNotice: string;
    sessionExpiredNotice: string;
    welcomeBack: string;
    continueWithGoogle: string;
    or: string;
    namePlaceholder: string;
    errorNameRequired: string;
    ageConfirm: string;
    errorAgeRequired: string;
    legalNoticeSignup: string;
    legalNoticeSignin: string;
    legalTermsLink: string;
    legalPrivacyLink: string;
    legalClose: string;
    errorInvalidName: string;
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
  /** The short explanation on the opening screen and the "how it works" section under it. */
  howItWorks: {
    tagline: string;
    trigger: string;
    triggerAria: string;
    eyebrow: string;
    title: string;
    intro: string;
    stepsAria: string;
    steps: { title: string; text: string }[];
    note: string;
    start: string;
    faq: string;
    close: string;
    panelAria: string;
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
    creditsRequiredNotice: string;
    ownerUnlimitedNotice: string;
    yourPackageRemaining: string;
    yourPackageRemainingOne: string;
    /** "{count} Dreams" — {count} is replaced with the package's real dream count. */
    dreamsCountLabel: string;
    vatIncluded: string;
    infoTitle: string;
    infoOneTime: string;
    infoVat: string;
    infoNoExpiry: string;
    infoCredit: string;
    infoPayment: string;
    infoInvoice: string;
    infoRefunds: string;
    infoDeletion: string;
    linksLabel: string;
    linkTerms: string;
    linkPrivacy: string;
    linkCancellation: string;
    /** The free tier's display name, shown as the account's package when it has never purchased one. */
    planFree: string;
    /** Marks the package card the signed-in account holds. */
    yourPackage: string;
    yourLatestPackage: string;
    checkout: {
      title: string;
      intro: string;
      fullName: string;
      fullNameHint: string;
      phone: string;
      phoneHint: string;
      privacy: string;
      privacyLink: string;
      privacyClose: string;
      vatIncluded: string;
      termsTitle: string;
      termsOneTime: string;
      termsVat: string;
      termsNoExpiry: string;
      termsInvoice: string;
      docsLead: string;
      linkTerms: string;
      linkPrivacy: string;
      linkCancellation: string;
      consent: string;
      errConsent: string;
      operator: string;
      cancel: string;
      submit: string;
      preparing: string;
      redirecting: string;
      errName: string;
      errPhone: string;
      errSession: string;
      errRate: string;
      errUnavailable: string;
    };
    paymentReturn: {
      title: string;
      confirming: string;
      confirmingNote: string;
      slow: string;
      checkFailed: string;
      confirmed: string;
      startDreaming: string;
      unknown: string;
      reference: string;
      signIn: string;
      signInButton: string;
      close: string;
    };
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
    faqNav: 'FAQ',
    faqNavAria: 'Questions and answers',
    packagesNav: 'PACKAGES',
  },
  hold: {
    holdToTellMe: 'HOLD TO TELL ME',
    holdAria: 'Hold to tell me about your dream',
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
    micDenied: 'Microphone access is blocked. Click the lock icon (or “Site settings”) in the address bar, allow the microphone, then try again.',
    micNoDevice: 'We couldn’t find a microphone on this device. You can tell us your dream by writing it.',
    writeYourDream: 'Write your dream',
    writeSomethingFirst: 'Write a few words about your dream to continue.',
    liveWordsUnavailable: 'Recording in progress. Your words will appear when you finish.',
    liveWordsKept: 'I couldn’t finish the accurate transcript, so I kept the words I caught while you spoke. Please check them.',
    micRecheck: 'I connected a microphone — check again',
    transcriptionRateLimited: 'You’ve sent a lot of recordings in a short time. Please wait a minute and try again, or write your dream.',
    micBusy: 'The microphone is in use by another app or isn’t available right now.',
    micInsecure: 'Voice recording only works on a secure (https) page.',
    micUnsupported: 'This browser doesn’t support voice recording.',
    micFormat: 'This browser can’t record in a format I can use.',
    micTimeout: 'The microphone permission wasn’t answered in time. Allow it in the browser prompt and try again.',
    transcriptionTooLarge: 'The recording is too long to send. Try a shorter one, or type your dream.',
    transcriptionNetwork: 'The recording didn’t reach me — check your connection. You can try again, or type your dream.',
    transcriptionTimeout: 'The transcription took too long. You can try again, or type your dream.',
    retryTranscription: 'Try again',
    typeInsteadHint: 'Type your dream instead.',
    transcriptionFailed: 'I couldn’t transcribe that. Try again or type your dream.',
    transcriptionFreeDreamUsed: 'Your free dream has been used. You can keep typing here, and sign in or create an account to continue.',
    transcriptionSessionExpired: 'Your sign-in has ended. You can keep typing here and sign in again to continue.',
    transcriptionCreditsRequired: 'You have no dreams left in your package. You can keep typing here, and choose a package to continue.',
    transcriptionSignInRequired: 'Please sign in or create an account to start a dream. Your words stay here.',
    cancelRecording: 'Cancel recording',
    cancelTranscription: 'Cancel transcription',
    cancelTyping: 'Cancel typing',
    analysisFailed: 'Something went wrong while I was putting this together.',
    analysisUncertain: 'I didn’t get an answer in time. Trying again won’t charge you twice.',
    tryAgain: 'TRY AGAIN',
    editDream: 'EDIT',
  },
  leaveDream: {
    title: 'Leave this dream?',
    body: 'This dream hasn’t been saved yet. If you leave now, it will be lost, along with its image and reflection.',
    stay: 'Stay',
    leave: 'Leave without saving',
  },
  reconstruction: {
    remembering: 'REMEMBERING…',
    couldntSeeAllOfIt: 'I COULDN’T SEE ALL OF IT.',
    restart: 'RESTART',
    thisIsWhatIFound: 'IS THIS HOW YOUR DREAM LOOKED?',
    yesTakeMeIn: 'TAKE ME INSIDE',
    notQuite: 'NOT QUITE',
    whatDidIGetWrong: 'WHAT DID I GET WRONG?',
    correctionPlaceholder: 'Tell me what to change...',
    tryAgain: 'TRY AGAIN',
    regenFailed: 'I couldn’t create a new image this time. Your current image is still here.',
    regenRejected: 'That change couldn’t be turned into an image. Try describing it differently — your current image is still here.',
    regenLimit: 'This dream has reached its limit of new images. You can continue with the one you have.',
    imageFailedRetry: 'I couldn’t create the image this time. Your dream is still here. Try again.',
    imageRejected: 'This image couldn’t be created as described. You can describe it a little differently.',
    imageExhausted: 'This dream has used all of its image attempts. You can start again with a new dream.',
    rephrase: 'REPHRASE',
    howToDescribeDifferently: 'HOW SHOULD I DESCRIBE IT DIFFERENTLY?',
  },
  reflection: {
    momentQuestion: 'Which moment in the dream stayed with you most?',
    momentHint: 'Choose one moment that especially caught your attention.',
    chosenMoment: 'The moment you chose',
    emotionsTitle: 'What feelings stayed with you after the dream?',
    emotionsDescription: 'Sometimes feelings reveal what words cannot. Choose up to three feelings that stayed with you.',
    emotionsContinue: 'DISCOVER WHAT YOUR DREAM REVEALS',
    emotionsSkip: 'Not sure what you felt? You can continue',
    linkSkip: 'You can skip this question',
    existential: 'AN EXISTENTIAL ANGLE',
    emotionsCount: '{count} of 3 chosen',
    emotionsGroupAria: 'Feelings from the dream, choose up to three',
    theFeelingsYouNamed: 'THE FEELINGS YOU NAMED',
    inShort: 'IN SHORT',
    emotions: {
      fear: 'Fear',
      joy: 'Joy',
      calm: 'Calm',
      love: 'Love',
      longing: 'Longing',
      confusion: 'Confusion',
      anger: 'Anger',
      sadness: 'Sadness',
      wonder: 'Wonder',
      freedom: 'Freedom',
      helplessness: 'Helplessness',
      excitement: 'Excitement',
    },
    reflectionQuestionPrefix: 'WHEN YOU THINK ABOUT',
    reflectionQuestionSuffix: 'NOW —\nWHAT COMES UP?',
    writingPlaceholder: 'Write whatever comes to mind...',
    continue: 'CONTINUE',
    reflecting: 'REFLECTING…',
    couldntGatherThoughts: 'I COULDN’T QUITE GATHER MY THOUGHTS.',
    tryAgain: 'TRY AGAIN',
    whatINotice: 'WHAT I NOTICE',
    yourAssociation: 'YOUR ASSOCIATION',
    onePossibleThread: 'ONE POSSIBLE THREAD',
    aQuestionWorthKeeping: 'A QUESTION WORTH KEEPING',
    seeOtherLenses: 'MORE PERSPECTIVES',
    hideOtherLenses: 'HIDE PERSPECTIVES',
    cognitive: 'COGNITIVE',
    jungian: 'INTERPRETATION THROUGH SYMBOLS & MEANINGS',
    jungianInfoAria: 'What is this?',
    jungianInfo: 'An approach inspired by the psychologist Carl Jung, which looks at the symbols and images in a dream and the personal meaning they may hold.',
    psychodynamic: 'PSYCHODYNAMIC',
  },
  closing: {
    dontLetItDisappear: 'DON’T LET THE DREAM DISAPPEAR.',
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
    loading: 'Gathering your dreams…',
    loadErrorTitle: 'We couldn’t load your dreams.',
    loadErrorBody: 'This doesn’t mean they’re gone. Check your connection and try again.',
    loadRetry: 'Try again',
    settingsDeleteHeading: 'Delete account',
    settingsDeleteBody:
      'Delete your account and everything in it from our live systems: your saved dreams and their images, your reflections and patterns, and any dream credits you have left. This cannot be undone. Copies in encrypted backups are handled as the Privacy Policy describes.',
    settingsDeleteButton: 'Delete my account',
    deleteAccountTitle: 'Delete your account?',
    deleteAccountBody:
      'This deletes your account, all your saved dreams and their images, your reflections and patterns, and any unused dream credits from our live systems. It cannot be undone or recovered. Copies in encrypted backups are handled as the Privacy Policy describes.',
    deleteAccountTypePrompt: 'To confirm, type:',
    deleteAccountInputLabel: 'Type the confirmation word',
    deleteAccountConfirm: 'Delete my account',
    deleteAccountFailed: 'Your account could not be fully deleted. Nothing was reported as deleted. Please try again.',
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
    greeting: 'Hello {name}',
    greetingNoName: 'Hello',
    settingsNameLabel: 'Name',
    settingsNameEmpty: 'Not set',
    settingsNameAdd: 'Add name',
    settingsNameEdit: 'Edit',
    settingsNameSave: 'Save',
    settingsNameCancel: 'Cancel',
    settingsNameError: "Couldn't save that name — please check it and try again.",
    settingsEmailLabel: 'Email',
    settingsPlanLabel: 'My package',
    settingsPlanSeveral: 'Several packages',
    settingsFreeDreamLabel: 'Free dream',
    settingsFreeDreamAvailable: 'Available',
    settingsFreeDreamUsed: 'Used',
    settingsAccountTypeLabel: 'Account type',
    settingsOwnerValue: 'App owner',
    settingsDreamsLabel: 'Dreams',
    settingsDreamsUnlimited: 'Unlimited ∞',
    purchasesTitle: 'Purchase documents',
    purchasesIntro: 'Completed purchases, so you can send each customer the transaction-details document by hand, together with the tax invoice / receipt from Morning. The document goes to the account\'s email. The customer\'s name is only at Grow.',
    purchasesLanguage: 'Document language',
    purchasesLoading: 'Loading…',
    purchasesError: 'The list could not be loaded.',
    purchasesEmpty: 'No completed purchases yet.',
    purchasesRef: 'Reference',
    purchasesCredits: 'credits',
    purchasesNoAccount: 'The account was deleted: there is no address to send to.',
    purchasesCopy: 'Copy document',
    purchasesCopied: 'Copied',
    purchasesCopyFailed: 'Copy failed. Use "Open email" instead.',
    purchasesMail: 'Open email',
    unlimitedTitle: 'Unlimited access',
    unlimitedIntro: 'Give an existing account permanent, unlimited dream creation. It stays until you revoke it, and the account\'s credits are never changed.',
    unlimitedEmailLabel: 'Account email',
    unlimitedEmailPlaceholder: 'name@example.com',
    unlimitedGrantButton: 'Grant access',
    unlimitedGranting: 'Granting…',
    unlimitedGranted: 'Access granted:',
    unlimitedAlready: 'This account already has unlimited access:',
    unlimitedOwnerAccount: 'This is the administrator account, which is always unlimited:',
    unlimitedNotRegistered: 'There is no registered account with this email, and none was created.',
    unlimitedInvalid: 'Enter a valid email address.',
    unlimitedError: 'Something went wrong. Nothing was changed. You can try again.',
    unlimitedForbidden: 'This area is for the administrator only.',
    unlimitedListTitle: 'Accounts with unlimited access',
    unlimitedListLoading: 'Loading…',
    unlimitedListError: 'The list could not be loaded.',
    unlimitedListEmpty: 'No account has been granted unlimited access yet.',
    unlimitedColEmail: 'Email',
    unlimitedColDate: 'Granted on',
    unlimitedRevoke: 'Revoke access',
    unlimitedRevokeConfirm: 'Confirm revoke',
    unlimitedRevokeKeep: 'Keep access',
    unlimitedRevokeNote: 'The account goes back to its regular credits.',
    unlimitedRevoked: 'Access revoked:',
    unlimitedRevokeMissing: 'This account no longer had access.',
    settingsDreamsPurchasedLabel: 'Dreams purchased',
    settingsDreamsRemainingLabel: 'Dreams remaining',
    balanceLoading: 'Checking your dreams…',
    balanceError: 'We couldn’t load your dream balance right now.',
    balanceRetry: 'Try again',
    balanceOwner: 'Unlimited dreams ∞',
    balanceRemaining: 'You have {remaining} of {total} dreams left in your package',
    balanceOne: 'You have 1 of {total} dreams left in your package',
    balanceAcross: 'You have {remaining} dreams left across your packages',
    balanceOneAcross: 'You have 1 dream left across your packages',
    balanceAcrossOf: 'You have {remaining} of {total} dreams left across your packages',
    balanceOneAcrossOf: 'You have 1 of {total} dreams left across your packages',
    balanceAcrossFreeOf: 'You have {remaining} of {total} dreams left, including your free dream',
    balanceFreeAvailable: 'Your free dream is waiting for you',
    balanceNone: 'No dreams left in your package',
    balanceFreeUsed: 'Your free dream has been used',
    balanceFreeNone: 'You have no dreams yet. Choose a package to begin.',
    balanceBuyMore: 'Get another package',
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
    whatStoodOut: 'The Moment You Chose',
    yourFeelings: 'The Feelings You Named',
    inShort: 'In Short',
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
    startDreamTagline: 'Create your account to tell your first dream — it is on us.',
    startDreamSigninTagline: 'Sign in to tell your dream.',
    freeDreamUsedNotice: 'Your first dream was free. To continue with more dreams, sign in or create an account.',
    sessionExpiredNotice: 'Your sign-in has ended. Sign in again to continue — what you wrote is waiting for you.',
    welcomeBack: 'WELCOME BACK, DREAMER.',
    continueWithGoogle: 'Continue with Google',
    or: 'OR',
    namePlaceholder: 'Name',
    errorNameRequired: 'Please enter your name.',
    ageConfirm: 'I confirm that I am 18 years old or over.',
    errorAgeRequired: 'To sign up, please confirm that you are 18 or over.',
    legalNoticeSignup: 'By signing up I agree to the {terms} and the {privacy}. Dream content is sent to AI providers for processing, including outside Israel, and may include sensitive information. Please do not include identifying details of other people.',
    legalNoticeSignin: 'DARE is for people aged 18 or over. By continuing I agree to the {terms} and the {privacy}.',
    legalTermsLink: 'Terms of Use',
    legalPrivacyLink: 'Privacy Policy',
    legalClose: 'Close and return to sign-up',
    errorInvalidName: 'Please enter a valid name (up to 60 characters, not an email address).',
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
    signupCheckEmailBody: 'If this address can receive a verification message, a link to continue will be sent to it.',
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
  howItWorks: {
    tagline: 'DARE TO GO IN is a private space for returning to the dreams that stay: tell them, see them, and ask them questions.',
    trigger: 'How it works',
    triggerAria: 'How DARE TO GO IN works: open the explanation',
    eyebrow: 'HOW IT WORKS',
    title: 'Every dream has a story. Come and find yours.',
    intro:
      'Write or record your dream, see it come to life in an image, choose the moment that stayed with you, and discover a personal reflection that takes your associations and feelings into account.',
    stepsAria: 'The six steps',
    steps: [
      { title: 'Tell the dream', text: 'Write it or record it, just as you remember it.' },
      { title: 'See it', text: 'An image created from your dream.' },
      { title: 'Choose a moment', text: 'The one that stayed with you most.' },
      { title: 'Share a feeling', text: 'If you like, up to three feelings. You can skip it.' },
      { title: 'Find meaning', text: 'A personal reflection and a short summary, not a verdict.' },
      { title: 'Save it', text: 'In a private journal you can return to.' },
    ],
    note: 'The reflection is a tool for personal thought, not a diagnosis or a treatment.',
    start: 'Tell us your dream',
    faq: 'Questions and answers',
    close: 'Close',
    panelAria: 'How it works',
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
    creditsRequiredNotice: 'Your free dream has been used. Choose a package to keep dreaming.',
    ownerUnlimitedNotice: 'You already have unlimited access to every dream. No package is needed.',
    yourPackageRemaining: 'Your package — {remaining} dreams left',
    yourPackageRemainingOne: 'Your package — 1 dream left',
    dreamsCountLabel: '{count} Dreams',
    vatIncluded: 'incl. VAT',
    infoTitle: 'Purchase details',
    infoOneTime: 'One-time payment for the package. No subscription and no recurring charge.',
    infoVat: 'All prices include VAT.',
    infoNoExpiry: 'Credits do not expire and stay in your account until you use them.',
    infoCredit: 'One credit = one full dream: the dream journey, an image and a reflection, saved to your archive. Credits are added to your account automatically once the payment is confirmed.',
    infoPayment: 'Payment is made on a secure Grow payment page and appears as DARE TO GO IN. We do not store card details.',
    infoInvoice: 'A tax invoice / receipt is issued and sent to your account email by the dealer, Dafna Dalmada, manually through Morning, within the times the law sets. It is not sent automatically or instantly.',
    infoRefunds: 'We do not have a voluntary refund policy beyond your rights under law. Details are in the Cancellation and Refund Policy and the Terms of Use.',
    infoDeletion: 'Deleting your account also deletes any unused credit balance.',
    linksLabel: 'Read before you buy',
    linkTerms: 'Terms of Use',
    linkPrivacy: 'Privacy Policy',
    linkCancellation: 'Cancellation and Refund Policy',
    planFree: 'Free',
    yourPackage: 'This is your package',
    yourLatestPackage: 'This is your latest package',
    checkout: {
      title: 'Complete your purchase',
      intro: 'Two details are needed to create your secure payment page.',
      fullName: 'Full name',
      fullNameHint: 'First and last name',
      phone: 'Mobile phone',
      phoneHint: 'Israeli mobile number, for example 054-123-4567',
      privacy: 'Used only to create your payment page. DARE does not store them; they are passed to our payment partners (Make and Grow) to process the payment.',
      privacyLink: 'Privacy Policy',
      privacyClose: 'Close and return to payment',
      vatIncluded: 'incl. VAT',
      termsTitle: 'Purchase details',
      termsOneTime: 'One-time payment. No subscription and no recurring charge.',
      termsVat: 'The price includes VAT.',
      termsNoExpiry: 'Credits do not expire.',
      termsInvoice: 'A tax invoice / receipt is issued and sent to your account email by the dealer, Dafna Dalmada, within the times the law sets. It is issued manually, so it is not sent automatically or instantly.',
      docsLead: 'Before you pay you can read:',
      linkTerms: 'Terms of Use',
      linkPrivacy: 'Privacy Policy',
      linkCancellation: 'Cancellation and Refund Policy',
      consent: 'I have read the Terms of Use, the Privacy Policy and the Cancellation and Refund Policy, and I accept the purchase terms.',
      errConsent: 'To continue to payment, please accept the purchase terms.',
      operator: 'Operated by',
      cancel: 'Cancel',
      submit: 'Continue to payment',
      preparing: 'Preparing your payment…',
      redirecting: 'Taking you to the secure payment page…',
      errName: 'Please enter your first and last name, using letters only.',
      errPhone: 'Please enter an Israeli mobile number, for example 054-123-4567.',
      errSession: 'Your session has ended. Please sign in again.',
      errRate: 'Too many attempts. Please wait a few minutes and try again.',
      errUnavailable: 'We could not start the payment right now. Nothing was charged. Please try again in a moment.',
    },
    paymentReturn: {
      title: 'Your payment',
      confirming: 'Thank you. We are confirming your payment…',
      confirmingNote: 'This usually takes a few seconds. Please keep this page open.',
      slow: 'We have not received the confirmation yet. This can take a few minutes. Your credits will appear in your account automatically once the payment is confirmed.',
      checkFailed: 'We could not check the status just now. Your payment is not affected.',
      confirmed: 'Payment confirmed. Your dream credits have been added.',
      startDreaming: 'Start dreaming',
      unknown: 'We could not find this payment on your account. If you paid, please sign in with the account you used, or contact us.',
      reference: 'Reference:',
      signIn: 'Please sign in to see your credits.',
      signInButton: 'Sign in',
      close: 'Close',
    },
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
    faqNav: 'שאלות',
    faqNavAria: 'שאלות ותשובות',
    packagesNav: 'חבילות',
  },
  hold: {
    holdToTellMe: 'לחצי והחזיקי כדי לספר',
    holdAria: 'לחצי והחזיקי כדי לספר על החלום',
    idRatherType: 'אעדיף להקליד',
    listening: 'מקשיבים…',
    privacyNote: 'החלום נשאר שלך.',
    imListening: 'מקשיבים.',
    tellMeEverything: 'אפשר לספר הכל, כל מה שזכור.',
    finishDream: 'סיום החלום',
    transcribing: 'מתמלל…',
    tellMeWhatHappened: 'אפשר לספר מה קרה.',
    typingPlaceholder: 'אפשר להתחיל מכל מה שזכור.',
    back: '← חזרה',
    imDone: 'סיימתי',
    iThinkIHaveIt: 'נדמה שיש לי את זה.',
    letMePutItBackTogether: 'מרכיבים את זה מחדש.',
    micErrorGeneric: 'לא הצלחתי לגשת אל המיקרופון.',
    micErrorStartFailed: 'לא הצלחתי להתחיל להקשיב.',
    micDenied: 'הגישה למיקרופון חסומה. לחצו על סמל המנעול (או “הגדרות אתר”) בשורת הכתובת, אפשרו מיקרופון ונסו שוב.',
    micNoDevice: 'לא מצאנו מיקרופון במכשיר הזה. אפשר לספר לנו את החלום בכתיבה.',
    writeYourDream: 'כתיבת החלום',
    writeSomethingFirst: 'כדי להמשיך, צריך לכתוב כמה מילים על החלום.',
    liveWordsUnavailable: 'ההקלטה מתבצעת. המילים יופיעו כשתסיימו.',
    liveWordsKept: 'לא הצלחתי להשלים את התמלול המדויק, אז שמרתי את המילים שקלטתי בזמן שדיברתם. כדאי לעבור עליהן.',
    micRecheck: 'חיברתי מיקרופון — לבדיקה חוזרת',
    transcriptionRateLimited: 'שלחתם הרבה הקלטות בזמן קצר. אפשר להמתין דקה ולנסות שוב, או לכתוב את החלום.',
    micBusy: 'המיקרופון בשימוש של אפליקציה אחרת או לא זמין כרגע.',
    micInsecure: 'הקלטה קולית עובדת רק בעמוד מאובטח (https).',
    micUnsupported: 'הדפדפן הזה לא תומך בהקלטה קולית.',
    micFormat: 'הדפדפן הזה לא יכול להקליט בפורמט שאנחנו מצליחים לעבד.',
    micTimeout: 'לא התקבל אישור למיקרופון בזמן. אשרו את הבקשה בדפדפן ונסו שוב.',
    transcriptionTooLarge: 'ההקלטה ארוכה מכדי לשלוח. נסו הקלטה קצרה יותר או הקלידו את החלום.',
    transcriptionNetwork: 'ההקלטה לא הגיעה אליי — בדקו את החיבור. אפשר לנסות שוב או להקליד את החלום.',
    transcriptionTimeout: 'התמלול לקח יותר מדי זמן. אפשר לנסות שוב או להקליד את החלום.',
    retryTranscription: 'נסו שוב',
    typeInsteadHint: 'אפשר להקליד את החלום במקום זאת.',
    transcriptionFailed: 'לא הצלחתי לתמלל את זה. נסו שוב או הקלידו את החלום.',
    transcriptionFreeDreamUsed: 'החלום החינמי שלך כבר נוצל. אפשר להמשיך להקליד כאן, ולהתחבר או ליצור חשבון כדי להמשיך.',
    transcriptionSessionExpired: 'ההתחברות שלך הסתיימה. אפשר להמשיך להקליד כאן ולהתחבר מחדש כדי להמשיך.',
    transcriptionCreditsRequired: 'לא נשארו לך חלומות בחבילה. אפשר להמשיך להקליד כאן ולבחור חבילה כדי להמשיך.',
    transcriptionSignInRequired: 'כדי להתחיל חלום צריך להתחבר או ליצור חשבון. המילים שלך נשארות כאן.',
    cancelRecording: 'ביטול הקלטה',
    cancelTranscription: 'ביטול תמלול',
    cancelTyping: 'ביטול הקלדה',
    analysisFailed: 'משהו השתבש בזמן שניסיתי להרכיב את זה מחדש.',
    analysisUncertain: 'לא קיבלתי תשובה בזמן. ניסיון נוסף לא יחייב אותך פעמיים.',
    tryAgain: 'ניסיון נוסף',
    editDream: 'עריכה',
  },
  leaveDream: {
    title: 'לעזוב את החלום?',
    body: 'החלום הזה עדיין לא נשמר. אם עוזבים עכשיו, הוא יאבד, יחד עם התמונה וההתבוננות שלו.',
    stay: 'להישאר',
    leave: 'לעזוב בלי לשמור',
  },
  reconstruction: {
    remembering: 'היזכרות…',
    couldntSeeAllOfIt: 'לא הצלחתי לראות את הכל.',
    restart: 'התחלה מחדש',
    thisIsWhatIFound: 'ככה נראה החלום שלך?',
    yesTakeMeIn: 'להיכנס פנימה',
    notQuite: 'לא בדיוק',
    whatDidIGetWrong: 'במה טעיתי?',
    correctionPlaceholder: 'אפשר לספר מה לשנות...',
    tryAgain: 'לנסות שוב',
    regenFailed: 'לא הצלחתי ליצור תמונה חדשה הפעם. התמונה הנוכחית עדיין כאן.',
    regenRejected: 'לא הצלחתי להפוך את השינוי הזה לתמונה. אפשר לנסות לנסח אותו אחרת — התמונה הנוכחית עדיין כאן.',
    regenLimit: 'החלום הזה הגיע למגבלת התמונות החדשות. אפשר להמשיך עם התמונה הקיימת.',
    imageFailedRetry: 'לא הצלחתי ליצור את התמונה הפעם. החלום שלך עדיין כאן. אפשר לנסות שוב.',
    imageRejected: 'אי אפשר ליצור את התמונה כפי שתוארה. אפשר לתאר אותה קצת אחרת.',
    imageExhausted: 'לחלום הזה נגמרו ניסיונות התמונה. אפשר להתחיל מחדש עם חלום חדש.',
    rephrase: 'ניסוח מחדש',
    howToDescribeDifferently: 'איך לתאר את זה אחרת?',
  },
  reflection: {
    momentQuestion: 'איזה רגע בחלום הכי נשאר איתך?',
    momentHint: 'אפשר לבחור רגע אחד שמשך את תשומת הלב במיוחד.',
    chosenMoment: 'הרגע שבחרת',
    emotionsTitle: 'איזו תחושה נשארה איתך מהחלום?',
    emotionsDescription: 'אפשר לבחור עד שלוש תחושות.',
    emotionsContinue: 'לגלות מה החלום מספר',
    emotionsSkip: 'אפשר להמשיך גם בלי לבחור',
    linkSkip: 'אפשר לדלג על השאלה',
    existential: 'זווית קיומית',
    emotionsCount: '{count} מתוך 3 נבחרו',
    emotionsGroupAria: 'תחושות מהחלום, אפשר לבחור עד שלוש',
    theFeelingsYouNamed: 'התחושות שבחרת',
    inShort: 'בקצרה',
    emotions: {
      fear: 'פחד',
      joy: 'שמחה',
      calm: 'שלווה',
      love: 'אהבה',
      longing: 'געגוע',
      confusion: 'בלבול',
      anger: 'כעס',
      sadness: 'עצב',
      wonder: 'פליאה',
      freedom: 'חופש',
      helplessness: 'חוסר אונים',
      excitement: 'התרגשות',
    },
    reflectionQuestionPrefix: 'כשחושבים על',
    reflectionQuestionSuffix: 'עכשיו —\nמה עולה?',
    writingPlaceholder: 'אפשר לכתוב מה שעולה לראש...',
    continue: 'המשך',
    reflecting: 'התבוננות…',
    couldntGatherThoughts: 'המחשבות לא הסתדרו הפעם.',
    tryAgain: 'לנסות שוב',
    whatINotice: 'מה שבולט',
    yourAssociation: 'האסוציאציה שלך',
    onePossibleThread: 'כיוון שכדאי לחקור',
    aQuestionWorthKeeping: 'שאלה שכדאי לשמור',
    seeOtherLenses: 'זוויות נוספות',
    hideOtherLenses: 'הסתרת הזוויות',
    cognitive: 'קוגניטיבי',
    jungian: 'פרשנות דרך סמלים ומשמעויות',
    jungianInfoAria: 'מה זה?',
    jungianInfo: 'גישה בהשראת הפסיכולוג קרל יונג, הבוחנת סמלים ודימויים בחלום ואת המשמעות האישית האפשרית שלהם.',
    psychodynamic: 'פסיכודינמי',
  },
  closing: {
    dontLetItDisappear: 'לא לתת לחלום להיעלם.',
    keepThisDream: 'לשמור\nעל החלום',
    letItGo: 'לשחרר אותו',
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
    loading: 'אוספים את החלומות שלך…',
    loadErrorTitle: 'לא הצלחנו לטעון את החלומות שלך.',
    loadErrorBody: 'זה לא אומר שהם נעלמו. כדאי לבדוק את החיבור ולנסות שוב.',
    loadRetry: 'נסו שוב',
    settingsDeleteHeading: 'מחיקת חשבון',
    settingsDeleteBody:
      'מחיקת החשבון וכל מה שבו מהמערכות החיות שלנו: החלומות ששמרתם והתמונות שלהם, ההרהורים והדפוסים, וכל קרדיט חלום שנשאר לכם. אי אפשר לבטל את הפעולה. עותקים בגיבויים מוצפנים מטופלים כמתואר במדיניות הפרטיות.',
    settingsDeleteButton: 'מחיקת החשבון שלי',
    deleteAccountTitle: 'למחוק את החשבון?',
    deleteAccountBody:
      'הפעולה מוחקת מהמערכות החיות שלנו את החשבון, את כל החלומות השמורים והתמונות שלהם, את ההרהורים והדפוסים, ואת כל קרדיט חלום שלא נוצל. אי אפשר לבטל או לשחזר. עותקים בגיבויים מוצפנים מטופלים כמתואר במדיניות הפרטיות.',
    deleteAccountTypePrompt: 'כדי לאשר, הקלידו:',
    deleteAccountInputLabel: 'הקלידו את מילת האישור',
    deleteAccountConfirm: 'מחיקת החשבון',
    deleteAccountFailed: 'לא הצלחנו למחוק את החשבון במלואו. לא דווח על מחיקה. אפשר לנסות שוב.',
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
    greeting: 'שלום {name}',
    greetingNoName: 'שלום',
    settingsNameLabel: 'שם',
    settingsNameEmpty: 'לא הוגדר',
    settingsNameAdd: 'הוספת שם',
    settingsNameEdit: 'עריכה',
    settingsNameSave: 'שמירה',
    settingsNameCancel: 'ביטול',
    settingsNameError: 'לא הצלחנו לשמור את השם — בדקו אותו ונסו שוב.',
    settingsEmailLabel: 'אימייל',
    settingsPlanLabel: 'החבילה שלי',
    settingsPlanSeveral: 'כמה חבילות',
    settingsFreeDreamLabel: 'חלום חינמי',
    settingsFreeDreamAvailable: 'זמין',
    settingsFreeDreamUsed: 'נוצל',
    settingsAccountTypeLabel: 'סוג חשבון',
    settingsOwnerValue: 'בעלת האפליקציה',
    settingsDreamsLabel: 'חלומות',
    settingsDreamsUnlimited: 'ללא הגבלה ∞',
    purchasesTitle: 'מסמכי רכישה',
    purchasesIntro: 'רכישות שהושלמו, כדי לשלוח לכל לקוח בידיים את מסמך פרטי העסקה, יחד עם חשבונית המס / הקבלה מ-Morning. המסמך נשלח לדוא"ל של החשבון. שם הלקוח נמצא רק ב-Grow.',
    purchasesLanguage: 'שפת המסמך',
    purchasesLoading: 'טוענים…',
    purchasesError: 'לא ניתן לטעון את הרשימה.',
    purchasesEmpty: 'עדיין אין רכישות שהושלמו.',
    purchasesRef: 'אסמכתא',
    purchasesCredits: 'קרדיטים',
    purchasesNoAccount: 'החשבון נמחק: אין כתובת לשליחה.',
    purchasesCopy: 'העתקת המסמך',
    purchasesCopied: 'הועתק',
    purchasesCopyFailed: 'ההעתקה נכשלה. אפשר להשתמש ב"פתיחת מייל".',
    purchasesMail: 'פתיחת מייל',
    unlimitedTitle: 'גישה ללא הגבלה',
    unlimitedIntro: 'אפשר להעניק לחשבון קיים יצירת חלומות ללא הגבלה. ההרשאה נשארת עד שמבטלים אותה, ויתרת הקרדיטים של החשבון לא משתנה.',
    unlimitedEmailLabel: 'כתובת המייל של החשבון',
    unlimitedEmailPlaceholder: 'name@example.com',
    unlimitedGrantButton: 'הענקת הרשאה',
    unlimitedGranting: 'מעניקים…',
    unlimitedGranted: 'ההרשאה ניתנה:',
    unlimitedAlready: 'לחשבון הזה כבר יש גישה ללא הגבלה:',
    unlimitedOwnerAccount: 'זה חשבון האדמין, שיש לו תמיד גישה ללא הגבלה:',
    unlimitedNotRegistered: 'אין משתמש רשום בכתובת מייל זו, ולא נוצר חשבון.',
    unlimitedInvalid: 'יש להזין כתובת מייל תקינה.',
    unlimitedError: 'משהו השתבש. לא בוצע שינוי. אפשר לנסות שוב.',
    unlimitedForbidden: 'האזור הזה מיועד לאדמין בלבד.',
    unlimitedListTitle: 'חשבונות עם גישה ללא הגבלה',
    unlimitedListLoading: 'טוענים…',
    unlimitedListError: 'לא ניתן לטעון את הרשימה.',
    unlimitedListEmpty: 'עדיין לא הוענקה הרשאה לאף חשבון.',
    unlimitedColEmail: 'כתובת מייל',
    unlimitedColDate: 'תאריך הענקה',
    unlimitedRevoke: 'ביטול הרשאה',
    unlimitedRevokeConfirm: 'אישור הביטול',
    unlimitedRevokeKeep: 'להשאיר את ההרשאה',
    unlimitedRevokeNote: 'החשבון חוזר ליתרת הקרדיטים הרגילה שלו.',
    unlimitedRevoked: 'ההרשאה בוטלה:',
    unlimitedRevokeMissing: 'לחשבון הזה כבר לא הייתה הרשאה.',
    settingsDreamsPurchasedLabel: 'חלומות שנרכשו',
    settingsDreamsRemainingLabel: 'חלומות שנותרו',
    balanceLoading: 'בודקים את יתרת החלומות…',
    balanceError: 'לא הצלחנו לטעון את יתרת החלומות כרגע.',
    balanceRetry: 'נסו שוב',
    balanceOwner: 'חלומות ללא הגבלה ∞',
    balanceRemaining: 'נותרו לך {remaining} מתוך {total} חלומות בחבילה',
    balanceOne: 'נותר לך חלום אחד מתוך {total} חלומות בחבילה',
    balanceAcross: 'נותרו לך {remaining} חלומות מכל החבילות שרכשת',
    balanceOneAcross: 'נותר לך חלום אחד מכל החבילות שרכשת',
    balanceAcrossOf: 'נותרו לך {remaining} מתוך {total} חלומות מכל החבילות שרכשת',
    balanceOneAcrossOf: 'נותר לך חלום אחד מתוך {total} חלומות מכל החבילות שרכשת',
    balanceAcrossFreeOf: 'נותרו לך {remaining} מתוך {total} חלומות, כולל החלום החינמי',
    balanceFreeAvailable: 'החלום החינמי שלך מחכה לך',
    balanceNone: 'לא נותרו חלומות בחבילה',
    balanceFreeUsed: 'החלום החינמי שלך נוצל',
    balanceFreeNone: 'אין לך עדיין חלומות. בחרו חבילה כדי להתחיל.',
    balanceBuyMore: 'לרכישת חבילה נוספת',
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
    whatStoodOut: 'הרגע שבחרתם',
    yourFeelings: 'התחושות שבחרתם',
    inShort: 'בקצרה',
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
    startDreamTagline: 'צרו חשבון כדי לספר את החלום הראשון שלכם — הוא במתנה.',
    startDreamSigninTagline: 'התחברו כדי לספר את החלום שלכם.',
    freeDreamUsedNotice: 'החלום הראשון שלך היה במתנה. כדי להמשיך לחלומות נוספים, יש להתחבר או ליצור חשבון.',
    sessionExpiredNotice: 'ההתחברות שלך הסתיימה. התחברו מחדש כדי להמשיך — מה שכתבת מחכה לך.',
    welcomeBack: 'ברוכים השבים, חולמים.',
    continueWithGoogle: 'המשך עם Google',
    or: 'או',
    namePlaceholder: 'שם',
    errorNameRequired: 'נא להזין שם.',
    ageConfirm: 'אני מאשר/ת שגילי 18 ומעלה.',
    errorAgeRequired: 'כדי להירשם יש לאשר שגילך 18 ומעלה.',
    legalNoticeSignup: 'בהרשמה אני מסכים/ה ל{terms} ול{privacy}. תוכן החלומות נשלח לעיבוד אצל ספקי בינה מלאכותית, גם מחוץ לישראל, ועשוי לכלול מידע רגיש. נא לא לכלול פרטים מזהים של אנשים אחרים.',
    legalNoticeSignin: 'DARE מיועדת לבני 18 ומעלה. בהמשך אני מסכים/ה ל{terms} ול{privacy}.',
    legalTermsLink: 'תנאי השימוש',
    legalPrivacyLink: 'מדיניות הפרטיות',
    legalClose: 'סגירה וחזרה להרשמה',
    errorInvalidName: 'נא להזין שם תקין (עד 60 תווים, לא כתובת אימייל).',
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
    signupCheckEmailBody: 'אם הכתובת יכולה לקבל הודעת אימות, יישלח אליה קישור להמשך.',
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
  howItWorks: {
    tagline: 'DARE TO GO IN הוא מרחב פרטי לחזור אל חלומות שנשארים: מספרים אותם, רואים אותם ושואלים אותם שאלות.',
    trigger: 'איך זה עובד',
    triggerAria: 'איך DARE TO GO IN עובד: פתיחת ההסבר',
    eyebrow: 'איך זה עובד',
    title: 'לכל חלום יש סיפור. בואו לגלות את שלכם.',
    intro:
      'כתבו או הקליטו את החלום, ראו אותו מתעורר לחיים בתמונה, בחרו את הרגע שנשאר איתכם וגלו הרהור אישי שמתחשב באסוציאציות ובתחושות שלכם.',
    stepsAria: 'ששת הצעדים',
    steps: [
      { title: 'מספרים את החלום', text: 'בכתיבה או בהקלטה, בדיוק כפי שזוכרים.' },
      { title: 'רואים אותו', text: 'תמונה שנוצרת בהשראת החלום.' },
      { title: 'בוחרים רגע', text: 'הרגע שהכי נשאר איתכם.' },
      { title: 'משתפים בתחושה', text: 'אם תרצו, עד שלוש תחושות. אפשר גם לדלג.' },
      { title: 'מגלים משמעות', text: 'הרהור אישי וסיכום קצר, לא פסק דין.' },
      { title: 'שומרים ביומן', text: 'ביומן פרטי שאפשר לחזור אליו.' },
    ],
    note: 'ההרהור הוא כלי למחשבה אישית, לא אבחנה ולא טיפול.',
    start: 'ספרו לנו את החלום',
    faq: 'שאלות ותשובות',
    close: 'סגירה',
    panelAria: 'איך זה עובד',
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
    creditsRequiredNotice: 'החלום החינמי שלך נוצל. בחרו חבילה כדי להמשיך לחלום.',
    ownerUnlimitedNotice: 'כבר יש לך גישה בלתי מוגבלת לכל החלומות. אין צורך ברכישת חבילה.',
    yourPackageRemaining: 'החבילה שלך — נותרו {remaining} חלומות',
    yourPackageRemainingOne: 'החבילה שלך — נותר חלום אחד',
    dreamsCountLabel: '{count} חלומות',
    vatIncluded: 'כולל מע"מ',
    infoTitle: 'פרטי הרכישה',
    infoOneTime: 'תשלום חד־פעמי עבור החבילה. אין מנוי ואין חיוב חוזר.',
    infoVat: 'כל המחירים כוללים מע"מ.',
    infoNoExpiry: 'הקרדיטים אינם פגי תוקף ונשמרים בחשבון עד שמנצלים אותם.',
    infoCredit: 'קרדיט אחד = חלום אחד מלא: מסע חלום, תמונה והתבוננות, ושמירה בארכיון. הקרדיטים מתווספים לחשבון אוטומטית לאחר אישור התשלום.',
    infoPayment: 'התשלום מתבצע בדף תשלום מאובטח של Grow ומופיע בשם DARE TO GO IN. אנחנו לא שומרים פרטי כרטיס.',
    infoInvoice: 'חשבונית מס / קבלה מופקת ונשלחת לדוא"ל החשבון על ידי העוסקת, דפנה דלמדה, באופן ידני באמצעות Morning, בהתאם למועדים הקבועים בדין. היא אינה נשלחת אוטומטית או מיידית.',
    infoRefunds: 'אין לנו מדיניות החזרים מרצון מעבר לזכויותיכם לפי דין. הפרטים במדיניות הביטולים והחזרים ובתנאי השימוש.',
    infoDeletion: 'מחיקת חשבון מוחקת גם יתרת קרדיטים שלא נוצלה.',
    linksLabel: 'לקריאה לפני הרכישה',
    linkTerms: 'תנאי שימוש',
    linkPrivacy: 'מדיניות פרטיות',
    linkCancellation: 'מדיניות ביטולים והחזרים',
    planFree: 'חינמי',
    yourPackage: 'זו החבילה שלך',
    yourLatestPackage: 'זו החבילה האחרונה שלך',
    checkout: {
      title: 'השלמת הרכישה',
      intro: 'נדרשים שני פרטים כדי ליצור את דף התשלום המאובטח שלך.',
      fullName: 'שם מלא',
      fullNameHint: 'שם פרטי ושם משפחה',
      phone: 'טלפון נייד',
      phoneHint: 'מספר נייד ישראלי, לדוגמה 054-123-4567',
      privacy: 'משמשים רק ליצירת דף התשלום. DARE אינה שומרת אותם; הם מועברים לשותפי התשלום שלנו (Make ו-Grow) לצורך עיבוד התשלום.',
      privacyLink: 'מדיניות הפרטיות',
      privacyClose: 'סגירה וחזרה לתשלום',
      vatIncluded: 'כולל מע"מ',
      termsTitle: 'פרטי הרכישה',
      termsOneTime: 'תשלום חד־פעמי. אין מנוי ואין חיוב חוזר.',
      termsVat: 'המחיר כולל מע"מ.',
      termsNoExpiry: 'הקרדיטים אינם פגי תוקף.',
      termsInvoice: 'חשבונית מס / קבלה מופקת ונשלחת לדוא"ל החשבון על ידי העוסקת, דפנה דלמדה, בהתאם למועדים הקבועים בדין. ההפקה ידנית, ולכן היא אינה נשלחת אוטומטית או מיידית.',
      docsLead: 'לפני התשלום אפשר לקרוא:',
      linkTerms: 'תנאי שימוש',
      linkPrivacy: 'מדיניות פרטיות',
      linkCancellation: 'מדיניות ביטולים והחזרים',
      consent: 'קראתי את תנאי השימוש, מדיניות הפרטיות ומדיניות הביטולים והחזרים, ואני מאשר/ת את תנאי הרכישה.',
      errConsent: 'כדי להמשיך לתשלום יש לאשר את תנאי הרכישה.',
      operator: 'מופעל על ידי',
      cancel: 'ביטול',
      submit: 'המשך לתשלום',
      preparing: 'מכינים את התשלום…',
      redirecting: 'מעבירים אותך לדף התשלום המאובטח…',
      errName: 'נא להזין שם פרטי ושם משפחה, באותיות בלבד.',
      errPhone: 'נא להזין מספר נייד ישראלי, לדוגמה 054-123-4567.',
      errSession: 'ההתחברות שלך הסתיימה. נא להתחבר שוב.',
      errRate: 'יותר מדי ניסיונות. נא להמתין כמה דקות ולנסות שוב.',
      errUnavailable: 'לא הצלחנו להתחיל את התשלום כרגע. לא בוצע חיוב. נא לנסות שוב בעוד רגע.',
    },
    paymentReturn: {
      title: 'התשלום שלך',
      confirming: 'תודה. אנחנו מאשרים את התשלום שלך…',
      confirmingNote: 'זה לוקח בדרך כלל כמה שניות. נא להשאיר את הדף פתוח.',
      slow: 'עדיין לא קיבלנו את האישור. זה יכול לקחת כמה דקות. הקרדיטים יופיעו בחשבון שלך אוטומטית ברגע שהתשלום יאושר.',
      checkFailed: 'לא הצלחנו לבדוק את הסטטוס ברגע זה. התשלום עצמו לא מושפע.',
      confirmed: 'התשלום אושר. קרדיטי החלומות נוספו לחשבון שלך.',
      startDreaming: 'מתחילים לחלום',
      unknown: 'לא מצאנו את התשלום הזה בחשבון שלך. אם שילמת, נא להתחבר עם החשבון שבו השתמשת, או לפנות אלינו.',
      reference: 'מספר אסמכתא:',
      signIn: 'נא להתחבר כדי לראות את הקרדיטים שלך.',
      signInButton: 'התחברות',
      close: 'סגירה',
    },
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
