type LegalDocumentsViewProps = {
  initialTab?: 'privacy' | 'terms';
};

export function LegalDocumentsView({ initialTab = 'privacy' }: LegalDocumentsViewProps) {
  return (
    <div className="legal-page">
      <div className="admin-header">
        <div>
          <p className="eyebrow">Documentos</p>
          <h2>{initialTab === 'privacy' ? 'Política de Privacidade' : 'Termo de Responsabilidade'}</h2>
          <p className="muted">Documentos básicos de uso do aplicativo FORJADOS.</p>
        </div>
      </div>

      {initialTab === 'privacy' ? <PrivacyContent /> : <TermsContent />}
    </div>
  );
}

export function PrivacyContent() {
  return (
    <section className="panel wide legal-document">
      <h3>Política de Privacidade</h3>
      <p>
        O aplicativo FORJADOS coleta dados necessários para cadastro, organização de equipes,
        inscrições, escalas, pagamentos, pontuação, caronas e comunicação interna.
      </p>
      <h4>Dados coletados</h4>
      <p>
        Podemos coletar nome, e-mail, telefone, data de nascimento, cidade, bairro, setores,
        tamanho de camisa, informações de saúde informadas voluntariamente, contato de emergência,
        comprovantes e histórico de participação.
      </p>
      <h4>Finalidade</h4>
      <p>
        Os dados são usados para identificar membros, organizar atividades da equipe, controlar
        inscrições, pagamentos, escalas, caronas, pontos e entregas de produtos/resgates.
      </p>
      <h4>Acesso aos dados</h4>
      <p>
        Administradores, diretoria, tesouraria e líderes autorizados podem acessar informações
        conforme suas funções. O acesso deve ser usado apenas para fins de organização do projeto.
      </p>
      <h4>Segurança</h4>
      <p>
        O sistema utiliza autenticação e regras de permissão no Supabase. Mesmo assim, nenhum
        sistema é totalmente imune a falhas. Dados sensíveis devem ser tratados com cuidado.
      </p>
      <h4>Solicitação de remoção</h4>
      <p>
        O membro pode solicitar correção ou remoção de dados à administração, respeitando
        obrigações de registro financeiro, histórico e organização interna.
      </p>
    </section>
  );
}

export function TermsContent() {
  return (
    <section className="panel wide legal-document">
      <h3>Termo de Responsabilidade</h3>
      <p>
        Ao solicitar acesso e participar da equipe FORJADOS, o membro declara que as informações
        fornecidas são verdadeiras e assume responsabilidade por sua participação nas atividades.
      </p>
      <h4>Compromisso</h4>
      <p>
        O membro se compromete a respeitar horários, escalas, orientações da liderança, regras
        internas, cuidados de segurança e princípios do projeto.
      </p>
      <h4>Saúde e segurança</h4>
      <p>
        O membro deve informar restrições alimentares, condições de saúde, uso de medicação e
        contato de emergência quando necessário. Em caso de limitação física ou médica, deve
        comunicar previamente a liderança.
      </p>
      <h4>Imagem e comunicação</h4>
      <p>
        Ao aceitar o termo, o membro autoriza o uso de registros de participação em materiais
        internos e de divulgação do projeto, salvo manifestação contrária feita à administração.
      </p>
      <h4>Conduta</h4>
      <p>
        Condutas incompatíveis com o propósito da equipe podem gerar advertência, restrição de
        acesso, remoção de escalas ou desligamento, conforme decisão da administração/diretoria.
      </p>
    </section>
  );
}
