import './DreamPrompt.css';

interface DreamPromptProps {
  revealed: boolean;
  /** True once the room begins listening — the prompt recedes without leaving. */
  quiet?: boolean;
}

export default function DreamPrompt({ revealed, quiet = false }: DreamPromptProps) {
  return (
    <p className={`dream-prompt${revealed ? ' is-revealed' : ''}${quiet ? ' is-quiet' : ''}`}>
      WHAT DO YOU REMEMBER FROM YOUR DREAM?
    </p>
  );
}
