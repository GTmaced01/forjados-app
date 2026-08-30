import type { EventRouteRowInput } from '../types';

export interface EventRoutePreviewRow extends EventRouteRowInput {
  order: number;
  starts_at: string;
  ends_at: string;
}

export const DEFAULT_EVENT_ROUTE: EventRouteRowInput[] = [
  { title: 'Campo', duration_minutes: 5 },
  { title: 'Procurado', duration_minutes: 10 },
  { title: 'Sepultamento', duration_minutes: 30 },
  { title: 'Selva', duration_minutes: 30 },
  { title: 'Depressão', duration_minutes: 30 },
  { title: 'Testemunho', duration_minutes: 30 },
  { title: 'Família Destruída', duration_minutes: 40 },
  { title: 'Almoço - Falsa', duration_minutes: 40, activity_type: 'meal' },
  { title: 'Falsa Baiana', duration_minutes: 30 },
  { title: 'Mendigo', duration_minutes: 10 },
  { title: 'Internauta', duration_minutes: 20 },
  { title: 'Igreja Morna', duration_minutes: 25 },
  { title: 'Família Restaurada', duration_minutes: 30 },
  { title: 'Ponte', duration_minutes: 15 },
  { title: 'Cracolândia', duration_minutes: 35 },
  { title: 'Contêiner', duration_minutes: 30 },
  { title: 'Igreja Adormecida', duration_minutes: 30 },
  { title: 'Lama', duration_minutes: 20 },
  { title: 'Revelação Inimigo', duration_minutes: 20 },
];

export function buildEventRoutePreview(
  startAt: string,
  rows: EventRouteRowInput[]
): EventRoutePreviewRow[] {
  const start = new Date(startAt);
  if (!startAt || Number.isNaN(start.getTime())) {
    throw new Error('Informe um horário inicial válido para o roteiro.');
  }

  let cursor = start.getTime();
  return rows.map((row, index) => {
    const duration = Number(row.duration_minutes);
    if (!row.title.trim() || !Number.isFinite(duration) || duration < 1) {
      throw new Error(`Revise o nome e a duração da etapa ${index + 1}.`);
    }
    const startsAt = new Date(cursor);
    cursor += duration * 60_000;
    return {
      ...row,
      title: row.title.trim(),
      duration_minutes: duration,
      order: index + 1,
      starts_at: startsAt.toISOString(),
      ends_at: new Date(cursor).toISOString(),
    };
  });
}
