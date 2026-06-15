export interface ScoreResult {
  graded: boolean;   // false => indeterminate; the loop shows CB's answer with NO red/green verdict
  correct: boolean;  // meaningful only when graded === true
}

// SAT answers are multiple-choice (a single letter) or student-produced response (grid-in).
// CB's correct-answer string may list several acceptable forms ("1/3, .333, .3333"). We grade
// only when confident; any unexpected format returns { graded:false } so we NEVER show a wrong
// verdict (the OnePrep trust-killer). Tolerances are calibrated against real CB grid-in answers
// during the live spike (Task 12).
export function score(pick: string, correctAnswerRaw: string): ScoreResult {
  const a = pick.trim();
  const accepted = splitAnswers(correctAnswerRaw);
  if (a === '' || accepted.length === 0) return { graded: false, correct: false };

  // Multiple-choice
  if (accepted.some(isChoiceLetter) || isChoiceLetter(a)) {
    if (!isChoiceLetter(a)) return { graded: false, correct: false };
    return { graded: true, correct: accepted.some((x) => x.toUpperCase() === a.toUpperCase()) };
  }

  // Grid-in (numeric / fraction, possibly multiple acceptable forms)
  const pv = parseNumeric(a);
  const targets = accepted.map(parseNumeric).filter((n): n is number => n !== null);
  if (pv === null || targets.length === 0) {
    return accepted.includes(a) ? { graded: true, correct: true } : { graded: false, correct: false };
  }
  return { graded: true, correct: targets.some((t) => numericAccept(a, pv, t)) };
}

function splitAnswers(raw: string): string[] {
  return raw.split(/[,;]|\bor\b/i).map((s) => s.trim()).filter(Boolean);
}

function isChoiceLetter(s: string): boolean { return /^[A-D]$/i.test(s.trim()); }

function parseNumeric(s: string): number | null {
  const t = s.trim();
  if (/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(t)) return parseFloat(t);
  const f = t.match(/^(-?\d+)\s*\/\s*(\d+)$/);
  if (f) { const d = parseInt(f[2]!, 10); return d === 0 ? null : parseInt(f[1]!, 10) / d; }
  return null;
}

// Exact match, or — for a non-terminating decimal — the pick equals the target rounded OR
// truncated to the pick's own decimal places, provided the pick carries >= 3 decimals
// (SAT requires filling the grid). Otherwise not accepted.
function numericAccept(pickStr: string, pickVal: number, target: number): boolean {
  if (Math.abs(pickVal - target) < 1e-9) return true;
  const dec = (pickStr.split('.')[1] ?? '').length;
  if (dec >= 3) {
    const f = 10 ** dec;
    const rounded = Math.round(target * f) / f;
    const truncated = Math.trunc(target * f) / f;
    return Math.abs(pickVal - rounded) < 1e-9 || Math.abs(pickVal - truncated) < 1e-9;
  }
  return false;
}
