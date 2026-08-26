import { useCallback, useEffect, useRef, useState } from 'react';
import DreamVideo from './DreamVideo';
import MemoryVeil from './MemoryVeil';
import MemoryTitle from './MemoryTitle';
import DreamPrompt from './DreamPrompt';
import HoldToRemember from './HoldToRemember';
import CustomCursor from './CustomCursor';
import DreamEchoes from './DreamEchoes';
import { usePointerRef } from './usePointerRef';
import { useOpeningSequence } from './useOpeningSequence';
import { useDreamRecorder } from './useDreamRecorder';
import { useSpeechTranscription } from './useSpeechTranscription';
import { createHoldState } from './HoldState';
import { createEchoState } from './EchoState';
import { createDreamEventState } from './dreamEventState';
import { createLampState } from './lampState';
import { useUnifiedDreamSequence } from './useUnifiedDreamSequence';
import type { DreamInput } from './dreamInput';
import { analyzeDream, type AnalysisResult } from './dreamAnalysis';
import DreamAnalysisDevView from './DreamAnalysisDevView';
import DreamReconstruction, { type ReconstructionPhase, type InsideStep } from './DreamReconstruction';
import { buildReconstructionBrief, type ReconstructionBrief } from './reconstructionBrief';
import { pickMemoryFragments } from './memoryFragments';
import { deriveDreamElements } from './dreamElements';
import { generateDreamImage, type ImageResult } from './dreamImage';
import { getDreamReflection, type DreamReflectionRequest } from './dreamReflectionEngine';
import type { ReflectionResult } from './dreamReflectionSchema';
import type { CentralMode } from './centralMode';
import './HeroDream.css';

const DISSOLVE_MS = 4200;
const FRAGMENTS_MS = 3600;
// Minimum time the temporary CSS reconstruction stays visible before
// handing off to the real image — not a hard exit timer: it also waits
// for generation to actually settle, whichever takes longer.
const RECONSTRUCTING_MIN_MS = 2200;
// Must stay in sync with the CSS reveal animation duration (DreamReconstruction.css).
const IMAGING_MS = 6500;
const SETTLE_PAUSE_MS = 1500;
// ENTER THE DREAM — must stay roughly in sync with the CSS push-in
// (1s hold + 6s slow push, see .dr-enter-push in DreamReconstruction.css).
const ENTERING_MS = 7200;
const INSIDE_QUIET_MS = 5000;
const LOOK_AROUND_VISIBLE_MS = 3000;
const INSIDE_QUIET2_MS = 1800;
// WHAT STANDS OUT TO YOU? — the question holds alone briefly, then the
// real choices reveal beneath it; after picking one, the others fade
// before the reflection question takes over.
const PROMPT_TO_CHOICES_MS = 1500;
const SELECTED_TO_REFLECTING_MS = 1400;

const TITLE_PHASES = new Set(['title', 'prompt', 'interaction', 'idle']);
const PROMPT_PHASES = new Set(['prompt', 'interaction', 'idle']);
const INTERACTION_PHASES = new Set(['interaction', 'idle']);

