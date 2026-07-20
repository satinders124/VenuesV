import { useState, useEffect, useCallback } from 'react';
import { getAIInsight } from '../config/aiApi';

type AIType = 'dashboard' | 'issues' | 'tasks' | 'zones' | 'overview' | 'team';

export function useAIInsight(type: AIType, venueId?: string, deps: any[] = []) {
  const [insight, setInsight] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchInsight = useCallback(async () => {
    try {
      setLoading(true);
      const result = await getAIInsight({ type, venueId });
      setInsight(result);
    } catch (e) {
      console.log('AI insight failed', e);
    } finally {
      setLoading(false);
    }
  }, [type, venueId, ...deps]);

  useEffect(() => { fetchInsight(); }, [fetchInsight]);

  return { insight, loading, refresh: fetchInsight };
}
