import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * One Supabase client for the whole app — real production auth (see
 * AuthContext.tsx), never a second competing source of "am I logged in"
 * truth. Only the public URL + anon/publishable key ever live here: both
 * are safe in client code by design (Supabase's Row Level Security, not
 * secrecy of this key, is what actually protects data) — a service-role
 * key must never appear in any file under src/.
 *
 * Reads from Vite's import.meta.env, which only exposes variables
 * prefixed VITE_ to the browser bundle (see .env / .env.example) — the
 * same mechanism this project already avoids for anything server-secret
 * (OPENAI_API_KEY has no VITE_ prefix specifically so it can never end up
 * here).
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Loud in dev, not a thrown error in prod — a misconfigured deployment
  // should fail auth calls with a clear message (see AuthContext.tsx),
  // not crash the entire app before the dream-recording journey (which
  // needs no auth at all) ever renders.
  console.error(
    'Supabase is not configured: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are missing. Auth will not work until these are set.',
  );
}

export const supabase: SupabaseClient = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '', {
  auth: {
    // Real, persisted session — never a fake localStorage boolean. This
    // is Supabase's own session store (a signed JWT + refresh token),
    // the actual source of truth AuthContext.tsx reads from.
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
