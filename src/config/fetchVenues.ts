import { supabase } from './supabase';

/**
 * Robust venue fetch that works before and after RLS migration 20260722.
 * After migration, a plain select * returns owned + assigned venues via RLS.
 * Before migration, we fallback to explicit ownerId / contains queries.
 */
export async function fetchVenuesForUser(uid: string, role: string) {
  // Primary: RLS-filtered plain select (works after 20260722)
  const { data: rlsData, error: rlsError } = await supabase.from('venues').select('*');
  if (!rlsError && rlsData && rlsData.length > 0) {
    // If role owner, filter to owned if needed? No - RLS already returns owned+assigned.
    // Return all that RLS allows - this fixes "venue not showing to team member".
    return rlsData;
  }

  // Fallback: try explicit queries (pre-migration behavior)
  if (role === 'owner') {
    const { data } = await supabase.from('venues').select('*').eq('ownerId', uid);
    if (data && data.length > 0) return data;
  } else {
    const { data } = await supabase.from('venues').select('*').contains('assignedUids', [uid]);
    if (data && data.length > 0) return data;
  }

  // Last resort: whatever RLS gave (even empty) or try without filter again
  if (rlsData) return rlsData;
  const { data: fallback } = await supabase.from('venues').select('*');
  return fallback || [];
}
