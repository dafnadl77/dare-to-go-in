import { useEffect, useRef } from 'react';
import DreamVideo from './DreamVideo';
import MemoryVeil from './MemoryVeil';
import MemoryTitle from './MemoryTitle';
import DreamPrompt from './DreamPrompt';
import HoldToRemember from './HoldToRemember';
import CustomCursor from './CustomCursor';
import DreamEchoes from './DreamEchoes';
import { usePointerRef } from './usePointerRef';
import { useOpeningSequence } from './useOpeningSequence';
import { createHoldState } from './HoldState';
import { createEchoState } from './EchoState';
import './HeroDream.css';

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
  const { phase, startTime } = useOpeningSequence();

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
        startTime={startTime}
      />
      <div className="hero-vignette" aria-hidden="true" />
      <DreamEchoes pointerRef={pointerRef} echoRef={echoRef} />
      <div ref={blackVeilRef} className="intro-black-veil" aria-hidden="true" />

      <div ref={uiLayerRef} className="hero-ui-layer">
        <div className="hero-ui-stack">
          <MemoryTitle revealed={TITLE_PHASES.has(phase)} pointerRef={pointerRef} />
          <DreamPrompt revealed={PROMPT_PHASES.has(phase)} />
          <HoldToRemember revealed={INTERACTION_PHASES.has(phase)} holdRef={holdRef} />
        </div>
      </div>

      <CustomCursor pointerRef={pointerRef} holdRef={holdRef} />
    </div>
  );
}
