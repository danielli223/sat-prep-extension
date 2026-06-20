import { CONFIG_FLAG_URL, TELEMETRY_FLAG_CACHE_KEY } from '../config';

export const INSTALL_ID_KEY = 'telemetry.installId';
export const INSTALLED_AT_KEY = 'telemetry.installedAt';
export const CONSENT_KEY = 'telemetry.consent';
export const CONSENT_VERSION = '1';
const TIMEOUT_MS = 4000;

async function get<T>(key: string): Promise<T | undefined> {
  try { const g = await chrome.storage.local.get(key); return (g as Record<string, unknown>)[key] as T; }
  catch { return undefined; }
}

export async function getInstallId(): Promise<string | null> { return (await get<string>(INSTALL_ID_KEY)) ?? null; }
export async function getInstalledAt(): Promise<string | null> { return (await get<string>(INSTALLED_AT_KEY)) ?? null; }
export async function isOptedIn(): Promise<boolean> { return (await get<boolean>(CONSENT_KEY)) === true; }

export async function optIn(): Promise<string> {
  const id = crypto.randomUUID();
  await chrome.storage.local.set({
    [INSTALL_ID_KEY]: id, [INSTALLED_AT_KEY]: new Date().toISOString(), [CONSENT_KEY]: true,
  });
  return id;
}

// Local-only teardown shared by opt-out and delete-my-data. Caller decides what to emit first.
export async function clearLocalTelemetry(): Promise<void> {
  try { await chrome.storage.local.set({ [CONSENT_KEY]: false }); } catch { /* best-effort */ }
  try { await chrome.storage.local.remove(INSTALL_ID_KEY); } catch { /* best-effort */ }
  try { await chrome.storage.local.remove(INSTALLED_AT_KEY); } catch { /* best-effort */ }
}

export async function resetInstallId(): Promise<string> {
  const id = crypto.randomUUID();
  await chrome.storage.local.set({ [INSTALL_ID_KEY]: id, [INSTALLED_AT_KEY]: new Date().toISOString() });
  return id;
}

// Remote kill flag rides on flags.json. Mirrors killswitch: timeout + cache + DEFAULT-ON on failure.
export async function remoteAllowed(): Promise<boolean> {
  const cached = await get<boolean>(TELEMETRY_FLAG_CACHE_KEY);
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(CONFIG_FLAG_URL, { credentials: 'omit', signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return cached ?? true;
    const body = (await res.json()) as { telemetryAllowed?: unknown };
    if (typeof body.telemetryAllowed !== 'boolean') return cached ?? true;
    try { await chrome.storage.local.set({ [TELEMETRY_FLAG_CACHE_KEY]: body.telemetryAllowed }); } catch { /* */ }
    return body.telemetryAllowed;
  } catch { return cached ?? true; }
}

export async function isTelemetryEnabled(): Promise<boolean> {
  if (!(await isOptedIn())) return false;
  return remoteAllowed();
}
