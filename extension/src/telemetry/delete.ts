import { getInstallId, clearLocalTelemetry } from './consent';
import { purgeQueue } from './queue';
import { TELEMETRY_DELETE_URL } from '../config';

// "Delete my data": erase server-side events for this install, then wipe local state. Order: capture
// the id → POST it → clear local. We deliberately do NOT emit telemetry_disabled here (it would be
// deleted anyway). Best-effort: a failed POST still clears local; the user can retry. Never throws.
export async function deleteMyData(fetchImpl: typeof fetch = fetch): Promise<void> {
  const id = await getInstallId();
  if (!id) return;
  try {
    await fetchImpl(TELEMETRY_DELETE_URL, {
      method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ install_id: id }),
    });
  } catch { /* best-effort; local wipe still proceeds, user can re-trigger */ }
  await clearLocalTelemetry();
  await purgeQueue();
}
