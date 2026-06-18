import { describe, it, expect, vi } from 'vitest';
import { installTelemetryListeners } from './background';

describe('installTelemetryListeners', () => {
  it('routes TELEMETRY_EVENT to ingest and TELEMETRY_DELETE to delete; creates a flush alarm', () => {
    const onMessage = vi.fn();
    const onAlarm = vi.fn();
    const create = vi.fn();
    const api = {
      runtime: { onMessage: { addListener: onMessage }, getManifest: () => ({ version: '0.0.1' }) },
      alarms: { create, onAlarm: { addListener: onAlarm } },
    };
    installTelemetryListeners(api as any);
    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith('telemetry-flush', expect.objectContaining({ periodInMinutes: expect.any(Number) }));
    expect(onAlarm).toHaveBeenCalledTimes(1);
  });
});
