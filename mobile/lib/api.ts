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
  patients: { id: string; first_name: string; last_name: string; email: string; phone: string } | null;
  services:  { id: string; name: string; category: string; price_from: number | null } | null;
}

export interface AppointmentSummary {
  id: string;
  appointment_date: string;
  appointment_time: string;
  status: string;
  patient_notes: string | null;
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
  await fetch(`${BASE}/api/push-token`, {
    method:  'POST',
    headers,
    body:    JSON.stringify({ token }),
  });
}
