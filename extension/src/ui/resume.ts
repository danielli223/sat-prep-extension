import type { IDBPDatabase } from 'idb';
import { shuffleIds } from '../order';
import { getSession } from '../store';
import { readListQuestionIds } from '../cb/list-reader';
import type { Session } from '../types';

// Guided resume (spec D9, contract §2.3). We never auto-advance or fetch — we reconstruct the
// session's question ORDER (deterministically, from the persisted shuffleSeed) and point the
// student back to where they were by scrolling that row into view via the badger's node lookup.
export interface ResumePlan {
  order: string[];        // the session's order over the currently-loaded results
  resumeId: string | null;
  resumeIndex: number;    // index of resumeId within `order`; -1 if it's no longer loaded
}

export interface ResumeResult {
  session: Session;
  plan: ResumePlan;
  scrolledTo: Element | null;   // the row we scrolled into view, or null if lastQuestionId isn't loaded
}

export function planResume(session: Session, currentListIds: string[]): ResumePlan {
  const order = session.orderMode === 'random'
    ? shuffleIds(currentListIds, session.shuffleSeed)   // contract §2.3: rebuild from the seed
    : [...currentListIds];
  const resumeId = session.lastQuestionId;
  const resumeIndex = resumeId === null ? -1 : order.indexOf(resumeId);
  return { order, resumeId, resumeIndex };
}

// Issue #31: random mode follows shuffleIds(loadedIds, seed) by GUIDED scrolling (the Resume posture) —
// never by auto-loading or id-navigating CB (bright lines #1 & #4). This is the pure seam content.ts
// uses to pick the next row to scroll into view; null past the end / for an empty loaded list.
export function nextRandomId(seed: number, currentListIds: string[], position: number): string | null {
  return shuffleIds(currentListIds, seed)[position] ?? null;
}

/** Scroll the results row for `id` into view (guided resume). Returns the row node, or null. */
export function scrollToResume(listRoot: Element, id: string): Element | null {
  const row = readListQuestionIds(listRoot).find((r) => r.id === id);
  if (!row) return null;
  row.node.scrollIntoView({ behavior: 'smooth', block: 'center' });
  return row.node;
}

// Issue #76: open the question for `id` by clicking that row's OWN already-rendered CB open affordance
// (`.id-column button` — the same kind of in-DOM CB button clickCbNext actuates). A user-initiated click
// on an existing node: no fetch, no enumeration, no prefetch (bright lines #1/#4). Unknown id → null
// (click nothing); a row with no button falls back to scrolling it into view. The `.id-column button`
// selector is CB-shape knowledge, kept here beside the existing list-reader row lookup.
export function openListQuestion(listRoot: Element, id: string): Element | null {
  const row = readListQuestionIds(listRoot).find((r) => r.id === id);
  if (!row) return null;
  const btn = row.node.querySelector('.id-column button');
  if (btn) {
    (btn as HTMLElement).click();
    return row.node;
  }
  scrollToResume(listRoot, id);   // fallback: at least bring the row into view
  return row.node;
}

// Contract §2.3 READ protocol — the single entry point the content script calls on Resume.
// Reads the persisted session for this filter, rebuilds its order from shuffleSeed, and scrolls to
// lastQuestionId. Returns null when there is no session to resume.
export async function resumeSession(
  db: IDBPDatabase, listRoot: Element, filterContext: string,
): Promise<ResumeResult | null> {
  const session = await getSession(db, filterContext);
  if (!session) return null;
  const ids = readListQuestionIds(listRoot).map((r) => r.id);
  const plan = planResume(session, ids);
  const scrolledTo = plan.resumeId ? scrollToResume(listRoot, plan.resumeId) : null;
  return { session, plan, scrolledTo };
}
