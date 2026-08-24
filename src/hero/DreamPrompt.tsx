import './DreamPrompt.css';

interface DreamPromptProps {
  revealed: boolean;
}

export default function DreamPrompt({ revealed }: DreamPromptProps) {
  return (
    <p className={`dream-prompt${revealed ? ' is-revealed' : ''}`}>
      WHAT DO YOU REMEMBER?
    </p>
  );
}
