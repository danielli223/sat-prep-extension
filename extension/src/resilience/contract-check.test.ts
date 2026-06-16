import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkContract, bumpFailureCounter, FAILURE_KEY } from './contract-check';
import type { QuestionView } from '../cb/reader';

function stubChrome() {
  const mem: Record<string, unknown> = {};
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: async (k: string) => (k in mem ? { [k]: mem[k] } : {}),
        set: async (o: Record<string, unknown>) => { Object.assign(mem, o); },
      },
    },
  });
  return mem;
}

const ok: QuestionView = {
  id: 'ab12cd34', section: 'Math', domain: 'Algebra', skill: 'Linear equations', difficulty: 'Hard',
  stem: 'stem', choices: [{ letter: 'A', text: '3' }, { letter: 'B', text: '5' }],
  correctAnswer: 'B', explanation: 'because',
};

beforeEach(() => { vi.unstubAllGlobals(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('checkContract', () => {
  it('passes a well-formed multiple-choice view', () => {
    expect(checkContract(ok)).toEqual({ ok: true });
  });

  it('passes a grid-in view (no choices) that still has id + answer', () => {
    expect(checkContract({ ...ok, choices: [], correctAnswer: '5' })).toEqual({ ok: true });
  });

  it('fails when readQuestion returned null (unreadable)', () => {
    expect(checkContract(null)).toEqual({ ok: false, reason: 'unreadable' });
  });

  it('fails when the id is missing/empty', () => {
    expect(checkContract({ ...ok, id: '' })).toEqual({ ok: false, reason: 'missing-id' });
  });

  it('fails when there are neither choices nor a correct answer (cannot score or display)', () => {
    expect(checkContract({ ...ok, choices: [], correctAnswer: null })).toEqual({ ok: false, reason: 'no-answerable-content' });
  });
});

describe('bumpFailureCounter', () => {
  it('increments and persists the failure count', async () => {
    const mem = stubChrome();
    expect(await bumpFailureCounter()).toBe(1);
    expect(await bumpFailureCounter()).toBe(2);
    expect(mem[FAILURE_KEY]).toBe(2);
  });
});
