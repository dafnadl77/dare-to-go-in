import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import '../ui/buttons.css';
import '../ui/mobileRendering.css';
import './prototype.css';
import DreamMapPrototype from './DreamMapPrototype';

/**
 * Entry of the dream-map PROTOTYPE page (dream-map-prototype.html at the project root). Development only: `vite build` builds
 * index.html alone, so this page never reaches the site. It does not load the app, the demo fence, auth or Supabase: it imports
 * nothing that can make a network request.
 */
document.body.classList.add('dmp-body');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DreamMapPrototype />
  </StrictMode>,
);
