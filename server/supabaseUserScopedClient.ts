import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * A per-request Supabase client authenticated as the CALLER'S OWN verified
 * session — anon key only, never the service-role key. Reads/writes made
 * through this client are exactly as privileged as the browser's own
 * Supabase client (src/auth/supabaseClient.ts): Row Level Security is the
 * only thing protecting data either way, so Pattern Reflection needs no
 * new privileged capability at all — see server/routes/patternReflection.ts,
 * which uses this to re-fetch the caller's own dreams (`dreams` table RLS:
 * auth.uid() = owner_id) and to read/write `pattern_reflections` (same
 * shape of RLS), instead of trusting anything the client merely claims.
 *
 * Constructed fresh per call (never cached/singleton) since the access
 * token differs per caller — createClient() itself does no network call,
 * so this is cheap.
 */
export function getSupabaseUserScopedClient(accessToken: string): SupabaseClient | null {
  const url = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
