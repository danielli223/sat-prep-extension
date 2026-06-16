import type { QuestionView } from '../cb/reader';
import { html } from '../ui/host';

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
  // Presentable once we've read the question itself — a stem (grid-in) or choices (MC). The correct
  // answer (grid-in) and even the full choice set may still be loading; those gate SCORING (polled at
  // Check), NOT display. A view with neither a stem nor choices is a failed read. (Live 2026-06-16:
  // requiring the grid-in answer here banner'd EVERY grid-in, whose answer is null until CB reveals it.)
  if (view.stem.trim() === '' && view.choices.length === 0) {
    return { ok: false, reason: 'no-answerable-content' };
  }
  return { ok: true };
}

export const FAILURE_KEY = 'contract.failureCount';

// Sentinel returned when the storage read/write itself failed. Distinct from 0 ("no failures yet")
// so a future "disable after N failures" reading this value never undercounts on storage flakiness.
// On success the return is always >= 1 (a successful bump means at least this failure).
export const FAILURE_COUNT_UNKNOWN = -1;

// Persisted, monotonically increasing failure tally. Observable signal that CB's DOM drifted —
// feeds the kill-switch decision (spec §8.1/§8.2). Best-effort; never throws. Returns the new count
// on success (>= 1), or FAILURE_COUNT_UNKNOWN (-1) if storage failed — NOT 0, which would collide
// with "no failures yet".
export async function bumpFailureCounter(): Promise<number> {
  try {
    const got = await chrome.storage.local.get(FAILURE_KEY);
    const prev = (got as Record<string, unknown>)[FAILURE_KEY];
    const next = (typeof prev === 'number' ? prev : 0) + 1;
    await chrome.storage.local.set({ [FAILURE_KEY]: next });
    return next;
  } catch {
    return FAILURE_COUNT_UNKNOWN;
  }
}

export const BANNER_ID = 'fp-degraded-banner';

// Non-verdict degraded banner (contract §2.4). Shows CB's own page is authoritative here; renders
// NO red/green. Idempotent + dismissible. Mounts inside the single shadow host (HOST_ID). All HTML
// goes through Plan 2's `html()` — the SINGLE `focused-practice` policy created once in host.ts;
// we never re-create the policy here (contract §2.1: ONE policy, created in host.ts).
export function renderBanner(root: ShadowRoot): void {
  if (root.getElementById(BANNER_ID)) return; // idempotent
  const el = root.ownerDocument!.createElement('div');
  el.id = BANNER_ID;
  el.setAttribute('role', 'status');
  el.innerHTML = html(`
    <div class="fp-banner">
      <span class="fp-banner-text">Couldn't read this one — answer it on CB.</span>
      <button type="button" data-action="dismiss" class="fp-banner-dismiss" aria-label="Dismiss">×</button>
    </div>`) as string;
  el.querySelector<HTMLButtonElement>('[data-action="dismiss"]')!.addEventListener('click', () => el.remove());
  root.appendChild(el);
}

export const BLOCK_NOTICE_ID = 'fp-block-notice';

// §8.3 "disable AND point to CB" notice. Shown when block-detection fires: the overlay disables
// itself for this page and tells the student to use CB's question bank directly. We NEVER retry,
// NEVER call the API — we just link them to CB's own page. Non-verdict; not dismissible (the overlay
// is off for this page). Idempotent. HTML goes through Plan 2's single `html()` policy.
export function renderBlockNotice(root: ShadowRoot): void {
  if (root.getElementById(BLOCK_NOTICE_ID)) return; // idempotent
  const el = root.ownerDocument!.createElement('div');
  el.id = BLOCK_NOTICE_ID;
  el.setAttribute('role', 'status');
  el.innerHTML = html(`
    <div class="fp-banner">
      <span class="fp-banner-text">Focused Practice is paused on this page. Use the question bank directly on CB:</span>
      <a class="fp-banner-link" href="https://satsuiteeducatorquestionbank.collegeboard.org/" target="_blank" rel="noopener noreferrer">Open the College Board question bank</a>
    </div>`) as string;
  root.appendChild(el);
}
