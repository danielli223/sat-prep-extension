import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the telemetry modules before importing the module under test.
vi.mock('../telemetry/ingest', () => ({ ingestTelemetryEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../telemetry/delete', () => ({ deleteMyData: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../telemetry/queue', () => ({ flush: vi.fn().mockResolvedValue(undefined), enqueue: vi.fn() }));

import { installTelemetryListeners } from './background';
import { ingestTelemetryEvent } from '../telemetry/ingest';
import { deleteMyData } from '../telemetry/delete';
import { flush } from '../telemetry/queue';
import { TELEMETRY_EVENT, TELEMETRY_DELETE } from '../messages';

describe('installTelemetryListeners', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes TELEMETRY_EVENT to ingest and TELEMETRY_DELETE to delete; creates a flush alarm', async () => {
    const onMessage = vi.fn();
    const onAlarm = vi.fn();
    const create = vi.fn();
    const api = {
      runtime: { onMessage: { addListener: onMessage }, getManifest: () => ({ version: '0.0.1' }) },
      alarms: { create, onAlarm: { addListener: onAlarm } },
    };
    installTelemetryListeners(api as any);

    // Verify the alarm was registered.
    expect(create).toHaveBeenCalledWith('telemetry-flush', expect.objectContaining({ periodInMinutes: expect.any(Number) }));

    // Capture listeners immediately after install, before any mock resets.
    const msgListener = (onMessage.mock.calls[0] as [unknown])[0] as (msg: unknown) => void;
    const alarmListener = (onAlarm.mock.calls[0] as [unknown])[0] as (alarm: { name: string }) => void;
    expect(typeof msgListener).toBe('function');
    expect(typeof alarmListener).toBe('function');

    // Exercise the TELEMETRY_EVENT branch.
    const fakeEvent = { event: 'question_attempted', props: { result: 'correct' } };
    msgListener({ type: TELEMETRY_EVENT, event: fakeEvent });
    // Give microtasks a chance to settle so the mocked promise resolves.
    await Promise.resolve();
    expect(ingestTelemetryEvent).toHaveBeenCalledWith(
      fakeEvent,
      expect.objectContaining({ appVersion: '0.0.1' }),
    );
    // Opportunistic flush fires after each ingest (Firefox fallback — no persistent alarms).
    await Promise.resolve();
    expect(flush).toHaveBeenCalledTimes(1);

    // Exercise the TELEMETRY_DELETE branch.
    vi.clearAllMocks();
    msgListener({ type: TELEMETRY_DELETE });
    await Promise.resolve();
    expect(deleteMyData).toHaveBeenCalledTimes(1);
    expect(ingestTelemetryEvent).not.toHaveBeenCalled();

    // Alarm listener must call flush for the named alarm.
    vi.clearAllMocks();
    alarmListener({ name: 'telemetry-flush' });
    await Promise.resolve();
    expect(flush).toHaveBeenCalledTimes(1);

    // Alarm listener must NOT call flush for unrelated alarms.
    vi.clearAllMocks();
    alarmListener({ name: 'some-other-alarm' });
    await Promise.resolve();
    expect(flush).not.toHaveBeenCalled();
  });

  it('ignores unknown message types without calling ingest or delete', async () => {
    const onMessage = vi.fn();
    const api = {
      runtime: { onMessage: { addListener: onMessage }, getManifest: () => ({ version: '0.0.1' }) },
      alarms: { create: vi.fn(), onAlarm: { addListener: vi.fn() } },
    };
    installTelemetryListeners(api as any);

    const msgListener = (onMessage.mock.calls[0] as [unknown])[0] as (msg: unknown) => void;
    msgListener({ type: 'open-journal' });
    await Promise.resolve();
    expect(ingestTelemetryEvent).not.toHaveBeenCalled();
    expect(deleteMyData).not.toHaveBeenCalled();
  });

  it('does not call ingest when TELEMETRY_EVENT has no event payload', async () => {
    const onMessage = vi.fn();
    const api = {
      runtime: { onMessage: { addListener: onMessage }, getManifest: () => ({ version: '0.0.1' }) },
      alarms: { create: vi.fn(), onAlarm: { addListener: vi.fn() } },
    };
    installTelemetryListeners(api as any);

    const msgListener = (onMessage.mock.calls[0] as [unknown])[0] as (msg: unknown) => void;
    msgListener({ type: TELEMETRY_EVENT }); // no .event
    await Promise.resolve();
    expect(ingestTelemetryEvent).not.toHaveBeenCalled();
  });
});
