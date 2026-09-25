import type { UserRole } from './types';

export const SECTORS = [
  'Liderança',
  'Confecção',
  'Logística',
  'Limpeza',
  'Rancho',
  'Mídia',
  'Tesouraria',
  'Louvor',
  'Saúde',
  'Intercessão',
  'Crianças',
  'Recepção',
  'Cozinha',
  'Transporte',
  'Comunicação',
  'Apoio',
  'Segurança',
  'Outro',
];

export const ROLE_LABELS: Record<UserRole, string> = {
  member: 'Equipe',
  leader: 'Líder',
  director: 'Diretoria',
  treasury: 'Tesouraria',
  admin: 'Administrador',
};

export const STATUS_LABELS = {
  pending: 'Pendente',
  approved: 'Aprovado',
  rejected: 'Recusado',
};

export const SHIRT_SIZES = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XGG'];

export const SKILLS = [
  'Fotografia',
  'Filmagem',
  'Design',
  'Edição de vídeo',
  'Som',
  'Iluminação',
  'Informática',
  'Elétrica',
  'Música',
  'Organização',
  'Recepção',
  'Segurança',
  'Comunicação',
  'Mídias sociais',
  'Transporte',
];

export const FORJADOS_MAIN_MESSAGE =
  'A forja não era para te destruir. Era para te transformar.';

export const FORJADOS_DNA_PHRASES = [
  'A dor não definiu quem eu sou.',
  'O fogo não me destruiu. Me forjou.',
  'Curados para curar.',
  'O perdão é a chave para a liberdade.',
  'Quem foi ferido pode voltar a amar.',
  'Toda cicatriz pode carregar propósito.',
  'Forjados pelo fogo. Guiados pelo Espírito.',
  'A presença de Deus restaura o que a vida tentou destruir.',
];

export const FORJADOS_RULES = [
  'Chegue com coração ensinável, disposição para servir e respeito ao propósito do retiro.',
  'Preserve a confidencialidade dos testemunhos e momentos de cura vividos no FORJADOS.',
  'Respeite horários, escalas, líderes, ambientes de ministração e orientações da organização.',
  'Evite brincadeiras, conversas ou atitudes que exponham dores, feridas ou fragilidades de outras pessoas.',
  'Mantenha postura cristã, linguagem saudável e comportamento compatível com um ambiente de restauração.',
  'Comunique previamente questões médicas, uso de medicação, restrições alimentares ou necessidades especiais.',
  'Use celular e redes sociais com equilíbrio, sem atrapalhar ministrações, aconselhamentos ou momentos de oração.',
  'Cuide dos espaços, materiais, alojamentos e pertences colocados à disposição pela organização.',
  'Toda forma de desrespeito, violência, assédio, discriminação ou conduta incompatível com o retiro pode gerar desligamento.',
  'O FORJADOS é um ambiente de cura: venha disposto a perdoar, ser tratado por Deus e não transmitir a dor que recebeu.',
];

export const FORJADOS_IDENTITY_TEXT =
  'Um forjado é alguém marcado pela vida, mas restaurado pelo amor de Deus — alguém que venceu batalhas internas, escolheu perdoar, encontrou identidade em Cristo e agora carrega luz onde antes havia feridas.';

export const MODULE_DNA = {
  home: {
    eyebrow: 'Forja diária',
    title: 'Painel da Jornada',
    description: 'Veja sua caminhada, equipe, avisos e próximos passos no FORJADOS.',
  },
  profile: {
    eyebrow: 'Identidade do Forjado',
    title: 'Minha Identidade',
    description: 'Atualize seus dados, equipe, saúde e informações de cuidado.',
  },
  inscription: {
    eyebrow: 'Edição e contribuição',
    title: 'Minha Inscrição',
    description: 'Acompanhe a edição ativa, o pagamento e o histórico das suas inscrições.',
  },
  publicPanel: {
    eyebrow: 'Direções da forja',
    title: 'Mural da Forja',
    description: 'Avisos, escalas, direções e comunicados publicados pela liderança.',
  },
  points: {
    eyebrow: 'Honra e serviço',
    title: 'Honra',
    description: 'Acompanhe pontos de honra recebidos por serviço, entrega e participação.',
  },
  pointsStore: {
    eyebrow: 'Recompensas de honra',
    title: 'Loja de Honra',
    description: 'Resgate recompensas com os pontos recebidos pela sua entrega no FORJADOS.',
  },
  shirts: {
    eyebrow: 'Fardas de um Forjado',
    title: 'Loja de Camisas',
    description: 'Escolha sua camisa e acompanhe pedidos ligados à identidade do movimento.',
  },
  rides: {
    eyebrow: 'Caminho compartilhado',
    title: 'Caronas',
    description: 'Organize deslocamentos com segurança, generosidade e cuidado com a equipe.',
  },
  leaderTeam: {
    eyebrow: 'Cuidado pastoral',
    title: 'Meus Liderados',
    description: 'Acompanhe pessoas da sua equipe com responsabilidade, honra e cuidado.',
  },
  serviceScale: {
    eyebrow: 'Serviço com propósito',
    title: 'Escala de Serviço',
    description: 'Organize turnos e funções para que cada pessoa sirva com clareza e descanso.',
  },
  treasury: {
    eyebrow: 'Mordomia e transparência',
    title: 'Tesouraria',
    description: 'Analise comprovantes e mantenha registros financeiros com responsabilidade.',
  },
  admin: {
    eyebrow: 'Direção e cuidado',
    title: 'Painel Administrativo',
    description: 'Gerencie membros, equipes, permissões e decisões importantes do retiro.',
  },
  notifications: {
    eyebrow: 'Chamados e atualizações',
    title: 'Notificações',
    description: 'Acompanhe avisos importantes, aprovações, pontos e movimentações da jornada.',
  },
  audit: {
    eyebrow: 'Memorial de decisões',
    title: 'Histórico do Sistema',
    description: 'Consulte ações importantes para manter transparência e responsabilidade.',
  },
};
