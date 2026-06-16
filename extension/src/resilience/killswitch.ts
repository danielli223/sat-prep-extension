import { CONFIG_FLAG_URL } from '../config';

// §2.5 enablement gate (Plan 4 owns). Fetches OUR hosted flag; caches in chrome.storage.local;
// NEVER throws. Default-ON: a flaky/absent host must not brick the local journal — the kill-switch
// only fires on an EXPLICIT { enabled: false } from us (spec §8.2 C&D / terms change).
export const CACHE_KEY = 'killswitch.enabled';
const TIMEOUT_MS = 4000;

async function readCache(): Promise<boolean | undefined> {
  try {
    const got = await chrome.storage.local.get(CACHE_KEY);
    const v = (got as Record<string, unknown>)[CACHE_KEY];
    return typeof v === 'boolean' ? v : undefined;
  } catch {
    return undefined;
  }
}

async function writeCache(v: boolean): Promise<void> {
  try { await chrome.storage.local.set({ [CACHE_KEY]: v }); } catch { /* cache best-effort */ }
}

export async function isEnabled(): Promise<boolean> {
  const cached = await readCache();
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(CONFIG_FLAG_URL, { credentials: 'omit', signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return cached ?? true;
    const body = (await res.json()) as { enabled?: unknown };
    if (typeof body.enabled !== 'boolean') return cached ?? true;
    await writeCache(body.enabled);
    return body.enabled;
  } catch {
    return cached ?? true;
  }
}
