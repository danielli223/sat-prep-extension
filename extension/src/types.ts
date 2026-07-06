export type ISO = string;
export type UUID = string;

export interface Envelope {
  userId: string | null;
  deviceId: UUID;
  createdAt: ISO;
  updatedAt: ISO;
  deleted: boolean;
  dirty: boolean;
  schemaVersion: number;
}

export interface Attempt extends Envelope {
  attemptId: UUID;
  questionId: string;
  section: string;
  domain: string;
  skill: string;
  difficulty: string;
  pick: string;        // "A".."D" for MC, or the grid-in value
  correct: boolean;
}

export interface Note extends Envelope {
  noteId: UUID;
  questionId: string;
  text: string;
}

// Keyed by questionId (one row per question, upserted) — unlike Attempt/Note this is current STATE,
// not an event log, so there is no "latest of many rows" reduction needed to derive it.
export interface Flag extends Envelope {
  questionId: string;
  flagged: boolean;
}

export interface Session extends Envelope {
  sessionId: UUID;
  filterContext: string;            // e.g. "SAT|Math|Algebra|Hard"
  orderMode: 'list' | 'random';
  shuffleSeed: number;
  lastQuestionId: string | null;
}
