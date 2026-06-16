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

function dayCount(from: string, to: string): number {
  const a = new Date(from + 'T00:00:00');
  const b = new Date(to   + 'T00:00:00');
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86400000) + 1);
}

// ── HTML template ────────────────────────────────────────────────────────────

function buildHtml(p: {
  patientName: string;
  idNumber: string | null;
  dateOfBirth: string | null;
  consultDate: string;
  fromDate: string;
  toDate: string;
  reason: string;
  clinicianName: string;
  signatureSvg: string | null;
}): string {
  const today = displayDate(todayIso());
  const days  = dayCount(p.fromDate, p.toDate);

  const idLine  = p.idNumber     ? `<div class="sub">ID Number: ${p.idNumber}</div>` : '';
  const dobLine = p.dateOfBirth  ? `<div class="sub">Date of Birth: ${displayDate(p.dateOfBirth)}</div>` : '';
  const sig     = p.signatureSvg
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
  .pb{background:#eef6fb;border-left:4px solid #0a4a5c;padding:14px 18px;border-radius:0 8px 8px 0;margin-bottom:22px;}
  .pname{font-size:18px;font-weight:700;color:#0a4a5c;}
  .sub{font-size:13px;color:#4b5563;margin-top:3px;}
  .body{font-size:14px;line-height:1.75;color:#374151;margin-bottom:20px;}
  .period{background:#f8fafc;border:1.5px solid #dde3ea;border-radius:10px;padding:16px 20px;margin-bottom:20px;}
  .pl{font-size:11px;text-transform:uppercase;font-weight:700;color:#0a4a5c;letter-spacing:0.5px;margin-bottom:7px;}
  .pd{font-size:16px;font-weight:600;color:#0a4a5c;}
  .py{font-size:13px;color:#6b7280;margin-top:4px;}
  .rb{background:#fff;border:1px solid #e0e3e8;border-radius:8px;padding:14px 18px;margin-bottom:28px;}
  .rl{font-size:11px;text-transform:uppercase;font-weight:700;color:#6b7280;letter-spacing:0.5px;margin-bottom:6px;}
  .rt{font-size:14px;color:#374151;line-height:1.65;white-space:pre-wrap;}
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
  <h2>Medical Certificate</h2>
  <div class="pb">
    <div class="pname">${p.patientName}</div>
    ${idLine}${dobLine}
  </div>
  <p class="body">
    This is to certify that the above-named patient was examined at <strong>OH Dental Studio</strong>
    on <strong>${displayDate(p.consultDate)}</strong> and is medically unfit for work / school
    for the period indicated below:
  </p>
  <div class="period">
    <div class="pl">Period of Incapacity</div>
    <div class="pd">${displayDate(p.fromDate)} &ndash; ${displayDate(p.toDate)}</div>
    <div class="py">${days} day${days !== 1 ? 's' : ''}</div>
  </div>
  <div class="rb">
    <div class="rl">Reason / Diagnosis</div>
    <div class="rt">${p.reason || 'Dental treatment performed.'}</div>
  </div>
  <div class="ss">
    <div class="sl">Treating Clinician</div>
    ${sig}
    <div class="cn">${p.clinicianName || '___________________________'}</div>
    <div class="cp">OH Dental Studio</div>
  </div>
  <div class="ft">
    This certificate was issued by OH Dental Studio.<br>
    Confidential medical document — for patient use only.
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

export default function SickNoteModal({ visible, onClose, appointment }: Props) {
  const { width: sw } = useWindowDimensions();
  const padWidth = sw - 80;

  const patient     = appointment.patients;
  const consultDate = appointment.appointment_date;

  const [fromDate,       setFromDate]       = useState(consultDate);
  const [toDate,         setToDate]         = useState(addDays(consultDate, 2));
  const [reason,         setReason]         = useState(appointment.clinical_notes?.trim() ?? '');
  const [clinicianName,  setClinicianName]  = useState('');
  const [signatureSvg,   setSignatureSvg]   = useState<string | null>(null);
  const [calendarFor,    setCalendarFor]    = useState<CalendarFor>(null);
  const [generating,     setGenerating]     = useState(false);

  // Persist clinician name
  useEffect(() => {
    AsyncStorage.getItem('clinician_name').then(v => { if (v) setClinicianName(v); });
  }, []);

  const saveClinicianName = useCallback((name: string) => {
    setClinicianName(name);
    AsyncStorage.setItem('clinician_name', name);
  }, []);

  const setDuration = (days: number) => setToDate(addDays(fromDate, days - 1));

  const generateAndShare = async () => {
    if (!clinicianName.trim()) {
      Alert.alert('Missing info', 'Please enter the clinician\'s name.');
      return;
    }
    setGenerating(true);
    try {
      const html = buildHtml({
        patientName:  patient ? `${patient.first_name} ${patient.last_name}` : 'Patient',
        idNumber:     patient?.id_number ?? null,
        dateOfBirth:  patient?.date_of_birth ?? null,
        consultDate,
        fromDate,
        toDate,
        reason:       reason.trim(),
        clinicianName: clinicianName.trim(),
        signatureSvg,
      });
      const { uri } = await Print.printToFileAsync({ html, width: 612, height: 792 });
      await Sharing.shareAsync(uri, {
        mimeType:    'application/pdf',
        dialogTitle: 'Share Sick Note',
        UTI:         'com.adobe.pdf',
      });
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not generate document.');
    } finally {
      setGenerating(false);
    }
  };

  // Reset on open
  useEffect(() => {
    if (visible) {
      setFromDate(consultDate);
      setToDate(addDays(consultDate, 2));
      setReason(appointment.clinical_notes?.trim() ?? '');
      setSignatureSvg(null);
      setCalendarFor(null);
    }
  }, [visible, consultDate, appointment.clinical_notes]);

  const markedDates: Record<string, any> = {
    [fromDate]: { selected: true, selectedColor: C.sage },
    ...(fromDate !== toDate ? { [toDate]: { selected: true, selectedColor: C.sageDep } } : {}),
  };

  // ── Calendar view ────────────────────────────────────────────────
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
                if (day.dateString > toDate) setToDate(day.dateString);
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
              dotColor: C.sage,
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
          <Text style={s.title}>Sick Note</Text>
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
              </View>
            )}

            {/* Consultation date */}
            <View style={s.infoRow}>
              <Ionicons name="calendar-outline" size={14} color={C.muted} />
              <Text style={s.infoText}>Consulted on <Text style={s.infoEmph}>{shortDate(consultDate)}</Text></Text>
            </View>

            {/* Rest period */}
            <View style={s.fieldCard}>
              <Text style={s.fieldLabel}>REST PERIOD</Text>
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
              <Text style={s.daysCount}>{dayCount(fromDate, toDate)} day{dayCount(fromDate, toDate) !== 1 ? 's' : ''}</Text>
              <View style={s.quickRow}>
                {[1, 2, 3, 5, 7, 14].map(d => (
                  <TouchableOpacity
                    key={d}
                    style={[s.quickBtn, dayCount(fromDate, toDate) === d && s.quickBtnActive]}
                    onPress={() => setDuration(d)}
                  >
                    <Text style={[s.quickBtnText, dayCount(fromDate, toDate) === d && s.quickBtnTextActive]}>
                      {d}d
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Reason */}
            <View style={s.fieldCard}>
              <Text style={s.fieldLabel}>REASON / DIAGNOSIS</Text>
              <TextInput
                style={s.textArea}
                value={reason}
                onChangeText={setReason}
                multiline
                placeholder="e.g. Dental extraction — post-operative pain and swelling"
                placeholderTextColor={C.muted}
                textAlignVertical="top"
                scrollEnabled={false}
                autoCapitalize="sentences"
                autoCorrect
              />
            </View>

            {/* Clinician name */}
            <View style={s.fieldCard}>
              <Text style={s.fieldLabel}>TREATING CLINICIAN</Text>
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
  safe:   { flex: 1, backgroundColor: C.bg },

  // Calendar picker view
  calHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: C.rule,
  },
  calTitle:  { fontSize: 16, fontWeight: '600', color: C.ink },
  calCancel: { fontSize: 14, color: C.muted },

  // Form view
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: C.rule, backgroundColor: C.bg,
  },
  closeBtn: { padding: 4 },
  title:    { fontSize: 16, fontWeight: '700', color: C.ink },

  scroll: { padding: 20, paddingTop: 16 },

  // Patient card
  patientCard: {
    backgroundColor: C.paper, borderRadius: 14,
    padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: C.rule,
  },
  cardLabel:   { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: C.muted, marginBottom: 6 },
  patientName: { fontSize: 17, fontWeight: '700', color: C.ink },
  patientSub:  { fontSize: 12, color: C.muted, marginTop: 2 },

  // Info row
  infoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 4, paddingVertical: 6, marginBottom: 8,
  },
  infoText: { fontSize: 13, color: C.inkSoft },
  infoEmph: { fontWeight: '600', color: C.ink },

  // Field cards
  fieldCard: {
    backgroundColor: C.paper, borderRadius: 14,
    padding: 14, marginBottom: 12,
    borderWidth: 1, borderColor: C.rule,
  },
  fieldLabel: {
    fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: C.muted, marginBottom: 10,
  },

  // Date picker row
  dateRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  dateBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.bg2, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    gap: 6,
  },
  dateBtnLabel: { fontSize: 11, color: C.muted, flex: 1 },
  dateBtnValue: { fontSize: 13, fontWeight: '600', color: C.ink },
  dateSep:      { fontSize: 16, color: C.muted, marginHorizontal: 2 },
  daysCount:    { fontSize: 12, color: C.sage, fontWeight: '600', marginBottom: 8 },

  // Quick duration buttons
  quickRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  quickBtn: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 8, borderWidth: 1, borderColor: C.rule,
    backgroundColor: C.bg,
  },
  quickBtnActive:     { backgroundColor: C.sage, borderColor: C.sage },
  quickBtnText:       { fontSize: 12, color: C.inkSoft, fontWeight: '500' },
  quickBtnTextActive: { color: '#fff', fontWeight: '600' },

  // Text inputs
  textArea: {
    fontSize: 14, color: C.ink, minHeight: 80, lineHeight: 21,
    textAlignVertical: 'top', paddingTop: 0,
  },
  input: { fontSize: 15, color: C.ink, paddingVertical: 2 },

  // Signature
  sigHint: { fontSize: 12, color: C.muted, marginBottom: 8 },

  // Share button
  shareBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, backgroundColor: C.sage, borderRadius: 16,
    paddingVertical: 16, marginTop: 8,
  },
  shareBtnDim:  { opacity: 0.55 },
  shareBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
