import './DreamPrompt.css';

interface DreamPromptProps {
  revealed: boolean;
  /** True once the room begins listening — the prompt recedes without leaving. */
  quiet?: boolean;
  /** True once Dream Reconstruction begins — the prompt fully dissolves away. */
  reconstructing?: boolean;
}

export default function DreamPrompt({ revealed, quiet = false, reconstructing = false }: DreamPromptProps) {
  return (
    <p className={`dream-prompt${revealed ? ' is-revealed' : ''}${quiet ? ' is-quiet' : ''}${reconstructing ? ' is-reconstructing' : ''}`}>
      WHAT DO YOU REMEMBER FROM YOUR DREAM?
    </p>
  );
}
