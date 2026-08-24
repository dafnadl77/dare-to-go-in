import { useEffect, useRef, useState } from 'react';
import type { DreamFragment } from './dreamFragmentTypes';
import './DreamFragments.css';

interface DreamFragmentsProps {
  /** The current set of real fragments extracted from the user's transcript — grows over time. */
  fragments: DreamFragment[];
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

export default function DreamFragments({ fragments }: DreamFragmentsProps) {
  const [instances, setInstances] = useState<FragmentInstance[]>([]);
  const shownLabelsRef = useRef<Set<string>>(new Set());
  const idRef = useRef(0);
  const usedPositionsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (fragments.length === 0) {
      shownLabelsRef.current = new Set();
      usedPositionsRef.current = new Set();
      setInstances([]);
      return;
    }

    const newOnes = fragments.filter((f) => !shownLabelsRef.current.has(f.label));
    if (newOnes.length === 0) return;
    newOnes.forEach((f) => shownLabelsRef.current.add(f.label));

    function pickPosition() {
      const available = POSITIONS.map((_, i) => i).filter((i) => !usedPositionsRef.current.has(i));
      const pool = available.length > 0 ? available : POSITIONS.map((_, i) => i);
      const idx = pool[Math.floor(Math.random() * pool.length)];
      usedPositionsRef.current.add(idx);
      if (usedPositionsRef.current.size >= POSITIONS.length) usedPositionsRef.current.clear();
      return POSITIONS[idx];
    }

    setInstances((prev) => [
      ...prev,
      ...newOnes.map((fragment) => {
        const pos = pickPosition();
        return {
          id: idRef.current++,
          fragment,
          x: pos.x,
          y: pos.y,
          faint: Math.random() < 0.4,
        };
      }),
    ]);
  }, [fragments]);

  if (instances.length === 0) return null;

  return (
    <div className="dream-fragments" aria-hidden="true">
      {instances.map((inst) => (
        <span
          key={inst.id}
          className={`dream-fragment${inst.faint ? ' is-faint' : ' is-fading'}`}
          style={{ left: `${inst.x * 100}%`, top: `${inst.y * 100}%` }}
          data-type={inst.fragment.type}
        >
          {inst.fragment.label}
        </span>
      ))}
    </div>
  );
}
