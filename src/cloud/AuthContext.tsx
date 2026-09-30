import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Linking } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { requireSupabase, supabase } from './supabase';
import type { AuthContextValue } from './types';
import { acceptProfileInvite } from './workspaces';

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(supabase));
  const [isRecoveringPassword, setIsRecoveringPassword] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setIsLoading(false);
      return;
    }
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session);
        setIsLoading(false);
      }
    }).catch(() => {
      if (mounted) setIsLoading(false);
    });
    const finishAuthLink = async (url: string | null) => {
      if (!url?.startsWith('kudosfamily://auth-callback')) return;
      const client = requireSupabase();
      const parsed = new URL(url);
      const params = new URLSearchParams(parsed.search);
      const fragmentParams = new URLSearchParams(parsed.hash.replace(/^#/, ''));
      fragmentParams.forEach((value, key) => { if (!params.has(key)) params.set(key, value); });
      const code = params.get('code');
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const authFlow = (params.get('flow') ?? params.get('type') ?? '').toLowerCase();
      if (code) {
        const { error } = await client.auth.exchangeCodeForSession(code);
        if (error) throw error;
      } else if (accessToken && refreshToken) {
        const { error } = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        if (error) throw error;
      } else {
        throw new Error('This account link is invalid or has expired.');
      }
      // Email confirmation and password recovery share the same native callback.
      // Only an explicit recovery link may open the password-change screen.
      setIsRecoveringPassword(authFlow === 'recovery');
    };
    void Linking.getInitialURL().then(finishAuthLink).catch(() => undefined);
    const linkSubscription = Linking.addEventListener('url', ({ url }) => { void finishAuthLink(url).catch(() => undefined); });
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === 'PASSWORD_RECOVERY') setIsRecoveringPassword(true);
    });
    return () => {
      mounted = false;
      linkSubscription.remove();
      data.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    user: session?.user ?? null,
    isLoading,
    isRecoveringPassword,
    signIn: async (email, password) => {
      const client = requireSupabase();
      const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
    },
    signUp: async (email, password, displayName, legalAcceptance, adultInviteCode) => {
      const client = requireSupabase();
      const { data, error } = await client.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: 'kudosfamily://auth-callback?flow=signup',
          data: {
            display_name: displayName.trim(),
            account_type: 'adult',
            adult_invite_code: adultInviteCode?.trim() || undefined,
            legal_terms_version: legalAcceptance.termsVersion,
            legal_privacy_version: legalAcceptance.privacyVersion,
            legal_accepted_at: legalAcceptance.acceptedAt,
            legal_acceptance_source: 'mobile_app',
          },
        },
      });
      if (error) throw error;
      return { needsEmailConfirmation: !data.session };
    },
    createChildAccount: async (inviteCode) => {
      const client = requireSupabase();
      const { error } = await client.auth.signInAnonymously({ options: { data: { account_type: 'child' } } });
      if (error) {
        if (/anonymous sign.?ins? (?:are )?disabled|anonymous.*disabled/i.test(error.message)) {
          throw new Error('Child accounts are not enabled for this Kudos Cloud environment. Enable Anonymous Sign-Ins in the Supabase Authentication settings, then try again.');
        }
        throw error;
      }
      try {
        await acceptProfileInvite(inviteCode);
        // Anonymous sign-in publishes the session before the invite RPC has
        // linked its profile. Refresh the session after linking so workspace
        // routing immediately re-runs with the child's real membership.
        await client.auth.refreshSession().catch(() => undefined);
      } catch (error) {
        await client.functions.invoke('profile-invite', { body: { action: 'cleanup-failed-child' } }).catch(() => undefined);
        await client.auth.signOut().catch(() => undefined);
        throw error;
      }
    },
    signOut: async () => {
      const client = requireSupabase();
      const { error } = await client.auth.signOut();
      if (error) throw error;
    },
    resetPassword: async (email) => {
      const client = requireSupabase();
      const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: 'kudosfamily://auth-callback?flow=recovery' });
      if (error) throw error;
    },
    updatePassword: async (password) => {
      if (password.length < 8) throw new Error('Use a password with at least 8 characters.');
      const { error } = await requireSupabase().auth.updateUser({ password });
      if (error) throw error;
      setIsRecoveringPassword(false);
    },
    cancelPasswordRecovery: async () => {
      setIsRecoveringPassword(false);
      await requireSupabase().auth.signOut();
    },
  }), [isLoading, isRecoveringPassword, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}
