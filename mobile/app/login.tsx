import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Svg, { Path, Circle } from 'react-native-svg';
import { supabase } from '../lib/supabase';
import { C } from '../constants/theme';

/** Kliniq wordmark / logo mark in SVG */
function KliniqMark() {
  return (
    <Svg width={44} height={44} viewBox="0 0 44 44">
      <Circle cx={22} cy={22} r={22} fill={C.ink} />
      {/* Stylised K */}
      <Path
        d="M14 10 L14 34 M14 22 L26 10 M14 22 L27 34"
        stroke="#ffffff"
        strokeWidth={3.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

export default function LoginScreen() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing fields', 'Please enter your email and password.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email:    email.trim().toLowerCase(),
      password,
    });
    setLoading(false);
    if (error) Alert.alert('Sign-in failed', error.message);
    // success → _layout.tsx onAuthStateChange redirects to tabs
  };

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={s.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={s.inner}>
          {/* Brand */}
          <View style={s.brand}>
            <KliniqMark />
            <View>
              <Text style={s.brandName}>Kliniq</Text>
              <Text style={s.brandSub}>Staff Portal</Text>
            </View>
          </View>

          <Text style={s.heading}>Good to see you.</Text>
          <Text style={s.sub}>
            Sign in to view your schedule and practice stats.
          </Text>

          {/* Form */}
          <View style={s.form}>
            <View style={s.field}>
              <Text style={s.label}>EMAIL</Text>
              <TextInput
                style={s.input}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder="staff@kliniq.co.za"
                placeholderTextColor={C.muted}
                returnKeyType="next"
              />
            </View>
            <View style={s.field}>
              <Text style={s.label}>PASSWORD</Text>
              <TextInput
                style={s.input}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="••••••••"
                placeholderTextColor={C.muted}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />
            </View>
            <TouchableOpacity
              style={[s.btn, loading && s.btnDim]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.btnText}>Sign in  →</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:  { flex: 1, backgroundColor: C.bg },
  kav:   { flex: 1 },
  inner: { flex: 1, padding: 28, justifyContent: 'center' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 44 },
  brandName: { fontSize: 18, fontWeight: '700', color: C.ink },
  brandSub:  { fontSize: 12, color: C.muted, marginTop: 1 },
  heading:   { fontSize: 32, fontWeight: '700', color: C.ink, marginBottom: 8 },
  sub:       { fontSize: 15, color: C.inkSoft, lineHeight: 22, marginBottom: 36 },
  form:      { gap: 16 },
  field:     { gap: 6 },
  label:     { fontSize: 11, letterSpacing: 0.8, color: C.muted, fontWeight: '500' },
  input: {
    borderWidth: 1, borderColor: C.rule, borderRadius: 12,
    padding: 14, fontSize: 15, color: C.ink, backgroundColor: C.paper,
  },
  btn: {
    backgroundColor: C.sage, borderRadius: 999,
    padding: 16, alignItems: 'center', marginTop: 8,
  },
  btnDim:  { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
