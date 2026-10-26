import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import '../ui/buttons.css';
import '../ui/mobileRendering.css';
import './prototype.css';
import PairConversation from './PairConversation';

/**
 * Entry of the PAIR-AND-QUESTION design page (pair-conversation.html at the project root). Development only: `vite build` builds
 * index.html alone, so this page never reaches the site. It imports nothing that can make a network request.
 */
document.body.classList.add('dmp-body');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PairConversation />
  </StrictMode>,
);
