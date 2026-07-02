import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Supabase session-storage adapter backed by the device keychain / keystore
// (expo-secure-store) so access + refresh tokens are encrypted at rest instead
// of sitting in plain AsyncStorage.
//
// SecureStore caps each value at ~2 KB on iOS, and a Supabase session
// (access + refresh JWT + user) routinely exceeds that — so large values are
// transparently split into numbered chunks. On web SecureStore is unavailable,
// so we fall back to AsyncStorage there.

const CHUNK_SIZE = 1800;
const isWeb = Platform.OS === 'web';

// SecureStore keys must match [A-Za-z0-9._-]
const safeKey = (k: string) => k.replace(/[^A-Za-z0-9._-]/g, '_');

async function scGet(key: string): Promise<string | null> {
  const base = safeKey(key);
  const head = await SecureStore.getItemAsync(base);
  if (head == null) return null;
  if (!head.startsWith('__chunks__:')) return head;
  const n = parseInt(head.slice('__chunks__:'.length), 10);
  let out = '';
  for (let i = 0; i < n; i++) {
    const part = await SecureStore.getItemAsync(`${base}__${i}`);
    if (part == null) return null; // corrupt/partial — treat as no session
    out += part;
  }
  return out;
}

async function scRemove(key: string): Promise<void> {
  const base = safeKey(key);
  const head = await SecureStore.getItemAsync(base);
  if (head && head.startsWith('__chunks__:')) {
    const n = parseInt(head.slice('__chunks__:'.length), 10);
    for (let i = 0; i < n; i++) await SecureStore.deleteItemAsync(`${base}__${i}`);
  }
  await SecureStore.deleteItemAsync(base);
}

async function scSet(key: string, value: string): Promise<void> {
  const base = safeKey(key);
  await scRemove(key); // clear any previous (possibly chunked) value first
  if (value.length <= CHUNK_SIZE) {
    await SecureStore.setItemAsync(base, value);
    return;
  }
  const n = Math.ceil(value.length / CHUNK_SIZE);
  await SecureStore.setItemAsync(base, `__chunks__:${n}`);
  for (let i = 0; i < n; i++) {
    await SecureStore.setItemAsync(`${base}__${i}`, value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
  }
}

export const secureStorage = {
  getItem: (key: string) => (isWeb ? AsyncStorage.getItem(key) : scGet(key)),
  setItem: (key: string, value: string) => (isWeb ? AsyncStorage.setItem(key, value) : scSet(key, value)),
  removeItem: (key: string) => (isWeb ? AsyncStorage.removeItem(key) : scRemove(key)),
};
