export const SUPPORT_FAQ_CATEGORIES = [
  { id: 'all', label: 'Todas' },
  { id: 'access', label: 'Acesso' },
  { id: 'registration', label: 'Cadastro' },
  { id: 'events', label: 'Inscrições' },
  { id: 'profile', label: 'Perfil' },
  { id: 'notifications', label: 'Notificações' },
  { id: 'privacy', label: 'Privacidade' },
] as const;

export type SupportFaqCategory = Exclude<(typeof SUPPORT_FAQ_CATEGORIES)[number]['id'], 'all'>;
export type SupportFaqFilter = (typeof SUPPORT_FAQ_CATEGORIES)[number]['id'];

export interface SupportFaqItem {
  id: string;
  category: SupportFaqCategory;
  question: string;
  summary: string;
  steps: string[];
  visualTitle: string;
  visualSteps: Array<{ label: string; detail: string }>;
}

export const SUPPORT_FAQ_ITEMS: SupportFaqItem[] = [
  {
    id: 'recover-password',
    category: 'access',
    question: 'Esqueci minha senha. Como recuperar o acesso?',
    summary: 'Use o link de recuperação da tela de entrada e defina uma nova senha pelo e-mail recebido.',
    steps: [
      'Na tela de entrada, toque em “Esqueci minha senha”.',
      'Informe o mesmo e-mail usado no cadastro e abra a mensagem enviada pelo FORJADOS.',
      'Crie uma senha nova e exclusiva. Nunca envie sua senha para a equipe de suporte.',
    ],
    visualTitle: 'Recuperação segura em três etapas',
    visualSteps: [
      { label: 'Entrar', detail: 'Esqueci minha senha' },
      { label: 'E-mail', detail: 'Abrir link seguro' },
      { label: 'Nova senha', detail: 'Salvar e entrar' },
    ],
  },
  {
    id: 'request-access',
    category: 'access',
    question: 'Como solicitar acesso e saber se fui aprovado?',
    summary: 'Complete a ficha de acesso. Enquanto a equipe analisa, o aplicativo mostra uma tela de espera.',
    steps: [
      'Crie sua conta e preencha todos os dados obrigatórios da ficha.',
      'Revise as informações antes de enviar, principalmente telefone, equipe e setores.',
      'Após o envio, aguarde a aprovação. Quando ela for concluída, o painel será liberado automaticamente.',
    ],
    visualTitle: 'Da solicitação até o painel',
    visualSteps: [
      { label: 'Ficha', detail: 'Preencher dados' },
      { label: 'Análise', detail: 'Aguardar equipe' },
      { label: 'Acesso', detail: 'Painel liberado' },
    ],
  },
  {
    id: 'complete-registration',
    category: 'registration',
    question: 'Por que o aplicativo pede para completar meu cadastro?',
    summary: 'Algumas informações são necessárias para identificar sua equipe e organizar as atividades com segurança.',
    steps: [
      'Preencha nome, telefone, nascimento, cidade, bairro, equipe principal e setores.',
      'Confira se os dados estão corretos e atualizados.',
      'Salve a ficha. Se algum campo obrigatório estiver faltando, o aplicativo indicará o que precisa ser corrigido.',
    ],
    visualTitle: 'Cadastro completo',
    visualSteps: [
      { label: 'Identidade', detail: 'Dados pessoais' },
      { label: 'Equipe', detail: 'Time e setores' },
      { label: 'Concluir', detail: 'Revisar e salvar' },
    ],
  },
  {
    id: 'event-inscription',
    category: 'events',
    question: 'Como fazer ou acompanhar minha inscrição?',
    summary: 'Abra a área de inscrição, preencha as informações solicitadas e acompanhe o status no próprio aplicativo.',
    steps: [
      'No painel, abra a área de inscrição disponível para o evento.',
      'Preencha as informações solicitadas e envie os comprovantes somente nos campos indicados.',
      'Acompanhe o status exibido no aplicativo. Se houver pendência, corrija apenas o item solicitado.',
    ],
    visualTitle: 'Fluxo da inscrição',
    visualSteps: [
      { label: 'Evento', detail: 'Abrir inscrição' },
      { label: 'Formulário', detail: 'Enviar dados' },
      { label: 'Status', detail: 'Acompanhar análise' },
    ],
  },
  {
    id: 'update-profile',
    category: 'profile',
    question: 'Onde atualizo meus dados pessoais?',
    summary: 'Use a área Minha Identidade para revisar dados de contato e outras informações do perfil.',
    steps: [
      'Entre no aplicativo e abra “Minha Identidade”.',
      'Atualize somente as informações que mudaram e confira os campos antes de salvar.',
      'Se um dado bloqueado precisar ser alterado, entre em contato com o suporte.',
    ],
    visualTitle: 'Atualização do perfil',
    visualSteps: [
      { label: 'Painel', detail: 'Minha Identidade' },
      { label: 'Editar', detail: 'Atualizar dados' },
      { label: 'Salvar', detail: 'Confirmar mudanças' },
    ],
  },
  {
    id: 'enable-notifications',
    category: 'notifications',
    question: 'Como ativar as notificações do FORJADOS?',
    summary: 'Autorize as notificações quando o aplicativo solicitar e mantenha essa permissão ativa no dispositivo.',
    steps: [
      'Quando o aviso aparecer, toque em permitir notificações.',
      'Se você recusou antes, abra as configurações do navegador ou do aplicativo e habilite a permissão.',
      'Mantenha o acesso à internet para receber avisos novos. Algumas notificações podem depender do seu perfil ou equipe.',
    ],
    visualTitle: 'Permissão de notificações',
    visualSteps: [
      { label: 'Aviso', detail: 'Permitir acesso' },
      { label: 'Dispositivo', detail: 'Manter habilitado' },
      { label: 'FORJADOS', detail: 'Receber novidades' },
    ],
  },
  {
    id: 'delete-account',
    category: 'privacy',
    question: 'Como excluir minha conta e meus dados?',
    summary: 'A exclusão pode ser iniciada em Minha Identidade ou solicitada ao suporte quando você não consegue entrar.',
    steps: [
      'Dentro do aplicativo, abra “Minha Identidade” e localize “Excluir minha conta”.',
      'Leia o aviso e confirme somente se quiser remover a conta permanentemente.',
      'Se não conseguir entrar, use o e-mail do cadastro para solicitar ajuda em forjados.ofc@gmail.com.',
    ],
    visualTitle: 'Exclusão com confirmação',
    visualSteps: [
      { label: 'Identidade', detail: 'Abrir perfil' },
      { label: 'Excluir', detail: 'Ler o aviso' },
      { label: 'Confirmar', detail: 'Processo permanente' },
    ],
  },
  {
    id: 'contact-support',
    category: 'privacy',
    question: 'O que devo informar ao entrar em contato com o suporte?',
    summary: 'Informe seu nome, e-mail de cadastro e uma descrição objetiva. Nunca envie senha ou código de verificação.',
    steps: [
      'Descreva o que estava tentando fazer e em qual tela o problema aconteceu.',
      'Se houver mensagem de erro, transcreva o texto ou envie uma captura sem dados sensíveis.',
      'Não compartilhe senha, código recebido por SMS/e-mail, documentos ou dados de pagamento por mensagem.',
    ],
    visualTitle: 'Pedido de ajuda seguro',
    visualSteps: [
      { label: 'Contexto', detail: 'Explicar a tela' },
      { label: 'Erro', detail: 'Descrever mensagem' },
      { label: 'Segurança', detail: 'Nunca enviar senha' },
    ],
  },
];

function normalizeFaqText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}

export function filterSupportFaq(
  items: SupportFaqItem[],
  query: string,
  category: SupportFaqFilter,
) {
  const normalizedQuery = normalizeFaqText(query);
  return items.filter((item) => {
    if (category !== 'all' && item.category !== category) return false;
    if (!normalizedQuery) return true;
    const searchable = [item.question, item.summary, ...item.steps].join(' ');
    return normalizeFaqText(searchable).includes(normalizedQuery);
  });
}
