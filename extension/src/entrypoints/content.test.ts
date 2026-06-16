import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { indexedDB } from 'fake-indexeddb';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runLoop } from './content';
import { openStore, getAttempts, getNotes, getSession } from '../store';

const here = dirname(fileURLToPath(import.meta.url));
const mc = readFileSync(join(here, '..', 'cb', '__fixtures__', 'multiple-choice.html'), 'utf8');

async function freshDb() {
  await new Promise<void>((res) => { const r = indexedDB.deleteDatabase('sat-overlay'); r.onsuccess = () => res(); r.onerror = () => res(); });
  return openStore();
}

beforeEach(() => { document.body.innerHTML = ''; history.replaceState({}, '', '/digital/results'); });

describe('content loop wiring', () => {
  it('Start → Check(correct) records one attempt, writes the session, and headers "Q n of N"', async () => {
    const db = await freshDb();
    // CB's loaded results list (10 rows) is on the page BEFORE Start, so N = 10 for the header.
    const rows = Array.from({ length: 10 }, () => '<tr><td>row</td></tr>').join('');
    document.body.innerHTML += `<table class="results-list"><tbody>${rows}</tbody></table>`;

    const shadow = await runLoop(document, db, 'dev-1');
    (shadow.querySelector('.fp-start-list') as HTMLElement).click();      // user-gated start

    document.body.innerHTML += mc;                                        // CB renders a question
    await vi.waitFor(() => expect(shadow.querySelector('.fp-card')).not.toBeNull());

    // header is "Q n of N" (N = loaded results), NOT "Q n of n".
    expect(shadow.querySelector('.fp-progress')!.textContent).toContain('Q 1 of 10');

    (shadow.querySelector('.fp-choice[data-letter="B"] .fp-pick') as HTMLElement).click();
    (shadow.querySelector('.fp-check') as HTMLElement).click();

    const attempts = await getAttempts(db);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]!.questionId).toBe('ab12cd34');
    expect(attempts[0]!.pick).toBe('B');
    expect(attempts[0]!.correct).toBe(true);
    expect(shadow.querySelector('.fp-choice[data-letter="B"]')!.classList.contains('fp-correct')).toBe(true);

    const session = await getSession(db, 'SAT|Math|Algebra|Hard');
    expect(session!.orderMode).toBe('list');
    expect(session!.shuffleSeed).toBe(0);
  });

  it('NEVER-GUESS: when the answer is unreadable, no attempt is recorded and no verdict shows', async () => {
    const db = await freshDb();
    const shadow = await runLoop(document, db, 'dev-1');
    (shadow.querySelector('.fp-start-list') as HTMLElement).click();

    // A question CB rendered WITHOUT its rationale → the frozen reader returns correctAnswer === null
    // (answer unreadable). DOM shape matches Plan 1's frozen reader/observer contract (.cb-dialog-container
    // + h4 Question ID + table.cb-table meta + choices) but omits .rationale, so the answer is unreadable.
    document.body.innerHTML +=
      '<div role="dialog" class="cb-modal-container"><div class="cb-dialog-container">' +
      '<div class="cb-dialog-header"><h4>Question ID: dead9999</h4></div>' +
      '<div class="cb-dialog-content">' +
      '<table class="cb-table"><tbody>' +
      '<tr><th>Assessment</th><th>Section</th><th>Domain</th><th>Skill</th><th>Difficulty</th></tr>' +
      '<tr><td>SAT</td><td>Math</td><td>Algebra</td><td>S</td><td>Hard</td></tr></tbody></table>' +
      '<div class="question-content"><div class="question">stem [SYNTHETIC]</div></div>' +
      '<div class="answer-choices"><ul><li>a</li><li>b</li><li>c</li><li>d</li></ul></div>' +
      '</div></div></div>';   // no .rationale node → correctAnswer unreadable (null)
    await vi.waitFor(() => expect(shadow.querySelector('.fp-card')).not.toBeNull());

    (shadow.querySelector('.fp-check') as HTMLElement).click();
    expect(await getAttempts(db)).toHaveLength(0);
    expect(shadow.querySelector('.fp-correct')).toBeNull();
    expect(shadow.querySelector('.fp-wrong')).toBeNull();
  });

  it('records ONE attempt even when Check is clicked repeatedly (no duplicate attempts)', async () => {
    const db = await freshDb();
    document.body.innerHTML += '<table class="results-list"><tbody><tr><td>row</td></tr></tbody></table>';
    const shadow = await runLoop(document, db, 'dev-1');
    (shadow.querySelector('.fp-start-list') as HTMLElement).click();

    document.body.innerHTML += mc;
    await vi.waitFor(() => expect(shadow.querySelector('.fp-card')).not.toBeNull());

    (shadow.querySelector('.fp-choice[data-letter="B"] .fp-pick') as HTMLElement).click();
    const check = shadow.querySelector('.fp-check') as HTMLElement;
    check.click();
    check.click();
    check.click();

    // makeAttempt mints a fresh attemptId each call; without a per-question guard, three clicks would
    // write three attempts and silently corrupt Plan 3's deriveStats. Exactly one must be recorded.
    expect(await getAttempts(db)).toHaveLength(1);
  });

  it('note change saves a note; Next updates session.lastQuestionId', async () => {
    const db = await freshDb();
    const shadow = await runLoop(document, db, 'dev-1');
    (shadow.querySelector('.fp-start-list') as HTMLElement).click();
    document.body.innerHTML += mc;
    await vi.waitFor(() => expect(shadow.querySelector('.fp-card')).not.toBeNull());

    const note = shadow.querySelector('.fp-note') as HTMLTextAreaElement;
    note.value = 'missed the trap'; note.dispatchEvent(new Event('change'));
    (shadow.querySelector('.fp-next') as HTMLElement).click();

    expect((await getNotes(db))[0]!.text).toBe('missed the trap');
    expect((await getSession(db, 'SAT|Math|Algebra|Hard'))!.lastQuestionId).toBe('ab12cd34');
  });

  it('Start dismisses the start panel so the student can open a CB question', async () => {
    const db = await freshDb();
    const shadow = await runLoop(document, db, 'dev-1');
    expect(shadow.querySelector('.fp-start')).not.toBeNull();   // panel shown on boot
    (shadow.querySelector('.fp-start-list') as HTMLElement).click();
    expect(shadow.querySelector('.fp-start')).toBeNull();       // cleared so CB is reachable
    expect(shadow.querySelector('.fp-card')).toBeNull();        // no question opened yet
  });

  it('Next clears the card so the student can navigate CB to the next question', async () => {
    const db = await freshDb();
    const shadow = await runLoop(document, db, 'dev-1');
    (shadow.querySelector('.fp-start-list') as HTMLElement).click();
    document.body.innerHTML += mc;
    await vi.waitFor(() => expect(shadow.querySelector('.fp-card')).not.toBeNull());
    (shadow.querySelector('.fp-next') as HTMLElement).click();
    await vi.waitFor(() => expect(shadow.querySelector('.fp-card')).toBeNull());
  });

  it('headers "Q n of N" from the live cb-table-react results list', async () => {
    const db = await freshDb();
    document.body.innerHTML +=
      '<table class="cb-table-react"><tbody>' +
      Array.from({ length: 5 }, () => '<tr><td>q</td></tr>').join('') + '</tbody></table>';
    const shadow = await runLoop(document, db, 'dev-1');
    (shadow.querySelector('.fp-start-list') as HTMLElement).click();
    document.body.innerHTML += mc;
    await vi.waitFor(() => expect(shadow.querySelector('.fp-card')).not.toBeNull());
    expect(shadow.querySelector('.fp-progress')!.textContent).toContain('Q 1 of 5');
  });
});

