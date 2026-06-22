import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Stack, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { registerForPushNotifications } from '../lib/notifications';
import { C } from '../constants/theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  // Icon glyphs render as blank boxes (notably on the web build) unless the
  // Ionicons font is explicitly loaded before the UI mounts.
  const [fontsLoaded] = useFonts(Ionicons.font);

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (session) {
          registerForPushNotifications().catch(console.error);
          router.replace('/(tabs)');
        } else {
          router.replace('/login');
        }
      })
      .catch(() => {
        // Network error or AsyncStorage failure — go to login
        router.replace('/login');
      })
      .finally(() => {
        setReady(true);
        SplashScreen.hideAsync();
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        registerForPushNotifications().catch(console.error);
        router.replace('/(tabs)');
      } else {
        router.replace('/login');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="login" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="patient/[id]" />
      </Stack>
      {(!ready || !fontsLoaded) && (
        <View style={{
          position: 'absolute', inset: 0,
          backgroundColor: C.bg,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <ActivityIndicator color={C.sage} size="large" />
        </View>
      )}
    </>
  );
}
