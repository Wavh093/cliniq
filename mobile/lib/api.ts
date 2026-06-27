import { supabase } from './supabase';
import Constants from 'expo-constants';

const BASE = Constants.expoConfig?.extra?.apiBaseUrl as string;

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
  };
}

export interface Appointment {
  id: string;
  appointment_date: string;
  appointment_time: string;
  duration_minutes: number;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
  patient_notes: string | null;
  internal_notes: string | null;
  clinical_notes: string | null;
  icd10_codes: string[] | null;
  tariff_codes: string[] | null;
  payment_method: string | null;
  amount_paid: number | null;
  paid_at: string | null;
  medical_aid_paid: boolean | null;
  ma_amount_charged: number | null;
  ma_amount_received: number | null;
  ma_status: string | null;
  patient_portion: number | null;
  patient_method: string | null;
  patient_paid_at: string | null;
  patients: {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
    date_of_birth: string | null;
    id_number: string | null;
    allergies: string[];
    medical_conditions: string[];
    medications: string[];
    has_medical_aid?: boolean;
  } | null;
  services: { id: string; name: string; category: string; price_from: number | null } | null;
  treatment_plan_session?: {
    id: string;
    session_number: number;
    plan_id: string;
    treatment_plans: {
      id: string;
      title: string;
      status: string;
      total_sessions: number;
      sessions_done: number;
    } | null;
  } | null;
}

export interface AppointmentSummary {
  id: string;
  appointment_date: string;
  appointment_time: string;
  status: string;
  patient_notes: string | null;
  internal_notes: string | null;
  clinical_notes: string | null;
  services: { name: string; category: string; price_from: number | null } | null;
}

export interface Patient {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  gender: string | null;
  id_number: string | null;
  suburb: string | null;
  city: string | null;
  province: string | null;
  referral_source: string | null;
  patient_type: string | null;
  medical_aid_name: string | null;
  medical_aid_number: string | null;
  medical_aid_plan: string | null;
  main_member: boolean;
  main_member_name: string | null;
  main_member_patient_id: string | null;
  relationship_to_member: string | null;
  dependant_code: string | null;
  allergies: string[];
  medications: string[];
  medical_conditions: string[];
  previous_dentist: string | null;
  dental_anxiety: string | null;
  intake_notes: string | null;
  consent_signed: boolean;
  popia_consent: boolean;
  appointments: AppointmentSummary[];
}

export interface LinkedPatient {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  relationship_to_member: string | null;
  dependant_code: string | null;
  medical_aid_name: string | null;
  medical_aid_number: string | null;
}

