export interface VideoLoopFrame {
  primary: HTMLVideoElement;
  secondary: HTMLVideoElement | null;
  /** 0..1 opacity weight of `secondary` drawn over `primary`. */
  blend: number;
}

/**
 * Ping-pongs playback between two <video> elements holding the same source,
 * starting the standby element shortly before the active one ends and
 * cross-dissolving between them so the native loop restart is never visible.
 */
export function createVideoLoopController(
  videoA: HTMLVideoElement,
  videoB: HTMLVideoElement,
  crossfadeMs: number,
) {
  let activeIsA = true;
  let blending = false;
  let swapStartTime = 0;
  const crossfadeS = crossfadeMs / 1000;

  function update(now: number): VideoLoopFrame {
    const primary = activeIsA ? videoA : videoB;
    const secondary = activeIsA ? videoB : videoA;

    if (!blending) {
      const duration = primary.duration;
      if (Number.isFinite(duration) && duration > 0) {
        const remaining = duration - primary.currentTime;
        if (remaining <= crossfadeS) {
          secondary.currentTime = 0;
          secondary.play().catch(() => {});
          blending = true;
          swapStartTime = now;
        }
      }
      return { primary, secondary: null, blend: 0 };
    }

    const blend = Math.min(1, (now - swapStartTime) / crossfadeMs);
    if (blend >= 1) {
      primary.pause();
      primary.currentTime = 0;
      activeIsA = !activeIsA;
      blending = false;
      return { primary: secondary, secondary: null, blend: 0 };
    }
    return { primary, secondary, blend };
  }

  return { update };
}

/** Draws `frame.primary` opaque, then cross-dissolves in `frame.secondary`. Preserves whatever filter/compositeOperation the caller has already set. */
export function drawVideoLoopFrame(
  ctx: CanvasRenderingContext2D,
  frame: VideoLoopFrame,
  dw: number,
  dh: number,
) {
  const { primary, secondary, blend } = frame;
  if (primary.readyState >= 2 && primary.videoWidth > 0) {
    ctx.globalAlpha = 1;
    ctx.drawImage(primary, 0, 0, dw, dh);
  }
  if (secondary && blend > 0 && secondary.readyState >= 2 && secondary.videoWidth > 0) {
    ctx.globalAlpha = blend;
    ctx.drawImage(secondary, 0, 0, dw, dh);
    ctx.globalAlpha = 1;
  }
}
