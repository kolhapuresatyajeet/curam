// Supabase client for the patient app. The anon key from app.json extra.
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { expoConfig } = require('@expo/config');

const extra = (expoConfig?.extra ?? {}) as { supabaseUrl?: string; supabaseAnonKey?: string };

if (!extra.supabaseUrl || !extra.supabaseAnonKey) {
  // Fail loudly in dev — the anon key must be set in app.json extra.
  console.warn('MyCúram: supabaseUrl/supabaseAnonKey missing from app.json extra');
}

export const supabase = createClient(
  extra.supabaseUrl ?? '',
  extra.supabaseAnonKey ?? '',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

export const supabaseUrl = extra.supabaseUrl ?? '';
