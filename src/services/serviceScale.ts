import { supabase } from './supabase';
import type {
  ServiceScaleAssignment,
  ServiceScaleConfig,
  ServiceScaleGender,
  ServiceScalePerson,
  ServiceScaleSchedule,
  GeneratedScaleSlot,
} from '../types';

const PEOPLE_TABLE = 'service_scale_people';
const SCHEDULES_TABLE = 'service_scale_schedules';
const ASSIGNMENTS_TABLE = 'service_scale_assignments';

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
  return (data || []) as ServiceScalePerson[];
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
  return data as ServiceScalePerson;
}

export async function updateServicePerson(
  id: string,
  params: Partial<Pick<ServiceScalePerson, 'name' | 'gender' | 'phone' | 'sector' | 'is_active' | 'does_trail' | 'notes'>>
): Promise<ServiceScalePerson> {
  const payload = {
    ...params,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from(PEOPLE_TABLE)
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return data as ServiceScalePerson;
}

export async function deleteServicePerson(id: string): Promise<void> {
  const { error } = await supabase.from(PEOPLE_TABLE).delete().eq('id', id);
  if (error) throw error;
}

export async function listServiceSchedules(): Promise<ServiceScaleSchedule[]> {
  const { data, error } = await supabase
    .from(SCHEDULES_TABLE)
    .select('*')
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

export async function saveGeneratedScale(params: {
  config: ServiceScaleConfig;
  slots: GeneratedScaleSlot[];
  status?: 'draft' | 'published';
}): Promise<ServiceScaleSchedule> {
  const { data: userData } = await supabase.auth.getUser();

  const { data: schedule, error: scheduleError } = await supabase
    .from(SCHEDULES_TABLE)
    .insert({
      title: params.config.title,
      start_at: params.config.startAt,
      end_at: params.config.endAt,
      shift_minutes: params.config.shiftMinutes,
      men_per_shift: params.config.menPerShift,
      women_per_shift: params.config.womenPerShift,
      min_rest_minutes: params.config.minRestMinutes,
      avoid_consecutive: params.config.avoidConsecutive,
      status: params.status || 'published',
      created_by: userData.user?.id || null,
    })
    .select('*')
    .single();

  if (scheduleError) throw scheduleError;

  const rows = params.slots.flatMap((slot) => {
    const men = slot.men.map((person) => ({
      schedule_id: schedule.id,
      person_id: person.id,
      person_name: person.name,
      gender: person.gender,
      slot_number: slot.slotNumber,
      slot_start: slot.startAt,
      slot_end: slot.endAt,
      accommodation: 'male' as const,
    }));

    const women = slot.women.map((person) => ({
      schedule_id: schedule.id,
      person_id: person.id,
      person_name: person.name,
      gender: person.gender,
      slot_number: slot.slotNumber,
      slot_start: slot.startAt,
      slot_end: slot.endAt,
      accommodation: 'female' as const,
    }));

    return [...men, ...women];
  });

  if (rows.length > 0) {
    const { error: assignmentsError } = await supabase.from(ASSIGNMENTS_TABLE).insert(rows);
    if (assignmentsError) throw assignmentsError;
  }

  return schedule as ServiceScaleSchedule;
}

export async function deleteServiceSchedule(id: string): Promise<void> {
  const { error } = await supabase.from(SCHEDULES_TABLE).delete().eq('id', id);
  if (error) throw error;
}

export function buildGeneratedScale(
  people: ServiceScalePerson[],
  config: ServiceScaleConfig
): { slots: GeneratedScaleSlot[]; warnings: string[] } {
  const warnings: string[] = [];
  const start = new Date(config.startAt);
  const end = new Date(config.endAt);
  const shiftMs = config.shiftMinutes * 60 * 1000;

  if (!config.title.trim()) warnings.push('Informe um nome para a escala/evento.');
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { slots: [], warnings: ['Data/hora inicial ou final inválida.'] };
  }
  if (end <= start) return { slots: [], warnings: ['A data final precisa ser maior que a data inicial.'] };
  if (config.shiftMinutes < 15) warnings.push('A duração do serviço precisa ter pelo menos 15 minutos.');

  const activePeople = people.filter((person) => person.is_active && !person.does_trail);
  const men = activePeople.filter((person) => person.gender === 'male');
  const women = activePeople.filter((person) => person.gender === 'female');

  if (men.length < config.menPerShift) {
    warnings.push(`Há apenas ${men.length} homem(ns) disponível(is), mas a escala pede ${config.menPerShift} por turno.`);
  }
  if (women.length < config.womenPerShift) {
    warnings.push(`Há apenas ${women.length} mulher(es) disponível(is), mas a escala pede ${config.womenPerShift} por turno.`);
  }

  const counts = new Map<string, number>();
  const lastEnd = new Map<string, number>();
  const previousSlotIds = new Set<string>();
  people.forEach((person) => counts.set(person.id, 0));

  function choose(candidates: ServiceScalePerson[], amount: number, slotStart: number): ServiceScalePerson[] {
    if (amount <= 0) return [];
    if (candidates.length === 0) return [];

    const withRest = candidates.filter((person) => {
      const last = lastEnd.get(person.id);
      if (!last) return true;
      const restedMinutes = (slotStart - last) / 60000;
      return restedMinutes >= config.minRestMinutes;
    });

    let pool = withRest.length >= amount ? withRest : candidates;

    if (config.avoidConsecutive) {
      const notPrevious = pool.filter((person) => !previousSlotIds.has(person.id));
      if (notPrevious.length >= amount) pool = notPrevious;
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
  let cursor = start.getTime();
  let slotNumber = 1;

  while (cursor < end.getTime()) {
    const slotEnd = Math.min(cursor + shiftMs, end.getTime());
    const selectedMen = choose(men, config.menPerShift, cursor);
    const selectedWomen = choose(women, config.womenPerShift, cursor);
    const selected = [...selectedMen, ...selectedWomen];

    selected.forEach((person) => {
      counts.set(person.id, (counts.get(person.id) || 0) + 1);
      lastEnd.set(person.id, slotEnd);
    });

    previousSlotIds.clear();
    selected.forEach((person) => previousSlotIds.add(person.id));

    slots.push({
      slotNumber,
      startAt: new Date(cursor).toISOString(),
      endAt: new Date(slotEnd).toISOString(),
      men: selectedMen,
      women: selectedWomen,
    });

    cursor = slotEnd;
    slotNumber += 1;
  }

  return { slots, warnings };
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
  const header = ['Turno', 'Início', 'Fim', 'Alojamento Masculino', 'Alojamento Feminino'];
  const rows = slots.map((slot) => [
    String(slot.slotNumber),
    formatDateTime(slot.startAt),
    formatDateTime(slot.endAt),
    slot.men.map((person) => person.name).join(' / '),
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
    .eq('name', name)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return;

  const { error } = await supabase.from(PEOPLE_TABLE).insert({
    name,
    gender: 'male',
    phone: params.phone || null,
    sector: params.sectors?.[0] || null,
    is_active: true,
    does_trail: false,
    notes: `Adicionado automaticamente após aprovação no app. Revisar gênero/setor se necessário. Cargo: ${params.role || 'membro'}`,
  });

  if (error) throw error;
}
