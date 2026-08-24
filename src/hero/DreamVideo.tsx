import { useEffect, type RefObject } from 'react';
import './DreamVideo.css';

const VIDEO_SRC = '/dare-to-go-in-hero-muted.mp4';

interface DreamVideoProps {
  videoARef: RefObject<HTMLVideoElement | null>;
  videoBRef: RefObject<HTMLVideoElement | null>;
}

function forceMute(video: HTMLVideoElement) {
  video.muted = true;
  video.defaultMuted = true;
  video.volume = 0;
}

/**
 * Two stacked instances of the same hero video. Only one plays at a time
 * under normal conditions — MemoryVeil's loop controller starts the second
 * shortly before the first ends and cross-dissolves between them so the
 * native loop restart is never visible. Both must stay muted forever.
 */
export default function DreamVideo({ videoARef, videoBRef }: DreamVideoProps) {
  useEffect(() => {
    const videos = [videoARef.current, videoBRef.current].filter(
      (v): v is HTMLVideoElement => v !== null,
    );
    if (videos.length === 0) return;

    const cleanups: Array<() => void> = [];
    videos.forEach((video) => {
      forceMute(video);
      const reassertMute = () => {
        if (!video.muted || video.volume !== 0) forceMute(video);
      };
      video.addEventListener('volumechange', reassertMute);
      cleanups.push(() => video.removeEventListener('volumechange', reassertMute));
    });

    const tryPlay = () => videoARef.current?.play().catch(() => {});
    tryPlay();
    document.addEventListener('pointerdown', tryPlay, { once: true });
    cleanups.push(() => document.removeEventListener('pointerdown', tryPlay));

    return () => cleanups.forEach((fn) => fn());
  }, [videoARef, videoBRef]);

  return (
    <>
      <video
        ref={videoARef}
        className="dream-video"
        src={VIDEO_SRC}
        autoPlay
        muted
        playsInline
        controls={false}
        disablePictureInPicture
        preload="auto"
        aria-hidden="true"
      />
      <video
        ref={videoBRef}
        className="dream-video"
        src={VIDEO_SRC}
        muted
        playsInline
        controls={false}
        disablePictureInPicture
        preload="auto"
        aria-hidden="true"
      />
    </>
  );
}
