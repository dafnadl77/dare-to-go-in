import { useState } from 'react';
import HeroDream from './hero/HeroDream';
import DreamAuth, { type AuthMode } from './archive/DreamAuth';
import DreamArchive from './archive/DreamArchive';
import DreamDetail from './archive/DreamDetail';
import type { ArchiveEntry } from './archive/archiveData';

/** Which top-level experience is mounted. No router is introduced for
    this first pass (the whole app is already a single state machine —
    see HeroDream.tsx) — 'dream' is the entire existing reconstruction/
    reflection/closing journey, untouched; 'auth'/'archive'/'detail' are
    the Dream Archive area, reached only via DREAM SAVED.'s "go to my
    dream archive" invitation. 'detail' always returns to 'archive', never
    anywhere else, matching "clicking a dream opens it; leaving it returns
    to MY DREAM ARCHIVE" from the brief. */
type AppView = 'dream' | 'auth' | 'archive' | 'detail';

function App() {
  const [view, setView] = useState<AppView>('dream');
  const [authMode, setAuthMode] = useState<AuthMode>('signup');
  const [openEntry, setOpenEntry] = useState<ArchiveEntry | null>(null);

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

  if (view === 'detail' && openEntry) {
    return <DreamDetail entry={openEntry} onBack={() => setView('archive')} onGoHome={() => setView('dream')} />;
  }

  if (view === 'archive') {
    return (
      <DreamArchive
        onBack={() => setView('dream')}
        onOpenEntry={(entry) => {
          setOpenEntry(entry);
          setView('detail');
        }}
      />
    );
  }

  return <HeroDream onGoToArchive={() => setView('auth')} />;
}

export default App;
