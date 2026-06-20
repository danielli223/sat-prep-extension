import { POSTHOG_INGEST_URL, POSTHOG_PROJECT_TOKEN } from '../config';

export interface QueuedEvent { event: string; timestamp: string; properties: Record<string, unknown>; }

// PostHog US /batch/ body: api_key top-level ONCE; per-event distinct_id lives INSIDE properties.
export function buildBatch(events: QueuedEvent[]): object {
  return {
    api_key: POSTHOG_PROJECT_TOKEN,
    historical_migration: false,
    batch: events.map((e) => ({ event: e.event, timestamp: e.timestamp, properties: e.properties })),
  };
}

export async function sendBatch(
  events: QueuedEvent[], fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; retryable: boolean }> {
  try {
    const res = await fetchImpl(POSTHOG_INGEST_URL, {
      method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildBatch(events)),
    });
    if (res.ok) return { ok: true, retryable: false };
    return { ok: false, retryable: res.status >= 500 }; // 4xx = bad payload, don't retry; 5xx = retry
  } catch {
    return { ok: false, retryable: true }; // network failure → retry later
  }
}
