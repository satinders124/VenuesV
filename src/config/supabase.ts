import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// TODO: Replace YOUR_ANON_KEY with the key from your Supabase dashboard
const supabaseUrl = 'https://nzicfhnnrbiilijmichh.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im56aWNmaG5ucmJpaWxpam1pY2hoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM4MDM0MjcsImV4cCI6MjA5OTM3OTQyN30.kDjReVKRCTPTwWxxyJrmMkimhyjI1ZZGGRH26kZwkQg';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
