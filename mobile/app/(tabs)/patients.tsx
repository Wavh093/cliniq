import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TextInput, FlatList,
  StyleSheet, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { searchPatients, type PatientSummary } from '../../lib/api';
import Avatar from '../../components/Avatar';
import { SkeletonList } from '../../components/Skeleton';
import { C, T } from '../../constants/theme';

function calcAge(dob: string | null): number | null {
  if (!dob) return null;
  const d   = new Date(dob);
  const now = new Date();
  const age = now.getFullYear() - d.getFullYear();
  const hasBirthdayPassed =
    now.getMonth() > d.getMonth() ||
    (now.getMonth() === d.getMonth() && now.getDate() >= d.getDate());
  return hasBirthdayPassed ? age : age - 1;
}

function initials(first: string, last: string) {
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase();
}

export default function PatientsScreen() {
  const [query,    setQuery]    = useState('');
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [total,    setTotal]    = useState(0);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await searchPatients(q);
      setPatients(res.patients);
      setTotal(res.total);
    } catch (e: any) {
      setError(e.message ?? 'Could not load patients');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load('');
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [load]);

  const handleSearch = (text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(text), 380);
  };

  const renderItem = ({ item }: { item: PatientSummary }) => {
    const age = calcAge(item.date_of_birth);
    const sub = [item.phone, item.medical_aid_name].filter(Boolean).join('  ·  ');
    const isNew = item.patient_type?.toLowerCase() === 'new';
    return (
      <TouchableOpacity
        style={s.row}
        onPress={() => router.push(`/patient/${item.id}`)}
        activeOpacity={0.7}
      >
        <Avatar
          name={`${item.first_name} ${item.last_name}`}
          initials={initials(item.first_name, item.last_name)}
          size={44}
        />
        <View style={s.rowBody}>
          <View style={s.rowTop}>
            <Text style={s.rowName} numberOfLines={1}>
              {item.first_name} {item.last_name}
              {age != null
                ? <Text style={s.rowAge}>{'  '}{age}y</Text>
                : null}
            </Text>
            {item.patient_type ? (
              <View style={[s.typeBadge, isNew ? s.typeBadgeNew : s.typeBadgeReturning]}>
                <Text style={[s.typeText, isNew ? s.typeTextNew : s.typeTextReturning]}>
                  {item.patient_type}
                </Text>
              </View>
            ) : null}
          </View>
          {sub ? (
            <Text style={s.rowSub} numberOfLines={1}>{sub}</Text>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={14} color={C.muted} />
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.title}>Patients</Text>
      </View>

      {/* Search bar */}
      <View style={s.searchWrap}>
        <Ionicons name="search-outline" size={16} color={C.muted} style={s.searchIcon} />
        <TextInput
          style={s.searchInput}
          placeholder="Search by name, phone, medical aid…"
          placeholderTextColor={C.muted}
          value={query}
          onChangeText={handleSearch}
          autoCapitalize="words"
          autoCorrect={false}
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
      </View>

      {/* Count line */}
      {!loading && !error && (
        <Text style={s.count}>
          {query.trim()
            ? `${patients.length} result${patients.length === 1 ? '' : 's'}`
            : `${total} patient${total === 1 ? '' : 's'} on record`}
        </Text>
      )}

      {/* List / states */}
      {loading ? (
        <SkeletonList count={6} />
      ) : error ? (
        <View style={s.center}>
          <Text style={s.err}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={patients}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          ListEmptyComponent={
            <View style={s.empty}>
              <Ionicons
                name={query.trim() ? 'search-outline' : 'people-outline'}
                size={36}
                color={C.muted}
                style={{ marginBottom: 12 }}
              />
              <Text style={s.emptyTitle}>
                {query.trim() ? 'No results found' : 'No patients yet'}
              </Text>
              <Text style={s.emptyText}>
                {query.trim()
                  ? `No patients match "${query}". Try a different name or phone number.`
                  : 'Patients added through the web portal will appear here.'}
              </Text>
            </View>
          }
          contentContainerStyle={s.list}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
  title:  { ...T.title, color: C.ink },

  searchWrap: {
    flexDirection:     'row',
    alignItems:        'center',
    marginHorizontal:  20,
    marginVertical:    12,
    backgroundColor:   C.paper,
    borderRadius:      26,
    borderWidth:       1,
    borderColor:       C.rule,
    paddingHorizontal: 16,
    paddingVertical:   14,
  },
  searchIcon:  { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15, color: C.ink, padding: 0 },

  count: {
    ...T.caption,
    color:             C.muted,
    paddingHorizontal: 20,
    marginBottom:      6,
    letterSpacing:     0.4,
  },

  center:    { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list:      { paddingHorizontal: 16, paddingBottom: 40 },
  empty:     { paddingVertical: 48, alignItems: 'center', paddingHorizontal: 32 },
  emptyTitle:{ fontSize: 16, fontWeight: '600', color: C.ink, marginBottom: 6, textAlign: 'center' },
  emptyText: { color: C.muted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  err:       { color: C.danger, fontSize: 14, textAlign: 'center', padding: 20 },

  row: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: C.paper,
    borderRadius:    14,
    padding:         14,
    marginBottom:    8,
    borderWidth:     1,
    borderColor:     C.rule,
    gap:             12,
  },
  rowBody:    { flex: 1, minWidth: 0 },
  rowTop: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    marginBottom:    3,
    gap:             8,
  },
  rowName:  { fontSize: 15, fontWeight: '600', color: C.ink, flexShrink: 1 },
  rowAge:   { fontSize: 13, color: C.muted, fontWeight: '400' },
  rowSub:   { fontSize: 13, color: C.muted },
  typeBadge: {
    borderRadius:      6,
    paddingHorizontal: 8,
    paddingVertical:   3,
    flexShrink:        0,
  },
  typeBadgeNew:       { backgroundColor: C.sageSoft },
  typeBadgeReturning: { backgroundColor: '#eceef0' },
  typeText: {
    fontSize:       10,
    fontWeight:     '700',
    textTransform:  'capitalize',
    letterSpacing:  0.3,
  },
  typeTextNew:       { color: C.sage },
  typeTextReturning: { color: C.muted },
});
