import { useState } from 'react';
import { signOut } from '../services/auth';
import { useAuth } from '../components/AuthProvider';
import { FORJADOS_MAIN_MESSAGE } from '../constants';

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
        <h2>{rejected ? 'Cadastro não aprovado' : 'Cadastro em análise'}</h2>
        <p className="muted">
          {rejected
            ? 'Sua ficha não foi aprovada neste momento. Fale com a diretoria para entender os próximos passos.'
            : 'Sua ficha foi recebida. Em breve a diretoria irá analisar seus dados e liberar seu acesso.'}
        </p>
        <p className="muted waiting-quote">{FORJADOS_MAIN_MESSAGE}</p>
        <button className="secondary-button" onClick={handleLogout} disabled={leaving}>
          {leaving ? 'Saindo...' : 'Sair da conta'}
        </button>
      </div>
    </div>
  );
}
