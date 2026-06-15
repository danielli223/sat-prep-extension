import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { openStore, recordAttempt, getAttempts, saveNote, getNotes, saveSession, getSession } from './store';
import { makeAttempt, makeNote, makeSession } from './model';
import { QuestionContentError } from './guard';
import { indexedDB } from 'fake-indexeddb';

async function freshDb() {
  await new Promise<void>((res) => { const r = indexedDB.deleteDatabase('sat-overlay'); r.onsuccess = () => res(); r.onerror = () => res(); });
  return openStore();
}

describe('local store', () => {
  it('records and reads back an attempt', async () => {
    const db = await freshDb();
    const a = makeAttempt({ deviceId: 'd', questionId: 'ac472881', section: 'Math', domain: 'Algebra', skill: 'Linear equations', difficulty: 'Hard', pick: 'B', correct: true });
    await recordAttempt(db, a);
    const all = await getAttempts(db);
    expect(all).toHaveLength(1);
    expect(all[0]!.questionId).toBe('ac472881');
  });

  it('rejects a write that smuggles question content (guard fires before persistence)', async () => {
    const db = await freshDb();
    const bad = { ...makeAttempt({ deviceId: 'd', questionId: 'q', section: 'Math', domain: 'Algebra', skill: 'x', difficulty: 'Hard', pick: 'B', correct: false }), passage: 'If 3x+7=22 ...' };
    await expect(recordAttempt(db, bad as never)).rejects.toBeInstanceOf(QuestionContentError);
    expect(await getAttempts(db)).toHaveLength(0);
  });

  it('saves/reads a note and a session (session keyed by filterContext)', async () => {
    const db = await freshDb();
    await saveNote(db, makeNote({ deviceId: 'd', questionId: 'q1', text: 'trap' }));
    expect((await getNotes(db))[0]!.text).toBe('trap');
    const s = makeSession({ deviceId: 'd', filterContext: 'SAT|Math|Algebra|Hard', orderMode: 'random', shuffleSeed: 3 });
    await saveSession(db, s);
    expect((await getSession(db, 'SAT|Math|Algebra|Hard'))!.shuffleSeed).toBe(3);
  });
});
