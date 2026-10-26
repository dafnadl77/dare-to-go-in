import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import '../ui/buttons.css';
import '../ui/mobileRendering.css';
import './prototype.css';
import './conversationDemo.css';
import ConversationDemo from './ConversationDemo';

/**
 * Entry of the CONVERSATION page (conversation.html at the project root, doc 102 step 2). Development only: `vite build` builds
 * index.html alone, so this page never reaches the site. The model is a stub inside the page; nothing here makes a network request.
 */
document.body.classList.add('dmp-body');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConversationDemo />
  </StrictMode>,
);
