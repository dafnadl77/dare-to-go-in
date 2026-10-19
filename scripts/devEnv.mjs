// Starts one of the two local test servers with a safe environment (see scripts/localModelBridge.ts):
//   node scripts/devEnv.mjs bridge   the local model bridge on 127.0.0.1:8787 (real models, no database; models from the OPENAI_* variables, gpt-4.1 for the two new stages by default)
//   node scripts/devEnv.mjs ui       the real screens (not the demo) on :5391, pointed at a dead Supabase address so the live project cannot be reached
//   node scripts/devEnv.mjs demo     the demo screens on :5392 (everything answered inside the browser)
//   node scripts/devEnv.mjs journey  the local test journey on :5393: the demo screens, but the questions and the reflection come from the real model through the local bridge
import { spawn } from 'node:child_process';

const mode = process.argv[2];
const env = { ...process.env };
let args;
if (mode === 'bridge') {
  env.OPENAI_QUESTIONS_MODEL ||= 'gpt-4.1';
  env.OPENAI_REFLECTION_MODEL ||= 'gpt-4.1';
  env.BRIDGE_ADDRESS ||= 'feminine';
  args = ['--import', 'tsx', 'scripts/localModelBridge.ts'];
} else if (mode === 'ui') {
  // Variables set in the process win over .env in Vite, so the real project's address in .env is never used here.
  env.VITE_SUPABASE_URL = 'http://127.0.0.1:9';
  env.VITE_SUPABASE_ANON_KEY = 'local-test-no-database';
  args = ['node_modules/vite/bin/vite.js', '--port', '5391', '--strictPort', '--host', '127.0.0.1'];
} else if (mode === 'demo') {
  args = ['node_modules/vite/bin/vite.js', '--port', '5392', '--strictPort', '--host', '127.0.0.1'];
} else if (mode === 'journey') {
  env.VITE_DEMO_BRIDGE_URL = 'http://127.0.0.1:8787';
  args = ['node_modules/vite/bin/vite.js', '--port', '5393', '--strictPort', '--host', '127.0.0.1'];
} else {
  console.error('usage: node scripts/devEnv.mjs bridge|ui|demo|journey');
  process.exit(1);
}
spawn(process.execPath, args, { stdio: 'inherit', env }).on('exit', (code) => process.exit(code ?? 0));
