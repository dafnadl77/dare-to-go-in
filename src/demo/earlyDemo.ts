import { DEMO_BUILD, demoRequested } from './demoFlag';
import { installDemo } from './installDemo';

/**
 * Imported FIRST by main.tsx, so that (module evaluation follows import order) the demo's network fence and demo session are in place
 * before the Supabase client or any other part of the app starts. In a production build DEMO_BUILD is the constant false, so this
 * whole module and everything it imports is removed from the bundle.
 */
if (DEMO_BUILD && demoRequested()) installDemo();
