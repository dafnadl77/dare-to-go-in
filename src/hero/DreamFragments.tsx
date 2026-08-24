import { useEffect, useRef, useState } from 'react';
import { DEMO_DREAM_FRAGMENTS, type DreamFragment } from './dreamFragmentTypes';
import type { RecordingState } from './useDreamRecorder';
import './DreamFragments.css';

interface DreamFragmentsProps {
  recordingState: RecordingState;
}

interface FragmentInstance {
  id: number;
  fragment: DreamFragment;
  x: number;
  y: number;
  faint: boolean;
}

/** Scattered positions around the room, away from the central title/prompt/interaction column. */
const POSITIONS = [
  { x: 0.13, y: 0.26 },
  { x: 0.86, y: 0.22 },
  { x: 0.09, y: 0.6 },
  { x: 0.89, y: 0.58 },
  { x: 0.22, y: 0.82 },
  { x: 0.78, y: 0.83 },
  { x: 0.5, y: 0.1 },
];

function shuffled<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export default function DreamFragments({ recordingState }: DreamFragmentsProps) {
  const [instances, setInstances] = useState<FragmentInstance[]>([]);
  const idRef = useRef(0);
  const usedPositionsRef = useRef<Set<number>>(new Set());

  const active = recordingState === 'recording';
  const visible = recordingState === 'recording' || recordingState === 'finished' || recordingState === 'paused';

  useEffect(() => {
    if (!active) return;

    setInstances([]);
    usedPositionsRef.current = new Set();
    const queue = shuffled(DEMO_DREAM_FRAGMENTS).slice(0, 4 + Math.floor(Math.random() * 2));
    const timers: ReturnType<typeof setTimeout>[] = [];
    let cancelled = false;

    function pickPosition() {
      const available = POSITIONS.map((_, i) => i).filter((i) => !usedPositionsRef.current.has(i));
      const pool = available.length > 0 ? available : POSITIONS.map((_, i) => i);
      const idx = pool[Math.floor(Math.random() * pool.length)];
      usedPositionsRef.current.add(idx);
      if (usedPositionsRef.current.size >= POSITIONS.length) usedPositionsRef.current.clear();
      return POSITIONS[idx];
    }

    function scheduleNext(queueIndex: number) {
      if (cancelled || queueIndex >= queue.length) return;
      const delay = 2600 + Math.random() * 2200;
      timers.push(
        setTimeout(() => {
          if (cancelled) return;
          const pos = pickPosition();
          setInstances((prev) => [
            ...prev,
            {
              id: idRef.current++,
              fragment: queue[queueIndex],
              x: pos.x,
              y: pos.y,
              faint: Math.random() < 0.4,
            },
          ]);
          scheduleNext(queueIndex + 1);
        }, delay),
      );
    }
    scheduleNext(0);

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [active]);

  useEffect(() => {
    if (recordingState === 'idle') setInstances([]);
  }, [recordingState]);

  if (!visible && instances.length === 0) return null;

  return (
    <div className="dream-fragments" aria-hidden="true">
      {instances.map((inst) => (
        <span
          key={inst.id}
          className={`dream-fragment${inst.faint ? ' is-faint' : ' is-fading'}`}
          style={{ left: `${inst.x * 100}%`, top: `${inst.y * 100}%` }}
          data-type={inst.fragment.type}
        >
          {inst.fragment.text}
        </span>
      ))}
    </div>
  );
}
