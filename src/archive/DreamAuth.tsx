import { useRef, useEffect, useState, type FormEvent } from 'react';
import DreamStageBackground from '../hero/DreamStageBackground';
import './DreamAuth.css';

export type AuthMode = 'signup' | 'signin';

interface DreamAuthProps {
  mode: AuthMode;
  onSwitchMode: (mode: AuthMode) => void;
  onBack: () => void;
  /** UI-only for this first pass — no real authentication is wired yet.
      Firing this just proceeds into the archive prototype so the whole
      flow can be reviewed end to end. */
  onAuthenticated: () => void;
}

/** A restrained monochrome "G" monogram — deliberately not the multi-color
    branded Google logo, to stay inside DARE's own thin line-icon language
    (see DreamClosing.tsx's portal icons) rather than importing a generic
    SaaS asset. */
function GoogleMark() {
  return (
    <svg className="da-google-mark" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21 12.2c0-.7-.06-1.4-.18-2H12v3.8h5.05c-.22 1.18-.9 2.18-1.9 2.85v2.36h3.07C20.1 17.4 21 15 21 12.2Z"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M12 21c2.43 0 4.47-.8 5.96-2.18l-3.07-2.37c-.85.57-1.94.9-2.89.9-2.22 0-4.1-1.5-4.77-3.5H4.06v2.44A9 9 0 0 0 12 21Z"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M7.23 13.85a5.4 5.4 0 0 1 0-3.7V7.71H4.06a9 9 0 0 0 0 8.58l3.17-2.44Z"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M12 6.75c1.32 0 2.51.45 3.44 1.34l2.58-2.58C16.46 3.94 14.43 3 12 3a9 9 0 0 0-7.94 4.71l3.17 2.44c.67-2 2.55-3.4 4.77-3.4Z"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}

/**
 * The Dream Archive's own authentication screen — the same cloud
 * environment as the rest of DARE, never a floating SaaS login card.
 * UI only for this pass: submitting either form (or the Google button)
 * simply calls onAuthenticated, which the caller uses to move on to the
 * archive prototype. No request is ever sent, no library is wired in.
 */
export default function DreamAuth({ mode, onSwitchMode, onBack, onAuthenticated }: DreamAuthProps) {
  const bgVideoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    bgVideoRef.current?.play().catch(() => {});
  }, []);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const isSignUp = mode === 'signup';

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onAuthenticated();
  };

  return (
    <div className="dream-auth">
      <DreamStageBackground ref={bgVideoRef} active />
      <button type="button" className="da-back" data-cursor-hover onClick={onBack} aria-label="Back to DARE">
        DARE
      </button>

      <div className="da-content">
        {isSignUp ? (
          <>
            <h1 className="da-eyebrow-title">KEEP YOUR DREAMS</h1>
            <p className="da-tagline">Create your private dream archive.</p>
          </>
        ) : (
          <>
            <h1 className="da-eyebrow-title">WELCOME BACK, DREAMER.</h1>
            <p className="da-tagline">&nbsp;</p>
          </>
        )}

        <form className="da-form" onSubmit={handleSubmit}>
          <button type="button" className="da-google" data-cursor-hover onClick={onAuthenticated}>
            <GoogleMark />
            Continue with Google
          </button>

          <div className="da-divider" aria-hidden="true">
            <span>OR</span>
          </div>

          <label className="da-field">
            <input
              className="da-input"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <label className="da-field">
            <input
              className="da-input"
              type="password"
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          <button type="submit" className="da-submit" data-cursor-hover>
            {isSignUp ? 'CREATE MY ARCHIVE' : 'ENTER MY ARCHIVE'}
          </button>
        </form>

        <p className="da-switch">
          {isSignUp ? (
            <>
              Already have an archive?
              <button type="button" className="da-switch-link" data-cursor-hover onClick={() => onSwitchMode('signin')}>
                Sign in
              </button>
            </>
          ) : (
            <>
              New here?
              <button type="button" className="da-switch-link" data-cursor-hover onClick={() => onSwitchMode('signup')}>
                Create your archive
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
