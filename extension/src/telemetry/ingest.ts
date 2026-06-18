import { assertTelemetrySafe } from './scrubber';
import { isTelemetryEnabled, getInstallId, getInstalledAt, CONSENT_VERSION } from './consent';
import { daysSinceInstallBucket } from './buckets';
import { enqueue } from './queue';
import type { TelemetryEvent } from './events';

export function detectBrowser(ua: string): 'chrome' | 'firefox' | 'edge' {
  if (/Edg\//.test(ua)) return 'edge';
  if (/Firefox\//.test(ua)) return 'firefox';
  return 'chrome';
}

// The AUTHORITATIVE boundary. Runs in the background worker. Re-scrubs the UNTRUSTED message props,
// gates on consent AND the remote flag, then injects only TRUSTED, self-generated super-properties.
// Never throws (best-effort): a scrub failure or a not-opted-in state silently drops the event.
export async function ingestTelemetryEvent(
  built: TelemetryEvent, ctx: { appVersion: string; ua: string; nowMs: number },
): Promise<void> {
  try {
    if (!built || typeof built.event !== 'string') return;
    assertTelemetrySafe({ event: built.event, ...built.props }); // authoritative re-scrub of untrusted input
    if (!(await isTelemetryEnabled())) return;                    // consent && remote-allowed
    const installId = await getInstallId();
    if (!installId) return;
    const installedAt = (await getInstalledAt()) ?? new Date(ctx.nowMs).toISOString();
    const properties = {
      ...built.props,
      distinct_id: installId,
      $process_person_profile: false,
      $ip: null,
      app_version: ctx.appVersion,
      browser: detectBrowser(ctx.ua),
      consent_version: CONSENT_VERSION,
      days_since_install_bucket: daysSinceInstallBucket(installedAt, ctx.nowMs),
    };
    await enqueue({ event: built.event, timestamp: new Date(ctx.nowMs).toISOString(), properties });
  } catch { /* telemetry is best-effort; never propagate */ }
}
