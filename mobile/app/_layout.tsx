import { useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator, AppState, type AppStateStatus } from 'react-native';
import { Stack, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { registerForPushNotifications } from '../lib/notifications';
import { C } from '../constants/theme';

SplashScreen.preventAutoHideAsync();

// Auto-lock: if the app is backgrounded for longer than this, the session is
// signed out on return so an unlocked, unattended phone can't expose patient
// PII. Matches the web dashboard's idle sign-out.
const IDLE_LIMIT_MS = 15 * 60 * 1000;

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  // Icon glyphs render as blank boxes (notably on the web build) unless the
  // Ionicons font is explicitly loaded before the UI mounts.
  const [fontsLoaded] = useFonts(Ionicons.font);
  const backgroundedAt = useRef<number | null>(null);

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
        // Network error or storage failure — go to login
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

    // Idle auto-lock via app background/foreground transitions.
    const onAppState = (state: AppStateStatus) => {
      if (state === 'active') {
        const since = backgroundedAt.current;
        backgroundedAt.current = null;
        if (since != null && Date.now() - since > IDLE_LIMIT_MS) {
          supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) supabase.auth.signOut().catch(() => {});
          });
        }
      } else if (state === 'background' || state === 'inactive') {
        if (backgroundedAt.current == null) backgroundedAt.current = Date.now();
      }
    };
    const appStateSub = AppState.addEventListener('change', onAppState);

    return () => {
      subscription.unsubscribe();
      appStateSub.remove();
    };
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
