import { useState } from 'react';
import { buildReflectionQuestion } from './dreamElements';
import type { InsideStep } from './DreamReconstruction';
import './DreamReflection.css';

interface DreamReflectionProps {
  step: InsideStep;
  elements: string[];
  selectedElement: string | null;
  onSelect: (element: string) => void;
  onSubmitReflection: (text: string) => void;
}

const CHOICE_STEPS = new Set<InsideStep>(['choices', 'selected']);
const RESPONSE_STEPS = new Set<InsideStep>(['reflecting', 'stored']);

/**
 * WHAT STANDS OUT TO YOU? → pick one real dream element → a reflection
 * question generated from that exact element → free-text response. Every
 * choice comes from the real DreamAnalysis (via deriveDreamElements) —
 * nothing here is invented, no image recognition, no hotspots.
 */
export default function DreamReflection({ step, elements, selectedElement, onSelect, onSubmitReflection }: DreamReflectionProps) {
  const [responseText, setResponseText] = useState('');

  const showReflectionQuestion = RESPONSE_STEPS.has(step) && selectedElement;
  const questionText = showReflectionQuestion ? buildReflectionQuestion(selectedElement) : 'WHAT STANDS OUT TO YOU?';

  const handleContinue = () => {
    const text = responseText.trim();
    if (!text) return;
    onSubmitReflection(text);
  };

  return (
    <div className="dream-reflection" data-step={step}>
      <p className="dr-question">{questionText}</p>

      {CHOICE_STEPS.has(step) && elements.length > 0 && (
        <div className="dr-elements" aria-hidden={step !== 'choices'}>
          {elements.map((el) => (
            <button
              key={el}
              type="button"
              className={`dr-element${selectedElement === el ? ' is-selected' : ''}${
                selectedElement && selectedElement !== el ? ' is-fading' : ''
              }`}
              data-cursor-hover
              disabled={!!selectedElement}
              onClick={() => onSelect(el)}
            >
              {el.toUpperCase()}
            </button>
          ))}
        </div>
      )}

      {RESPONSE_STEPS.has(step) && (
        <div className="dr-response">
          <textarea
            className="dr-response-textarea"
            value={responseText}
            onChange={(e) => setResponseText(e.target.value)}
            placeholder="TYPE WHAT COMES TO MIND..."
            dir="auto"
            rows={3}
            readOnly={step === 'stored'}
          />
          {step === 'reflecting' && (
            <button type="button" className="dr-choice" data-cursor-hover onClick={handleContinue}>
              CONTINUE
            </button>
          )}
        </div>
      )}
    </div>
  );
}
