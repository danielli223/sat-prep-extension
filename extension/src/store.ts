import { openDB, type IDBPDatabase } from 'idb';
import { assertNoQuestionContent } from './guard';
import type { Attempt, Note, Session } from './types';

const DB_NAME = 'sat-overlay';
const DB_VERSION = 1;

export async function openStore(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('attempts')) {
        const s = db.createObjectStore('attempts', { keyPath: 'attemptId' });
        s.createIndex('byQuestion', 'questionId');
      }
      if (!db.objectStoreNames.contains('notes')) db.createObjectStore('notes', { keyPath: 'noteId' });
      if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions', { keyPath: 'filterContext' });
    },
    // Yield this connection when another connection requests a version change or deletion,
    // so an upgrade/delete is never permanently blocked by a stale open handle.
    blocking(_currentVersion, _blockedVersion, event) {
      (event.target as IDBDatabase | null)?.close();
    },
  });
}

export async function recordAttempt(db: IDBPDatabase, a: Attempt): Promise<void> {
  assertNoQuestionContent(a as unknown as Record<string, unknown>);
  await db.put('attempts', a);
}
export async function getAttempts(db: IDBPDatabase): Promise<Attempt[]> {
  return db.getAll('attempts') as Promise<Attempt[]>;
}

export async function saveNote(db: IDBPDatabase, n: Note): Promise<void> {
  assertNoQuestionContent(n as unknown as Record<string, unknown>);
  await db.put('notes', n);
}
export async function getNotes(db: IDBPDatabase): Promise<Note[]> {
  return db.getAll('notes') as Promise<Note[]>;
}

export async function saveSession(db: IDBPDatabase, s: Session): Promise<void> {
  assertNoQuestionContent(s as unknown as Record<string, unknown>);
  await db.put('sessions', s);
}
export async function getSession(db: IDBPDatabase, filterContext: string): Promise<Session | undefined> {
  return db.get('sessions', filterContext) as Promise<Session | undefined>;
}
