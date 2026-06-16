import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
  Alert, Image, Modal, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import {
  getDentalChart, getDentalScans, saveDentalScan, deleteDentalScan,
  type ToothStatus, type ToothNote, type ToothRecord, type DentalScan,
} from '../lib/api';
import { C } from '../constants/theme';
import DentalChart from './DentalChart';
import ToothDetailModal from './ToothDetailModal';

// ── Types ────────────────────────────────────────────────────────────────────
interface ToothCell {
  status: ToothStatus;
  hasNotes: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(iso: string): string {
  const d = new Date(iso);
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// ── Component ────────────────────────────────────────────────────────────────
interface Props {
  patientId: string;
  appointmentId?: string | null;
}

export default function DentalChartCard({ patientId, appointmentId }: Props) {
  const [loading,      setLoading]      = useState(true);
  const [toothMap,     setToothMap]     = useState<Partial<Record<number, ToothCell>>>({});
  const [notesByTooth, setNotesByTooth] = useState<Record<number, ToothNote[]>>({});
  const [scans,        setScans]        = useState<DentalScan[]>([]);
  const [scansLoading, setScansLoading] = useState(true);
  const [uploading,    setUploading]    = useState(false);

  // Tooth detail modal
  const [selectedFdi, setSelectedFdi] = useState<number | null>(null);

  // Image viewer modal
  const [viewingImage, setViewingImage] = useState<string | null>(null);

  // ── Load chart data ───────────────────────────────────────────────────────
  const loadChart = useCallback(async () => {
    setLoading(true);
    try {
      const { records, notes } = await getDentalChart(patientId);

      const map: Partial<Record<number, ToothCell>> = {};
      for (const r of records) {
        map[r.tooth_fdi] = { status: r.status as ToothStatus, hasNotes: false };
      }

      const byTooth: Record<number, ToothNote[]> = {};
      for (const n of notes) {
        if (!byTooth[n.tooth_fdi]) byTooth[n.tooth_fdi] = [];
        byTooth[n.tooth_fdi].push(n);
        if (map[n.tooth_fdi]) map[n.tooth_fdi]!.hasNotes = true;
        else map[n.tooth_fdi] = { status: 'healthy', hasNotes: true };
      }

      setToothMap(map);
      setNotesByTooth(byTooth);
    } catch {
      // Non-critical: chart shows empty (all healthy) on error
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  // ── Load scans ────────────────────────────────────────────────────────────
  const loadScans = useCallback(async () => {
    setScansLoading(true);
    try {
      const data = await getDentalScans(patientId);
      setScans(data);
    } catch {
      // Non-critical
    } finally {
      setScansLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    loadChart();
    loadScans();
  }, [loadChart, loadScans]);

  // ── Chart interaction callbacks ───────────────────────────────────────────
  const handleStatusChange = useCallback((fdi: number, status: ToothStatus) => {
    setToothMap(prev => ({
      ...prev,
      [fdi]: { ...(prev[fdi] ?? { hasNotes: false }), status },
    }));
  }, []);

  const handleNoteAdded = useCallback((note: ToothNote) => {
    const fdi = note.tooth_fdi;
    setNotesByTooth(prev => ({
      ...prev,
      [fdi]: [note, ...(prev[fdi] ?? [])],
    }));
    setToothMap(prev => ({
      ...prev,
      [fdi]: { ...(prev[fdi] ?? { status: 'healthy' }), hasNotes: true },
    }));
  }, []);

  const handleNoteDeleted = useCallback((noteId: string) => {
    setNotesByTooth(prev => {
      const next = { ...prev };
      for (const fdi of Object.keys(next)) {
        const key = Number(fdi);
        next[key] = next[key].filter(n => n.id !== noteId);
        if (next[key].length === 0) {
          setToothMap(m => ({
            ...m,
            [key]: { ...(m[key] ?? { status: 'healthy' }), hasNotes: false },
          }));
        }
      }
      return next;
    });
  }, []);

  // ── Scan upload ───────────────────────────────────────────────────────────
  const handleAddScan = useCallback(() => {
    Alert.alert('Add Scan', 'Select the type of scan to upload.', [
      {
        text: 'Photo / X-ray (JPEG)',
        onPress: () => pickAndUpload('image'),
      },
      {
        text: 'Document (PDF)',
        onPress: () => pickAndUpload('pdf'),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, []);

  const pickAndUpload = useCallback(async (type: 'image' | 'pdf') => {
    let ImagePicker: any;
    let DocumentPicker: any;

    try {
      if (type === 'image') {
        ImagePicker = require('expo-image-picker');
      } else {
        DocumentPicker = require('expo-document-picker');
      }
    } catch {
      Alert.alert(
        'Not available',
        `Please run: npx expo install expo-image-picker expo-document-picker`,
      );
      return;
    }

    try {
      setUploading(true);

      let uri: string;
      let filename: string;
      let mimeType: string;

      if (type === 'image') {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Permission required', 'Allow photo library access in Settings.');
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.85,
          allowsEditing: false,
        });
        if (result.canceled || !result.assets?.length) return;
        const asset = result.assets[0];
        uri      = asset.uri;
        filename = asset.fileName ?? `scan-${Date.now()}.jpg`;
        mimeType = asset.mimeType ?? 'image/jpeg';
      } else {
        const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf' });
        if (result.canceled || !result.assets?.length) return;
        const asset = result.assets[0];
        uri      = asset.uri;
        filename = asset.name ?? `scan-${Date.now()}.pdf`;
        mimeType = 'application/pdf';
      }

      // Upload directly to Supabase Storage using the authenticated session
      const storagePath = `${patientId}/${Date.now()}-${filename.replace(/[^a-z0-9._-]/gi, '_')}`;

      const response = await fetch(uri);
      const blob     = await response.blob();

      const { error: uploadErr } = await supabase.storage
        .from('dental-scans')
        .upload(storagePath, blob, { contentType: mimeType });

      if (uploadErr) throw uploadErr;

      // Save metadata via API
      const scan = await saveDentalScan({
        patient_id:     patientId,
        appointment_id: appointmentId ?? null,
        tooth_fdis:     [],
        file_path:      storagePath,
        mime_type:      mimeType,
        filename,
      });

      setScans(prev => [scan, ...prev]);
    } catch (e: any) {
      Alert.alert('Upload failed', e.message ?? 'Please try again.');
    } finally {
      setUploading(false);
    }
  }, [patientId, appointmentId]);

  // ── Scan actions ──────────────────────────────────────────────────────────
  const openScan = useCallback(async (scan: DentalScan) => {
    if (scan.signed_url) {
      if (scan.mime_type === 'application/pdf') {
        await Linking.openURL(scan.signed_url).catch(() =>
          Alert.alert('Cannot open', 'No PDF viewer available on this device.'),
        );
      } else {
        setViewingImage(scan.signed_url);
      }
    } else {
      // Regenerate signed URL via supabase client
      const { data } = await supabase.storage
        .from('dental-scans')
        .createSignedUrl(scan.file_path, 3600);
      if (data?.signedUrl) {
        if (scan.mime_type === 'application/pdf') {
          Linking.openURL(data.signedUrl);
        } else {
          setViewingImage(data.signedUrl);
        }
      }
    }
  }, []);

  const confirmDeleteScan = useCallback((scan: DentalScan) => {
    Alert.alert('Delete scan?', scan.filename, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDentalScan(scan.id);
            setScans(prev => prev.filter(s => s.id !== scan.id));
          } catch (e: any) {
            Alert.alert('Could not delete', e.message ?? 'Please try again.');
          }
        },
      },
    ]);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────
  const selectedNotes = selectedFdi !== null ? (notesByTooth[selectedFdi] ?? []) : [];
  const selectedCell  = selectedFdi !== null ? toothMap[selectedFdi] : null;

  return (
    <>
      <View style={s.card}>
        {/* ── Chart header ────────────────────────────────────── */}
        <View style={s.cardHeader}>
          <Ionicons name="grid-outline" size={14} color={C.sage} />
          <Text style={s.cardTitle}>DENTAL CHART</Text>
          {loading && <ActivityIndicator size="small" color={C.muted} style={{ marginLeft: 6 }} />}
        </View>

        {/* ── SVG Chart ────────────────────────────────────────── */}
        <DentalChart
          teeth={toothMap}
          onToothPress={(fdi) => setSelectedFdi(fdi)}
        />

        {/* ── Legend ──────────────────────────────────────────── */}
        <View style={s.legend}>
          {([
            ['#FEF3C7', '#F59E0B', 'Cavity'],
            ['#DBEAFE', '#60A5FA', 'Filled'],
            ['#FEF9C3', '#CA8A04', 'Crown'],
            ['#D1FAE5', '#34D399', 'Implant'],
            ['#FEE2E2', '#EF4444', 'Treatment'],
          ] as [string, string, string][]).map(([fill, stroke, label]) => (
            <View key={label} style={s.legendItem}>
              <View style={[s.legendDot, { backgroundColor: fill, borderColor: stroke }]} />
              <Text style={s.legendLabel}>{label}</Text>
            </View>
          ))}
        </View>

        {/* ── Divider ─────────────────────────────────────────── */}
        <View style={s.divider} />

        {/* ── Scans section ───────────────────────────────────── */}
        <View style={s.scansHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="scan-outline" size={14} color={C.sage} />
            <Text style={s.cardTitle}>DENTAL SCANS</Text>
            {scansLoading && <ActivityIndicator size="small" color={C.muted} style={{ marginLeft: 4 }} />}
          </View>
          <TouchableOpacity
            style={[s.addScanBtn, uploading && s.addScanBtnDim]}
            onPress={handleAddScan}
            disabled={uploading}
            activeOpacity={0.75}
          >
            {uploading
              ? <ActivityIndicator size="small" color={C.sage} />
              : <Ionicons name="add" size={16} color={C.sage} />}
            <Text style={s.addScanText}>{uploading ? 'Uploading…' : 'Add'}</Text>
          </TouchableOpacity>
        </View>

        {!scansLoading && scans.length === 0 && (
          <Text style={s.scansEmpty}>No scans uploaded for this patient.</Text>
        )}

        {scans.map((scan) => (
          <TouchableOpacity
            key={scan.id}
            style={s.scanRow}
            onPress={() => openScan(scan)}
            onLongPress={() => confirmDeleteScan(scan)}
            activeOpacity={0.7}
          >
            <View style={s.scanIcon}>
              <Ionicons
                name={scan.mime_type === 'application/pdf' ? 'document-outline' : 'image-outline'}
                size={20}
                color={C.sage}
              />
            </View>
            <View style={s.scanInfo}>
              <Text style={s.scanFilename} numberOfLines={1}>{scan.filename}</Text>
              <Text style={s.scanMeta}>
                {fmtDate(scan.created_at)}
                {scan.tooth_fdis?.length > 0 && `  ·  Teeth: ${scan.tooth_fdis.join(', ')}`}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={14} color={C.muted} />
          </TouchableOpacity>
        ))}

        <Text style={s.longPressHint}>Long-press a scan to delete it</Text>
      </View>

      {/* ── Tooth detail modal ──────────────────────────────────── */}
      {selectedFdi !== null && (
        <ToothDetailModal
          visible
          onClose={() => setSelectedFdi(null)}
          patientId={patientId}
          appointmentId={appointmentId}
          toothFdi={selectedFdi}
          currentStatus={selectedCell?.status ?? 'healthy'}
          notes={selectedNotes}
          onStatusChange={handleStatusChange}
          onNoteAdded={handleNoteAdded}
          onNoteDeleted={handleNoteDeleted}
        />
      )}

      {/* ── Image viewer modal ──────────────────────────────────── */}
      <Modal
        visible={!!viewingImage}
        animationType="fade"
        transparent
        onRequestClose={() => setViewingImage(null)}
      >
        <View style={s.imageViewerBg}>
          <TouchableOpacity
            style={s.imageViewerClose}
            onPress={() => setViewingImage(null)}
          >
            <Ionicons name="close-circle" size={32} color="#fff" />
          </TouchableOpacity>
          {viewingImage && (
            <Image
              source={{ uri: viewingImage }}
              style={s.imageViewerImg}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>
    </>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  card: {
    backgroundColor: C.paper,
    borderRadius:    16,
    padding:         16,
    marginBottom:    12,
    borderWidth:     1,
    borderColor:     C.rule,
  },
  cardHeader: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            6,
    marginBottom:   12,
  },
  cardTitle: {
    fontSize:     10,
    fontWeight:   '700',
    letterSpacing: 0.8,
    color:        C.sage,
  },

  legend: {
    flexDirection:  'row',
    flexWrap:       'wrap',
    gap:            8,
    marginTop:      10,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: {
    width:       10,
    height:      10,
    borderRadius: 5,
    borderWidth: 1.5,
  },
  legendLabel: { fontSize: 10, color: C.muted, fontWeight: '500' },

  divider: {
    height:          1,
    backgroundColor: C.rule,
    marginVertical:  14,
  },

  scansHeader: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   10,
  },
  addScanBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             4,
    backgroundColor: C.bg,
    borderRadius:    8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth:     1,
    borderColor:     C.sage,
  },
  addScanBtnDim: { opacity: 0.5 },
  addScanText:   { fontSize: 12, color: C.sage, fontWeight: '600' },
  scansEmpty:    { fontSize: 13, color: C.muted, fontStyle: 'italic', paddingBottom: 4 },

  scanRow: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: C.rule,
  },
  scanIcon: {
    width:           36,
    height:          36,
    backgroundColor: C.bg,
    borderRadius:    8,
    alignItems:      'center',
    justifyContent:  'center',
  },
  scanInfo:     { flex: 1 },
  scanFilename: { fontSize: 13, fontWeight: '600', color: C.ink },
  scanMeta:     { fontSize: 11, color: C.muted, marginTop: 1 },
  longPressHint:{ fontSize: 10, color: C.muted, fontStyle: 'italic', marginTop: 6, textAlign: 'center' },

  // Image viewer
  imageViewerBg: {
    flex:            1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent:  'center',
    alignItems:      'center',
  },
  imageViewerClose: {
    position: 'absolute',
    top:      52,
    right:    20,
    zIndex:   10,
  },
  imageViewerImg: {
    width:  '100%',
    height: '80%',
  },
});
