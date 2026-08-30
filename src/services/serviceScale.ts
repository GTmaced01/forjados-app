import { supabase } from './supabase';
import type {
  ServiceScaleAssignment,
  ServiceScaleConfig,
  ServiceScaleGender,
  ServiceScalePerson,
  ServiceScaleSchedule,
  PublishedServiceScaleAssignment,
  GeneratedScaleSlot,
  ServiceScaleSlotRequirement,
} from '../types';

const PEOPLE_TABLE = 'service_scale_people';
const SCHEDULES_TABLE = 'service_scale_schedules';
const ASSIGNMENTS_TABLE = 'service_scale_assignments';

export interface ScaleGenerationMetrics {
  totalSlots: number;
  expectedAssignments: number;
  generatedAssignments: number;
  activeMen: number;
  activeWomen: number;
  incompleteActivePeople: number;
}

export interface ScaleGenerationResult {
  slots: GeneratedScaleSlot[];
  warnings: string[];
  isValid: boolean;
  metrics: ScaleGenerationMetrics;
}

function isServiceScaleGender(value: unknown): value is ServiceScaleGender {
  return value === 'male' || value === 'female';
}

function normalizeServiceScalePerson(value: Record<string, unknown>): ServiceScalePerson {
  const displayName = typeof value.display_name === 'string' ? value.display_name.trim() : '';
  const name = typeof value.name === 'string' ? value.name.trim() : '';

  return {
    ...(value as unknown as ServiceScalePerson),
    id: String(value.id || ''),
    name: displayName || name || 'Pessoa sem nome',
    gender: isServiceScaleGender(value.gender) ? value.gender : null,
    phone: typeof value.phone === 'string' ? value.phone : null,
    sector: typeof value.sector === 'string' ? value.sector : null,
    is_active: value.is_active !== false,
    does_trail: value.does_trail === true,
  };
}

export function formatSupabaseError(error: unknown): string {
  if (!error) return 'Erro desconhecido.';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;

  const possible = error as { message?: string; details?: string; hint?: string; code?: string };
  return [possible.message, possible.details, possible.hint, possible.code]
    .filter(Boolean)
    .join(' · ') || 'Erro desconhecido.';
}

export async function listServicePeople(): Promise<ServiceScalePerson[]> {
  const { data, error } = await supabase
    .from(PEOPLE_TABLE)
    .select('*')
    .order('gender', { ascending: true })
    .order('name', { ascending: true });

  if (error) throw error;
  return (data || []).map((person: Record<string, unknown>) => normalizeServiceScalePerson(person));
}

export async function syncApprovedProfilesToServiceScale(): Promise<{ inserted: number; updated: number }> {
  const { data, error } = await supabase.rpc('forjados_sync_service_scale_profiles_v1');
  if (error) throw error;

  const result = Array.isArray(data) ? data[0] : data;
  return {
    inserted: Number(result?.inserted_count || 0),
    updated: Number(result?.updated_count || 0),
  };
}

export async function createServicePerson(params: {
  name: string;
  gender: ServiceScaleGender;
  phone?: string;
  sector?: string;
  is_active: boolean;
  does_trail: boolean;
  notes?: string;
}): Promise<ServiceScalePerson> {
  const payload = {
    name: params.name.trim(),
    display_name: params.name.trim(),
    gender: params.gender,
    phone: params.phone?.trim() || null,
    sector: params.sector?.trim() || null,
    is_active: params.is_active,
    does_trail: params.does_trail,
    notes: params.notes?.trim() || null,
  };

  const { data, error } = await supabase
    .from(PEOPLE_TABLE)
    .insert(payload)
    .select('*')
    .single();

  if (error) throw error;
  return normalizeServiceScalePerson(data as Record<string, unknown>);
}

