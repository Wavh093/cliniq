import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { secureStorage } from './secureStorage';

const supabaseUrl     = Constants.expoConfig?.extra?.supabaseUrl     as string;
const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Tokens are stored in the device keychain/keystore (see secureStorage),
    // not plain AsyncStorage.
    storage:            secureStorage,
    autoRefreshToken:   true,
    persistSession:     true,
    detectSessionInUrl: false,
  },
});
