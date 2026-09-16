import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * The ONE privileged Supabase connection in this codebase — used
 * exclusively for public.trial_identities / public.dream_attempts (see
 * dreamAttempts.ts / trialIdentity.ts), never for public.dreams, which
 * continues to be written only via the user's own session + its existing
 * RLS policies, completely unchanged.
 *
 * Why this needs the service-role key at all: those two tables have RLS
 * enabled with ZERO grants to anon/authenticated (see the migration) —
 * Postgres RLS has no way to express "this anonymous request legitimately
 * owns trial X" the way it can check a real auth.uid() claim, since an
 * anonymous request carries no verifiable per-request identity Postgres
 * itself can see. The real authorization for these tables happens in
 * application code (see callerIdentity.ts) BEFORE this client is ever
 * touched — this client itself trusts nothing on its own.
 *
 * SUPABASE_SERVICE_ROLE_KEY must exist ONLY as a server-side environment
 * variable: never VITE_-prefixed, never imported by anything under src/,
 * never logged. Lazily constructed (like getOpenAIClient in
 * openaiClient.ts) so a missing key is a controlled 503 at request time,
 * not a boot-time crash.
 */
let client: SupabaseClient | null = null;
let clientKey: string | undefined;

export function getSupabaseServiceClient(): SupabaseClient | null {
  const url = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  if (!client || clientKey !== serviceRoleKey) {
    client = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    clientKey = serviceRoleKey;
  }
  return client;
}

/**
 * A separate, unprivileged client using only the public anon key — used
 * solely to VERIFY a caller-supplied Supabase access token
 * (auth.getUser(jwt), a real network call to Supabase's own auth server)
 * without ever needing the service-role key just to check who someone is.
 * Deliberately never used for any table read/write.
 */
let verifierClient: SupabaseClient | null = null;

export function getSupabaseAuthVerifierClient(): SupabaseClient | null {
  const url = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  if (!verifierClient) {
    verifierClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return verifierClient;
}
