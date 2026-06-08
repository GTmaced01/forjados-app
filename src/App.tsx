import { AuthProvider, useAuth } from './components/AuthProvider';
import { AuthView } from './views/AuthView';
import { RegistrationView } from './views/RegistrationView';
import { DashboardView } from './views/DashboardView';
import { WaitingView } from './views/WaitingView';
import { PwaStatus } from './components/PwaStatus';

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

  if (profileIncomplete) return <RegistrationView />;
  if (!isAdmin && profile.inscription_status !== 'approved') return <WaitingView />;

  return <DashboardView />;
}

export default function App() {
  return (
    <AuthProvider>
      <PwaStatus />
      <AppContent />
    </AuthProvider>
  );
}
