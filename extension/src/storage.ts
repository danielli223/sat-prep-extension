// Single-key reader for chrome.storage.local. Returns undefined on a missing key OR any storage
// error — callers supply their own default/narrowing — so a storage hiccup never throws into a
// caller. The opaque-record cast lives here ONCE instead of being hand-copied at every read site.
// NOTE: this swallows errors; do NOT use it where a write must share the read's try (e.g. the
// one-time onboarding gate, contract-check's failure counter) — those keep their own combined try.
export async function getLocal<T>(key: string): Promise<T | undefined> {
  try {
    const g = await chrome.storage.local.get(key);
    return (g as Record<string, unknown>)[key] as T;
  } catch {
    return undefined;
  }
}
