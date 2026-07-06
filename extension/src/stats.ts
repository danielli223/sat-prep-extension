import type { Attempt } from './types';

// The student's own per-question status (from their attempt journal — never CB content). Single-
// sourced here so the badger, nav grid, journal, view-model, and answer overlay don't each hand-copy
// the union or the map shape.
export type SeenStatus = 'done' | 'missed';        // a question they've attempted
export type PriorStatus = 'new' | SeenStatus;      // + 'new' (never attempted)
export type SeenMap = Record<string, SeenStatus>;  // latest result per questionId

export interface SkillStat { skill: string; total: number; correct: number; accuracy: number; }
export interface Stats {
  total: number; correct: number; accuracy: number;
  perSkill: SkillStat[];                       // worst accuracy first
  seen: SeenMap;                               // latest result per questionId
}

// How many times each of the five student-facing tools was used THIS sitting. IN-MEMORY ONLY (mirrors
// content.ts's existing attempted/correct counters) — never persisted, resets on the next page load.
// content.ts's runLoop mutates one shared instance by reference; handleMessage/the journal panel just
// read it, so this type is single-sourced here rather than in content.ts, which panel.ts must not
// import (content.ts already imports panel.ts — importing back would be circular).
export interface ToolCounts { check: number; reveal: number; note: number; desmos: number; next: number; }
export function createToolCounts(): ToolCounts {
  return { check: 0, reveal: 0, note: 0, desmos: 0, next: 0 };
}

// Issue #34: an optional difficulty filter. "No selection = all" — undefined opts, an empty Set, or
// a Set covering every present difficulty all behave identically to the unfiltered call. The filter
// is applied to the RAW attempts BEFORE the latest-per-question reduction, so a question whose latest
// attempt is an unselected difficulty drops out and the latest attempt WITHIN the selection survives.
export interface StatsOpts { difficulties?: Set<string>; }

export function deriveStats(attempts: Attempt[], opts?: StatsOpts): Stats {
  const diffs = opts?.difficulties;
  const filtering = diffs !== undefined && diffs.size > 0;
  const latest = new Map<string, Attempt>();
  for (const a of attempts) {
    if (a.deleted) continue;
    if (filtering && !diffs!.has(a.difficulty)) continue;   // drop unselected difficulties before reducing
    const prev = latest.get(a.questionId);
    if (!prev || a.createdAt > prev.createdAt) latest.set(a.questionId, a);
  }
  const list = [...latest.values()];
  const correct = list.filter((a) => a.correct).length;

  const bySkill = new Map<string, { t: number; c: number }>();
  const seen: SeenMap = {};
  for (const a of list) {
    const s = bySkill.get(a.skill) ?? { t: 0, c: 0 };
    s.t++; if (a.correct) s.c++;
    bySkill.set(a.skill, s);
    seen[a.questionId] = a.correct ? 'done' : 'missed';
  }
  const perSkill = [...bySkill.entries()]
    .map(([skill, { t, c }]) => ({ skill, total: t, correct: c, accuracy: t ? c / t : 0 }))
    .sort((x, y) => x.accuracy - y.accuracy);

  return { total: list.length, correct, accuracy: list.length ? correct / list.length : 0, perSkill, seen };
}

// Lifetime attempt count per question, straight from the raw rows (never collapsed to "latest"):
// content.ts's gradedIds guard records at most one Attempt per question per sitting, so each row here
// is one distinct sitting's first grade of that question — the count IS the lifetime "how many times
// have I done this question" the student sees on the overlay badge and in the journal panel.
export function deriveAttemptCounts(attempts: Attempt[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const a of attempts) {
    if (a.deleted) continue;
    counts[a.questionId] = (counts[a.questionId] ?? 0) + 1;
  }
  return counts;
}
