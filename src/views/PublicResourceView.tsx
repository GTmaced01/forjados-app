import { useEffect, type ReactNode } from 'react';
import { ArrowLeft, ExternalLink, Mail, ShieldCheck, Trash2 } from 'lucide-react';
import { LegalDocumentsView } from './LegalDocumentsView';

export type PublicResourceKind = 'privacy' | 'terms' | 'rules' | 'delete-account' | 'support';

function goHome() {
  window.location.assign('/');
}

const PAGE_METADATA: Record<PublicResourceKind, { title: string; description: string }> = {
  privacy: {
    title: 'Política de Privacidade | FORJADOS',
    description: 'Política oficial de privacidade e proteção de dados do aplicativo FORJADOS.',
  },
  terms: {
    title: 'Termo de Responsabilidade | FORJADOS',
    description: 'Termo oficial de responsabilidade e participação do Projeto FORJADOS.',
  },
  rules: {
    title: 'Regras do Retiro | FORJADOS',
    description: 'Regras oficiais de convivência e participação do Projeto FORJADOS.',
  },
  'delete-account': {
    title: 'Exclusão de conta | FORJADOS',
    description: 'Instruções oficiais para excluir a conta e os dados do aplicativo FORJADOS.',
  },
  support: {
    title: 'Suporte | FORJADOS',
    description: 'Canal oficial de suporte do aplicativo FORJADOS.',
  },
};

function PublicPageShell({ children }: { children: ReactNode }) {
  return (
    <div className="legal-page public-resource-page">
      <div className="public-resource-brand">
        <img src="/logo-forjados.png" alt="FORJADOS" />
        <button className="secondary-button" type="button" onClick={goHome}>
          <ArrowLeft size={17} />Voltar ao aplicativo
        </button>
      </div>
      {children}
    </div>
  );
}

function DeleteAccountPublicPage() {
  const signInUrl = '/?tab=profile&account=delete';
  const supportMail = 'mailto:forjados.ofc@gmail.com?subject=Solicita%C3%A7%C3%A3o%20de%20exclus%C3%A3o%20de%20conta%20FORJADOS';

  return (
    <PublicPageShell>
      <div className="admin-header">
        <div>
          <p className="eyebrow">Controle dos seus dados</p>
          <h1>Exclusão de conta e dados</h1>
          <p className="muted">Página pública oficial do aplicativo FORJADOS.</p>
        </div>
      </div>

      <article className="panel wide legal-document public-deletion-document">
        <section>
          <div className="public-resource-title-icon"><Trash2 size={24} /></div>
          <h2>Excluir pelo próprio aplicativo</h2>
          <p>Entre na sua conta, abra <strong>Minha Identidade</strong> e localize a seção <strong>Excluir minha conta</strong>. Após a confirmação, o processo é iniciado imediatamente.</p>
          <a className="primary-button public-resource-link" href={signInUrl}>
            Entrar para excluir minha conta <ExternalLink size={16} />
          </a>
        </section>

        <section>
          <h3>Se você não conseguir entrar</h3>
          <p>Envie a solicitação pelo e-mail usado no cadastro. A equipe poderá pedir uma confirmação de identidade antes de executar a exclusão, para impedir pedidos fraudulentos.</p>
          <a className="secondary-button public-resource-link" href={supportMail}>
            <Mail size={16} />Solicitar exclusão por e-mail
          </a>
        </section>

        <section>
          <h3>O que será excluído</h3>
          <ul>
            <li>Login e perfil da conta;</li>
            <li>Nome, e-mail, telefone, data de nascimento e endereço informado;</li>
            <li>Dados de saúde, restrições alimentares, medicamentos e contato de emergência;</li>
            <li>Mensagens, inscrições, presenças, escalas e preferências associadas à conta;</li>
            <li>Fotos, documentos e comprovantes armazenados pelo aplicativo.</li>
          </ul>
        </section>

        <section>
          <h3>Retenção mínima</h3>
          <p>Dados pessoais que não sejam mais necessários são apagados. Somente registros mínimos exigidos por obrigação legal ou regulatória podem ser preservados pelo prazo aplicável, com acesso restrito e redução ou anonimização sempre que possível.</p>
          <p>Comprovantes técnicos sem identificação direta podem permanecer por até cinco anos para demonstrar que a solicitação foi atendida, sendo descartados ao final desse prazo.</p>
        </section>

        <section className="public-resource-security-note">
          <ShieldCheck size={20} />
          <p>A exclusão é permanente. Para usar o FORJADOS novamente, será necessário criar uma nova conta e passar por uma nova aprovação.</p>
        </section>
      </article>
    </PublicPageShell>
  );
}

function SupportPublicPage() {
  return (
    <PublicPageShell>
      <div className="admin-header">
        <div>
          <p className="eyebrow">Atendimento</p>
          <h1>Suporte do FORJADOS</h1>
          <p className="muted">Ajuda para acesso, cadastro, privacidade e utilização do aplicativo.</p>
        </div>
      </div>
      <article className="panel wide legal-document">
        <h2>Como falar conosco</h2>
        <p>Envie sua solicitação para <a href="mailto:forjados.ofc@gmail.com">forjados.ofc@gmail.com</a>. Informe seu nome e descreva o problema, mas não envie sua senha.</p>
        <p>Solicitações de privacidade e exclusão de conta também podem ser feitas por esse canal.</p>
        <div className="public-resource-actions">
          <a className="primary-button public-resource-link" href="mailto:forjados.ofc@gmail.com"><Mail size={16} />Enviar e-mail ao suporte</a>
          <a className="secondary-button public-resource-link" href="/excluir-conta"><Trash2 size={16} />Excluir conta</a>
        </div>
      </article>
    </PublicPageShell>
  );
}

export function PublicResourceView({ kind }: { kind: PublicResourceKind }) {
  useEffect(() => {
    const metadata = PAGE_METADATA[kind];
    const previousTitle = document.title;
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const previousDescription = description?.content;

    document.title = metadata.title;
    if (description) description.content = metadata.description;

    return () => {
      document.title = previousTitle;
      if (description && previousDescription !== undefined) description.content = previousDescription;
    };
  }, [kind]);

  if (kind === 'delete-account') return <DeleteAccountPublicPage />;
  if (kind === 'support') return <SupportPublicPage />;

  return (
    <LegalDocumentsView
      initialTab={kind}
      onBack={goHome}
    />
  );
}