// Spike addendum (2026-06-15): CB injects the correct answer into the DOM ONLY once its
// "Show correct answer and explanation" control is checked. The QuestionView captured when the modal
// first appeared predates that reveal (correctAnswer === null), so the loop MUST (a) trigger the
// reveal when a question is shown and (b) re-read the answer AT CHECK TIME from the live container —
// never the stale view.correctAnswer. This suite locks both behaviors.
describe('content loop — reveal-gated scoring (spike 2026-06-15)', () => {
  // CB's modal WITHOUT the rationale (answer absent), plus the reveal checkbox. The reader returns
  // correctAnswer === null here, exactly like the live first paint before reveal.
  const unrevealedModal = `
    <div role="dialog" class="cb-modal-container">
      <div class="cb-dialog-container">
        <div class="cb-dialog-header"><h4>Question ID: ab12cd34</h4></div>
        <div class="cb-dialog-content">
          <table class="cb-table"><tbody>
            <tr><th>Assessment</th><th>Section</th><th>Domain</th><th>Skill</th><th>Difficulty</th></tr>
            <tr><td>SAT</td><td>Math</td><td>Algebra</td><td>Linear equations</td><td>Hard</td></tr>
          </tbody></table>
          <div class="question-content"><div class="question">If 3x + 7 = 22, x = ? [SYNTHETIC]</div></div>
          <div class="answer-content">
            <div class="answer-choices"><ul><li>3</li><li>5</li><li>7</li><li>15</li></ul></div>
            <label class="hide-rationale-checkbox"><input type="checkbox" /> Show correct answer and explanation</label>
            <div class="rationale-slot"></div>
          </div>
        </div>
      </div>
    </div>`;

  it('triggers CB reveal on show AND reads the correct answer at CHECK time, not from the stale view', async () => {
    const db = await freshDb();
    const shadow = await runLoop(document, db, 'dev-1');
    (shadow.querySelector('.fp-start-list') as HTMLElement).click();

    // The first paint has NO rationale → view.correctAnswer is null. The loop's ensureAnswerRevealed
    // must check the reveal box; we wire that box to inject CB's rationale (the live behavior).
    document.body.innerHTML += unrevealedModal;
    const box = document.querySelector('.hide-rationale-checkbox input') as HTMLInputElement;
    box.addEventListener('change', () => {
      if (box.checked && !document.querySelector('.rationale')) {
        const slot = document.querySelector('.rationale-slot') as HTMLElement;
        slot.innerHTML =
          '<div class="rationale"><p>Correct Answer: B</p><div>Subtract 7, divide by 3.</div></div>';
      }
    });

    await vi.waitFor(() => expect(shadow.querySelector('.fp-card')).not.toBeNull());
    // The loop must have actuated the reveal box on show.
    expect(box.checked).toBe(true);
    expect(document.querySelector('.rationale')).not.toBeNull();

    // Pick B and Check. Scoring can only succeed if the loop re-read the answer at check time from the
    // live DOM — the QuestionView captured on show carried correctAnswer === null.
    (shadow.querySelector('.fp-choice[data-letter="B"] .fp-pick') as HTMLElement).click();
    (shadow.querySelector('.fp-check') as HTMLElement).click();

    const attempts = await getAttempts(db);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]!.correct).toBe(true);
    expect(shadow.querySelector('.fp-choice[data-letter="B"]')!.classList.contains('fp-correct')).toBe(true);
  });

  it('reveals CB explanation read LIVE from the post-reveal DOM, not the stale observe-time snapshot', async () => {
    const db = await freshDb();
    const shadow = await runLoop(document, db, 'dev-1');
    (shadow.querySelector('.fp-start-list') as HTMLElement).click();

    // First paint has NO rationale (view.explanation === null at observe time). The reveal box wiring
    // injects CB's rationale only after ensureAnswerRevealed clicks it — exactly the live reveal-gated
    // flow. The loop must re-read the explanation at click time, never the null observe-time snapshot.
    document.body.innerHTML += unrevealedModal;
    const box = document.querySelector('.hide-rationale-checkbox input') as HTMLInputElement;
    box.addEventListener('change', () => {
      if (box.checked && !document.querySelector('.rationale')) {
        const slot = document.querySelector('.rationale-slot') as HTMLElement;
        slot.innerHTML =
          '<div class="rationale"><p>Correct Answer: B</p><div>Subtract 7, divide by 3. [SYNTHETIC]</div></div>';
      }
    });

    await vi.waitFor(() => expect(shadow.querySelector('.fp-card')).not.toBeNull());

    // Reveal explanation BEFORE any Check. The explanation was null at observe time but is now live in
    // the DOM; the card must show CB's actual words, not "No explanation available".
    (shadow.querySelector('.fp-reveal') as HTMLElement).click();
    const panel = shadow.querySelector('.fp-explanation')!;
    expect(panel.textContent).toContain('Subtract 7');
    expect(panel.textContent).not.toContain('No explanation available');
  });
});

