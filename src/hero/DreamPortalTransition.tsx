import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import DreamPortal, { type DreamPortalHandle } from './DreamPortal';
import type { AccentColor } from './dreamAccentColor';
import './DreamPortalTransition.css';

interface DreamPortalTransitionProps {
  imageUrl: string;
  accent: AccentColor;
  onComplete: () => void;
}

// Target total ~5.2s, inside the requested 4.5–5.5s window. Progress is
// driven linearly by GSAP; the phase pacing (formation/pull/acceleration/
// crossing/arrival) is already shaped inside the shader's own smoothstep
// windows on this same 0..1 value, so no easing curve is needed here.
const PORTAL_DURATION_S = 5.2;
const ENTERING_LABEL_SHOW_AT_S = 2.3;
const ENTERING_LABEL_HIDE_AT_S = 4.1;

/**
 * Orchestrates the "YES — TAKE ME IN" portal: a GSAP timeline drives one
 * progress value that the WebGL vortex and its particle field both read
 * every frame. No new image, no pre-rendered asset — purely a procedural
 * transformation of the dream image already on screen.
 */
export default function DreamPortalTransition({ imageUrl, accent, onComplete }: DreamPortalTransitionProps) {
  const portalRef = useRef<DreamPortalHandle>(null);
  const [labelVisible, setLabelVisible] = useState(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = reducedMotion ? 1.4 : PORTAL_DURATION_S;
    const driver = { value: 0 };
    const timeline = gsap.timeline({
      onComplete: () => onCompleteRef.current(),
    });
    timeline.to(driver, {
      value: 1,
      duration,
      ease: 'none',
      onUpdate: () => portalRef.current?.setProgress(driver.value),
    });
    if (!reducedMotion) {
      timeline
        .call(() => setLabelVisible(true), [], ENTERING_LABEL_SHOW_AT_S)
        .call(() => setLabelVisible(false), [], ENTERING_LABEL_HIDE_AT_S);
    }

    // Belt-and-suspenders: if the timeline is ever killed or GSAP fails to
    // fire onComplete for some environment-specific reason, the journey
    // must never get stuck on a black/frozen portal.
    const safety = setTimeout(() => onCompleteRef.current(), (duration + 1) * 1000);

    return () => {
      timeline.kill();
      clearTimeout(safety);
    };
  }, []);

  return (
    <div className="dream-portal-transition">
      <DreamPortal ref={portalRef} imageUrl={imageUrl} accent={accent} />
      <p className={`dream-portal-label${labelVisible ? ' is-visible' : ''}`}>ENTERING YOUR DREAM&hellip;</p>
    </div>
  );
}
