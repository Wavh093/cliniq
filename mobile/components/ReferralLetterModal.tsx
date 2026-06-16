import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, Modal, ScrollView, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, useWindowDimensions,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Calendar } from 'react-native-calendars';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import SignaturePad from './SignaturePad';
import { C } from '../constants/theme';
import type { Appointment } from '../lib/api';

// ── Helpers ─────────────────────────────────────────────────────────────────

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function addMonths(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}

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

// ── HTML template ────────────────────────────────────────────────────────────

function buildHtml(p: {
  patientName: string;
  idNumber: string | null;
  dateOfBirth: string | null;
  phone: string | null;
  email: string | null;
  fromDate: string;
  toDate: string;
  referTo: string;
  message: string;
  clinicianName: string;
  signatureSvg: string | null;
}): string {
  const today    = displayDate(todayIso());
  const patSub   = [
    p.dateOfBirth ? `DOB: ${displayDate(p.dateOfBirth)}` : '',
    p.idNumber    ? `ID: ${p.idNumber}` : '',
  ].filter(Boolean).join('  |  ');
  const contact  = [p.phone, p.email].filter(Boolean).join('  |  ');
  const sig      = p.signatureSvg
    ? `<div style="margin:6px 0 2px;">${p.signatureSvg}</div>`
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
  .dear{font-size:15px;color:#374151;margin-bottom:18px;}
  .re{background:#eef6fb;border-left:4px solid #0a4a5c;padding:14px 18px;border-radius:0 8px 8px 0;margin-bottom:22px;}
  .rn{font-size:17px;font-weight:700;color:#0a4a5c;}
  .rs{font-size:13px;color:#4b5563;margin-top:3px;}
  .intro{font-size:14px;line-height:1.75;color:#374151;margin-bottom:8px;}
  .validity{background:#f8fafc;border:1.5px solid #dde3ea;border-radius:10px;padding:14px 18px;margin-bottom:22px;}
  .vl{font-size:11px;text-transform:uppercase;font-weight:700;color:#0a4a5c;letter-spacing:0.5px;margin-bottom:6px;}
  .vd{font-size:15px;font-weight:600;color:#0a4a5c;}
  .msg{background:#fff;border:1px solid #e0e3e8;border-radius:8px;padding:14px 18px;margin-bottom:8px;}
  .ml{font-size:11px;text-transform:uppercase;font-weight:700;color:#6b7280;letter-spacing:0.5px;margin-bottom:6px;}
  .mt{font-size:14px;color:#374151;line-height:1.65;white-space:pre-wrap;}
  .contact{font-size:13px;color:#6b7280;margin-bottom:28px;}
  .ss{margin-top:4px;}
  .sl{font-size:11px;text-transform:uppercase;font-weight:700;color:#6b7280;letter-spacing:0.5px;margin-bottom:2px;}
  .cn{font-size:14px;font-weight:600;color:#0a4a5c;margin-top:2px;}
  .cp{font-size:12px;color:#9ca3af;margin-top:1px;}
  .ft{margin-top:44px;padding-top:14px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center;line-height:1.6;}
</style>
</head>
<body>
<div class="page">
  <div class="lh">
    <div><div class="pn">OH Dental Studio</div><div class="ps">Professional Dental Care</div></div>
    <div class="dd">${today}</div>
  </div>
  <h2>Referral Letter</h2>
  <div class="dear">Dear ${p.referTo ? `Dr / ${p.referTo}` : 'Sir / Madam'},</div>
  <div class="re">
    <div class="rn">${p.patientName}</div>
    ${patSub ? `<div class="rs">${patSub}</div>` : ''}
    ${contact ? `<div class="rs">${contact}</div>` : ''}
  </div>
  <p class="intro">
    I am referring the above-named patient to your care for further assessment and management.
  </p>
  <div class="validity">
    <div class="vl">Referral Validity Period</div>
    <div class="vd">${displayDate(p.fromDate)} &ndash; ${displayDate(p.toDate)}</div>
  </div>
  <div class="msg">
    <div class="ml">Clinical Notes / Reason for Referral</div>
    <div class="mt">${p.message || 'Please assess and manage as appropriate.'}</div>
  </div>
  ${contact ? `<div class="contact">Patient contact: ${contact}</div>` : ''}
  <div class="ss">
    <div class="sl">Referring Clinician</div>
    ${sig}
    <div class="cn">${p.clinicianName || '___________________________'}</div>
    <div class="cp">OH Dental Studio</div>
  </div>
  <div class="ft">
    This letter was issued by OH Dental Studio.<br>
    Confidential medical document — for recipient use only.
  </div>
</div>
</body>
</html>`;
}

// ── Types ────────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  onClose: () => void;
  appointment: Appointment;
}

type CalendarFor = 'from' | 'to' | null;

// ── Component ────────────────────────────────────────────────────────────────

export default function ReferralLetterModal({ visible, onClose, appointment }: Props) {
  const { width: sw } = useWindowDimensions();
  const padWidth = sw - 80;

  const patient = appointment.patients;
  const today   = todayIso();

  const [fromDate,      setFromDate]      = useState(today);
  const [toDate,        setToDate]        = useState(addMonths(today, 3));
  const [referTo,       setReferTo]       = useState('');
  const [message,       setMessage]       = useState(appointment.clinical_notes?.trim() ?? '');
  const [clinicianName, setClinicianName] = useState('');
  const [signatureSvg,  setSignatureSvg]  = useState<string | null>(null);
  const [calendarFor,   setCalendarFor]   = useState<CalendarFor>(null);
  const [generating,    setGenerating]    = useState(false);

  // Persist clinician name across sessions
  useEffect(() => {
    AsyncStorage.getItem('clinician_name').then(v => { if (v) setClinicianName(v); });
  }, []);

  const saveClinicianName = useCallback((name: string) => {
    setClinicianName(name);
    AsyncStorage.setItem('clinician_name', name);
  }, []);

  // Reset on open
  useEffect(() => {
    if (visible) {
      const t = todayIso();
      setFromDate(t);
      setToDate(addMonths(t, 3));
      setMessage(appointment.clinical_notes?.trim() ?? '');
      setSignatureSvg(null);
      setCalendarFor(null);
    }
  }, [visible, appointment.clinical_notes]);

  const generateAndShare = async () => {
    if (!clinicianName.trim()) {
      Alert.alert('Missing info', 'Please enter the clinician\'s name.');
      return;
    }
    if (!referTo.trim()) {
      Alert.alert('Missing info', 'Please enter who you are referring the patient to.');
      return;
    }
    setGenerating(true);
    try {
      const html = buildHtml({
        patientName:  patient ? `${patient.first_name} ${patient.last_name}` : 'Patient',
        idNumber:     patient?.id_number ?? null,
        dateOfBirth:  patient?.date_of_birth ?? null,
        phone:        patient?.phone ?? null,
        email:        patient?.email ?? null,
        fromDate,
        toDate,
        referTo:      referTo.trim(),
        message:      message.trim(),
        clinicianName: clinicianName.trim(),
        signatureSvg,
      });
      const { uri } = await Print.printToFileAsync({ html, width: 612, height: 792 });
      await Sharing.shareAsync(uri, {
        mimeType:    'application/pdf',
        dialogTitle: 'Share Referral Letter',
        UTI:         'com.adobe.pdf',
      });
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not generate document.');
    } finally {
      setGenerating(false);
    }
  };

  // Marked dates for calendar
  const markedDates: Record<string, any> = {
    [fromDate]: { selected: true, selectedColor: C.sage },
    [toDate]:   { selected: true, selectedColor: C.sage },
  };

  // ── Calendar picker view ─────────────────────────────────────────
  if (calendarFor) {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={() => setCalendarFor(null)}>
        <SafeAreaView style={s.safe} edges={['top']}>
          <View style={s.calHeader}>
            <Text style={s.calTitle}>
              Select {calendarFor === 'from' ? 'start' : 'end'} date
            </Text>
            <TouchableOpacity onPress={() => setCalendarFor(null)}>
              <Text style={s.calCancel}>Cancel</Text>
            </TouchableOpacity>
          </View>
          <Calendar
            current={calendarFor === 'from' ? fromDate : toDate}
            minDate={calendarFor === 'to' ? fromDate : undefined}
            onDayPress={(day: any) => {
              if (calendarFor === 'from') {
                setFromDate(day.dateString);
                if (day.dateString > toDate) setToDate(addMonths(day.dateString, 1));
              } else {
                setToDate(day.dateString);
              }
              setCalendarFor(null);
            }}
            markedDates={markedDates}
            theme={{
              selectedDayBackgroundColor: C.sage,
              todayTextColor: C.sage,
              arrowColor: C.sage,
            }}
          />
        </SafeAreaView>
      </Modal>
    );
  }

  // ── Form view ────────────────────────────────────────────────────
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={s.safe} edges={['top']}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={onClose} style={s.closeBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={22} color={C.ink} />
          </TouchableOpacity>
          <Text style={s.title}>Referral Letter</Text>
          <View style={{ width: 38 }} />
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={s.scroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Patient info */}
            {patient && (
              <View style={s.patientCard}>
                <Text style={s.cardLabel}>PATIENT</Text>
                <Text style={s.patientName}>{patient.first_name} {patient.last_name}</Text>
                {patient.date_of_birth && (
                  <Text style={s.patientSub}>DOB: {shortDate(patient.date_of_birth)}</Text>
                )}
                {patient.id_number && (
                  <Text style={s.patientSub}>ID: {patient.id_number}</Text>
                )}
                {patient.phone && (
                  <Text style={s.patientSub}>{patient.phone}</Text>
                )}
              </View>
            )}

            {/* Refer to */}
            <View style={s.fieldCard}>
              <Text style={s.fieldLabel}>REFER TO</Text>
              <TextInput
                style={s.input}
                value={referTo}
                onChangeText={setReferTo}
                placeholder="e.g. Maxillofacial Surgeon, Dr. Naidoo"
                placeholderTextColor={C.muted}
                autoCapitalize="words"
                returnKeyType="next"
              />
            </View>

            {/* Referral validity period */}
            <View style={s.fieldCard}>
              <Text style={s.fieldLabel}>VALIDITY PERIOD</Text>
              <View style={s.dateRow}>
                <TouchableOpacity style={s.dateBtn} onPress={() => setCalendarFor('from')}>
                  <Text style={s.dateBtnLabel}>From</Text>
                  <Text style={s.dateBtnValue}>{shortDate(fromDate)}</Text>
                  <Ionicons name="calendar-outline" size={14} color={C.sage} />
                </TouchableOpacity>
                <Text style={s.dateSep}>→</Text>
                <TouchableOpacity style={s.dateBtn} onPress={() => setCalendarFor('to')}>
                  <Text style={s.dateBtnLabel}>To</Text>
                  <Text style={s.dateBtnValue}>{shortDate(toDate)}</Text>
                  <Ionicons name="calendar-outline" size={14} color={C.sage} />
                </TouchableOpacity>
              </View>
              <View style={s.quickRow}>
                {[
                  { label: '1 month',  months: 1 },
                  { label: '3 months', months: 3 },
                  { label: '6 months', months: 6 },
                  { label: '1 year',   months: 12 },
                ].map(({ label, months }) => {
                  const targetTo = addMonths(fromDate, months);
                  return (
                    <TouchableOpacity
                      key={label}
                      style={[s.quickBtn, toDate === targetTo && s.quickBtnActive]}
                      onPress={() => setToDate(targetTo)}
                    >
                      <Text style={[s.quickBtnText, toDate === targetTo && s.quickBtnTextActive]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Clinical message */}
            <View style={s.fieldCard}>
              <Text style={s.fieldLabel}>REASON FOR REFERRAL</Text>
              <TextInput
                style={s.textArea}
                value={message}
                onChangeText={setMessage}
                multiline
                placeholder="Clinical findings, treatment history, specific requests for the specialist…"
                placeholderTextColor={C.muted}
                textAlignVertical="top"
                scrollEnabled={false}
                autoCapitalize="sentences"
                autoCorrect
              />
            </View>

            {/* Clinician name */}
            <View style={s.fieldCard}>
              <Text style={s.fieldLabel}>REFERRING CLINICIAN</Text>
              <TextInput
                style={s.input}
                value={clinicianName}
                onChangeText={saveClinicianName}
                placeholder="Dr. Full Name"
                placeholderTextColor={C.muted}
                autoCapitalize="words"
              />
            </View>

            {/* Signature */}
            <View style={s.fieldCard}>
              <Text style={s.fieldLabel}>SIGNATURE</Text>
              <Text style={s.sigHint}>Draw your signature below</Text>
              <SignaturePad
                key={visible ? 'open' : 'closed'}
                width={padWidth}
                height={140}
                onChange={setSignatureSvg}
              />
            </View>

            {/* Share button */}
            <TouchableOpacity
              style={[s.shareBtn, generating && s.shareBtnDim]}
              onPress={generateAndShare}
              disabled={generating}
              activeOpacity={0.85}
            >
              {generating ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="share-outline" size={20} color="#fff" />
                  <Text style={s.shareBtnText}>Generate & Share</Text>
                </>
              )}
            </TouchableOpacity>

            <View style={{ height: 32 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },

  calHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: C.rule,
  },
  calTitle:  { fontSize: 16, fontWeight: '600', color: C.ink },
  calCancel: { fontSize: 14, color: C.muted },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: C.rule, backgroundColor: C.bg,
  },
  closeBtn: { padding: 4 },
  title:    { fontSize: 16, fontWeight: '700', color: C.ink },

  scroll: { padding: 20, paddingTop: 16 },

  patientCard: {
    backgroundColor: C.paper, borderRadius: 14,
    padding: 14, marginBottom: 12,
    borderWidth: 1, borderColor: C.rule,
  },
  cardLabel:   { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: C.muted, marginBottom: 6 },
  patientName: { fontSize: 17, fontWeight: '700', color: C.ink },
  patientSub:  { fontSize: 12, color: C.muted, marginTop: 2 },

  fieldCard: {
    backgroundColor: C.paper, borderRadius: 14,
    padding: 14, marginBottom: 12,
    borderWidth: 1, borderColor: C.rule,
  },
  fieldLabel: {
    fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: C.muted, marginBottom: 10,
  },

  dateRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  dateBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.bg2, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    gap: 6,
  },
  dateBtnLabel: { fontSize: 11, color: C.muted, flex: 1 },
  dateBtnValue: { fontSize: 13, fontWeight: '600', color: C.ink },
  dateSep:      { fontSize: 16, color: C.muted, marginHorizontal: 2 },

  quickRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  quickBtn: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 8, borderWidth: 1, borderColor: C.rule,
    backgroundColor: C.bg,
  },
  quickBtnActive:     { backgroundColor: C.sage, borderColor: C.sage },
  quickBtnText:       { fontSize: 12, color: C.inkSoft, fontWeight: '500' },
  quickBtnTextActive: { color: '#fff', fontWeight: '600' },

  textArea: {
    fontSize: 14, color: C.ink, minHeight: 100, lineHeight: 21,
    textAlignVertical: 'top', paddingTop: 0,
  },
  input: { fontSize: 15, color: C.ink, paddingVertical: 2 },

  sigHint: { fontSize: 12, color: C.muted, marginBottom: 8 },

  shareBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, backgroundColor: C.sage, borderRadius: 16,
    paddingVertical: 16, marginTop: 8,
  },
  shareBtnDim:  { opacity: 0.55 },
  shareBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
