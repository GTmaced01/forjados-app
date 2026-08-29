import { supabase } from './supabase';
import type { AttendanceRecord, AttendanceStatus } from '../types';

export async function listAttendance(): Promise<AttendanceRecord[]> {
  const { data, error } = await supabase.rpc('forjados_list_attendance_v2', { p_edition_id: null });
  if (error) throw error;
  return (data || []) as AttendanceRecord[];
}

export async function updateAttendance(userId: string, editionId: string, status: AttendanceStatus, notes = '') {
  const { error } = await supabase.rpc('forjados_update_attendance_v2', {
    p_user_id: userId,
    p_edition_id: editionId,
    p_attendance_status: status,
    p_notes: notes,
  });
  if (error) throw error;
}
