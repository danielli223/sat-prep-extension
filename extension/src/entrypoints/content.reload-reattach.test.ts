import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { indexedDB } from 'fake-indexeddb';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runLoop } from './content';
import { openStore, saveSession } from '../store';
import { makeSession } from '../model';

// SYNTHETIC fixture only — Question ID ab12cd34, filterContext SAT|Math|Algebra|Hard. Never real CB text.
const here = dirname(fileURLToPath(import.meta.url));
const mc = readFileSync(join(here, '..', 'cb', '__fixtures__', 'multiple-choice.html'), 'utf8');

async function freshDb() {
  await new Promise<void>((res) => { const r = indexedDB.deleteDatabase('sat-overlay'); r.onsuccess = () => res(); r.onerror = () => res(); });
  return openStore();
}

// The overlay mounts INSIDE CB's live .answer-content. `null` until it is mounted; looked up fresh each call.
function overlay(): ShadowRoot | null {
  return document.querySelector('.answer-content .fp-answer-host')?.shadowRoot ?? null;
}
function inOverlay(sel: string): Element | null {
  return overlay()?.querySelector(sel) ?? null;
}

// NOTE: this lives in its own file (not content.test.ts) ON PURPOSE. content.test.ts's many
// runLoop+Start tests leak live MutationObserver instances on document.body that never get torn down;
// any of them would mount our overlay over a freshly-injected modal and FALSELY pass a boot-reattach
// test. A fresh file gets a fresh global document with no leaked observers, so the only thing that can
// mount the overlay here is runLoop's own boot re-attach — which is exactly the behavior under test.
beforeEach(() => { document.body.innerHTML = ''; history.replaceState({}, '', '/digital/results'); });

describe('content loop — reload mid-question re-attaches the overlay on boot (#30)', () => {
  it('re-mounts the overlay over an already-present question when a resumable session exists — no Start/Resume click', async () => {
    const db = await freshDb();

    // (2) A resumable session for the filterContext the open modal carries, pointing at that question —
    // exactly as the "practice_resumed" test sets one up.
    const s = makeSession({ deviceId: 'dev-1', filterContext: 'SAT|Math|Algebra|Hard', orderMode: 'list', shuffleSeed: 0 });
    s.lastQuestionId = 'ab12cd34';
    await saveSession(db, s);

    // (1) CB's question modal (Question ID ab12cd34) is already settled on the page at boot — the
    // reload-mid-question scenario: CB re-rendered its native (unstyled) modal, our overlay is gone.
    document.body.innerHTML += mc;

    // Invariant #4 guard: an ENABLED CB "Next" sits on the page. Boot re-attach is inert re-decoration
    // and must NEVER actuate a question transition. clickCbNext targets the first enabled button whose
    // text is exactly "Next"; spy on this exact button and assert the re-attach never clicks it.
    const next = document.createElement('button');
    next.textContent = 'Next';
    document.body.appendChild(next);
    let nextClicks = 0;
    next.addEventListener('click', () => { nextClicks++; });

    // Boot. No Start, no Resume — just the fresh page load.
    await runLoop(document, db, 'dev-1');

    // Our overlay re-mounts automatically inside CB's .answer-content (observer settles on a debounce).
    await vi.waitFor(() => expect(document.querySelector('.answer-content .fp-answer-host')).not.toBeNull());
    expect(inOverlay('.fp-choice')).not.toBeNull();   // our interaction rendered over the live question

    expect(nextClicks).toBe(0);   // §invariant #4: boot re-attach never auto-advances / enumerates
  });
});
