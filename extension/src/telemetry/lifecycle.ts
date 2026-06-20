import { getInstallId, clearLocalTelemetry } from './consent';
import { enqueue, flush, purgeQueue } from './queue';
import { injectSuperProps, type IngestCtx } from './ingest';
import { TELEMETRY_DISABLED } from './events';

// Opt-out: emit ONE final telemetry_disabled carrying the CURRENT id (so opt-out rate is measurable),
// flush it, THEN delete the id and purge. Order matters — the event must capture the id before deletion,
// and the queue must not outlive consent. The final event INTENTIONALLY bypasses the consent gate (the
// user is opting out), but must still carry the FULL trusted super-property set (browser, app_version,
// consent_version, days_since_install_bucket, the hygiene flags) — so it's built via injectSuperProps,
// the same source of truth the normal ingest path uses. Best-effort throughout; never throws.
export async function optOut(ctx: IngestCtx, fetchImpl: typeof fetch = fetch): Promise<void> {
  const id = await getInstallId();
  if (id) {
    const properties = await injectSuperProps({}, ctx);
    await enqueue({ event: TELEMETRY_DISABLED, timestamp: new Date(ctx.nowMs).toISOString(), properties });
    await flush(fetchImpl);
  }
  await clearLocalTelemetry();
  await purgeQueue();
}
