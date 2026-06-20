import { TELEMETRY_EVENT } from '../messages';
import type { TelemetryEvent } from './events';

// Fire-and-forget. Callers use `void emit(builder(...))`. NEVER awaited, NEVER throws — telemetry must
// not block or break scoring/notes/the observer loop. Consent + scrubbing happen authoritatively in the
// background; this just hands the built event off. A null build (e.g. an empty note) is a no-op.
export function emit(built: TelemetryEvent | null): void {
  if (!built) return;
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
      chrome.runtime.sendMessage({ type: TELEMETRY_EVENT, event: built });
    }
  } catch { /* no receiver / context gone — telemetry is best-effort */ }
}
