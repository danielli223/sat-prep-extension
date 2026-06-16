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
