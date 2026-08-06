import {
  getInstallId, clearLocalTelemetry, hasReportedDecline, markDeclineReported,
  isOptedIn, CONSENT_VERSION,
} from './consent';
import { enqueue, flush, purgeQueue } from './queue';
import { injectSuperProps, detectBrowser, type IngestCtx } from './ingest';
import { assertTelemetrySafe } from './scrubber';
import { TELEMETRY_DISABLED, TELEMETRY_DECLINED_EVENT } from './events';

// The distinct_id every decline shares. A CONSTANT, not a per-user value: PostHog requires some
// distinct_id on each event, and a shared literal means declines can only ever be counted in
// aggregate — there is no per-person grain to slice, join, or re-identify.
export const ANONYMOUS_DECLINE_ID = 'anonymous-decline';

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

// Anonymous decline counter — the ONLY egress that originates from a user who did NOT consent, and
// therefore the most carefully bounded thing in this module. It exists to answer one question:
// what share of people who saw the ask said no? Rules that make that defensible:
//   * NO identifier. No install id (one is never even minted for a decliner), no random id, no
//     session id. distinct_id is the shared ANONYMOUS_DECLINE_ID literal, so every decline is
//     indistinguishable from every other. There is no person to profile, contact, or delete.
//   * NO person profile ($process_person_profile:false) — see the scrubber's note.
//   * NO IP ($ip:null), and NO days_since_install_bucket: an install timestamp plus a version is a
//     weak fingerprint, and neither is needed to count.
//   * AT MOST ONCE per install, guarded by DECLINE_REPORTED_KEY, so this can never become a
//     usage/session signal about someone who opted out of being measured.
//   * Never fires for someone who DID opt in — that path emits telemetry_disabled instead.
// Count it in PostHog with a TOTAL COUNT trend, never "unique users" (which would read 1 forever).
export async function reportDecline(ctx: IngestCtx, fetchImpl: typeof fetch = fetch): Promise<void> {
  try {
    if (await isOptedIn()) return;            // they consented — not a decline
    if (await hasReportedDecline()) return;   // already counted this install, ever
    const properties = {
      distinct_id: ANONYMOUS_DECLINE_ID,
      $process_person_profile: false,
      $ip: null,
      app_version: ctx.appVersion,
      browser: detectBrowser(ctx.ua),
      consent_version: CONSENT_VERSION,
    };
    // Runs through the SAME allowlist as every other payload — an anonymous event is still not
    // allowed to smuggle a field. (distinct_id/$ip/$process_person_profile are handled explicitly.)
    assertTelemetrySafe({ event: TELEMETRY_DECLINED_EVENT, app_version: ctx.appVersion, browser: properties.browser, consent_version: CONSENT_VERSION });
    await markDeclineReported();              // mark BEFORE sending: a retry must not double-count
    await enqueue({
      event: TELEMETRY_DECLINED_EVENT,
      timestamp: new Date(ctx.nowMs).toISOString(),
      properties,
    });
    await flush(fetchImpl);
  } catch { /* best-effort; a decline that fails to count is never worth breaking anything over */ }
}
