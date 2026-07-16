import { supabase } from './supabase';

const API_BASE = 'https://www.venuesv.com/api';

export async function deleteVenue(venueId: string): Promise<{ success: boolean; venueCount: number }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Your session has expired. Please sign in again.');
  }

  const response = await fetch(`${API_BASE}/venue-delete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ venueId }),
  });

  const text = await response.text();
  let payload: any = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = {};
  }

  if (!response.ok) {
    throw new Error(payload.error || `Venue deletion failed (HTTP ${response.status}). Please try again.`);
  }
  return payload;
}