export default function HeroDream() {
  const videoARef = useRef<HTMLVideoElement>(null);
  const videoBRef = useRef<HTMLVideoElement>(null);
  const uiLayerRef = useRef<HTMLDivElement>(null);
  const blackVeilRef = useRef<HTMLDivElement>(null);
  const pointerRef = usePointerRef();
  const holdRef = useRef(createHoldState());
  const echoRef = useRef(createEchoState());
  const dreamEventRef = useRef(createDreamEventState());
  const lampStateRef = useRef(createLampState());
  const schedulerPausedRef = useRef(false);
  useUnifiedDreamSequence(dreamEventRef, lampStateRef, schedulerPausedRef);
  const { phase, startTime } = useOpeningSequence();

  const recorder = useDreamRecorder();
  const transcription = useSpeechTranscription();
  const [centralMode, setCentralMode] = useState<CentralMode>('hold');
  const [micUnavailable, setMicUnavailable] = useState(false);
  // Kept wired (though fragments aren't rendered right now) so re-enabling
  // the visual layer later doesn't require touching this plumbing again.
  const [, setTypedTranscript] = useState('');
  // The real captured dream (typed or spoken), once TYPE/RECORD genuinely
  // completes, plus the Dream Analysis pipeline's result for it. STAGE 3
  // ONLY: the temporary dev view below is not final UI.
  const dreamInputRef = useRef<DreamInput | null>(null);
  const [analysisPending, setAnalysisPending] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  // Only present with ?debug=1 — the dev view must never appear in the
  // normal user journey, only as a development aid.
  const [debugMode] = useState(() => new URLSearchParams(window.location.search).has('debug'));

  // Dream Reconstruction — begins only once a REAL DreamAnalysis has
  // succeeded. Every fragment/brief field below is derived from that real
  // analysis; nothing here is invented or demo content.
  const [reconstructionPhase, setReconstructionPhase] = useState<ReconstructionPhase>('none');
  const [brief, setBrief] = useState<ReconstructionBrief | null>(null);
  const [fragments, setFragments] = useState<string[]>([]);
  const [corrections, setCorrections] = useState<string[]>([]);
  // ENTER THE DREAM — the quiet look → "LOOK AROUND." → pause → "WHAT
  // STANDS OUT TO YOU?" → choices → reflection. Terminal at 'stored'.
  const [insideStep, setInsideStep] = useState<InsideStep>('quiet');
  // The selectable elements are derived once from the real DreamAnalysis
  // (never invented, never hardcoded per-dream) — see dreamElements.ts.
  const [dreamElements, setDreamElements] = useState<string[]>([]);
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const [reflectionResponse, setReflectionResponse] = useState<string | null>(null);

  // The one grounded reflection engine call — real OpenAI, idempotent per
  // token exactly like image generation, never re-fired by rerenders.
  const [reflectionPending, setReflectionPending] = useState(false);
  const [reflectionEngineResult, setReflectionEngineResult] = useState<ReflectionResult | null>(null);
  const reflectionTokenRef = useRef<string | null>(null);
  const reflectionRetryCountRef = useRef(0);

  const startReflectionEngine = useCallback((token: string, request: DreamReflectionRequest) => {
    if (reflectionTokenRef.current === token) return;
    reflectionTokenRef.current = token;
    setReflectionPending(true);
    setReflectionEngineResult(null);
    getDreamReflection(request).then((result) => {
      setReflectionEngineResult(result);
      setReflectionPending(false);
    });
  }, []);

  // Real image generation. `displayedImageUrl` is the last fully-settled
  // image; `incomingImageUrl` is a freshly generated one mid-reveal during
  // the 'imaging' phase. `generationTokenRef` makes generation idempotent —
  // a given token (e.g. 'initial', 'correction-1') only ever fires one real
  // request, no matter how many times rerenders/effects/StrictMode touch it.
  const [displayedImageUrl, setDisplayedImageUrl] = useState<string | null>(null);
  const [incomingImageUrl, setIncomingImageUrl] = useState<string | null>(null);
  const [imagePending, setImagePending] = useState(false);
  const [imageResult, setImageResult] = useState<ImageResult | null>(null);
  const generationTokenRef = useRef<string | null>(null);
  const correctionCountRef = useRef(0);
  const retryCountRef = useRef(0);
  const reconstructingEnteredAtRef = useRef(0);

  const startImageGeneration = useCallback((token: string, briefToUse: ReconstructionBrief) => {
    if (generationTokenRef.current === token) return;
    generationTokenRef.current = token;
    setImagePending(true);
    setImageResult(null);
    generateDreamImage(briefToUse).then((result) => {
      setImageResult(result);
      setImagePending(false);
    });
  }, []);

  const handleDreamCapture = (input: DreamInput) => {
    dreamInputRef.current = input;
    setAnalysisPending(true);
    setAnalysisResult(null);
    analyzeDream(input)
      .then((result) => {
        setAnalysisResult(result);
      })
      .finally(() => {
        setAnalysisPending(false);
      });
  };

  // Kick off the reconstruction sequence AND the one real initial image
  // generation the moment analysis succeeds — once only per successful
  // analysis (reconstructionPhase stays 'none' until then, so a re-render
  // from an unrelated state change can't retrigger it).
  useEffect(() => {
    if (analysisResult?.status !== 'ok' || reconstructionPhase !== 'none') return;
    const analysis = analysisResult.analysis;
    const newBrief = buildReconstructionBrief(analysis, []);
    setBrief(newBrief);
    setFragments(pickMemoryFragments(analysis));
    setDreamElements(deriveDreamElements(analysis));
    startImageGeneration('initial', newBrief);
    const t = setTimeout(() => setReconstructionPhase('dissolving'), SETTLE_PAUSE_MS);
    return () => clearTimeout(t);
  }, [analysisResult, reconstructionPhase, startImageGeneration]);

  // Timer-driven phase progression for the room's own dissolve. User
  // choices (NOT QUITE / YES) take over from 'reveal' onward.
  //
  // 'reconstructing' can now last far longer than the original ~8s dissolve
  // beat (real image generation may take up to a minute) — for that open-
  // ended wait specifically, the room stays fully alive and animated (no
  // frozen/paused scheduler) rather than sitting under the dissolve veil
  // the whole time. Only the brief, fixed dissolving/fragments beat and the
  // later image/reveal phases actually pause the room's own cycle.
  useEffect(() => {
    schedulerPausedRef.current = reconstructionPhase !== 'none' && reconstructionPhase !== 'reconstructing';
    if (reconstructionPhase === 'dissolving') {
      const t = setTimeout(() => setReconstructionPhase('fragments'), DISSOLVE_MS);
      return () => clearTimeout(t);
    }
    if (reconstructionPhase === 'fragments') {
      const t = setTimeout(() => setReconstructionPhase('reconstructing'), FRAGMENTS_MS);
      return () => clearTimeout(t);
    }
  }, [reconstructionPhase]);

  useEffect(() => {
    if (reconstructionPhase === 'reconstructing') {
      reconstructingEnteredAtRef.current = performance.now();
    }
  }, [reconstructionPhase]);

  // 'reconstructing' only ever hands off to the real image once it has
  // actually loaded — "loads invisibly in the background, only when fully
  // loaded, begin transformation" — combined with a minimum dwell so a very
  // fast response doesn't feel like it skipped the room dissolving.
  useEffect(() => {
    if (reconstructionPhase !== 'reconstructing') return;
    if (imagePending || !imageResult) return;
    const elapsed = performance.now() - reconstructingEnteredAtRef.current;
    const remaining = Math.max(0, RECONSTRUCTING_MIN_MS - elapsed);
    const t = setTimeout(() => {
      if (imageResult.status === 'ok') {
        setIncomingImageUrl(imageResult.imageDataUrl);
        setReconstructionPhase('imaging');
      } else {
        setReconstructionPhase('image-error');
      }
    }, remaining);
    return () => clearTimeout(t);
  }, [reconstructionPhase, imagePending, imageResult]);

  // 'regenerating' (after a NOT QUITE correction): the previous image stays
  // visible the whole time, no minimum dwell — hand off the instant the
  // corrected image is ready (or show the error state if it fails).
  useEffect(() => {
    if (reconstructionPhase !== 'regenerating') return;
    if (imagePending || !imageResult) return;
    if (imageResult.status === 'ok') {
      setIncomingImageUrl(imageResult.imageDataUrl);
      setReconstructionPhase('imaging');
    } else {
      setReconstructionPhase('image-error');
    }
  }, [reconstructionPhase, imagePending, imageResult]);

  // 'imaging': the real cross-dissolve/organic-mask reveal (CSS-driven).
  // Once it's had time to fully play out, commit the new image as the
  // settled one and move on to the reveal choice.
  useEffect(() => {
    if (reconstructionPhase !== 'imaging') return;
    const t = setTimeout(() => {
      setDisplayedImageUrl(incomingImageUrl);
      setIncomingImageUrl(null);
      setReconstructionPhase('reveal');
    }, IMAGING_MS);
    return () => clearTimeout(t);
  }, [reconstructionPhase, incomingImageUrl]);

  const handleNotQuite = () => setReconstructionPhase('correcting');

  const handleCorrectionSubmit = (text: string) => {
    if (analysisResult?.status !== 'ok') return;
    const nextCorrections = [...corrections, text];
    setCorrections(nextCorrections);
    const newBrief = buildReconstructionBrief(analysisResult.analysis, nextCorrections);
    setBrief(newBrief);
    correctionCountRef.current += 1;
    setReconstructionPhase('regenerating');
    startImageGeneration(`correction-${correctionCountRef.current}`, newBrief);
  };

  const handleRetryImage = () => {
    if (!brief) return;
    retryCountRef.current += 1;
    const token = `${generationTokenRef.current ?? 'initial'}-retry-${retryCountRef.current}`;
    setReconstructionPhase(displayedImageUrl ? 'regenerating' : 'reconstructing');
    startImageGeneration(token, brief);
  };

  const handleYes = () => setReconstructionPhase('entering');

  // 'entering': gently dissolve the reveal UI, hold the settled image, then
  // slowly push into it (CSS-driven) — once that's had time to play out,
  // cross fully into DreamWorld.
  useEffect(() => {
    if (reconstructionPhase !== 'entering') return;
    const t = setTimeout(() => setReconstructionPhase('inside'), ENTERING_MS);
    return () => clearTimeout(t);
  }, [reconstructionPhase]);

  // 'inside': a quiet look at the living image, then "LOOK AROUND." fades
  // in and back out, a short pause, then the terminal "WHAT STANDS OUT TO
  // YOU?" — nothing advances past that on its own.
  useEffect(() => {
    if (reconstructionPhase === 'inside') setInsideStep('quiet');
  }, [reconstructionPhase]);

  useEffect(() => {
    if (reconstructionPhase !== 'inside') return;
    if (insideStep === 'quiet') {
      const t = setTimeout(() => setInsideStep('look-around'), INSIDE_QUIET_MS);
      return () => clearTimeout(t);
    }
    if (insideStep === 'look-around') {
      const t = setTimeout(() => setInsideStep('quiet2'), LOOK_AROUND_VISIBLE_MS);
      return () => clearTimeout(t);
    }
    if (insideStep === 'quiet2') {
      const t = setTimeout(() => setInsideStep('prompt'), INSIDE_QUIET2_MS);
      return () => clearTimeout(t);
    }
    // 'prompt' holds alone briefly, then the real choices reveal beneath it
    // — but only if there actually are any real elements to choose from.
    if (insideStep === 'prompt' && dreamElements.length > 0) {
      const t = setTimeout(() => setInsideStep('choices'), PROMPT_TO_CHOICES_MS);
      return () => clearTimeout(t);
    }
    // 'choices' waits for the user to click one — no timer.
    // 'selected': the other choices fade, then the reflection question takes over.
    if (insideStep === 'selected') {
      const t = setTimeout(() => setInsideStep('reflecting'), SELECTED_TO_REFLECTING_MS);
      return () => clearTimeout(t);
    }
    // 'reflecting' waits for CONTINUE — no timer. 'stored' is terminal.
  }, [reconstructionPhase, insideStep, dreamElements]);

  const handleSelectElement = (element: string) => {
    if (selectedElement) return;
    setSelectedElement(element);
    setInsideStep('selected');
  };

  const handleSubmitReflection = (text: string) => {
    setReflectionResponse(text);
    setInsideStep('interpreting');
    if (analysisResult?.status === 'ok' && selectedElement) {
      startReflectionEngine('initial', {
        dreamAnalysis: analysisResult.analysis,
        selectedElement,
        reflectionResponse: text,
        reconstructionCorrections: corrections,
      });
    }
  };

  // 'interpreting' hands off to the terminal 'reflection' step the instant
  // the real reflection engine resolves successfully. On failure it stays
  // at 'interpreting' — DreamReflection shows the honest error + retry there.
  useEffect(() => {
    if (insideStep !== 'interpreting') return;
    if (reflectionPending || !reflectionEngineResult) return;
    if (reflectionEngineResult.status === 'ok') {
      setInsideStep('reflection');
    }
  }, [insideStep, reflectionPending, reflectionEngineResult]);

  const handleRetryReflection = () => {
    if (analysisResult?.status !== 'ok' || !selectedElement || !reflectionResponse) return;
    reflectionRetryCountRef.current += 1;
    startReflectionEngine(`retry-${reflectionRetryCountRef.current}`, {
      dreamAnalysis: analysisResult.analysis,
      selectedElement,
      reflectionResponse,
      reconstructionCorrections: corrections,
    });
  };

  // Debug-only QA hook (never part of the normal user journey, only present
  // with ?debug=1): lets a real already-generated image be dropped straight
  // into state so later phases (e.g. ENTER THE DREAM) can be verified
  // without spending a new OpenAI image-generation call every time.
  useEffect(() => {
    if (!debugMode) return;
    const w = window as unknown as { __dreamDebug?: Record<string, (...args: never[]) => void> };
    w.__dreamDebug = {
      setPhase: ((p: ReconstructionPhase) => setReconstructionPhase(p)) as (...args: never[]) => void,
      setInsideStep: ((s: InsideStep) => setInsideStep(s)) as (...args: never[]) => void,
      setDisplayedImage: ((url: string) => setDisplayedImageUrl(url)) as (...args: never[]) => void,
      setAnalysis: ((a: unknown) => setAnalysisResult({ status: 'ok', analysis: a } as AnalysisResult)) as (...args: never[]) => void,
      setDreamElements: ((els: string[]) => setDreamElements(els)) as (...args: never[]) => void,
      getReflectionState: (() => ({ selectedElement, reflectionResponse, reflectionEngineResult })) as (...args: never[]) => void,
      setReflectionResult: ((r: unknown) =>
        setReflectionEngineResult({ status: 'ok', reflection: r } as ReflectionResult)) as (...args: never[]) => void,
      setReflectionErrored: (() =>
        setReflectionEngineResult({ status: 'error', reason: 'request_failed', message: 'debug-forced error' })) as (
        ...args: never[]
      ) => void,
      // Read-only QA introspection: confirms at runtime (not just by code
      // reading) that the room's own animation scheduler is genuinely
      // unpaused while waiting for the real image.
      isSchedulerPaused: (() => schedulerPausedRef.current) as (...args: never[]) => void,
      getDreamEventState: (() => ({ ...dreamEventRef.current })) as (...args: never[]) => void,
      getLampState: (() => ({ ...lampStateRef.current })) as (...args: never[]) => void,
    };
    return () => {
      delete w.__dreamDebug;
    };
  }, [debugMode, selectedElement, reflectionResponse, reflectionEngineResult]);

  const isReconstructing = reconstructionPhase !== 'none';

  // Once a recording has genuinely begun, the title/prompt settle into the
  // background for the rest of the session — including through the finished
  // and settled states. The typing path never touches this.
  const listeningEverStarted = recorder.recordingState !== 'idle' && recorder.recordingState !== 'error';

  useEffect(() => {
    const timer = setTimeout(() => {
      blackVeilRef.current?.classList.add('is-fading');
    }, 1100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let raf = 0;
    const eased = { x: 0, y: 0 };
    function frame() {
      const pointer = pointerRef.current;
      if (pointer && uiLayerRef.current) {
        const nx = pointer.x / window.innerWidth - 0.5;
        const ny = pointer.y / window.innerHeight - 0.5;
        eased.x += (nx - eased.x) * 0.04;
        eased.y += (ny - eased.y) * 0.04;
        const maxShift = 10;
        uiLayerRef.current.style.transform = `translate3d(${eased.x * maxShift}px, ${eased.y * maxShift}px, 0)`;
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [pointerRef]);

  return (
    <div className="hero-dream">
      <DreamVideo videoARef={videoARef} videoBRef={videoBRef} />
      <MemoryVeil
        videoARef={videoARef}
        videoBRef={videoBRef}
        pointerRef={pointerRef}
        holdRef={holdRef}
        echoRef={echoRef}
        dreamEventRef={dreamEventRef}
        startTime={startTime}
      />
      <div className="hero-vignette" aria-hidden="true" />
      <DreamEchoes pointerRef={pointerRef} echoRef={echoRef} lampStateRef={lampStateRef} />
      <div ref={blackVeilRef} className="intro-black-veil" aria-hidden="true" />

      <div ref={uiLayerRef} className="hero-ui-layer">
        <div className="hero-ui-stack">
          <MemoryTitle
            revealed={TITLE_PHASES.has(phase)}
            dissolving={listeningEverStarted}
            reconstructing={isReconstructing}
            pointerRef={pointerRef}
          />
          <DreamPrompt revealed={PROMPT_PHASES.has(phase)} quiet={listeningEverStarted} reconstructing={isReconstructing} />
          <HoldToRemember
            revealed={INTERACTION_PHASES.has(phase)}
            holdRef={holdRef}
            recorder={recorder}
            transcription={transcription}
            centralMode={centralMode}
            setCentralMode={setCentralMode}
            micUnavailable={micUnavailable}
            setMicUnavailable={setMicUnavailable}
            onTypedTranscriptChange={setTypedTranscript}
            onDreamCapture={handleDreamCapture}
            reconstructing={isReconstructing}
          />
        </div>
      </div>

      <CustomCursor pointerRef={pointerRef} holdRef={holdRef} />

      <DreamReconstruction
        phase={reconstructionPhase}
        insideStep={insideStep}
        analysis={analysisResult?.status === 'ok' ? analysisResult.analysis : null}
        brief={brief}
        fragments={fragments}
        dreamElements={dreamElements}
        selectedElement={selectedElement}
        reflectionResult={reflectionEngineResult?.status === 'ok' ? reflectionEngineResult.reflection : null}
        reflectionErrored={reflectionEngineResult?.status === 'error'}
        displayedImageUrl={displayedImageUrl}
        incomingImageUrl={incomingImageUrl}
        onNotQuite={handleNotQuite}
        onCorrectionSubmit={handleCorrectionSubmit}
        onRetryImage={handleRetryImage}
        onYes={handleYes}
        onSelectElement={handleSelectElement}
        onSubmitReflection={handleSubmitReflection}
        onRetryReflection={handleRetryReflection}
      />

      {/* Development aid only — never part of the normal user journey.
          Visit with ?debug=1 to inspect the raw DreamAnalysis. */}
      {debugMode && (
        <DreamAnalysisDevView
          pending={analysisPending}
          result={analysisResult}
          onDismiss={() => {
            setAnalysisResult(null);
            setAnalysisPending(false);
          }}
        />
      )}
    </div>
  );
}
