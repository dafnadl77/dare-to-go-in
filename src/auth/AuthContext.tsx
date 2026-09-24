import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { claimTrial } from './claimTrial';
import { ADDRESS_PREFERENCE_METADATA_KEY, type AddressPreference } from '../hero/addressPreference';

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
  /** True from the moment Supabase's own PASSWORD_RECOVERY auth event
      fires (the dreamer followed a real password-reset email link) until
      updatePassword() below actually succeeds. This — not merely "a
      session exists" — is what App.tsx's guard checks to keep a
      recovery link from dropping straight into the normal archive
      before a new password is actually set: a recovery link creates a
      real Supabase session same as any sign-in, so `user` alone can't
      tell the two apart. Deliberately NOT cleared just by navigating
      away (see App.tsx) — only a genuine successful password change
      clears it, so a dreamer who backs out and returns to the same link
      is still correctly routed to "set a new password", not the archive. */
  isPasswordRecovery: boolean;
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
  /** The official Supabase password-recovery request — always resolves
      to a generic success (Supabase itself never reveals whether the
      email is actually registered, so this app doesn't either; see
      ResetPassword request screen). Only a genuine failure to even reach
      Supabase (network, rate limit) surfaces as an error here. */
  resetPasswordForEmail: (email: string) => Promise<AuthActionResult>;
  /** Sets a new password on the CURRENT session — only meaningful while
      isPasswordRecovery is true (see ResetPassword.tsx, which is the
      only caller). Clears isPasswordRecovery on success. */
  updatePassword: (newPassword: string) => Promise<AuthActionResult>;
  /** The dreamer's own explicit, optional choice of how DARE addresses
      them in generated Hebrew (see ../hero/addressPreference.ts) — stored
      directly on the Supabase auth user's own metadata (the safest
      existing per-user store: no new table, already owner-isolated by
      Supabase itself, never readable/writable by anyone but this user's
      own session). NEVER called automatically or inferred from anything;
      the only caller is the dreamer's own explicit choice in Settings. */
  updateAddressPreference: (preference: AddressPreference) => Promise<AuthActionResult>;
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
/** The view App.tsx shows for a password-recovery link — see
    ResetPassword.tsx. Exported so App.tsx's getInitialView() recognizes
    it without either file guessing the other's string literal. */
export const RESET_PASSWORD_VIEW_VALUE = 'reset-password';

/** Always built from the browser's own current origin — never a
    hardcoded domain — so this is correct in every environment without
    edits: localhost:5173 in dev, the real Vercel domain in production,
    daretogoin.com now that it's live, and any future domain with no code
    change. Used for the Google OAuth redirect and the sign-up
    confirmation-email link, so a confirmed/authenticated dreamer always
    lands back on the archive instead of the bare homepage. */
function postAuthRedirectUrl(): string {
  return `${window.location.origin}/?${POST_AUTH_REDIRECT_PARAM}=${POST_AUTH_REDIRECT_VALUE}`;
}

/** Same never-hardcoded-origin approach as postAuthRedirectUrl, pointed
    at the dedicated "set a new password" view instead — see
    resetPasswordForEmail below and ResetPassword.tsx. Must be added to
    Supabase's Auth → URL Configuration → Redirect URLs allow-list (see
    this task's own final report) or Supabase silently falls back to the
    project's default Site URL instead of sending the dreamer here. */
function resetPasswordRedirectUrl(): string {
  return `${window.location.origin}/?${POST_AUTH_REDIRECT_PARAM}=${RESET_PASSWORD_VIEW_VALUE}`;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

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

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      // Fires exactly once, only when the session that just materialized
      // came from a real password-recovery link (see
      // resetPasswordRedirectUrl) — never for an ordinary sign-in, even
      // though both end up setting a real session the same way. This is
      // the one authoritative signal ResetPassword.tsx/App.tsx's guard
      // rely on; nothing here parses the URL itself.
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
      }
      // SIGNED_IN fires only for a genuinely new sign-in during this page
      // lifetime (password sign-in, sign-up that creates a session
      // immediately, or an OAuth/magic-link redirect completing) — never
      // for the initial session restore on page load (that's its own
      // INITIAL_SESSION event) and never for a background token refresh,
      // so this never re-fires the claim on every reload of an already
      // signed-in visitor.
      if (event === 'SIGNED_IN' && session?.access_token) {
        claimTrial(session.access_token);
      }
    });

    return () => {
      subscription.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      isPasswordRecovery,
      async signInWithPassword(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) return { ok: false, error };
        return { ok: true, sessionCreated: true };
      },
      async signUpWithPassword(email, password) {
        // emailRedirectTo is set explicitly rather than left to Supabase's
        // dashboard-configured Site URL default — a fresh Supabase project
        // defaults that to http://localhost:3000, which is exactly what
        // sent the first real confirmation email to the wrong place before
        // the dashboard was corrected. Passing it here makes the app
        // correct on its own, in every environment, regardless of that
        // dashboard setting.
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: postAuthRedirectUrl() },
        });
        if (error) return { ok: false, error };
        // A real session comes back immediately only when the project's
        // "Confirm email" setting is off; otherwise data.session is null
        // until the dreamer follows the link in their inbox.
        return { ok: true, sessionCreated: data.session !== null };
      },
      async signInWithGoogle() {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          // prompt: 'select_account' forces Google's own native account
          // chooser every time this fires (an explicit "Continue with
          // Google" click — see DreamAuth.tsx's handleGoogleClick, the
          // only caller) instead of silently reusing whichever Google
          // account happens to already be signed in on this device. Purely
          // a Google-side authorization-request parameter passed through
          // Supabase's own supported OAuth options — never touches Supabase
          // session restoration for an already-authenticated DARE user,
          // which goes through getSession()/onAuthStateChange and never
          // calls this at all.
          options: { redirectTo: postAuthRedirectUrl(), queryParams: { prompt: 'select_account' } },
        });
        if (error) return { ok: false, error };
        // On success the browser is already navigating to Google — there
        // is nothing further for this promise to resolve to. The eventual
        // real session (once the OAuth round trip completes) always comes
        // back through onAuthStateChange, not through this return value.
        return { ok: true, sessionCreated: true };
      },
      async resetPasswordForEmail(email) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: resetPasswordRedirectUrl(),
        });
        // Supabase itself never distinguishes "no account for this
        // email" as its own error here (a deliberate anti-enumeration
        // choice on their side) — only a real failure to even make the
        // request (network, rate limit) comes back as an error, so the
        // caller can safely show one generic "if an account exists…"
        // message regardless of which branch this took.
        if (error) return { ok: false, error };
        return { ok: true, sessionCreated: false };
      },
      async updatePassword(newPassword) {
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) return { ok: false, error };
        setIsPasswordRecovery(false);
        return { ok: true, sessionCreated: true };
      },
      async updateAddressPreference(preference) {
        // Supabase merges `data` into the user's existing user_metadata
        // (never a full replace) and fires its own USER_UPDATED auth event,
        // which the listener above already handles (setUser(session.user)),
        // so `user.user_metadata` refreshes on its own — no extra state here.
        const { error } = await supabase.auth.updateUser({ data: { [ADDRESS_PREFERENCE_METADATA_KEY]: preference } });
        if (error) return { ok: false, error };
        return { ok: true, sessionCreated: false };
      },
      async signOut() {
        await supabase.auth.signOut();
      },
    }),
    [user, loading, isPasswordRecovery],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth() must be used within an AuthProvider');
  return ctx;
}
