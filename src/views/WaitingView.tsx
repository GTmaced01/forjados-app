import { useState } from 'react';
import { signOut } from '../services/auth';
import { useAuth } from '../components/AuthProvider';

export function WaitingView() {
  const { profile } = useAuth();
  const [leaving, setLeaving] = useState(false);

  if (!profile) return null;

  const rejected = profile.inscription_status === 'rejected';

  async function handleLogout() {
    setLeaving(true);
  
    try {
      await Promise.race([
        signOut(),
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]);
    } catch (error) {
      console.error('Erro ao sair da conta:', error);
    } finally {
      window.location.href = '/';
    }
  }

  return (
    <div className="page-center">
      <div className="panel center">
        <h1>FORJADOS</h1>

        <h2>{rejected ? 'Inscrição recusada' : 'Inscrição em análise'}</h2>

        <p className="muted">
          {rejected
            ? 'Sua ficha não foi aceita neste momento. Fale com a diretoria para mais informações.'
            : 'Sua ficha foi recebida e está aguardando aprovação da diretoria.'}
        </p>

        <button
          className="secondary-button"
          onClick={handleLogout}
          disabled={leaving}
        >
          {leaving ? 'Saindo...' : 'Sair da conta'}
        </button>
      </div>
    </div>
  );
}