export async function updateServicePerson(
  id: string,
  params: Partial<Pick<ServiceScalePerson, 'name' | 'gender' | 'phone' | 'sector' | 'is_active' | 'does_trail' | 'notes'>>
): Promise<ServiceScalePerson> {
  const payload = {
    ...params,
    ...(params.name !== undefined ? { display_name: params.name.trim() } : {}),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from(PEOPLE_TABLE)
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return normalizeServiceScalePerson(data as Record<string, unknown>);
}

export async function deleteServicePerson(id: string): Promise<void> {
  const { error } = await supabase.from(PEOPLE_TABLE).delete().eq('id', id);
  if (error) throw error;
}

export async function listServiceSchedules(): Promise<ServiceScaleSchedule[]> {
  const { data, error } = await supabase
    .from(SCHEDULES_TABLE)
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as ServiceScaleSchedule[];
}

export async function listAssignmentsBySchedule(scheduleId: string): Promise<ServiceScaleAssignment[]> {
  const { data, error } = await supabase
    .from(ASSIGNMENTS_TABLE)
    .select('*')
    .eq('schedule_id', scheduleId)
    .order('slot_number', { ascending: true })
    .order('gender', { ascending: true })
    .order('person_name', { ascending: true });

  if (error) throw error;
  return (data || []) as ServiceScaleAssignment[];
}

export async function listPublishedServiceScaleAssignments(
  editionId: string
): Promise<PublishedServiceScaleAssignment[]> {
  const { data, error } = await supabase.rpc('forjados_list_published_service_scales_v1', {
    p_edition_id: editionId,
  });
  if (error) throw error;
  return (data || []) as PublishedServiceScaleAssignment[];
}

export async function saveGeneratedScale(params: {
  config: ServiceScaleConfig;
  slots: GeneratedScaleSlot[];
  status?: 'draft' | 'published';
}): Promise<ServiceScaleSchedule> {
  const assignments = params.slots.flatMap((slot) => {
    const men = slot.men.map((person) => ({
      person_id: person.id,
      gender: person.gender,
      slot_number: slot.slotNumber,
      slot_start: slot.startAt,
      slot_end: slot.endAt,
      accommodation: 'male' as const,
    }));

    const women = slot.women.map((person) => ({
      person_id: person.id,
      gender: person.gender,
      slot_number: slot.slotNumber,
      slot_start: slot.startAt,
      slot_end: slot.endAt,
      accommodation: 'female' as const,
    }));

    return [...men, ...women];
  });

  const { data, error } = await supabase.rpc('forjados_save_service_scale_v3', {
    p_config: {
      scale_type: params.config.scaleType,
      title: params.config.title.trim(),
      start_at: params.config.startAt,
      end_at: params.config.endAt,
      shift_minutes: params.config.shiftMinutes,
      min_rest_minutes: params.config.minRestMinutes,
      avoid_consecutive: params.config.avoidConsecutive,
      status: params.status || 'published',
    },
    p_slots: params.slots.map((slot) => ({
      slot_number: slot.slotNumber,
      slot_start: slot.startAt,
      slot_end: slot.endAt,
      men_required: slot.menRequired,
      women_required: slot.womenRequired,
    })),
    p_assignments: assignments,
  });

  if (error) throw error;
  if (!data) throw new Error('O banco não retornou a escala salva.');
  return (Array.isArray(data) ? data[0] : data) as ServiceScaleSchedule;
}

export function buildGeneratedScale(
  people: ServiceScalePerson[],
  config: ServiceScaleConfig,
  requirements: ServiceScaleSlotRequirement[] = buildScaleSlotRequirements(config)
): ScaleGenerationResult {
  const warnings: string[] = [];
  const start = new Date(config.startAt);
  const end = new Date(config.endAt);
  const numericValues = [
    config.shiftMinutes,
    config.menPerShift,
    config.womenPerShift,
    config.minRestMinutes,
  ];
  const hasInvalidNumber = numericValues.some((value) => !Number.isFinite(value) || !Number.isInteger(value));
  const activePeople = people.filter((person) => person.is_active && !person.does_trail);
  const incompleteActivePeople = activePeople.filter((person) => !isServiceScaleGender(person.gender));
  const men = activePeople.filter((person) => person.gender === 'male');
  const women = activePeople.filter((person) => person.gender === 'female');
  const activeRequirements = requirements
    .filter((slot) => slot.enabled && slot.menRequired + slot.womenRequired > 0)
    .map((slot, index) => ({ ...slot, slotNumber: index + 1 }));
  const totalSlots = activeRequirements.length;
  const metrics: ScaleGenerationMetrics = {
    totalSlots,
    expectedAssignments: activeRequirements.reduce(
      (total, slot) => total + Math.max(0, slot.menRequired) + Math.max(0, slot.womenRequired),
      0
    ),
    generatedAssignments: 0,
    activeMen: men.length,
    activeWomen: women.length,
    incompleteActivePeople: incompleteActivePeople.length,
  };

  if (!config.title.trim()) warnings.push('Informe um nome para a escala/evento.');
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) warnings.push('Data/hora inicial ou final inválida.');
  else if (end <= start) warnings.push('A data final precisa ser maior que a data inicial.');
  if (hasInvalidNumber) warnings.push('Use números inteiros válidos na configuração da escala.');
  if (config.shiftMinutes < 15 || config.shiftMinutes > 720) warnings.push('A duração do serviço deve ficar entre 15 minutos e 12 horas.');
  if (config.menPerShift < 0 || config.womenPerShift < 0) warnings.push('A quantidade padrão de pessoas não pode ser negativa.');
  if (config.minRestMinutes < 0 || config.minRestMinutes > 1440) warnings.push('O descanso mínimo deve ficar entre 0 e 1.440 minutos.');
  if (requirements.length === 0) warnings.push('Monte os horários e informe quando haverá necessidade de serviço.');
  if (activeRequirements.length === 0) warnings.push('Ative pelo menos um horário com uma pessoa escalada.');
  if (requirements.some((slot) => (
    !Number.isInteger(slot.menRequired)
    || !Number.isInteger(slot.womenRequired)
    || slot.menRequired < 0
    || slot.womenRequired < 0
    || slot.menRequired > 50
    || slot.womenRequired > 50
  ))) warnings.push('Cada horário deve ter quantidades inteiras entre 0 e 50.');
  if (activeRequirements.some((slot) => {
    const slotStart = new Date(slot.startAt).getTime();
    const slotEnd = new Date(slot.endAt).getTime();
    return Number.isNaN(slotStart)
      || Number.isNaN(slotEnd)
      || slotStart < start.getTime()
      || slotEnd > end.getTime()
      || slotEnd <= slotStart
      || slotEnd - slotStart > config.shiftMinutes * 60 * 1000;
  })) warnings.push('Há um horário fora do período ou com duração inválida. Monte os horários novamente.');
  if (totalSlots > 1000) warnings.push('O período gera turnos demais. Reduza o período ou aumente a duração do serviço.');

  if (incompleteActivePeople.length > 0) {
    warnings.push(`${incompleteActivePeople.length} pessoa(s) ativa(s) ainda precisa(m) de alojamento definido. Edite o cadastro antes de gerar.`);
  }
  const maxMenRequired = activeRequirements.reduce((max, slot) => Math.max(max, slot.menRequired), 0);
  const maxWomenRequired = activeRequirements.reduce((max, slot) => Math.max(max, slot.womenRequired), 0);
  if (men.length < maxMenRequired) {
    warnings.push(`Há apenas ${men.length} homem(ns) ativo(s), mas um horário pede ${maxMenRequired}.`);
  }
  if (women.length < maxWomenRequired) {
    warnings.push(`Há apenas ${women.length} mulher(es) ativa(s), mas um horário pede ${maxWomenRequired}.`);
  }

  const uniqueWarnings = () => [...new Set(warnings)];
  const hasBlockingWarning = warnings.length > 0;
  if (hasBlockingWarning || totalSlots === 0 || totalSlots > 1000) {
    return { slots: [], warnings: uniqueWarnings(), isValid: false, metrics };
  }

  const counts = new Map<string, number>();
  const lastEnd = new Map<string, number>();
  const previousSlotIds = new Set<string>();
  people.forEach((person) => counts.set(person.id, 0));

  function choose(candidates: ServiceScalePerson[], amount: number, slotStart: number, label: string): ServiceScalePerson[] {
    if (amount <= 0) return [];
    if (candidates.length === 0) return [];

    const withRest = candidates.filter((person) => {
      const last = lastEnd.get(person.id);
      if (last === undefined) return true;
      const restedMinutes = (slotStart - last) / 60000;
      return restedMinutes >= config.minRestMinutes;
    });

    let pool = withRest;
    if (withRest.length < amount) {
      warnings.push(`O turno que começa às ${new Date(slotStart).toLocaleString('pt-BR')} precisa reutilizar ${label} antes do descanso mínimo; considere cadastrar mais pessoas ou reduzir o descanso.`);
      pool = candidates;
    }

    if (config.avoidConsecutive) {
      const notPrevious = pool.filter((person) => !previousSlotIds.has(person.id));
      if (notPrevious.length >= amount) pool = notPrevious;
      else warnings.push(`O descanso foi respeitado, mas não foi possível evitar serviço consecutivo no turno que começa às ${new Date(slotStart).toLocaleString('pt-BR')}.`);
    }

    return [...pool]
      .sort((a, b) => {
        const countDiff = (counts.get(a.id) || 0) - (counts.get(b.id) || 0);
        if (countDiff !== 0) return countDiff;
        const lastA = lastEnd.get(a.id) || 0;
        const lastB = lastEnd.get(b.id) || 0;
        if (lastA !== lastB) return lastA - lastB;
        return a.name.localeCompare(b.name);
      })
      .slice(0, amount);
  }

  const slots: GeneratedScaleSlot[] = [];
  for (const requirement of activeRequirements) {
    const cursor = new Date(requirement.startAt).getTime();
    const slotEnd = new Date(requirement.endAt).getTime();
    const selectedMen = choose(men, requirement.menRequired, cursor, 'homens');
    const selectedWomen = choose(women, requirement.womenRequired, cursor, 'mulheres');
    const selected = [...selectedMen, ...selectedWomen];

    if (selectedMen.length !== requirement.menRequired || selectedWomen.length !== requirement.womenRequired) {
      return {
        slots: [],
        warnings: uniqueWarnings(),
        isValid: false,
        metrics: { ...metrics, generatedAssignments: metrics.generatedAssignments + selected.length },
      };
    }

    selected.forEach((person) => {
      counts.set(person.id, (counts.get(person.id) || 0) + 1);
      lastEnd.set(person.id, slotEnd);
    });
    metrics.generatedAssignments += selected.length;

    previousSlotIds.clear();
    selected.forEach((person) => previousSlotIds.add(person.id));

    slots.push({
      slotNumber: requirement.slotNumber,
      startAt: requirement.startAt,
      endAt: requirement.endAt,
      menRequired: requirement.menRequired,
      womenRequired: requirement.womenRequired,
      men: selectedMen,
      women: selectedWomen,
    });
  }

  return { slots, warnings: uniqueWarnings(), isValid: true, metrics };
}

