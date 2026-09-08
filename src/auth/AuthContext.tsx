import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from './supabaseClient';

export type AuthActionResult =
  | { ok: true; sessionCreated: boolean }
  | { ok: false; error: unknown };

interface AuthContextValue {
  /** The real, authenticated Supabase user — null when signed out. This
      (via supabase.auth's own session, not a localStorage flag) is the
      ONLY source of truth for "is someone signed in" anywhere in the app. */
  user: User | null;
  /** True until the very first session check resolves — callers (see
      RequireAuth.tsx) must not render/redirect on this yet, or a
      genuinely signed-in dreamer would flash through the auth screen on
      every refresh before their real session loads. */
  loading: boolean;
  signInWithPassword: (email: string, password: string) => Promise<AuthActionResult>;
  /** `sessionCreated` distinguishes two genuinely different successes: a
      fresh Supabase project has "Confirm email" on by default, so a brand
      new sign-up returns no session at all until the dreamer clicks the
      link Supabase just emailed them — the caller (DreamAuth) must show
      that as its own state, never treat it as "signed in". */
  signUpWithPassword: (email: string, password: string) => Promise<AuthActionResult>;
  /** Starts the real Google OAuth redirect — the browser navigates away
      to Google, then to Supabase, then back here. Only returns (with an
      error) if the redirect itself couldn't even start; a successful
      call never "returns" in the normal sense, the page just leaves. */
  signInWithGoogle: () => Promise<AuthActionResult>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Appended to the OAuth/redirect target so the app knows to land back on
    the archive (the only reason DreamAuth is ever reached) once a real
    session exists — read once by App.tsx on mount. There is no router in
    this app (see App.tsx's own comment on that), so this plain query
    param is the whole mechanism, not a route. */
export const POST_AUTH_REDIRECT_PARAM = 'view';
export const POST_AUTH_REDIRECT_VALUE = 'archive';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      // Never silently pretend someone is signed in — an unconfigured
      // backend just means auth stays unavailable, not bypassed.
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      subscription.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      async signInWithPassword(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) return { ok: false, error };
        return { ok: true, sessionCreated: true };
      },
      async signUpWithPassword(email, password) {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) return { ok: false, error };
        // A real session comes back immediately only when the project's
        // "Confirm email" setting is off; otherwise data.session is null
        // until the dreamer follows the link in their inbox.
        return { ok: true, sessionCreated: data.session !== null };
      },
      async signInWithGoogle() {
        const redirectTo = `${window.location.origin}/?${POST_AUTH_REDIRECT_PARAM}=${POST_AUTH_REDIRECT_VALUE}`;
        const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
        if (error) return { ok: false, error };
        // On success the browser is already navigating to Google — there
        // is nothing further for this promise to resolve to. The eventual
        // real session (once the OAuth round trip completes) always comes
        // back through onAuthStateChange, not through this return value.
        return { ok: true, sessionCreated: true };
      },
      async signOut() {
        await supabase.auth.signOut();
      },
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth() must be used within an AuthProvider');
  return ctx;
}
