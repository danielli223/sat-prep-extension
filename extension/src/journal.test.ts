import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { indexedDB } from 'fake-indexeddb';
import { openStore, recordAttempt, saveNote } from './store';
import { makeAttempt, makeNote } from './model';
import { getSeen, getMistakes } from './journal';
import type { Attempt } from './types';

async function freshDb() {
  await new Promise<void>((res) => { const r = indexedDB.deleteDatabase('sat-overlay'); r.onsuccess = () => res(); r.onerror = () => res(); });
  return openStore();
}

function att(o: Partial<Attempt> & { questionId: string; skill: string; correct: boolean; createdAt: string }): Attempt {
  return { ...makeAttempt({ deviceId: 'd', questionId: o.questionId, section: 'Math', domain: 'Algebra',
    skill: o.skill, difficulty: o.difficulty ?? 'Hard', pick: 'B', correct: o.correct }), createdAt: o.createdAt, updatedAt: o.createdAt };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-06-15T00:00:00.000Z')); });
afterEach(() => { vi.useRealTimers(); });

describe('getSeen', () => {
  it('returns the latest result per question as a done/missed map (delegates to deriveStats)', async () => {
    const db = await freshDb();
    await recordAttempt(db, att({ questionId: 'q1', skill: 'Inferences', correct: false, createdAt: '2026-06-10T00:00:00.000Z' }));
    await recordAttempt(db, att({ questionId: 'q1', skill: 'Inferences', correct: true,  createdAt: '2026-06-12T00:00:00.000Z' }));
    await recordAttempt(db, att({ questionId: 'q2', skill: 'Inferences', correct: false, createdAt: '2026-06-11T00:00:00.000Z' }));
    const seen = await getSeen(db);
    expect(seen).toEqual({ q1: 'done', q2: 'missed' });
  });
});

describe('getMistakes', () => {
  it('lists only currently-missed questions, joined with the latest note, newest-missed first', async () => {
    const db = await freshDb();
    await recordAttempt(db, att({ questionId: 'q1', skill: 'Inferences', correct: false, createdAt: '2026-06-10T00:00:00.000Z' }));
    await recordAttempt(db, att({ questionId: 'q2', skill: 'Linear equations', correct: false, createdAt: '2026-06-12T00:00:00.000Z' }));
    await recordAttempt(db, att({ questionId: 'q3', skill: 'Inferences', correct: true,  createdAt: '2026-06-11T00:00:00.000Z' })); // correct → excluded
    await saveNote(db, makeNote({ deviceId: 'd', questionId: 'q1', text: 'missed the trap' }));

    const mistakes = await getMistakes(db);
    expect(mistakes.map((m) => m.questionId)).toEqual(['q2', 'q1']); // q2 missed later → first
    expect(mistakes[0]!.note).toBeNull();
    expect(mistakes[0]!.skill).toBe('Linear equations');
    expect(mistakes[1]!.note).toBe('missed the trap');
    expect(mistakes[1]!.difficulty).toBe('Hard');
    expect(mistakes[1]!.lastSeenAt).toBe('2026-06-10T00:00:00.000Z');
  });

  it('flips a mistake to resolved when a later attempt is correct (latest-attempt wins)', async () => {
    const db = await freshDb();
    await recordAttempt(db, att({ questionId: 'q1', skill: 'X', correct: false, createdAt: '2026-06-10T00:00:00.000Z' }));
    await recordAttempt(db, att({ questionId: 'q1', skill: 'X', correct: true,  createdAt: '2026-06-13T00:00:00.000Z' }));
    expect(await getMistakes(db)).toEqual([]);
  });
});
