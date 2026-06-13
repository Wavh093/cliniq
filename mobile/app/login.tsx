import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Svg, { Path, Circle, Line } from 'react-native-svg';
import { supabase } from '../lib/supabase';
import { C } from '../constants/theme';

/** Kliniq logo — dental heart with medical cross + tools */
function KliniqLogo({ size = 80 }: { size?: number }) {
  return (
    <Svg viewBox="0 0 80 80" width={size} height={size}>
      <Circle cx={40} cy={40} r={40} fill="#0a4a5c" />
      {/* Dental heart */}
      <Path
        d="M40 57 C35 52 18 42 18 30 C18 24 23 19 29 19 C33 19 36.5 21.5 40 25.5 C43.5 21.5 47 19 51 19 C57 19 62 24 62 30 C62 42 45 52 40 57Z"
        fill="none" stroke="white" strokeWidth={2.2}
        strokeLinejoin="round" strokeLinecap="round"
      />
      {/* Medical cross */}
      <Line x1={40} y1={26.5} x2={40} y2={35.5} stroke="white" strokeWidth={2.2} strokeLinecap="round" />
      <Line x1={35.5} y1={31} x2={44.5} y2={31} stroke="white" strokeWidth={2.2} strokeLinecap="round" />
      {/* Dental tool left */}
      <Path
        d="M14 62 L14 54 C14 51 16 49 18.5 49 L18.5 43 C18.5 41.5 20.5 41 21 42.5 L21.5 48.5 C22.5 48 24 49 24 50.5 L24 53.5 C26 54.5 26.5 57 25.5 59 L25.5 62 Z"
        fill="none" stroke="white" strokeWidth={1.8}
        strokeLinejoin="round" strokeLinecap="round"
      />
      {/* Dental tool right */}
      <Path
        d="M66 62 L66 54 C66 51 64 49 61.5 49 L61.5 43 C61.5 41.5 59.5 41 59 42.5 L58.5 48.5 C57.5 48 56 49 56 50.5 L56 53.5 C54 54.5 53.5 57 54.5 59 L54.5 62 Z"
        fill="none" stroke="white" strokeWidth={1.8}
        strokeLinejoin="round" strokeLinecap="round"
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
            <KliniqLogo size={80} />
            <Text style={s.brandName}>Kliniq</Text>
            <Text style={s.brandSub}>Staff Portal</Text>
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
                textContentType="emailAddress"
                autoComplete="email"
                accessibilityLabel="Email address"
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
                textContentType="password"
                autoComplete="current-password"
                accessibilityLabel="Password"
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
  brand:     { alignItems: 'center', gap: 4, marginBottom: 44 },
  brandName: { fontSize: 22, fontWeight: '700', color: C.ink, marginTop: 8 },
  brandSub:  { fontSize: 12, color: C.muted },
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
