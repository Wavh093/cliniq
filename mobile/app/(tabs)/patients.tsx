import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TextInput, FlatList,
  StyleSheet, ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { searchPatients, type PatientSummary } from '../../lib/api';
import { C } from '../../constants/theme';

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

  useEffect(() => { load(''); }, [load]);

  const handleSearch = (text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(text), 380);
  };

  const renderItem = ({ item }: { item: PatientSummary }) => {
    const age = calcAge(item.date_of_birth);
    const sub = [item.phone, item.medical_aid_name].filter(Boolean).join('  ·  ');
    return (
      <TouchableOpacity
        style={s.row}
        onPress={() => router.push(`/patient/${item.id}`)}
        activeOpacity={0.7}
      >
        <View style={s.avatar}>
          <Text style={s.avatarText}>{initials(item.first_name, item.last_name)}</Text>
        </View>
        <View style={s.rowBody}>
          <View style={s.rowTop}>
            <Text style={s.rowName} numberOfLines={1}>
              {item.first_name} {item.last_name}
              {age != null
                ? <Text style={s.rowAge}>{'  '}{age}y</Text>
                : null}
            </Text>
            {item.patient_type ? (
              <View style={s.typeBadge}>
                <Text style={s.typeText}>{item.patient_type}</Text>
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
    <SafeAreaView style={s.safe} edges={['top']}>
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
        <View style={s.center}>
          <ActivityIndicator color={C.sage} size="large" />
        </View>
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
              <Text style={s.emptyText}>
                {query.trim() ? 'No patients match that search.' : 'No patients yet.'}
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
  title:  { fontSize: 28, fontWeight: '700', color: C.ink },

  searchWrap: {
    flexDirection:     'row',
    alignItems:        'center',
    marginHorizontal:  16,
    marginVertical:    10,
    backgroundColor:   C.paper,
    borderRadius:      12,
    borderWidth:       1,
    borderColor:       C.rule,
    paddingHorizontal: 12,
    paddingVertical:   10,
  },
  searchIcon:  { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15, color: C.ink },

  count: {
    fontSize:          11,
    color:             C.muted,
    paddingHorizontal: 20,
    marginBottom:      6,
    letterSpacing:     0.4,
    fontWeight:        '500',
  },

  center:    { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list:      { paddingHorizontal: 16, paddingBottom: 40 },
  empty:     { paddingVertical: 48, alignItems: 'center' },
  emptyText: { color: C.muted, fontSize: 15 },
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
  avatar: {
    width:           44,
    height:          44,
    borderRadius:    22,
    backgroundColor: C.bg2,
    alignItems:      'center',
    justifyContent:  'center',
  },
  avatarText: { fontSize: 15, fontWeight: '700', color: C.sage },
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
    backgroundColor:   C.bg2,
    borderRadius:      4,
    paddingHorizontal: 6,
    paddingVertical:   2,
    flexShrink:        0,
  },
  typeText: {
    fontSize:       10,
    color:          C.sage,
    fontWeight:     '700',
    textTransform:  'capitalize',
    letterSpacing:  0.3,
  },
});
