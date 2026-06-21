import { sendBatch, type QueuedEvent } from './transport';
import { getLocal } from '../storage';

export const QUEUE_KEY = 'telemetry.queue';
const MAX_QUEUE = 500; // backstop so an offline device can't grow storage unbounded

export async function readQueue(): Promise<QueuedEvent[]> {
  const q = await getLocal<unknown>(QUEUE_KEY);
  return Array.isArray(q) ? (q as QueuedEvent[]) : [];
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
  const batch = await readQueue();
  if (batch.length === 0) return;
  const sentCount = batch.length;   // snapshot the in-flight slice
  const { ok, retryable } = await sendBatch(batch, fetchImpl);
  if (ok || !retryable) {
    // Sent, or unrecoverable (4xx) → drop ONLY the slice we sent. Re-read the queue (an emit may have
    // landed during the in-flight POST) and drop the first sentCount items, so a concurrently-enqueued
    // event survives instead of being purged with the key.
    const current = await readQueue();
    const kept = current.slice(sentCount);
    if (kept.length === 0) await purgeQueue();
    else await writeQueue(kept);
  }
  // else: retryable failure → keep the whole queue for the next flush (timestamps unchanged).
}
