import { getInstallId, clearLocalTelemetry } from './consent';
import { enqueue, flush, purgeQueue } from './queue';
import { TELEMETRY_DISABLED } from './events';

// Opt-out: emit ONE final telemetry_disabled carrying the CURRENT id (so opt-out rate is measurable),
// flush it, THEN delete the id and purge. Order matters — the event must capture the id before deletion,
// and the queue must not outlive consent. Best-effort throughout.
export async function optOut(fetchImpl: typeof fetch = fetch): Promise<void> {
  const id = await getInstallId();
  if (id) {
    await enqueue({
      event: TELEMETRY_DISABLED, timestamp: new Date().toISOString(),
      properties: { distinct_id: id, $process_person_profile: false, $ip: null },
    });
    await flush(fetchImpl);
  }
  await clearLocalTelemetry();
  await purgeQueue();
}
