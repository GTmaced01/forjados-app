import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';
import { getMyProfile } from '../services/profiles';
import { withTimeout } from '../services/safeAsync';
import type { UserProfile } from '../types';

type AuthContextValue = {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  authError: string;
  reloadProfile: () => Promise<void>;
  isAdmin: boolean;
  isDirector: boolean;
  isLeader: boolean;
  isTreasury: boolean;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  profile: null,
  loading: true,
  authError: '',
  reloadProfile: async () => {},
  isAdmin: false,
  isDirector: false,
  isLeader: false,
  isTreasury: false,
});

function getMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  return fallback;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const mountedRef = useRef(true);

  const loadProfileForUser = useCallback(async (currentUser: User | null) => {
    if (!mountedRef.current) return;

    if (!currentUser) {
      setUser(null);
      setProfile(null);
      setAuthError('');
      return;
    }

    setUser(currentUser);

    try {
      const profileData = await withTimeout(
        getMyProfile(currentUser),
        12000,
        'Tempo limite ao carregar perfil. Verifique a conexão e tente novamente.'
      );

      if (!mountedRef.current) return;

      if (!profileData) {
        throw new Error('Perfil não encontrado e não foi possível criar automaticamente.');
      }

      setProfile(profileData);
      setAuthError('');
    } catch (error) {
      console.error('Erro ao carregar perfil:', error);

      if (!mountedRef.current) return;

      setProfile(null);
      setAuthError(getMessage(error, 'Não foi possível carregar seu perfil.'));
    }
  }, []);

  const reloadProfile = useCallback(async () => {
    setLoading(true);
    setAuthError('');

    try {
      const { data, error } = await withTimeout(
        supabase.auth.getSession(),
        12000,
        'Não foi possível recuperar sua sessão. Tente entrar novamente.'
      );

      if (error) throw error;

      await loadProfileForUser(data.session?.user ?? null);
    } catch (error) {
      console.error('Erro ao recarregar perfil:', error);
      setProfile(null);
      setAuthError(getMessage(error, 'Não foi possível recarregar seu perfil.'));
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [loadProfileForUser]);

  useEffect(() => {
    mountedRef.current = true;

    async function start() {
      setLoading(true);
      setAuthError('');

      try {
        const { data, error } = await withTimeout(
          supabase.auth.getSession(),
          12000,
          'Não foi possível iniciar a sessão. Tente entrar novamente.'
        );

        if (error) throw error;

        await loadProfileForUser(data.session?.user ?? null);
      } catch (error) {
        console.error('Erro geral ao iniciar AuthProvider:', error);

        if (!mountedRef.current) return;

        setUser(null);
        setProfile(null);
        setAuthError(getMessage(error, 'Não foi possível iniciar o aplicativo.'));
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    }

    start();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mountedRef.current) return;

      if (!session?.user) {
        setUser(null);
        setProfile(null);
        setAuthError('');
        setLoading(false);
        return;
      }

      setLoading(true);

      loadProfileForUser(session.user).finally(() => {
        if (mountedRef.current) {
          setLoading(false);
        }
      });
    });

    return () => {
      mountedRef.current = false;
      listener.subscription.unsubscribe();
    };
  }, [loadProfileForUser]);

  const value = useMemo(() => {
    const role = profile?.role;

    return {
      user,
      profile,
      loading,
      authError,
      reloadProfile,
      isAdmin: role === 'admin' || profile?.is_admin === true,
      isDirector: role === 'director' || role === 'admin' || profile?.is_admin === true,
      isLeader:
        role === 'leader' ||
        role === 'director' ||
        role === 'admin' ||
        profile?.is_admin === true,
      isTreasury: role === 'treasury' || role === 'admin' || profile?.is_admin === true,
    };
  }, [user, profile, loading, authError, reloadProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
