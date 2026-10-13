/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** True in every build except Vercel production (see vite.config.ts and src/demo/demoFlag.ts). */
declare const __DARE_DEMO_BUILD__: boolean;
