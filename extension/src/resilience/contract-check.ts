import type { QuestionView } from '../cb/reader';

// DOM-contract self-check (spec §8.1, contract §2.4). Verifies CB's expected data is present on a
// read view BEFORE the loop trusts it. On failure we NEVER guess a score — the caller degrades to
// the non-verdict banner (renderBanner) and bumps the persisted failure counter. A wrong right/wrong
// is the trust-killer; this gate ensures we only score what we could fully read.
export type ContractResult =
  | { ok: true }
  | { ok: false; reason: 'unreadable' | 'missing-id' | 'no-answerable-content' };

export function checkContract(view: QuestionView | null): ContractResult {
  if (view === null) return { ok: false, reason: 'unreadable' };
  if (!view.id || view.id.trim() === '') return { ok: false, reason: 'missing-id' };
  // We can present a question if it has choices (MC) OR a revealed correct answer (grid-in).
  if (view.choices.length === 0 && (view.correctAnswer === null || view.correctAnswer.trim() === '')) {
    return { ok: false, reason: 'no-answerable-content' };
  }
  return { ok: true };
}

export const FAILURE_KEY = 'contract.failureCount';

// Persisted, monotonically increasing failure tally. Observable signal that CB's DOM drifted —
// feeds the kill-switch decision (spec §8.1/§8.2). Best-effort; never throws.
export async function bumpFailureCounter(): Promise<number> {
  try {
    const got = await chrome.storage.local.get(FAILURE_KEY);
    const prev = (got as Record<string, unknown>)[FAILURE_KEY];
    const next = (typeof prev === 'number' ? prev : 0) + 1;
    await chrome.storage.local.set({ [FAILURE_KEY]: next });
    return next;
  } catch {
    return 0;
  }
}
