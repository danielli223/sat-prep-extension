import { assertTelemetrySafe } from './scrubber';
import { isTelemetryEnabled, getInstallId, getInstalledAt, CONSENT_VERSION } from './consent';
import { daysSinceInstallBucket } from './buckets';
import { enqueue } from './queue';
import type { TelemetryEvent } from './events';

export interface IngestCtx { appVersion: string; ua: string; nowMs: number; }

export function detectBrowser(ua: string): 'chrome' | 'firefox' | 'edge' {
  if (/Edg\//.test(ua)) return 'edge';
  if (/Firefox\//.test(ua)) return 'firefox';
  return 'chrome';
}

// Merge the TRUSTED, self-generated super-properties onto a props object. The single source of truth
// for the super-property set (distinct_id, the PostHog hygiene flags, app_version, browser,
// consent_version, days_since_install_bucket) so every code path that builds an egress payload — the
// normal ingest path AND the opt-out lifecycle event — carries the SAME full set.
export async function injectSuperProps(
  props: Record<string, unknown>, ctx: IngestCtx,
): Promise<Record<string, unknown>> {
  const installId = await getInstallId();
  const installedAt = (await getInstalledAt()) ?? new Date(ctx.nowMs).toISOString();
  return {
    ...props,
    distinct_id: installId,
    $process_person_profile: true,
    $ip: null,
    app_version: ctx.appVersion,
    browser: detectBrowser(ctx.ua),
    consent_version: CONSENT_VERSION,
    days_since_install_bucket: daysSinceInstallBucket(installedAt, ctx.nowMs),
  };
}

// The AUTHORITATIVE boundary. Runs in the background worker. Re-scrubs the UNTRUSTED message props,
// gates on consent AND the remote flag, then injects only TRUSTED, self-generated super-properties.
// Never throws (best-effort): a scrub failure or a not-opted-in state silently drops the event.
export async function ingestTelemetryEvent(
  built: TelemetryEvent, ctx: IngestCtx,
): Promise<void> {
  try {
    if (!built || typeof built.event !== 'string') return;
    assertTelemetrySafe({ event: built.event, ...built.props }); // authoritative re-scrub of untrusted input
    if (!(await isTelemetryEnabled())) return;                    // consent && remote-allowed
    const installId = await getInstallId();
    if (!installId) return;
    const properties = await injectSuperProps(built.props, ctx);
    await enqueue({ event: built.event, timestamp: new Date(ctx.nowMs).toISOString(), properties });
  } catch { /* telemetry is best-effort; never propagate */ }
}
