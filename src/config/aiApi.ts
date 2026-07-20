import { supabase } from './supabase';

const API_BASE = 'https://www.venuesv.com/api';

type AIType = 'dashboard' | 'issues' | 'tasks' | 'zones' | 'overview' | 'team';
type AIInsight = {
  title: string;
  message: string;
  actionLabel: string;
  actionScreen: string;
  type: 'info' | 'warning' | 'success';
  confidence: number;
};

async function request(path: string, body: Record<string, unknown>): Promise<any> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Session expired');

  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let payload: any = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = {}; }

  if (!res.ok) throw new Error(payload.error || `AI unavailable (HTTP ${res.status})`);
  return payload;
}

export async function getAIInsight(input: { venueId?: string; type: AIType }): Promise<AIInsight> {
  try {
    const result = await request('/ai-insight', input);
    return result as AIInsight;
  } catch (e) {
    // Safe fallback if AI API unavailable – local heuristic matching backend
    console.log('AI fallback, using local heuristic', e);
    const { type } = input;
    if (type === 'issues') {
      return { title: 'Triage by priority', message: 'Focus high first. Photo proof closes audit trail faster.', actionLabel: 'View Issues', actionScreen: 'Issues', type: 'info', confidence: 0.8 };
    }
    if (type === 'tasks') {
      return { title: 'Tasks on track', message: 'Daily reset at midnight. Overdue tasks roll to attention.', actionLabel: 'View Tasks', actionScreen: 'Tasks', type: 'info', confidence: 0.8 };
    }
    return { title: 'Ops running', message: 'Monitoring venues, issues, and tasks in real time.', actionLabel: 'View Dashboard', actionScreen: 'Dashboard', type: 'info', confidence: 0.8 };
  }
}
