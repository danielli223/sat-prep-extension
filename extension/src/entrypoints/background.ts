import { firstRunOnboarding } from './onboarding';
import { TELEMETRY_EVENT, TELEMETRY_DELETE, TELEMETRY_OPTOUT } from '../messages';
import { ingestTelemetryEvent } from '../telemetry/ingest';
import { deleteMyData } from '../telemetry/delete';
import { optOut } from '../telemetry/lifecycle';
import { flush } from '../telemetry/queue';
import type { TelemetryEvent } from '../telemetry/events';

const FLUSH_ALARM = 'telemetry-flush';

// Telemetry egress lives ONLY here (the single auditable network exit). Injected `api` so it's testable.
export function installTelemetryListeners(api: typeof chrome): void {
  api.runtime.onMessage.addListener((msg: { type?: string; event?: TelemetryEvent }) => {
    if (msg?.type === TELEMETRY_EVENT && msg.event) {
      void ingestTelemetryEvent(msg.event, {
        appVersion: api.runtime.getManifest().version,
        ua: typeof navigator !== 'undefined' ? navigator.userAgent : 'chrome',
        nowMs: Date.now(),
      }).then(() => flush());
    } else if (msg?.type === TELEMETRY_OPTOUT) {
      // Opt-out runs HERE (the single egress point): builds + flushes the final telemetry_disabled
      // with the full trusted super-prop set, then clears local state.
      void optOut({
        appVersion: api.runtime.getManifest().version,
        ua: typeof navigator !== 'undefined' ? navigator.userAgent : 'chrome',
        nowMs: Date.now(),
      });
    } else if (msg?.type === TELEMETRY_DELETE) {
      void deleteMyData();
    }
  });
  api.alarms.create(FLUSH_ALARM, { periodInMinutes: 1 });
  api.alarms.onAlarm.addListener((a: chrome.alarms.Alarm) => { if (a.name === FLUSH_ALARM) void flush(); });
}

// Minimal service worker. On install, surface the one-time trust line (spec §7).
if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
  chrome.runtime.onInstalled.addListener(() => {
    console.log('[focused-practice] installed');
    void firstRunOnboarding().then((line) => { if (line) console.log('[focused-practice]', line); });
  });
}

if (typeof chrome !== 'undefined' && chrome.runtime?.id && chrome.alarms) {
  installTelemetryListeners(chrome);
}