export function buildScaleSlotRequirements(config: ServiceScaleConfig): ServiceScaleSlotRequirement[] {
  const start = new Date(config.startAt);
  const end = new Date(config.endAt);
  if (
    Number.isNaN(start.getTime())
    || Number.isNaN(end.getTime())
    || end <= start
    || !Number.isInteger(config.shiftMinutes)
    || config.shiftMinutes < 15
    || config.shiftMinutes > 720
  ) return [];

  const shiftMs = config.shiftMinutes * 60 * 1000;
  const slots: ServiceScaleSlotRequirement[] = [];
  let cursor = start.getTime();

  while (cursor < end.getTime() && slots.length < 1001) {
    const slotEnd = Math.min(cursor + shiftMs, end.getTime());
    slots.push({
      slotNumber: slots.length + 1,
      startAt: new Date(cursor).toISOString(),
      endAt: new Date(slotEnd).toISOString(),
      menRequired: Math.max(0, config.menPerShift || 0),
      womenRequired: Math.max(0, config.womenPerShift || 0),
      enabled: config.menPerShift + config.womenPerShift > 0,
    });
    cursor = slotEnd;
  }

  return slots;
}

export function summarizeGeneratedScale(slots: GeneratedScaleSlot[]): Record<string, number> {
  return slots.reduce<Record<string, number>>((acc, slot) => {
    [...slot.men, ...slot.women].forEach((person) => {
      acc[person.name] = (acc[person.name] || 0) + 1;
    });
    return acc;
  }, {});
}