// --- Plan 3 additions (badger + panel toggle + coachmark + resume) ---
import { refreshBadges, mountPanelToggle, bindPanelCoachmarks, resumeFor, handleMessage } from './content';
import { HOST_ID } from '../ui/host';
import { recordAttempt, saveSession } from '../store';
import { makeAttempt, makeSession } from '../model';

// INPUT fixture conformed to the FROZEN list-reader contract (table.cb-table-react, bare 8-hex in
// td.id-column) so readListQuestionIds actually yields the two rows — data only, no assertion change.
const LIST = `<div class="results-page"><table class="cb-table-react"><tbody>
  <tr class="result-row"><td class="checked-column"></td><td class="id-column"><button class="cb-btn">ab12cd34</button></td></tr>
  <tr class="result-row"><td class="checked-column"></td><td class="id-column"><button class="cb-btn">ef56ab78</button></td></tr>
</tbody></table></div>`;

describe('content wiring (Plan 3)', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('refreshBadges reads the store and badges the on-screen list', async () => {
    const db = await freshDb();
    await recordAttempt(db, makeAttempt({ deviceId: 'd', questionId: 'ab12cd34', section: 'Math', domain: 'Algebra', skill: 'X', difficulty: 'Hard', pick: 'B', correct: false }));
    document.body.innerHTML = LIST;
    await refreshBadges(db, document.querySelector('.results-page')!);
    const chips = document.querySelectorAll('.fp-badge');
    expect(chips).toHaveLength(2);
    expect(chips[0]!.getAttribute('data-state')).toBe('missed');   // ab12cd34 was missed
    expect(chips[1]!.getAttribute('data-state')).toBe('new');      // ef56ab78 unseen
  });

  it('mountPanelToggle adds a single toggle button (idempotent)', () => {
    mountPanelToggle(document);
    mountPanelToggle(document);
    expect(document.querySelectorAll('.fp-panel-toggle')).toHaveLength(1);
  });

  it('bindPanelCoachmarks: clicking a Practice link drops a coachmark whose confirm re-badges', async () => {
    const db = await freshDb();
    document.body.innerHTML = LIST;
    const hostEl = document.createElement('div'); document.body.appendChild(hostEl);
    const host = hostEl.attachShadow({ mode: 'open' });
    host.innerHTML = '<a class="fp-practice-link" data-skill="Inferences" href="#">Practice Inferences on CB</a>';

    bindPanelCoachmarks(host, db, document.querySelector('.results-page')!);
    (host.querySelector('a.fp-practice-link') as HTMLElement).click();
    const mark = host.querySelector('.fp-coachmark')!;
    expect(mark.textContent).toContain('Inferences');             // coachmark names the skill to filter
    (host.querySelector('.fp-coachmark-confirm') as HTMLElement).click();
    expect(document.querySelectorAll('.fp-badge').length).toBe(2); // confirm re-ran the badger (highlight)
  });

  it('resumeFor reads getSession and scrolls to lastQuestionId (contract §2.3)', async () => {
    const db = await freshDb();
    const s = makeSession({ deviceId: 'd', filterContext: 'SAT|Math|Algebra|Hard', orderMode: 'list', shuffleSeed: 0 });
    s.lastQuestionId = 'ef56ab78';
    await saveSession(db, s);
    document.body.innerHTML = LIST;
    const result = await resumeFor(db, document.querySelector('.results-page')!, 'SAT|Math|Algebra|Hard');
    expect(result).not.toBeNull();
    expect(result!.plan.resumeId).toBe('ef56ab78');
  });

  it('handleMessage("open-journal") mounts the panel into the shared host', async () => {
    const db = await freshDb();
    await handleMessage(db, { type: 'open-journal' });
    // The shared host carries id HOST_ID; the panel section lands inside its shadow root.
    const host = document.getElementById(HOST_ID);
    expect(host).not.toBeNull();
    expect(host!.shadowRoot!.querySelector('.fp-panel')).not.toBeNull();
  });

  it('handleMessage ignores unrelated message types', async () => {
    const db = await freshDb();
    await handleMessage(db, { type: 'something-else' });
    expect(document.getElementById(HOST_ID)).toBeNull();
  });
});
