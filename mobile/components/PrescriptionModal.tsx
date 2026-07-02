import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, Modal, ScrollView, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, Image, Share,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C } from '../constants/theme';
import type { Appointment } from '../lib/api';
import { getPractice, saveDocument, getMySignature, API_BASE, type PracticeConfig } from '../lib/api';
import { letterheadHeader, LETTERHEAD_CSS } from '../lib/docTemplate';

// ── Helpers ─────────────────────────────────────────────────────────────────
function todayIso(): string { return new Date().toISOString().slice(0, 10); }
function displayDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const MONTHS = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

function esc(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export interface RxItem {
  drug: string;
  strength: string;
  dose: string;
  freq: string;
  duration: string;
  qty: string;
}

// ── HTML template ────────────────────────────────────────────────────────────
function buildHtml(p: {
  patientName: string;
  idNumber: string | null;
  dateOfBirth: string | null;
  allergies: string[];
  items: RxItem[];
  notes: string;
  clinicianName: string;
  signatureSvg: string | null;
  practiceName: string;
  doctorQualification: string | null;
  practiceNumber: string | null;
  hpcsaNumber: string | null;
  letterhead: string | null;
}): string {
  const today = displayDate(todayIso());
  const idLine  = p.idNumber    ? `<div class="sub">ID Number: ${esc(p.idNumber)}</div>` : '';
  const dobLine = p.dateOfBirth ? `<div class="sub">Date of Birth: ${displayDate(p.dateOfBirth)}</div>` : '';
  const allergyLine = p.allergies.length
    ? `<div class="allergy">⚠ Allergies: ${p.allergies.map(esc).join(', ')}</div>`
    : `<div class="allergy noallergy">No known allergies recorded</div>`;

  const rows = p.items.map((it, i) => `
    <div class="rx">
      <div class="rxn">${i + 1}</div>
      <div class="rxbody">
        <div class="rxdrug">${esc(it.drug)}${it.strength ? ` <span class="rxstr">${esc(it.strength)}</span>` : ''}</div>
        <div class="rxdir">${[
          it.dose ? `Take ${esc(it.dose)}` : '',
          it.freq ? esc(it.freq) : '',
          it.duration ? `for ${esc(it.duration)}` : '',
        ].filter(Boolean).join(' · ') || 'As directed'}</div>
        ${it.qty ? `<div class="rxqty">Quantity to dispense: ${esc(it.qty)}</div>` : ''}
      </div>
    </div>`).join('');

  const sig = p.signatureSvg
    ? p.signatureSvg.startsWith('data:')
      ? `<img src="${p.signatureSvg}" style="height:64px;max-width:220px;display:block;margin:6px 0 2px;object-fit:contain;">`
      : `<div style="margin:6px 0 2px;">${p.signatureSvg}</div>`
    : `<div style="border-top:1.5px solid #bbb;width:220px;margin:24px 0 6px;"></div>`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  *{box-sizing:border-box;}
  body{font-family:'Helvetica Neue',Arial,sans-serif;margin:0;padding:0;color:#1a2531;background:#fff;}
  .page{max-width:680px;margin:0 auto;padding:44px 52px;}
  .lh{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:18px;border-bottom:3px solid #0a4a5c;margin-bottom:28px;}
  .pn{font-size:22px;font-weight:800;color:#0a4a5c;letter-spacing:-0.3px;}
  .ps{font-size:12px;color:#6b7280;margin-top:2px;}
  .dd{font-size:13px;color:#6b7280;text-align:right;line-height:1.5;}
  h2{color:#0a4a5c;font-size:16px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;border-bottom:1px solid #e5e7eb;padding-bottom:10px;margin:0 0 22px;}
  .rxsymbol{font-size:34px;font-weight:800;color:#0a4a5c;font-family:Georgia,serif;line-height:1;margin-bottom:14px;}
  .pb{background:#eef6fb;border-left:4px solid #0a4a5c;padding:14px 18px;border-radius:0 8px 8px 0;margin-bottom:14px;}
  .pname{font-size:18px;font-weight:700;color:#0a4a5c;}
  .sub{font-size:13px;color:#4b5563;margin-top:3px;}
  .allergy{font-size:13px;font-weight:600;color:#991b1b;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:9px 14px;margin-bottom:22px;}
  .noallergy{color:#6b7280;background:#f8fafc;border-color:#e5e7eb;font-weight:500;}
  .rx{display:flex;gap:14px;padding:14px 0;border-bottom:1px solid #eef1f4;}
  .rxn{width:26px;height:26px;border-radius:50%;background:#0a4a5c;color:#fff;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
  .rxbody{flex:1;}
  .rxdrug{font-size:16px;font-weight:700;color:#0a4a5c;}
  .rxstr{font-weight:500;color:#4b5563;font-size:14px;}
  .rxdir{font-size:14px;color:#374151;margin-top:3px;}
  .rxqty{font-size:12px;color:#6b7280;margin-top:3px;}
  .notes{background:#fff;border:1px solid #e0e3e8;border-radius:8px;padding:14px 18px;margin:22px 0;}
  .nl{font-size:11px;text-transform:uppercase;font-weight:700;color:#6b7280;letter-spacing:0.5px;margin-bottom:6px;}
  .nt{font-size:14px;color:#374151;line-height:1.65;white-space:pre-wrap;}
  .ss{margin-top:26px;}
  .sl{font-size:11px;text-transform:uppercase;font-weight:700;color:#6b7280;letter-spacing:0.5px;margin-bottom:2px;}
  .ft{margin-top:40px;padding-top:14px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center;line-height:1.6;}
  ${LETTERHEAD_CSS}
</style>
</head>
<body>
<div class="page">
  ${letterheadHeader({ letterhead: p.letterhead, practiceName: p.practiceName, practiceNumber: p.practiceNumber, dateText: today })}
  <h2>Prescription</h2>
  <div class="pb">
    <div class="pname">${esc(p.patientName)}</div>
    ${idLine}${dobLine}
  </div>
  ${allergyLine}
  <div class="rxsymbol">&#8478;</div>
  ${rows || '<div class="rxdir">No medications listed.</div>'}
  ${p.notes ? `<div class="notes"><div class="nl">Additional instructions</div><div class="nt">${esc(p.notes)}</div></div>` : ''}
  <div class="ss">
    <div class="sl">Prescribing Clinician</div>
    ${sig}
    <p style="margin:4px 0;font-size:13px"><strong>${esc(p.clinicianName) || '___________________________'}</strong></p>
    ${p.doctorQualification ? `<p style="margin:2px 0;font-size:12px;color:#666">${esc(p.doctorQualification)}</p>` : ''}
    ${p.hpcsaNumber ? `<p style="margin:2px 0;font-size:12px;color:#666">HPCSA No: ${esc(p.hpcsaNumber)}</p>` : ''}
    ${p.practiceNumber ? `<p style="margin:2px 0;font-size:12px;color:#666">Practice No: ${esc(p.practiceNumber)}</p>` : ''}
  </div>
  <div class="ft">
    This prescription was issued by ${esc(p.practiceName)}.<br>
    Confidential medical document — for patient use only.
  </div>
</div>
</body>
</html>`;
}

// ── Component ────────────────────────────────────────────────────────────────
interface Props {
  visible: boolean;
  onClose: () => void;
  appointment: Appointment;
}

const BLANK_ITEM: RxItem = { drug: '', strength: '', dose: '', freq: '', duration: '', qty: '' };

export default function PrescriptionModal({ visible, onClose, appointment }: Props) {
  const insets = useSafeAreaInsets();
  const patient = appointment.patients;

  const [items,         setItems]         = useState<RxItem[]>([{ ...BLANK_ITEM }]);
  const [notes,         setNotes]         = useState('');
  const [clinicianName, setClinicianName] = useState('');
  const [signatureSvg,  setSignatureSvg]  = useState<string | null>(null);
  const [sigLoading,    setSigLoading]    = useState(false);
  const [generating,    setGenerating]    = useState(false);
  const [webDocId,      setWebDocId]      = useState<string | null>(null);
  const [practice,      setPractice]      = useState<PracticeConfig | null>(null);

  const saveClinicianName = useCallback((name: string) => {
    setClinicianName(name);
    AsyncStorage.setItem('clinician_name', name);
  }, []);

  useEffect(() => {
    if (!visible) return;
    setItems([{ ...BLANK_ITEM }]);
    setNotes('');
    setWebDocId(null);
    AsyncStorage.getItem('clinician_name').then((v: string | null) => { if (v) setClinicianName(v); });
    getPractice().then(p => {
      if (p) {
        setPractice(p);
        const full = [p.doctor_first_name, p.doctor_last_name].filter(Boolean).join(' ');
        if (full) setClinicianName(full);
      }
    });
    setSigLoading(true);
    getMySignature().then(({ signatureData, displayName }) => {
      setSignatureSvg(signatureData);
      if (displayName && !clinicianName.trim()) setClinicianName(displayName);
      setSigLoading(false);
    });
  }, [visible]);

  const setItem = (idx: number, patch: Partial<RxItem>) =>
    setItems(prev => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const addItem = () => setItems(prev => [...prev, { ...BLANK_ITEM }]);
  const removeItem = (idx: number) => setItems(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev);

  const generateAndShare = async () => {
    const filled = items.filter(it => it.drug.trim());
    if (!filled.length) { Alert.alert('Missing medication', 'Please add at least one medication with a name.'); return; }
    if (!clinicianName.trim()) { Alert.alert('Missing info', "Please enter the prescriber's name."); return; }
    setGenerating(true);
    try {
      const practiceName = practice?.name || 'Dental Practice';
      const html = buildHtml({
        patientName:         patient ? `${patient.first_name} ${patient.last_name}` : 'Patient',
        idNumber:            patient?.id_number ?? null,
        dateOfBirth:         patient?.date_of_birth ?? null,
        allergies:           patient?.allergies ?? [],
        items:               filled,
        notes:               notes.trim(),
        clinicianName:       clinicianName.trim(),
        signatureSvg,
        practiceName,
        doctorQualification: practice?.doctor_qualification ?? null,
        practiceNumber:      practice?.practice_number ?? null,
        hpcsaNumber:         practice?.hpcsa_number ?? null,
        letterhead:          practice?.letterhead_data ?? null,
      });
      const patId = patient?.id;
      const saved = await saveDocument({
        type:           'prescription',
        appointment_id: appointment.id,
        ...(patId ? { patient_id: patId } : {}),
        title:          `Prescription — ${patient ? patient.first_name + ' ' + patient.last_name : 'Patient'} — ${todayIso()}`,
        html_content:   html,
      });
      if (saved?.id) {
        setWebDocId(saved.id);
        Alert.alert('Sent to front desk', 'The prescription has been generated and is ready for the admin to print and sign.');
      } else {
        Alert.alert('Error', 'Could not save the prescription. Please try again.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not generate prescription.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={s.safe} edges={['top']}>
        <View style={s.header}>
          <TouchableOpacity onPress={onClose} style={s.closeBtnWrap} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close-circle" size={28} color={C.ink} />
          </TouchableOpacity>
          <Text style={s.title}>Prescription</Text>
          <View style={{ width: 38 }} />
        </View>

        <ScrollView
          contentContainerStyle={[s.scroll, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {patient && (
            <View style={s.patientCard}>
              <Text style={s.cardLabel}>PATIENT</Text>
              <Text style={s.patientName}>{patient.first_name} {patient.last_name}</Text>
              {patient.date_of_birth && <Text style={s.patientSub}>DOB: {shortDate(patient.date_of_birth)}</Text>}
              {patient.id_number && <Text style={s.patientSub}>ID: {patient.id_number}</Text>}
              {patient.allergies?.length ? (
                <View style={s.allergyChip}>
                  <Ionicons name="warning" size={13} color="#991b1b" />
                  <Text style={s.allergyText}>Allergies: {patient.allergies.join(', ')}</Text>
                </View>
              ) : null}
            </View>
          )}

          {/* Medication rows */}
          {items.map((it, idx) => (
            <View key={idx} style={s.rxCard}>
              <View style={s.rxHead}>
                <Text style={s.rxNum}>Medication {idx + 1}</Text>
                {items.length > 1 && (
                  <TouchableOpacity onPress={() => removeItem(idx)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="trash-outline" size={16} color={C.danger} />
                  </TouchableOpacity>
                )}
              </View>
              <TextInput style={s.input} value={it.drug} onChangeText={t => setItem(idx, { drug: t })}
                placeholder="Drug name (e.g. Amoxicillin)" placeholderTextColor={C.muted} autoCapitalize="words" />
              <View style={s.row2}>
                <TextInput style={[s.input, s.half]} value={it.strength} onChangeText={t => setItem(idx, { strength: t })}
                  placeholder="Strength (500mg)" placeholderTextColor={C.muted} />
                <TextInput style={[s.input, s.half]} value={it.dose} onChangeText={t => setItem(idx, { dose: t })}
                  placeholder="Dose (1 tab)" placeholderTextColor={C.muted} />
              </View>
              <View style={s.row2}>
                <TextInput style={[s.input, s.half]} value={it.freq} onChangeText={t => setItem(idx, { freq: t })}
                  placeholder="Frequency (3× daily)" placeholderTextColor={C.muted} />
                <TextInput style={[s.input, s.half]} value={it.duration} onChangeText={t => setItem(idx, { duration: t })}
                  placeholder="Duration (5 days)" placeholderTextColor={C.muted} />
              </View>
              <TextInput style={s.input} value={it.qty} onChangeText={t => setItem(idx, { qty: t })}
                placeholder="Quantity to dispense (optional)" placeholderTextColor={C.muted} keyboardType="numbers-and-punctuation" />
            </View>
          ))}

          <TouchableOpacity style={s.addRow} onPress={addItem}>
            <Ionicons name="add-circle-outline" size={18} color={C.sage} />
            <Text style={s.addRowText}>Add another medication</Text>
          </TouchableOpacity>

          {/* Notes */}
          <View style={s.fieldCard}>
            <Text style={s.fieldLabel}>ADDITIONAL INSTRUCTIONS</Text>
            <TextInput style={s.textArea} value={notes} onChangeText={setNotes} multiline
              placeholder="e.g. Take with food. Complete the full course." placeholderTextColor={C.muted}
              textAlignVertical="top" scrollEnabled={false} />
          </View>

          {/* Clinician */}
          <View style={s.fieldCard}>
            <Text style={s.fieldLabel}>PRESCRIBING CLINICIAN</Text>
            <TextInput style={s.inputBare} value={clinicianName} onChangeText={saveClinicianName}
              placeholder="Dr. Full Name" placeholderTextColor={C.muted} autoCapitalize="words" />
          </View>

          {/* Signature */}
          <View style={s.fieldCard}>
            <Text style={s.fieldLabel}>SIGNATURE</Text>
            {sigLoading ? (
              <ActivityIndicator size="small" color={C.sage} style={{ marginVertical: 12 }} />
            ) : signatureSvg ? (
              <>
                <Image source={{ uri: signatureSvg }} style={s.sigPreview} resizeMode="contain" />
                <Text style={s.sigNote}>From your clinician profile</Text>
              </>
            ) : (
              <View style={s.sigMissing}>
                <Text style={s.sigMissingText}>No signature uploaded. Add yours in Settings on the web app.</Text>
              </View>
            )}
          </View>

          {!webDocId ? (
            <TouchableOpacity style={[s.shareBtn, generating && s.shareBtnDim]} onPress={generateAndShare} disabled={generating} activeOpacity={0.85}>
              {generating ? <ActivityIndicator color="#fff" size="small" /> : (
                <>
                  <Ionicons name="print-outline" size={20} color="#fff" />
                  <Text style={s.shareBtnText}>Generate & Send to Admin</Text>
                </>
              )}
            </TouchableOpacity>
          ) : (
            <View style={s.sentBanner}>
              <Ionicons name="checkmark-circle" size={20} color="#065F46" />
              <Text style={s.sentBannerText}>Sent to front desk for printing</Text>
            </View>
          )}

          {webDocId && (
            <TouchableOpacity style={s.webLinkBtn} onPress={() => Share.share({ message: `Print this prescription: ${API_BASE}/document.html?id=${webDocId}` })}>
              <Ionicons name="link-outline" size={16} color={C.sage} />
              <Text style={s.webLinkText}>Share print link with admin</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.rule, backgroundColor: C.bg },
  closeBtnWrap: { padding: 4 },
  title:  { fontSize: 16, fontWeight: '700', color: C.ink },
  scroll: { padding: 20, paddingTop: 16 },

  patientCard: { backgroundColor: C.paper, borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: C.rule },
  cardLabel:   { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: C.muted, marginBottom: 6 },
  patientName: { fontSize: 17, fontWeight: '700', color: C.ink },
  patientSub:  { fontSize: 12, color: C.muted, marginTop: 2 },
  allergyChip: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  allergyText: { fontSize: 12, color: '#991b1b', fontWeight: '600', flex: 1 },

  rxCard:  { backgroundColor: C.paper, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.rule },
  rxHead:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  rxNum:   { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: C.muted },
  input:   { backgroundColor: C.bg, borderWidth: 1, borderColor: C.rule, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: C.ink, marginBottom: 8 },
  row2:    { flexDirection: 'row', gap: 8 },
  half:    { flex: 1 },

  addRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, marginBottom: 12 },
  addRowText: { fontSize: 14, color: C.sage, fontWeight: '600' },

  fieldCard:  { backgroundColor: C.paper, borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: C.rule },
  fieldLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: C.muted, marginBottom: 10 },
  textArea:   { fontSize: 14, color: C.ink, minHeight: 70, lineHeight: 21, textAlignVertical: 'top', paddingTop: 0 },
  inputBare:  { fontSize: 15, color: C.ink, paddingVertical: 2 },

  sigPreview: { width: '100%', height: 72, borderRadius: 8, backgroundColor: '#f8fafc', marginBottom: 4 },
  sigNote:    { fontSize: 11, color: C.muted, fontStyle: 'italic' },
  sigMissing: { borderWidth: 1, borderColor: C.rule, borderRadius: 10, padding: 14, backgroundColor: C.bg },
  sigMissingText: { fontSize: 13, color: C.muted, lineHeight: 19 },

  shareBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: C.sage, borderRadius: 16, paddingVertical: 16, marginTop: 8 },
  shareBtnDim:  { opacity: 0.55 },
  shareBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  sentBanner:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#D1FAE5', borderRadius: 14, paddingVertical: 16, marginTop: 8 },
  sentBannerText: { fontSize: 15, fontWeight: '600', color: '#065F46' },
  webLinkBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: C.rule, backgroundColor: C.paper },
  webLinkText:  { fontSize: 13, color: C.sage, fontWeight: '600' },
});