export function exportScaleCsv(slots: GeneratedScaleSlot[]): string {
  const header = ['Turno', 'Início', 'Fim', 'Necessidade masculina', 'Homens escalados', 'Necessidade feminina', 'Mulheres escaladas'];
  const rows = slots.map((slot) => [
    String(slot.slotNumber),
    formatDateTime(slot.startAt),
    formatDateTime(slot.endAt),
    String(slot.menRequired),
    slot.men.map((person) => person.name).join(' / '),
    String(slot.womenRequired),
    slot.women.map((person) => person.name).join(' / '),
  ]);

  return [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(';'))
    .join('\n');
}

export function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function toDatetimeLocalValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export async function ensureProfileInServiceScale(params: {
  userId: string;
  displayName: string;
  phone?: string;
  sectors?: string[];
  role?: string;
}) {
  const name = params.displayName?.trim();
  if (!name) return;

  const { data: existing, error: existingError } = await supabase
    .from(PEOPLE_TABLE)
    .select('id')
    .eq('user_id', params.userId)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return;

  const { error } = await supabase.from(PEOPLE_TABLE).insert({
    user_id: params.userId,
    name,
    display_name: name,
    gender: 'male',
    phone: params.phone || null,
    sector: params.sectors?.[0] || null,
    is_active: true,
    does_trail: false,
    notes: `Adicionado automaticamente após aprovação no app. Revisar gênero/setor se necessário. Cargo: ${params.role || 'membro'}`,
  });

  if (error) throw error;
}