export async function getAppointments(params: Record<string, string> = {}): Promise<{ appointments: Appointment[] }> {
  const q = new URLSearchParams(params).toString();
  const res = await fetch(`${BASE}/api/appointments${q ? `?${q}` : ''}`, {
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(`Appointments error: ${res.status}`);
  return res.json();
}

export async function getAnalytics(): Promise<any> {
  const res = await fetch(`${BASE}/api/analytics`, { headers: await authHeaders() });
  if (!res.ok) throw new Error(`Analytics error: ${res.status}`);
  return res.json();
}

export async function getPatient(id: string): Promise<{ patient: Patient }> {
  const res = await fetch(`${BASE}/api/patients?id=${encodeURIComponent(id)}`, {
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(`Patient error: ${res.status}`);
  return res.json();
}

export async function getDependants(mainMemberId: string): Promise<{ patients: LinkedPatient[] }> {
  const res = await fetch(`${BASE}/api/patients?main_member_id=${encodeURIComponent(mainMemberId)}`, {
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(`Dependants error: ${res.status}`);
  return res.json();
}

export async function savePushToken(token: string): Promise<void> {
  const headers = await authHeaders();
  await fetch(`${BASE}/api/notify?action=save-token`, {
    method:  'POST',
    headers,
    body:    JSON.stringify({ token }),
  });
}

export interface PatientSummary {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  patient_type: string | null;
  date_of_birth: string | null;
  suburb: string | null;
  medical_aid_name: string | null;
  created_at: string;
}

export async function searchPatients(q = '', limit = 30): Promise<{ patients: PatientSummary[]; total: number }> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (q.trim()) params.set('q', q.trim());
  const res = await fetch(`${BASE}/api/patients?${params}`, { headers: await authHeaders() });
  if (!res.ok) throw new Error(`Patients error: ${res.status}`);
  return res.json();
}

// ── Treatment Plans ──────────────────────────────────────────────

export interface TreatmentPlan {
  id: string;
  title: string;
  description: string | null;
  total_sessions: number;
  sessions_done: number;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  next_session_due: string | null;
  notes: string | null;
  notify_patient: boolean;
  created_at: string;
  updated_at: string;
  payment_summary?: { total_charged: number; total_paid: number; outstanding: number };
  patients: {
    id: string; first_name: string; last_name: string;
    phone: string | null; email: string | null;
  } | null;
}

export interface TreatmentPlanSession {
  id: string;
  session_number: number;
  status: 'scheduled' | 'completed' | 'missed' | 'rescheduled';
  session_date: string | null;
  notes: string | null;
  service_id: string | null;
  amount_charged: number | null;
  amount_paid: number | null;
  payment_method: string | null;
  appointments?: {
    id: string;
    appointment_date: string;
    appointment_time: string;
    status: string;
    services: { id: string; name: string; price_from: number | null } | null;
  } | null;
}

export async function getTreatmentPlans(planStatus = 'active'): Promise<{ plans: TreatmentPlan[]; total: number }> {
  const params = new URLSearchParams({ resource: 'treatment_plans', status: planStatus, limit: '50' });
  const res = await fetch(`${BASE}/api/appointments?${params}`, { headers: await authHeaders() });
  if (!res.ok) throw new Error(`Plans error: ${res.status}`);
  return res.json();
}

export async function getTreatmentPlan(id: string): Promise<{ plan: TreatmentPlan & { treatment_plan_sessions: TreatmentPlanSession[] } }> {
  const res = await fetch(
    `${BASE}/api/appointments?resource=treatment_plans&id=${encodeURIComponent(id)}`,
    { headers: await authHeaders() },
  );
  if (!res.ok) throw new Error(`Plan error: ${res.status}`);
  return res.json();
}

export async function getAppointment(id: string): Promise<{ appointment: Appointment }> {
  const res = await fetch(`${BASE}/api/appointments?id=${encodeURIComponent(id)}`, {
    headers: await authHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error ?? `Appointment not found (${res.status})`);
  }
  const data = await res.json();
  // Guard: API should return { appointment: {...} } — if not, surface a clear error
  if (!data.appointment) throw new Error('Appointment data missing in response');
  return data;
}

export async function saveSessionNotes(
  id: string,
  data: { clinical_notes?: string | null; internal_notes?: string | null },
): Promise<void> {
  const res = await fetch(`${BASE}/api/appointments?id=${encodeURIComponent(id)}`, {
    method:  'PATCH',
    headers: await authHeaders(),
    body:    JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error ?? `Save failed: ${res.status}`);
  }
}

export async function updatePatientNotes(id: string, intake_notes: string | null): Promise<void> {
  const res = await fetch(`${BASE}/api/patients?id=${encodeURIComponent(id)}`, {
    method:  'PATCH',
    headers: await authHeaders(),
    body:    JSON.stringify({ intake_notes }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error ?? `Save failed: ${res.status}`);
  }
}

// ── AI Clinical Assistant ────────────────────────────────────────

export async function getAIUsage(): Promise<{ used: number; limit: number; remaining: number }> {
  try {
    const res = await fetch(`${BASE}/api/notify?action=ai-ask`, { headers: await authHeaders() });
    if (!res.ok) return { used: 0, limit: 10, remaining: 10 };
    return res.json();
  } catch {
    return { used: 0, limit: 10, remaining: 10 };
  }
}

export async function askAI(question: string): Promise<{
  answer: string;
  used: number;
  limit: number;
  remaining: number;
}> {
  const res = await fetch(`${BASE}/api/notify?action=ai-ask`, {
    method:  'POST',
    headers: await authHeaders(),
    body:    JSON.stringify({ question }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error ?? `AI request failed: ${res.status}`);
  }
  return res.json();
}

export async function savePayment(id: string, data: {
  payment_method?: string;
  amount_paid?: number;
  medical_aid_paid?: boolean;
  ma_amount_charged?: number;
  patient_portion?: number;
  patient_method?: string;
}): Promise<void> {
  const res = await fetch(`${BASE}/api/revenue?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: await authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error ?? `Payment save failed: ${res.status}`);
  }
}

export async function updateAppointmentStatus(id: string, status: string): Promise<void> {
  const res = await fetch(`${BASE}/api/appointments?id=${encodeURIComponent(id)}`, {
    method:  'PATCH',
    headers: await authHeaders(),
    body:    JSON.stringify({ status }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error ?? `Status update failed: ${res.status}`);
  }
}

// ── Practice config & Documents ──────────────────────────────────

/** Exported so modals can build shareable document URLs. */
export const API_BASE = BASE;

export interface PracticeConfig {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  hpcsa_number: string | null;
  doctor_first_name: string | null;
  doctor_last_name: string | null;
  doctor_qualification: string | null;
  practice_number: string | null;
}

export async function getPractice(): Promise<PracticeConfig | null> {
  try {
    const res = await fetch(`${BASE}/api/staff?resource=config`, { headers: await authHeaders() });
    if (!res.ok) return null;
    const data = await res.json();
    return data.practice ?? null;
  } catch {
    return null;
  }
}

export async function saveDocument(payload: {
  type: 'sick_note' | 'referral_letter';
  appointment_id: string;
  patient_id?: string;
  title: string;
  html_content: string;
}): Promise<{ id: string } | null> {
  try {
    const res = await fetch(`${BASE}/api/documents`, {
      method:  'POST',
      headers: await authHeaders(),
      body:    JSON.stringify(payload),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ── Clinician Signatures ─────────────────────────────────────────────────────

export async function getMySignature(): Promise<{ signatureData: string | null; displayName: string | null }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { signatureData: null, displayName: null };
    const { data } = await supabase
      .from('clinician_signatures')
      .select('signature_data, display_name')
      .eq('user_id', user.id)
      .maybeSingle();
    return {
      signatureData: data?.signature_data ?? null,
      displayName:   data?.display_name   ?? null,
    };
  } catch {
    return { signatureData: null, displayName: null };
  }
}

// ── Dental Chart ─────────────────────────────────────────────────────────────

export type ToothStatus =
  | 'healthy' | 'cavity' | 'filled' | 'crown'
  | 'extraction' | 'implant' | 'missing' | 'bridge' | 'needs_treatment';

export interface ToothRecord {
  tooth_fdi: number;
  status: ToothStatus;
  updated_at: string;
}

export interface ToothNote {
  id: string;
  tooth_fdi: number;
  note: string;
  appointment_id: string | null;
  created_at: string;
  appointments?: {
    appointment_date: string;
    services: { name: string } | null;
  } | null;
}

export interface DentalScan {
  id: string;
  appointment_id: string | null;
  tooth_fdis: number[];
  file_path: string;
  mime_type: 'image/jpeg' | 'image/png' | 'application/pdf';
  filename: string;
  notes: string | null;
  created_at: string;
  signed_url: string | null;
}

export async function getDentalChart(
  patientId: string,
): Promise<{ records: ToothRecord[]; notes: ToothNote[] }> {
  const res = await fetch(
    `${BASE}/api/documents?resource=dental&patient_id=${encodeURIComponent(patientId)}`,
    { headers: await authHeaders() },
  );
  if (!res.ok) throw new Error(`Dental chart error: ${res.status}`);
  return res.json();
}

export async function upsertToothStatus(
  patientId: string,
  toothFdi: number,
  status: ToothStatus,
): Promise<ToothRecord> {
  const res = await fetch(`${BASE}/api/documents?resource=dental`, {
    method:  'POST',
    headers: await authHeaders(),
    body:    JSON.stringify({ patient_id: patientId, tooth_fdi: toothFdi, status }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error ?? `Save failed: ${res.status}`);
  }
  const data = await res.json();
  return data.record;
}

export async function addToothNote(
  patientId: string,
  toothFdi: number,
  note: string,
  appointmentId?: string | null,
): Promise<ToothNote> {
  const res = await fetch(`${BASE}/api/documents?resource=dental&action=note`, {
    method:  'POST',
    headers: await authHeaders(),
    body:    JSON.stringify({
      patient_id:     patientId,
      tooth_fdi:      toothFdi,
      note,
      appointment_id: appointmentId ?? null,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error ?? `Save failed: ${res.status}`);
  }
  const data = await res.json();
  return data.note;
}

export async function deleteToothNote(id: string): Promise<void> {
  const res = await fetch(
    `${BASE}/api/documents?resource=dental&action=note&id=${encodeURIComponent(id)}`,
    { method: 'DELETE', headers: await authHeaders() },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error ?? `Delete failed: ${res.status}`);
  }
}

export async function getDentalScans(patientId: string): Promise<DentalScan[]> {
  const res = await fetch(
    `${BASE}/api/documents?resource=dental&action=scans&patient_id=${encodeURIComponent(patientId)}`,
    { headers: await authHeaders() },
  );
  if (!res.ok) throw new Error(`Scans error: ${res.status}`);
  const data = await res.json();
  return data.scans ?? [];
}

export async function saveDentalScan(payload: {
  patient_id: string;
  file_path: string;
  mime_type: string;
  filename: string;
  appointment_id?: string | null;
  tooth_fdis?: number[];
  notes?: string | null;
}): Promise<DentalScan> {
  const res = await fetch(`${BASE}/api/documents?resource=dental&action=scan`, {
    method:  'POST',
    headers: await authHeaders(),
    body:    JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error ?? `Upload failed: ${res.status}`);
  }
  const data = await res.json();
  return data.scan;
}

export async function deleteDentalScan(id: string): Promise<void> {
  const res = await fetch(
    `${BASE}/api/documents?resource=dental&action=scan&id=${encodeURIComponent(id)}`,
    { method: 'DELETE', headers: await authHeaders() },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error ?? `Delete failed: ${res.status}`);
  }
}

// ── Dental Surfaces ──────────────────────────────────────────────────────────

export async function getDentalSurfaces(
  patientId: string,
): Promise<{ surfaces: any[] }> {
  const res = await fetch(
    `${BASE}/api/documents?resource=dental_surfaces&patient_id=${encodeURIComponent(patientId)}`,
    { headers: await authHeaders() },
  );
  if (!res.ok) throw new Error(`Surfaces error: ${res.status}`);
  return res.json();
}

export async function saveDentalSurface(
  patientId: string,
  toothFdi: number,
  surface: string,
  status: string,
): Promise<{ surface: any }> {
  const res = await fetch(`${BASE}/api/documents`, {
    method:  'POST',
    headers: await authHeaders(),
    body:    JSON.stringify({ action: 'surface', patient_id: patientId, tooth_fdi: toothFdi, surface, status }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error ?? `Save failed: ${res.status}`);
  }
  return res.json();
}

// ── Time Blocks ──────────────────────────────────────────────────────────────

export async function getTimeBlocks(): Promise<{ time_blocks: any[] }> {
  const res = await fetch(`${BASE}/api/appointments?resource=time_blocks`, {
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(`Time blocks error: ${res.status}`);
  return res.json();
}

export async function createTimeBlock(data: {
  start_datetime: string;
  end_datetime: string;
  reason?: string;
}): Promise<{ time_block: any }> {
  const res = await fetch(`${BASE}/api/appointments?resource=time_blocks`, {
    method:  'POST',
    headers: await authHeaders(),
    body:    JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error ?? `Create failed: ${res.status}`);
  }
  return res.json();
}

export async function deleteTimeBlock(id: string): Promise<{ ok: boolean }> {
  const res = await fetch(
    `${BASE}/api/appointments?resource=time_blocks&id=${encodeURIComponent(id)}`,
    { method: 'DELETE', headers: await authHeaders() },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error ?? `Delete failed: ${res.status}`);
  }
  return res.json();
}
