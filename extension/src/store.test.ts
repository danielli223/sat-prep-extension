import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { openDB } from 'idb';
import { openStore, recordAttempt, getAttempts, saveNote, getNotes, saveFlag, getFlags, saveSession, getSession } from './store';
import { makeAttempt, makeNote, makeFlag, makeSession } from './model';
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

  it('saves/reads a flag, keyed by questionId (a re-toggle upserts the same row, not a new one)', async () => {
    const db = await freshDb();
    await saveFlag(db, makeFlag({ deviceId: 'd', questionId: 'q1', flagged: true }));
    await saveFlag(db, makeFlag({ deviceId: 'd', questionId: 'q1', flagged: false }));   // re-toggle
    const all = await getFlags(db);
    expect(all).toHaveLength(1);              // upsert, not append
    expect(all[0]!.flagged).toBe(false);       // latest write wins
  });

  it('rejects a flag write that smuggles an unlisted field', async () => {
    const bad = { ...makeFlag({ deviceId: 'd', questionId: 'q', flagged: true }), skillNarrative: 'the trap was...' };
    const db = await freshDb();
    await expect(saveFlag(db, bad as never)).rejects.toBeInstanceOf(QuestionContentError);
    expect(await getFlags(db)).toHaveLength(0);
  });

  it('migrates a v1 database (attempts/notes/sessions only) to v2, adding `flags` without losing existing data', async () => {
    await new Promise<void>((res) => { const r = indexedDB.deleteDatabase('sat-overlay'); r.onsuccess = () => res(); r.onerror = () => res(); });
    // The exact schema openStore used to create before the `flags` store existed (DB_VERSION was 1).
    const v1 = await openDB('sat-overlay', 1, {
      upgrade(db) {
        const s = db.createObjectStore('attempts', { keyPath: 'attemptId' });
        s.createIndex('byQuestion', 'questionId');
        db.createObjectStore('notes', { keyPath: 'noteId' });
        db.createObjectStore('sessions', { keyPath: 'filterContext' });
      },
    });
    await v1.put('attempts', makeAttempt({
      deviceId: 'd', questionId: 'ac472881', section: 'Math', domain: 'Algebra',
      skill: 'Linear equations', difficulty: 'Hard', pick: 'B', correct: true,
    }));
    v1.close();

    const db = await openStore();   // opens at the current DB_VERSION — upgrade() must add `flags` in place
    expect(await getAttempts(db)).toHaveLength(1);   // pre-existing data survived the upgrade
    await saveFlag(db, makeFlag({ deviceId: 'd', questionId: 'ac472881', flagged: true }));
    expect((await getFlags(db))[0]!.flagged).toBe(true);
  });
});
