import { sendBatch, type QueuedEvent } from './transport';

export const QUEUE_KEY = 'telemetry.queue';
const MAX_QUEUE = 500; // backstop so an offline device can't grow storage unbounded

export async function readQueue(): Promise<QueuedEvent[]> {
  try {
    const g = await chrome.storage.local.get(QUEUE_KEY);
    const q = (g as Record<string, unknown>)[QUEUE_KEY];
    return Array.isArray(q) ? (q as QueuedEvent[]) : [];
  } catch { return []; }
}

async function writeQueue(q: QueuedEvent[]): Promise<void> {
  try { await chrome.storage.local.set({ [QUEUE_KEY]: q.slice(-MAX_QUEUE) }); } catch { /* best-effort */ }
}

export async function purgeQueue(): Promise<void> {
  try { await chrome.storage.local.remove(QUEUE_KEY); } catch { /* best-effort */ }
}

export async function enqueue(e: QueuedEvent): Promise<void> {
  const q = await readQueue();
  q.push(e);
  await writeQueue(q);
}

export async function flush(fetchImpl: typeof fetch = fetch): Promise<void> {
  const q = await readQueue();
  if (q.length === 0) return;
  const { ok, retryable } = await sendBatch(q, fetchImpl);
  if (ok || !retryable) await purgeQueue(); // sent, or unrecoverable (4xx) → drop; else keep for retry
}
