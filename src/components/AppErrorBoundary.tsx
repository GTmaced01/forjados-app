import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, Home, RefreshCw } from 'lucide-react';

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  hasError: boolean;
};

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Falha recuperável na interface do FORJADOS:', error, info);
  }

  private returnHome = () => {
    localStorage.setItem('forjados-active-tab', 'home');
    window.history.replaceState({}, '', '/');
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="app-error-page" role="alert">
        <section className="panel app-error-card">
          <span className="app-error-icon" aria-hidden="true">
            <AlertTriangle size={30} />
          </span>
          <p className="eyebrow">Recuperação segura</p>
          <h1>Esta tela não carregou como deveria.</h1>
          <p className="muted">
            Seus dados continuam protegidos. Volte ao início ou tente carregar o aplicativo
            novamente.
          </p>
          <div className="app-error-actions">
            <button className="primary-button" type="button" onClick={this.returnHome}>
              <Home size={17} />
              Voltar ao início
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => window.location.reload()}
            >
              <RefreshCw size={17} />
              Tentar novamente
            </button>
          </div>
        </section>
      </main>
    );
  }
}
