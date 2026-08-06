import { firstRunOnboarding } from './onboarding';
import { TELEMETRY_EVENT, TELEMETRY_DELETE, TELEMETRY_OPTOUT, TELEMETRY_DECLINED } from '../messages';
import { ingestTelemetryEvent } from '../telemetry/ingest';
import { deleteMyData } from '../telemetry/delete';
import { optOut, reportDecline } from '../telemetry/lifecycle';
import { flush } from '../telemetry/queue';
import type { TelemetryEvent } from '../telemetry/events';

const FLUSH_ALARM = 'telemetry-flush';

// Telemetry egress lives ONLY here (the single auditable network exit). Injected `api` so it's testable.
export function installTelemetryListeners(api: typeof chrome): void {
  api.runtime.onMessage.addListener((msg: { type?: string; event?: TelemetryEvent }) => {
    // The trusted super-prop context — identical for every egress path, built once per message.
    const ctx = {
      appVersion: api.runtime.getManifest().version,
      ua: typeof navigator !== 'undefined' ? navigator.userAgent : 'chrome',
      nowMs: Date.now(),
    };
    if (msg?.type === TELEMETRY_EVENT && msg.event) {
      void ingestTelemetryEvent(msg.event, ctx).then(() => flush());
    } else if (msg?.type === TELEMETRY_OPTOUT) {
      // Opt-out runs HERE (the single egress point): builds + flushes the final telemetry_disabled
      // with the full trusted super-prop set, then clears local state.
      void optOut(ctx);
    } else if (msg?.type === TELEMETRY_DELETE) {
      void deleteMyData();
    } else if (msg?.type === TELEMETRY_DECLINED) {
      // Anonymous, at-most-once decline counter. Runs here like every other egress path so the
      // single-network-exit property holds even for the one event a non-consenting user produces.
      void reportDecline(ctx);
    }
  });
  api.alarms.create(FLUSH_ALARM, { periodInMinutes: 1 });
  api.alarms.onAlarm.addListener((a: chrome.alarms.Alarm) => { if (a.name === FLUSH_ALARM) void flush(); });
}

// On install, open the one-time trust/consent onboarding tab (spec §7). Injected `api` so it's testable.
export function handleInstalled(api: typeof chrome): void {
  void firstRunOnboarding().then((shown) => {
    if (shown) api.tabs.create({ url: api.runtime.getURL('onboarding.html') });
  });
}

// Minimal service worker.
if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
  chrome.runtime.onInstalled.addListener(() => {
    console.log('[focused-practice] installed');
    handleInstalled(chrome);
  });
}

if (typeof chrome !== 'undefined' && chrome.runtime?.id && chrome.alarms) {
  installTelemetryListeners(chrome);
}
