import type { IDBPDatabase } from 'idb';
import { getAttempts, getNotes, getFlags } from './store';
import { deriveStats, type SeenMap } from './stats';
import type { Attempt } from './types';

// Read-views for the journal/badger, derived from getAttempts/getNotes/getFlags + deriveStats.
// Taxonomy (skill/difficulty) is read from per-attempt context only — never a global
// questionId->metadata index (spec §10 guardrail; see guard-ci.test.ts's QID_METADATA_INDEX check).

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

/** Latest flagged/unflagged state per question. The flags store already holds one row per question
 *  (upserted, not an event log), so this is a direct read — no latest-createdAt reduction needed. */
export async function getFlaggedMap(db: IDBPDatabase): Promise<Record<string, boolean>> {
  const flags = await getFlags(db);
  const map: Record<string, boolean> = {};
  for (const f of flags) { if (!f.deleted) map[f.questionId] = f.flagged; }
  return map;
}

export interface FlaggedQuestion {
  questionId: string;
  skill: string | null;
  difficulty: string | null;      // null when flagged before ever being attempted/graded
  flaggedAt: string;
}

/** Currently-flagged questions, newest-flagged first, joined with the latest attempt (if any) for
 *  display context. A question can be flagged before it's ever been attempted, so skill/difficulty
 *  are nullable rather than backed by a questionId->metadata index (spec §10). */
export async function getFlaggedQuestions(db: IDBPDatabase): Promise<FlaggedQuestion[]> {
  const flags = await getFlags(db);
  const attempts = await getAttempts(db);

  const latestAttempt = new Map<string, Attempt>();
  for (const a of attempts) {
    if (a.deleted) continue;
    const prev = latestAttempt.get(a.questionId);
    if (!prev || a.createdAt > prev.createdAt) latestAttempt.set(a.questionId, a);
  }

  return flags
    .filter((f) => !f.deleted && f.flagged)
    .map((f) => {
      const a = latestAttempt.get(f.questionId);
      return { questionId: f.questionId, skill: a?.skill ?? null, difficulty: a?.difficulty ?? null, flaggedAt: f.updatedAt };
    })
    .sort((x, y) => (x.flaggedAt < y.flaggedAt ? 1 : x.flaggedAt > y.flaggedAt ? -1 : 0));
}
