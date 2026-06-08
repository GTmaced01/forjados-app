import { useState } from 'react';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { signIn, signUp, resetPassword, getAuthErrorMessage } from '../services/auth';
import type { UserRole } from '../types';
import { PrivacyContent, RulesContent, TermsContent } from './LegalDocumentsView';
import { FORJADOS_MAIN_MESSAGE } from '../constants';

type Mode = 'login' | 'register' | 'forgot' | 'privacy' | 'terms' | 'rules';

export function AuthView() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [displayName, setDisplayName] = useState('');
  const [requestedRole, setRequestedRole] = useState<UserRole>('member');

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await signIn(email, password);
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      await signUp({
        email,
        password,
        displayName,
        requestedRole,
      });

      setSuccess('Conta criada. Agora complete sua ficha para análise da diretoria.');
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      await resetPassword(email);
      setSuccess('E-mail de recuperação enviado.');
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="brand">
          <h1>FORJADOS</h1>
          <p>CURADOS PARA CURAR</p>
          <small>{FORJADOS_MAIN_MESSAGE}</small>
        </div>

        {mode === 'login' && (
          <form onSubmit={handleLogin} className="form">
            <h2>Acessar aplicativo</h2>
            <p className="muted">Entre para acompanhar sua jornada, equipe, avisos e organização do retiro.</p>

            {error && <div className="alert error">{error}</div>}
            {success && <div className="alert success">{success}</div>}

            <label>E-mail</label>
            <div className="input-icon">
              <Mail size={18} />
              <input type="email" required placeholder="seuemail@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>

            <label>Senha</label>
            <div className="input-icon">
              <Lock size={18} />
              <input type={showPassword ? 'text' : 'password'} required placeholder="Sua senha" value={password} onChange={(e) => setPassword(e.target.value)} />
              <button type="button" onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            <button className="primary-button" disabled={loading}>{loading ? 'Entrando...' : 'Entrar'}</button>

            <div className="auth-links">
              <button type="button" onClick={() => setMode('forgot')}>Esqueci minha senha</button>
              <button type="button" onClick={() => setMode('register')}>Solicitar acesso</button>
            </div>

            <div className="auth-legal-links">
              <button type="button" onClick={() => setMode('rules')}>Regras do Retiro</button>
              <button type="button" onClick={() => setMode('privacy')}>Política de Privacidade</button>
              <button type="button" onClick={() => setMode('terms')}>Termo de Responsabilidade</button>
            </div>
          </form>
        )}

        {mode === 'register' && (
          <form onSubmit={handleRegister} className="form">
            <h2>Começar cadastro</h2>
            <p className="muted">Dê o primeiro passo para servir em um ambiente de cura, identidade e propósito.</p>

            {error && <div className="alert error">{error}</div>}
            {success && <div className="alert success">{success}</div>}

            <label>Nome completo</label>
            <input required placeholder="Seu nome completo" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />

            <label>Tipo de participação</label>
            <select value={requestedRole} onChange={(e) => setRequestedRole(e.target.value as UserRole)}>
              <option value="member">Equipe</option>
              <option value="leader">Líder</option>
              <option value="director">Diretoria</option>
              <option value="treasury">Tesouraria</option>
            </select>

            <label>E-mail</label>
            <input type="email" required placeholder="seuemail@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />

            <label>Senha</label>
            <input type={showPassword ? 'text' : 'password'} required placeholder="Crie uma senha" value={password} onChange={(e) => setPassword(e.target.value)} />

            <button className="primary-button" disabled={loading}>{loading ? 'Criando...' : 'Começar jornada'}</button>

            <div className="auth-links">
              <button type="button" onClick={() => setMode('login')}>Já tenho conta</button>
            </div>

            <div className="auth-legal-links">
              <button type="button" onClick={() => setMode('rules')}>Regras do Retiro</button>
              <button type="button" onClick={() => setMode('privacy')}>Política de Privacidade</button>
              <button type="button" onClick={() => setMode('terms')}>Termo de Responsabilidade</button>
            </div>
          </form>
        )}

        {mode === 'privacy' && <div className="form legal-auth-view"><PrivacyContent /><button type="button" className="secondary-button" onClick={() => setMode('login')}>Voltar</button></div>}
        {mode === 'terms' && <div className="form legal-auth-view"><TermsContent /><button type="button" className="secondary-button" onClick={() => setMode('login')}>Voltar</button></div>}
        {mode === 'rules' && <div className="form legal-auth-view"><RulesContent /><button type="button" className="secondary-button" onClick={() => setMode('login')}>Voltar</button></div>}

        {mode === 'forgot' && (
          <form onSubmit={handleForgot} className="form">
            <h2>Recuperar senha</h2>
            {error && <div className="alert error">{error}</div>}
            {success && <div className="alert success">{success}</div>}
            <label>E-mail</label>
            <input type="email" required placeholder="seuemail@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <button className="primary-button" disabled={loading}>{loading ? 'Enviando...' : 'Enviar recuperação'}</button>
            <div className="auth-links"><button type="button" onClick={() => setMode('login')}>Voltar</button></div>
          </form>
        )}
      </div>
    </div>
  );
}
