import type { Attempt } from './types';

export interface SkillStat { skill: string; total: number; correct: number; accuracy: number; }
export interface Stats {
  total: number; correct: number; accuracy: number;
  perSkill: SkillStat[];                       // worst accuracy first
  seen: Record<string, 'done' | 'missed'>;     // latest result per questionId
  streakDays: number;                          // consecutive active days ending at the most recent
}

// Issue #34: an optional difficulty filter. "No selection = all" — undefined opts, an empty Set, or
// a Set covering every present difficulty all behave identically to the unfiltered call. The filter
// is applied to the RAW attempts BEFORE the latest-per-question reduction, so a question whose latest
// attempt is an unselected difficulty drops out and the latest attempt WITHIN the selection survives.
// streakDays is intentionally computed over ALL active days, not the filtered pool.
export interface StatsOpts { difficulties?: Set<string>; }

export function deriveStats(attempts: Attempt[], opts?: StatsOpts): Stats {
  const diffs = opts?.difficulties;
  const filtering = diffs !== undefined && diffs.size > 0;
  const latest = new Map<string, Attempt>();
  const days = new Set<string>();
  for (const a of attempts) {
    if (a.deleted) continue;
    days.add(a.createdAt.slice(0, 10));
    if (filtering && !diffs!.has(a.difficulty)) continue;   // drop unselected difficulties before reducing
    const prev = latest.get(a.questionId);
    if (!prev || a.createdAt > prev.createdAt) latest.set(a.questionId, a);
  }
  const list = [...latest.values()];
  const correct = list.filter((a) => a.correct).length;

  const bySkill = new Map<string, { t: number; c: number }>();
  const seen: Record<string, 'done' | 'missed'> = {};
  for (const a of list) {
    const s = bySkill.get(a.skill) ?? { t: 0, c: 0 };
    s.t++; if (a.correct) s.c++;
    bySkill.set(a.skill, s);
    seen[a.questionId] = a.correct ? 'done' : 'missed';
  }
  const perSkill = [...bySkill.entries()]
    .map(([skill, { t, c }]) => ({ skill, total: t, correct: c, accuracy: t ? c / t : 0 }))
    .sort((x, y) => x.accuracy - y.accuracy);

  return { total: list.length, correct, accuracy: list.length ? correct / list.length : 0, perSkill, seen, streakDays: streak(days) };
}

function streak(days: Set<string>): number {
  const sorted = [...days].sort().reverse();
  if (sorted.length === 0) return 0;
  let n = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = Date.parse(sorted[i - 1]! + 'T00:00:00Z');
    const cur = Date.parse(sorted[i]! + 'T00:00:00Z');
    if (prev - cur === 86_400_000) n++; else break;
  }
  return n;
}
