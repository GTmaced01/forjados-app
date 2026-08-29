import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';
import { getMyProfile } from '../services/profiles';
import { withTimeout } from '../services/safeAsync';
import { clearSensitiveLocalData } from '../services/localData';
import { isOfflineError, readOfflineData, saveOfflineData } from '../services/offlineCache';
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
  isOfflineMode: boolean;
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
  isOfflineMode: false,
});

function createOfflineProfileSnapshot(profile: UserProfile): UserProfile {
  return {
    ...profile,
    health_problems: '',
    continuous_medicine: '',
    food_restrictions: '',
    emergency_contact: {},
    terms_accepted: {},
  };
}

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
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const mountedRef = useRef(true);
  const profileRef = useRef<UserProfile | null>(null);

  const loadProfileForUser = useCallback(async (currentUser: User | null) => {
    if (!mountedRef.current) return;

    if (!currentUser) {
      clearSensitiveLocalData();
      setUser(null);
      setProfile(null);
      profileRef.current = null;
      setAuthError('');
      setIsOfflineMode(false);
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
      profileRef.current = profileData;
      saveOfflineData('profile', createOfflineProfileSnapshot(profileData), currentUser.id);
      setAuthError('');
      setIsOfflineMode(false);
    } catch (error) {
      console.error('Erro ao carregar perfil:', error);

      if (!mountedRef.current) return;

      const currentProfile = profileRef.current;
      if (currentProfile?.id === currentUser.id) {
        setProfile(currentProfile);
        setAuthError('Não foi possível atualizar seu perfil agora. Os dados desta sessão foram mantidos.');
        return;
      }

      const cachedProfile = readOfflineData<UserProfile>('profile', currentUser.id);
      if (cachedProfile && isOfflineError(error)) {
        setProfile(cachedProfile);
        profileRef.current = cachedProfile;
        setIsOfflineMode(true);
        setAuthError('Você está offline. Exibindo os últimos dados salvos neste aparelho.');
        return;
      }

      setProfile(null);
      profileRef.current = null;
      setAuthError(getMessage(error, 'Não foi possível carregar seu perfil.'));
    }
  }, []);

  const reloadProfile = useCallback(async () => {
    setAuthError('');

    try {
      const { data, error } = await withTimeout(
        supabase.auth.getSession(),
        12000,
        'Não foi possível recuperar sua sessão. Tente entrar novamente.'
      );

      if (error) throw error;

      const currentUser = data.session?.user ?? null;

      if (!currentUser) {
        setUser(null);
        setProfile(null);
        profileRef.current = null;
        return;
      }

      setUser(currentUser);

      const profileData = await withTimeout(
        getMyProfile(currentUser),
        12000,
        'Tempo limite ao atualizar perfil. Verifique a conexão e tente novamente.'
      );

      if (!mountedRef.current) return;

      if (!profileData) {
        throw new Error('Perfil não encontrado.');
      }

      setProfile(profileData);
      profileRef.current = profileData;
      saveOfflineData('profile', createOfflineProfileSnapshot(profileData), currentUser.id);
      setAuthError('');
      setIsOfflineMode(false);
    } catch (error) {
      console.error('Erro ao recarregar perfil:', error);

      if (!mountedRef.current) return;

      const currentProfile = profileRef.current;
      if (currentProfile) {
        setProfile(currentProfile);
        setAuthError('Não foi possível atualizar seu perfil agora. Os dados desta sessão foram mantidos.');
        return;
      }


      if (user) {
        const cachedProfile = readOfflineData<UserProfile>('profile', user.id);
        if (cachedProfile && isOfflineError(error)) {
          setProfile(cachedProfile);
          profileRef.current = cachedProfile;
          setIsOfflineMode(true);
          setAuthError('Você está offline. Exibindo os últimos dados salvos neste aparelho.');
          return;
        }
      }

      setAuthError(getMessage(error, 'Não foi possível recarregar seu perfil.'));
    }
  }, [user]);

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
        profileRef.current = null;
        setAuthError(getMessage(error, 'Não foi possível iniciar o aplicativo.'));
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    }

    start();

    const { data: listener } = supabase.auth.onAuthStateChange((_event: string, session: { user?: User } | null) => {
      if (!mountedRef.current) return;

      if (!session?.user) {
        clearSensitiveLocalData();
        setUser(null);
        setProfile(null);
        profileRef.current = null;
        setAuthError('');
        setIsOfflineMode(false);
        setLoading(false);
        return;
      }

      const hasCurrentProfile = profileRef.current?.id === session.user.id;

      if (!hasCurrentProfile) {
        setLoading(true);
      }

      loadProfileForUser(session.user).finally(() => {
        if (mountedRef.current && !hasCurrentProfile) {
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
      isOfflineMode,
    };
  }, [user, profile, loading, authError, reloadProfile, isOfflineMode]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
