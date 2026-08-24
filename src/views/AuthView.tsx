import { useState } from 'react';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import {
  getAuthErrorMessage,
  resetPassword,
  signIn,
  signOut,
  signUp,
  updatePassword,
} from '../services/auth';
import type { UserRole } from '../types';
import { PrivacyContent, RulesContent, TermsContent } from './LegalDocumentsView';
import { FORJADOS_MAIN_MESSAGE } from '../constants';

type Mode =
  | 'login'
  | 'register'
  | 'forgot'
  | 'update-password'
  | 'privacy'
  | 'terms'
  | 'rules';

type AuthViewProps = {
  initialMode?: Mode;
  onPasswordUpdated?: () => void;
};

function PasswordField(props: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  placeholder: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <>
      <label htmlFor={props.id}>{props.label}</label>
      <div className="input-icon">
        <Lock size={18} aria-hidden="true" />
        <input
          id={props.id}
          type={visible ? 'text' : 'password'}
          required
          minLength={8}
          autoComplete={props.autoComplete}
          placeholder={props.placeholder}
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
        />
        <button
          type="button"
          aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </>
  );
}

export function AuthView({ initialMode = 'login', onPasswordUpdated }: AuthViewProps) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [requestedRole, setRequestedRole] = useState<UserRole>('member');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  function changeMode(nextMode: Mode) {
    setMode(nextMode);
    setError('');
    setSuccess('');
    setPassword('');
    setPasswordConfirmation('');
  }

  function validatePasswords() {
    if (password.length < 8) throw new Error('A senha deve ter pelo menos 8 caracteres.');
    if (password !== passwordConfirmation) throw new Error('As senhas informadas não são iguais.');
  }

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      validatePasswords();
      if (!acceptedTerms) {
        throw new Error('Leia e aceite os termos, a política de privacidade e o compromisso de confidencialidade.');
      }

      await signUp({
        email: email.trim(),
        password,
        displayName: displayName.trim(),
        requestedRole,
      });

      setSuccess('Conta criada. Agora complete sua ficha para análise da diretoria.');
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleForgot(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      await resetPassword(email.trim());
      setSuccess('E-mail de recuperação enviado. Use o link recebido para criar uma nova senha.');
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordUpdate(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      validatePasswords();
      await updatePassword(password);
      await signOut();
      window.history.replaceState({}, '', '/');
      setSuccess('Senha atualizada com segurança. Entre novamente.');
      setMode('login');
      onPasswordUpdated?.();
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
            <p className="muted">Entre para acompanhar sua inscrição, equipe, avisos e organização do retiro.</p>
            {error && <div className="alert error">{error}</div>}
            {success && <div className="alert success">{success}</div>}

            <label htmlFor="login-email">E-mail</label>
            <div className="input-icon">
              <Mail size={18} aria-hidden="true" />
              <input id="login-email" type="email" required autoComplete="email" placeholder="seuemail@email.com" value={email} onChange={(event) => setEmail(event.target.value)} />
            </div>
            <PasswordField id="login-password" label="Senha" value={password} onChange={setPassword} autoComplete="current-password" placeholder="Sua senha" />

            <button className="primary-button" disabled={loading}>{loading ? 'Entrando...' : 'Entrar'}</button>
            <div className="auth-links">
              <button type="button" onClick={() => changeMode('forgot')}>Esqueci minha senha</button>
              <button type="button" onClick={() => changeMode('register')}>Solicitar acesso</button>
            </div>
            <div className="auth-legal-links">
              <button type="button" onClick={() => changeMode('rules')}>Regras do Retiro</button>
              <button type="button" onClick={() => changeMode('privacy')}>Política de Privacidade</button>
              <button type="button" onClick={() => changeMode('terms')}>Termos e Confidencialidade</button>
            </div>
          </form>
        )}

        {mode === 'register' && (
          <form onSubmit={handleRegister} className="form">
            <h2>Começar cadastro</h2>
            <p className="muted">Dê o primeiro passo para servir em um ambiente de cura, identidade e propósito.</p>
            {error && <div className="alert error">{error}</div>}
            {success && <div className="alert success">{success}</div>}

            <label htmlFor="register-name">Nome completo</label>
            <input id="register-name" required autoComplete="name" placeholder="Seu nome completo" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
            <label htmlFor="register-role">Tipo de participação</label>
            <select id="register-role" value={requestedRole} onChange={(event) => setRequestedRole(event.target.value as UserRole)}>
              <option value="member">Equipe</option>
              <option value="leader">Líder</option>
              <option value="director">Diretoria</option>
              <option value="treasury">Tesouraria</option>
            </select>
            <label htmlFor="register-email">E-mail</label>
            <input id="register-email" type="email" required autoComplete="email" placeholder="seuemail@email.com" value={email} onChange={(event) => setEmail(event.target.value)} />
            <PasswordField id="register-password" label="Senha" value={password} onChange={setPassword} autoComplete="new-password" placeholder="Mínimo de 8 caracteres" />
            <PasswordField id="register-password-confirmation" label="Confirmar senha" value={passwordConfirmation} onChange={setPasswordConfirmation} autoComplete="new-password" placeholder="Digite a senha novamente" />

            <label className="auth-terms-consent">
              <input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} />
              <span>Li e aceito os termos, a política de privacidade e o compromisso de confidencialidade, proteção de dados e conduta da equipe FORJADOS.</span>
            </label>

            <button className="primary-button" disabled={loading}>{loading ? 'Criando...' : 'Começar inscrição'}</button>
            <div className="auth-links"><button type="button" onClick={() => changeMode('login')}>Já tenho conta</button></div>
            <div className="auth-legal-links">
              <button type="button" onClick={() => changeMode('rules')}>Regras do Retiro</button>
              <button type="button" onClick={() => changeMode('privacy')}>Política de Privacidade</button>
              <button type="button" onClick={() => changeMode('terms')}>Termos e Confidencialidade</button>
            </div>
          </form>
        )}

        {mode === 'forgot' && (
          <form onSubmit={handleForgot} className="form">
            <h2>Recuperar senha</h2>
            {error && <div className="alert error">{error}</div>}
            {success && <div className="alert success">{success}</div>}
            <label htmlFor="forgot-email">E-mail</label>
            <input id="forgot-email" type="email" required autoComplete="email" placeholder="seuemail@email.com" value={email} onChange={(event) => setEmail(event.target.value)} />
            <button className="primary-button" disabled={loading}>{loading ? 'Enviando...' : 'Enviar recuperação'}</button>
            <div className="auth-links"><button type="button" onClick={() => changeMode('login')}>Voltar</button></div>
          </form>
        )}

        {mode === 'update-password' && (
          <form onSubmit={handlePasswordUpdate} className="form">
            <h2>Criar nova senha</h2>
            <p className="muted">Escolha uma senha nova com pelo menos 8 caracteres.</p>
            {error && <div className="alert error">{error}</div>}
            {success && <div className="alert success">{success}</div>}
            <PasswordField id="recovery-password" label="Nova senha" value={password} onChange={setPassword} autoComplete="new-password" placeholder="Nova senha" />
            <PasswordField id="recovery-password-confirmation" label="Confirmar nova senha" value={passwordConfirmation} onChange={setPasswordConfirmation} autoComplete="new-password" placeholder="Digite a senha novamente" />
            <button className="primary-button" disabled={loading}>{loading ? 'Atualizando...' : 'Atualizar senha'}</button>
          </form>
        )}

        {mode === 'privacy' && <div className="form legal-auth-view"><PrivacyContent /><button type="button" className="secondary-button" onClick={() => changeMode('login')}>Voltar</button></div>}
        {mode === 'terms' && <div className="form legal-auth-view"><TermsContent /><button type="button" className="secondary-button" onClick={() => changeMode('login')}>Voltar</button></div>}
        {mode === 'rules' && <div className="form legal-auth-view"><RulesContent /><button type="button" className="secondary-button" onClick={() => changeMode('login')}>Voltar</button></div>}
      </div>
    </div>
  );
}
