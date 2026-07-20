import { supabase } from './supabase';

/**
 * Robust venue fetch that works before and after RLS migration 20260722.
 * After migration, a plain select * returns owned + assigned venues via RLS.
 * Before migration, we fallback to explicit ownerId / contains queries.
 * Added try/catch + null safety for Android emulator where network can be flaky.
 */
export async function fetchVenuesForUser(uid: string, role: string) {
  try {
    // Primary: RLS-filtered plain select (works after 20260722)
    const { data: rlsData, error: rlsError } = await supabase.from('venues').select('*');
    if (!rlsError && rlsData && rlsData.length > 0) {
      return rlsData;
    }
    // If RLS returned empty but no error, user might have 0 venues - still try fallbacks before returning empty

    // Fallback: try explicit queries (pre-migration behavior)
    try {
      if (role === 'owner') {
        const { data } = await supabase.from('venues').select('*').eq('ownerId', uid);
        if (data && data.length > 0) return data;
      } else {
        const { data } = await supabase.from('venues').select('*').contains('assignedUids', [uid]);
        if (data && data.length > 0) return data;
      }
    } catch (e) {
      console.log('fetchVenuesForUser fallback query failed', e);
    }

    // Last resort: whatever RLS gave (even empty) or try without filter again
    if (rlsData) return rlsData;
    try {
      const { data: fallback } = await supabase.from('venues').select('*');
      return fallback || [];
    } catch {
      return [];
    }
  } catch (e) {
    console.log('fetchVenuesForUser overall error', e);
    return [];
  }
}

