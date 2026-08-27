import { lazy, Suspense, useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './components/AuthProvider';
import { AuthView } from './views/AuthView';
import { WaitingView } from './views/WaitingView';
import { PwaStatus } from './components/PwaStatus';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { initialPasswordRecovery, supabase } from './services/supabase';
import { isPasswordRecoveryUrl } from './services/authRecovery';
import { PushPermissionPrompt } from './components/PushPermissionPrompt';

const RegistrationView = lazy(() =>
  import('./views/RegistrationView').then(({ RegistrationView }) => ({ default: RegistrationView })),
);
const DashboardView = lazy(() =>
  import('./views/DashboardView').then(({ DashboardView }) => ({ default: DashboardView })),
);

function AppLoading() {
  return (
    <div className="page-center">
      <div className="panel center">
        <h1>FORJADOS</h1>
        <div className="loader"></div>
        <p className="muted">Preparando sua experiência...</p>
      </div>
    </div>
  );
}

function isRecoveryUrl() {
  return initialPasswordRecovery || isPasswordRecoveryUrl(window.location);
}

function AppContent() {
  const { user, profile, loading, authError, isAdmin, reloadProfile } = useAuth();

  if (loading) {
    return (
      <div className="page-center">
        <div className="panel center">
          <h1>FORJADOS</h1>
          <div className="loader"></div>
          <p className="muted">Carregando aplicativo...</p>
        </div>
      </div>
    );
  }

  if (!user) return <AuthView />;

  if (!profile) {
    return (
      <>
        <div className="page-center">
          <div className="panel center auth-recovery-panel">
            <h1>FORJADOS</h1>
            <p className="muted">{authError || 'Não foi possível carregar seu perfil automaticamente.'}</p>
            <div className="auth-recovery-actions">
              <button className="primary-button" type="button" onClick={reloadProfile}>Tentar novamente</button>
              <button className="secondary-button" type="button" onClick={() => { window.location.href = '/'; }}>Atualizar página</button>
            </div>
          </div>
        </div>
        <PushPermissionPrompt userId={user.id} />
      </>
    );
  }

  const profileIncomplete =
    !profile.display_name ||
    !profile.phone ||
    !profile.birth_date ||
    !profile.city ||
    !profile.neighborhood ||
    !profile.primary_team ||
    !profile.sectors ||
    profile.sectors.length === 0;

  const content = profileIncomplete ? (
    <RegistrationView />
  ) : !isAdmin && profile.inscription_status !== 'approved' ? (
    <WaitingView />
  ) : (
    <DashboardView />
  );

  return (
    <>
      {content}
      <PushPermissionPrompt userId={user.id} />
    </>
  );
}

function AppGate() {
  const [passwordRecovery, setPasswordRecovery] = useState(isRecoveryUrl);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event: string) => {
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
      if (event === 'SIGNED_OUT') setPasswordRecovery(false);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  if (passwordRecovery) {
    return <AuthView initialMode="update-password" onPasswordUpdated={() => setPasswordRecovery(false)} />;
  }

  return <AppContent />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppErrorBoundary>
        <PwaStatus />
        <Suspense fallback={<AppLoading />}>
          <AppGate />
        </Suspense>
      </AppErrorBoundary>
    </AuthProvider>
  );
}
