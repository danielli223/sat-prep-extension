import type { Attempt, Note, Session, Envelope, UUID, ISO } from './types';

export const SCHEMA_VERSION = 1;

export const newId = (): UUID => crypto.randomUUID();
export const nowIso = (): ISO => new Date().toISOString();

function envelope(deviceId: UUID, at: ISO): Envelope {
  return { userId: null, deviceId, createdAt: at, updatedAt: at, deleted: false, dirty: true, schemaVersion: SCHEMA_VERSION };
}

export interface NewAttempt {
  deviceId: UUID; questionId: string; section: string; domain: string;
  skill: string; difficulty: string; pick: string; correct: boolean;
}
export function makeAttempt(i: NewAttempt): Attempt {
  const at = nowIso();
  return { attemptId: newId(), questionId: i.questionId, section: i.section, domain: i.domain,
    skill: i.skill, difficulty: i.difficulty, pick: i.pick, correct: i.correct, ...envelope(i.deviceId, at) };
}

export function makeNote(i: { deviceId: UUID; questionId: string; text: string }): Note {
  const at = nowIso();
  return { noteId: newId(), questionId: i.questionId, text: i.text, ...envelope(i.deviceId, at) };
}

export function makeSession(i: { deviceId: UUID; filterContext: string; orderMode: 'list' | 'random'; shuffleSeed: number }): Session {
  const at = nowIso();
  return { sessionId: newId(), filterContext: i.filterContext, orderMode: i.orderMode,
    shuffleSeed: i.shuffleSeed, lastQuestionId: null, ...envelope(i.deviceId, at) };
}
