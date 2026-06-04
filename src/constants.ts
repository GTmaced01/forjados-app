import type { UserRole } from './types';

export const SECTORS = [
  'Liderança',
  'Confecção',
  'Logística',
  'Rancho',
  'Mídia',
  'Tesouraria',
  'Louvor',
  'Saúde',
  'Intercessão',
  'Recepção',
  'Cozinha',
  'Transporte',
  'Comunicação',
  'Apoio',
  'Outro',
];

export const PRIMARY_TEAMS = SECTORS;

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