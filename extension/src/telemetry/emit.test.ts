import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { emit } from './emit';
import { TELEMETRY_EVENT } from '../messages';

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('emit (fire-and-forget client facade)', () => {
  it('posts a TELEMETRY_EVENT message with the built event', () => {
    const send = vi.fn();
    vi.stubGlobal('chrome', { runtime: { id: 'x', sendMessage: send } });
    emit({ event: 'question_attempted', props: { question_id: 'q' } });
    expect(send).toHaveBeenCalledWith({ type: TELEMETRY_EVENT, event: { event: 'question_attempted', props: { question_id: 'q' } } });
  });

  it('no-ops on a null build (e.g. empty note) and never throws if sendMessage explodes', () => {
    const send = vi.fn(() => { throw new Error('no receiver'); });
    vi.stubGlobal('chrome', { runtime: { id: 'x', sendMessage: send } });
    expect(() => emit(null)).not.toThrow();
    expect(() => emit({ event: 'e', props: {} })).not.toThrow();
  });
});
