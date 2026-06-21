import 'fake-indexeddb/auto';
import { describe, it, expect, vi } from 'vitest';
import { indexedDB } from 'fake-indexeddb';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { planResume, scrollToResume, resumeSession, nextRandomId } from './resume';
import { shuffleIds } from '../order';
import { openStore, saveSession } from '../store';
import { makeSession } from '../model';
import type { Session } from '../types';

const here = dirname(fileURLToPath(import.meta.url));
function loadList(): Element {
  document.body.innerHTML = readFileSync(join(here, '..', 'cb', '__fixtures__', 'results-list.html'), 'utf8');
  return document.querySelector('.results-page')!;
}

async function freshDb() {
  await new Promise<void>((res) => { const r = indexedDB.deleteDatabase('sat-overlay'); r.onsuccess = () => res(); r.onerror = () => res(); });
  return openStore();
}

function session(o: Partial<Session>): Session {
  return { sessionId: 's', filterContext: 'SAT|Math|Algebra|Hard', orderMode: 'list', shuffleSeed: 0,
    lastQuestionId: null, userId: null, deviceId: 'd', createdAt: 't', updatedAt: 't',
    deleted: false, dirty: false, schemaVersion: 1, ...o };
}

describe('planResume', () => {
  it('list mode: keeps CB list order and reports the resume index', () => {
    const plan = planResume(session({ orderMode: 'list', lastQuestionId: 'ef56ab78' }), ['ab12cd34', 'ef56ab78', '99ff00aa']);
    expect(plan.order).toEqual(['ab12cd34', 'ef56ab78', '99ff00aa']);
    expect(plan.resumeId).toBe('ef56ab78');
    expect(plan.resumeIndex).toBe(1);
  });

  it('random mode: rebuilds order from shuffleSeed via shuffleIds (contract §2.3)', () => {
    const ids = ['ab12cd34', 'ef56ab78', '99ff00aa'];
    const plan = planResume(session({ orderMode: 'random', shuffleSeed: 7, lastQuestionId: ids[2] }), ids);
    expect(plan.order).toEqual(shuffleIds(ids, 7));                 // reconstructed deterministically
    expect(plan.resumeIndex).toBe(plan.order.indexOf(ids[2]!));     // index within the rebuilt order
  });

  it('reports resumeIndex -1 when lastQuestionId is no longer in the loaded results', () => {
    const plan = planResume(session({ orderMode: 'list', lastQuestionId: 'gone' }), ['ab12cd34', 'ef56ab78']);
    expect(plan.resumeIndex).toBe(-1);
  });
});

describe('scrollToResume', () => {
  it('scrolls the row whose Question ID matches and returns it', () => {
    const root = loadList();
    const target = root.querySelector('.result-row')!; // ab12cd34 row
    const spy = vi.spyOn(target, 'scrollIntoView').mockImplementation(() => {});
    const node = scrollToResume(root, 'ab12cd34');
    expect(node).toBe(target);
    expect(spy).toHaveBeenCalledOnce();
  });

  it('returns null when the target id is not present in the list', () => {
    const root = loadList();
    expect(scrollToResume(root, 'not-loaded')).toBeNull();
  });
});

// Issue #31: random mode follows shuffleIds(loadedIds, seed) by GUIDED scrolling (no auto-load, no
// id-navigation). nextRandomId is the pure seam content.ts uses to pick the row to scroll into view.
describe('nextRandomId (issue #31 — guided shuffle order)', () => {
  const ids = ['ab12cd34', 'ef56ab78', '99ff00aa', 'dead0001'];
  const seed = 7;

  it('returns the shuffled-order id at the given position (seed-agnostic via shuffleIds)', () => {
    const order = shuffleIds(ids, seed);   // deterministic reference order — never assume a literal
    expect(nextRandomId(seed, ids, 0)).toBe(order[0]);
    expect(nextRandomId(seed, ids, 1)).toBe(order[1]);
    expect(nextRandomId(seed, ids, ids.length - 1)).toBe(order[ids.length - 1]);
  });

  it('returns null once the position runs past the end of the order', () => {
    expect(nextRandomId(seed, ids, ids.length)).toBeNull();
    expect(nextRandomId(seed, ids, ids.length + 5)).toBeNull();
  });

  it('returns null for an empty list of loaded ids', () => {
    expect(nextRandomId(seed, [], 0)).toBeNull();
  });
});

describe('resumeSession (contract §2.3 read protocol)', () => {
  it('reads getSession, rebuilds the order, and scrolls to lastQuestionId', async () => {
    const db = await freshDb();
    const s = makeSession({ deviceId: 'd', filterContext: 'SAT|Math|Algebra|Hard', orderMode: 'random', shuffleSeed: 7 });
    s.lastQuestionId = 'ef56ab78';
    await saveSession(db, s);

    const root = loadList();
    const target = root.querySelector('.result-row:nth-child(2)') as Element; // ef56ab78 row
    const spy = vi.spyOn(target, 'scrollIntoView').mockImplementation(() => {});

    const result = await resumeSession(db, root, 'SAT|Math|Algebra|Hard');
    expect(result).not.toBeNull();
    expect(result!.plan.order).toEqual(shuffleIds(['ab12cd34', 'ef56ab78', '99ff00aa'], 7)); // rebuilt from seed
    expect(result!.scrolledTo).toBe(target);
    expect(spy).toHaveBeenCalledOnce();
  });

  it('returns null when there is no saved session for the filter (nothing to resume)', async () => {
    const db = await freshDb();
    expect(await resumeSession(db, loadList(), 'SAT|Math|Algebra|Hard')).toBeNull();
  });
});
