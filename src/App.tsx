import { useState } from 'react';
import HeroDream from './hero/HeroDream';
import DreamAuth, { type AuthMode } from './archive/DreamAuth';
import DreamArchive from './archive/DreamArchive';

/** Which top-level experience is mounted. No router is introduced for
    this first pass (the whole app is already a single state machine —
    see HeroDream.tsx) — 'dream' is the entire existing reconstruction/
    reflection/closing journey, untouched; 'auth'/'archive' are the new,
    fully separate Dream Archive area, reached only via DREAM SAVED.'s
    "go to my dream archive" invitation. */
type AppView = 'dream' | 'auth' | 'archive';

function App() {
  const [view, setView] = useState<AppView>('dream');
  const [authMode, setAuthMode] = useState<AuthMode>('signup');

  if (view === 'auth') {
    return (
      <DreamAuth
        mode={authMode}
        onSwitchMode={setAuthMode}
        onBack={() => setView('dream')}
        onAuthenticated={() => setView('archive')}
      />
    );
  }

  if (view === 'archive') {
    return <DreamArchive onBack={() => setView('dream')} />;
  }

  return <HeroDream onGoToArchive={() => setView('auth')} />;
}

export default App;
