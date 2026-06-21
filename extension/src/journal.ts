import type { IDBPDatabase } from 'idb';
import { getAttempts, getNotes } from './store';
import { deriveStats, type SeenMap } from './stats';
import type { Attempt } from './types';

// Read-views for the journal/badger. NO new store methods, NO new persisted fields:
// everything derives from the frozen getAttempts/getNotes + deriveStats event log.
// Taxonomy (skill/difficulty) is read from per-attempt context only — never a global
// questionId->metadata index (spec §10 guardrail).

export interface Mistake {
  questionId: string;
  skill: string;
  difficulty: string;
  lastSeenAt: string;            // createdAt of the latest (still-missed) attempt
  note: string | null;          // latest note for this question, if any
}

/** Latest result per question as a done/missed map. Thin wrapper over deriveStats.seen. */
export async function getSeen(db: IDBPDatabase): Promise<SeenMap> {
  const attempts = await getAttempts(db);
  return deriveStats(attempts).seen;
}

/** Currently-missed questions (latest attempt wrong), joined with the latest note, newest-missed first. */
export async function getMistakes(db: IDBPDatabase): Promise<Mistake[]> {
  const attempts = await getAttempts(db);
  const latestNoteByQ = latestNote(await getNotes(db));

  const latest = new Map<string, Attempt>();
  for (const a of attempts) {
    if (a.deleted) continue;
    const prev = latest.get(a.questionId);
    if (!prev || a.createdAt > prev.createdAt) latest.set(a.questionId, a);
  }

  return [...latest.values()]
    .filter((a) => !a.correct)
    .sort((x, y) => (x.createdAt < y.createdAt ? 1 : x.createdAt > y.createdAt ? -1 : 0))
    .map((a) => ({
      questionId: a.questionId,
      skill: a.skill,
      difficulty: a.difficulty,
      lastSeenAt: a.createdAt,
      note: latestNoteByQ.get(a.questionId) ?? null,
    }));
}

function latestNote(notes: { questionId: string; text: string; createdAt: string; deleted: boolean }[]): Map<string, string> {
  const byQ = new Map<string, { text: string; at: string }>();
  for (const n of notes) {
    if (n.deleted) continue;
    const prev = byQ.get(n.questionId);
    if (!prev || n.createdAt > prev.at) byQ.set(n.questionId, { text: n.text, at: n.createdAt });
  }
  return new Map([...byQ.entries()].map(([q, v]) => [q, v.text]));
}
