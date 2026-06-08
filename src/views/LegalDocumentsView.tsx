import {
  FORJADOS_IDENTITY_TEXT,
  FORJADOS_MAIN_MESSAGE,
  FORJADOS_RULES,
} from '../constants';

type LegalDocumentsTab = 'privacy' | 'terms' | 'rules';

type LegalDocumentsViewProps = {
  initialTab?: LegalDocumentsTab;
};

const TITLES: Record<LegalDocumentsTab, string> = {
  privacy: 'Política de Privacidade',
  terms: 'Termo de Responsabilidade',
  rules: 'Regras do Retiro',
};

export function LegalDocumentsView({ initialTab = 'privacy' }: LegalDocumentsViewProps) {
  return (
    <div className="legal-page">
      <div className="admin-header">
        <div>
          <p className="eyebrow">Documentos da jornada</p>
          <h2>{TITLES[initialTab]}</h2>
          <p className="muted">
            Diretrizes para proteger o propósito, a segurança e o ambiente de cura do FORJADOS.
          </p>
        </div>
      </div>

      {initialTab === 'privacy' && <PrivacyContent />}
      {initialTab === 'terms' && <TermsContent />}
      {initialTab === 'rules' && <RulesContent />}
    </div>
  );
}

export function PrivacyContent() {
  return (
    <section className="panel wide legal-document">
      <h3>Política de Privacidade</h3>
      <p>
        O aplicativo FORJADOS coleta dados necessários para cadastro, organização de equipes,
        inscrições, escalas, pagamentos, pontuação, caronas e comunicação interna do retiro.
      </p>
      <h4>Dados coletados</h4>
      <p>
        Podemos coletar nome, e-mail, telefone, data de nascimento, cidade, bairro, equipe
        principal, setores, tamanho de camisa, informações de saúde informadas voluntariamente,
        contato de emergência, comprovantes e histórico de participação.
      </p>
      <h4>Finalidade</h4>
      <p>
        Os dados são utilizados para identificar membros, aprovar acessos, organizar escalas,
        pagamentos, pontos, lojas internas, caronas e comunicação relacionada ao FORJADOS.
      </p>
      <h4>Acesso aos dados</h4>
      <p>
        Administradores, diretoria, tesouraria e líderes autorizados podem visualizar informações
        conforme suas responsabilidades. O uso deve ser pastoral, administrativo e alinhado ao
        propósito do projeto.
      </p>
      <h4>Segurança</h4>
      <p>
        O sistema utiliza autenticação, permissões por perfil e regras de acesso. Ainda assim,
        informações sensíveis devem ser tratadas com discrição e responsabilidade.
      </p>
      <h4>Direitos do participante</h4>
      <p>
        O membro pode solicitar correção de dados cadastrais e, quando possível, remoção de dados,
        respeitando registros necessários para controle financeiro, histórico e organização.
      </p>
    </section>
  );
}

export function TermsContent() {
  return (
    <section className="panel wide legal-document">
      <h3>Termo de Responsabilidade</h3>
      <p>
        Ao solicitar acesso e participar do FORJADOS, o membro declara que as informações
        fornecidas são verdadeiras e assume responsabilidade pela participação nas atividades.
      </p>
      <h4>Compromisso com o propósito</h4>
      <p>
        O FORJADOS existe para conduzir pessoas feridas a um processo de cura, identidade,
        restauração e reconciliação com Deus. O participante se compromete a proteger esse ambiente.
      </p>
      <h4>Saúde e segurança</h4>
      <p>
        O membro deve informar restrições alimentares, condições de saúde, uso de medicação e
        contato de emergência quando necessário.
      </p>
      <h4>Imagem e comunicação</h4>
      <p>
        Ao aceitar este termo, o membro autoriza o uso de registros da participação em materiais
        internos e de divulgação, salvo manifestação contrária feita à administração.
      </p>
      <h4>Conduta</h4>
      <p>
        Condutas incompatíveis com o propósito do retiro podem gerar advertência, remoção de escala,
        restrição de acesso ou desligamento, conforme decisão da liderança.
      </p>
      <h4>Declaração espiritual e relacional</h4>
      <p>
        O participante reconhece que o FORJADOS é um ambiente de escuta, cura, verdade e perdão.
        A proposta é cooperar com o agir de Deus, preservar o próximo e caminhar em honra.
      </p>
    </section>
  );
}

export function RulesContent() {
  return (
    <section className="panel wide legal-document">
      <h3>Regras do Retiro FORJADOS</h3>
      <p>
        <strong>{FORJADOS_MAIN_MESSAGE}</strong>
      </p>
      <p>{FORJADOS_IDENTITY_TEXT}</p>

      <h4>Diretrizes de convivência e participação</h4>
      <ol className="legal-rules-list">
        {FORJADOS_RULES.map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ol>

      <h4>Compromisso final</h4>
      <p>
        O FORJADOS trabalha cura espiritual, paternidade, identidade, Espírito Santo, perdão e
        restauração de alma. Todo envolvimento no retiro deve proteger esse ambiente.
      </p>
    </section>
  );
}
