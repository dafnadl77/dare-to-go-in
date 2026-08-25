import { useEffect, type RefObject } from 'react';
import type { DreamEventState, DreamEventType } from './dreamEventState';
import type { LampState, LampSide } from './lampState';

type ChainLink =
  | { kind: 'dream'; type: DreamEventType; inMs: number; holdMs: number; outMs: number }
  | { kind: 'lamp'; side: LampSide; inMs: number; holdMs: number; outMs: number };

// One continuous, gapless chain: ART -> BED -> MIRROR -> LEFT lamp -> RIGHT
// lamp -> ART -> ... forever. Each link's own in/hold/out durations are
// exactly the ones already approved for that effect (unchanged) — only the
// dead time BETWEEN links has been removed: the next link's startTime is
// set to the exact instant the previous link's total duration elapses.
const CHAIN: ChainLink[] = [
  { kind: 'dream', type: 'art', inMs: 1000, holdMs: 2000, outMs: 1000 },
  { kind: 'dream', type: 'bed', inMs: 1000, holdMs: 2000, outMs: 1000 },
  { kind: 'dream', type: 'mirror', inMs: 1000, holdMs: 2000, outMs: 1000 },
  { kind: 'lamp', side: 'left', inMs: 400, holdMs: 1200, outMs: 400 },
  { kind: 'lamp', side: 'right', inMs: 400, holdMs: 1200, outMs: 400 },
];

function linkDuration(link: ChainLink): number {
  return link.inMs + link.holdMs + link.outMs;
}

function applyLink(link: ChainLink, startTime: number, dreamState: DreamEventState, lampState: LampState) {
  if (link.kind === 'dream') {
    dreamState.activeType = link.type;
    dreamState.startTime = startTime;
    dreamState.inMs = link.inMs;
    dreamState.holdMs = link.holdMs;
    dreamState.outMs = link.outMs;
    lampState.activeSide = null;
  } else {
    lampState.activeSide = link.side;
    lampState.startTime = startTime;
    lampState.inMs = link.inMs;
    lampState.holdMs = link.holdMs;
    lampState.outMs = link.outMs;
    dreamState.activeType = null;
  }
}

/**
 * Drives ART/BED/MIRROR (dreamEventRef, read by MemoryVeil) and the two
 * lamps (lampStateRef, read by DreamEchoes) from a single chained
 * timeline, so only one effect is ever active anywhere and the next one
 * starts the instant the current one's fade-out finishes — no idle gap.
 */
export function useUnifiedDreamSequence(dreamEventRef: RefObject<DreamEventState>, lampStateRef: RefObject<LampState>) {
  useEffect(() => {
    let raf = 0;
    let chainIndex = 0;
    let segmentStartTime: number | null = null;

    function frame(now: number) {
      const dreamState = dreamEventRef.current;
      const lampState = lampStateRef.current;
      if (!dreamState || !lampState) {
        raf = requestAnimationFrame(frame);
        return;
      }

      if (segmentStartTime === null) {
        segmentStartTime = now;
        applyLink(CHAIN[chainIndex], segmentStartTime, dreamState, lampState);
      } else if (now - segmentStartTime >= linkDuration(CHAIN[chainIndex])) {
        chainIndex = (chainIndex + 1) % CHAIN.length;
        segmentStartTime += linkDuration(CHAIN[(chainIndex - 1 + CHAIN.length) % CHAIN.length]);
        applyLink(CHAIN[chainIndex], segmentStartTime, dreamState, lampState);
      }

      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [dreamEventRef, lampStateRef]);
}
