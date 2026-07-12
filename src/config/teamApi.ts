import { supabase } from './supabase';

// www is the current Vercel primary domain. Using it directly prevents a
// cross-domain redirect from stripping the Supabase Authorization header.
const API_BASE = 'https://www.venuesv.com/api';

type Role = 'manager' | 'cleaner' | 'staff';

export type TeamMember = {
  id: string;
  uid: string;
  name: string;
  email: string;
  role: string;
  venue: string;
  venues?: string[];
  expoPushToken?: string;
};

async function request<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Your session has expired. Please sign in again.');
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  });

  // Vercel/Supabase errors may occasionally arrive as HTML. Read text first so
  // the app always shows a useful error instead of JSON Parse error: '<'.
  const text = await response.text();
  let payload: any = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = {};
  }

  if (!response.ok) {
    throw new Error(payload.error || `Team service is unavailable (HTTP ${response.status}). Please try again.`);
  }
  return payload as T;
}

export async function getVenueTeamMembers(venueId: string): Promise<TeamMember[]> {
  const result = await request<{ members?: TeamMember[] }>('/team-members', { venueId });
  return result.members || [];
}

export async function inviteTeamMember(input: {
  email: string;
  name: string;
  role: Role;
  venueId: string;
}): Promise<{ uid: string; existed: boolean; inviteSent: boolean }> {
  return request('/team-invite', input);
}

export async function removeTeamMember(input: {
  targetUid: string;
  venueId: string;
}): Promise<{ success: boolean }> {
  return request('/team-remove', input);
}
