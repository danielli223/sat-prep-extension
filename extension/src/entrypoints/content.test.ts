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
const gridIn = readFileSync(join(here, '..', 'cb', '__fixtures__', 'grid-in.html'), 'utf8');

async function freshDb() {
  await new Promise<void>((res) => { const r = indexedDB.deleteDatabase('sat-overlay'); r.onsuccess = () => res(); r.onerror = () => res(); });
  return openStore();
}

// The overlay now mounts INSIDE CB's live .answer-content (not the body host). These helpers reach the
// overlay's shadow root in the live document; `null` until the overlay is mounted. We look it up fresh
// each call because CB can replace .answer-content on its in-place Next.
function overlay(): ShadowRoot | null {
  return document.querySelector('.answer-content .fp-answer-host')?.shadowRoot ?? null;
}
function inOverlay(sel: string): Element | null {
  return overlay()?.querySelector(sel) ?? null;
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
    // The overlay mounts INSIDE CB's .answer-content (not the body host).
    await vi.waitFor(() => expect(document.querySelector('.answer-content .fp-answer-host')).not.toBeNull());
    expect(inOverlay('.fp-choice')).not.toBeNull();   // our interaction rendered in CB's answer region

    // header is "Q n of N" (N = loaded results), NOT "Q n of n".
    expect(inOverlay('.fp-progress')!.textContent).toContain('Q 1 of 10');

    (inOverlay('.fp-choice[data-letter="B"] .fp-pick') as HTMLElement).click();
    (inOverlay('.fp-check') as HTMLElement).click();

    const attempts = await getAttempts(db);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]!.questionId).toBe('ab12cd34');
    expect(attempts[0]!.pick).toBe('B');
    expect(attempts[0]!.correct).toBe(true);
    // data-correct stamping integration: the correct choice goes green on the overlay shadow.
    expect(inOverlay('.fp-choice[data-letter="B"]')!.classList.contains('fp-correct')).toBe(true);

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
    // + h4 Question ID + table.cb-table meta + choices, inside .answer-content) but omits .rationale AND
    // the reveal box, so the answer is permanently unreadable (poll finds nothing).
    document.body.innerHTML +=
      '<div role="dialog" class="cb-modal-container"><div class="cb-dialog-container">' +
      '<div class="cb-dialog-header"><h4>Question ID: dead9999</h4></div>' +
      '<div class="cb-dialog-content">' +
      '<table class="cb-table"><tbody>' +
      '<tr><th>Assessment</th><th>Section</th><th>Domain</th><th>Skill</th><th>Difficulty</th></tr>' +
      '<tr><td>SAT</td><td>Math</td><td>Algebra</td><td>S</td><td>Hard</td></tr></tbody></table>' +
      '<div class="question-content"><div class="question">stem [SYNTHETIC]</div></div>' +
      '<div class="answer-content"><div class="answer-choices"><ul><li>a</li><li>b</li><li>c</li><li>d</li></ul></div></div>' +
      '</div></div></div>';   // no .rationale node → correctAnswer unreadable (null)
    await vi.waitFor(() => expect(document.querySelector('.answer-content .fp-answer-host')).not.toBeNull());

    (inOverlay('.fp-choice[data-letter="A"] .fp-pick') as HTMLElement).click();   // a pick, but the answer is unreadable
    (inOverlay('.fp-check') as HTMLElement).click();
    // The loop polls ~1s for a never-arriving rationale, then shows the non-verdict "couldn't grade".
    await vi.waitFor(() => expect(inOverlay('.fp-indeterminate')).not.toBeNull(), { timeout: 2500 });
    expect(await getAttempts(db)).toHaveLength(0);
    expect(inOverlay('.fp-correct')).toBeNull();
    expect(inOverlay('.fp-wrong')).toBeNull();
  });

  it('records ONE attempt even when Check is clicked repeatedly (no duplicate attempts)', async () => {
    const db = await freshDb();
    document.body.innerHTML += '<table class="results-list"><tbody><tr><td>row</td></tr></tbody></table>';
    const shadow = await runLoop(document, db, 'dev-1');
    (shadow.querySelector('.fp-start-list') as HTMLElement).click();

    document.body.innerHTML += mc;
    await vi.waitFor(() => expect(document.querySelector('.answer-content .fp-answer-host')).not.toBeNull());

    (inOverlay('.fp-choice[data-letter="B"] .fp-pick') as HTMLElement).click();
    const check = inOverlay('.fp-check') as HTMLElement;
    check.click();
    check.click();
    check.click();

    // makeAttempt mints a fresh attemptId each call; without a per-question guard, three clicks would
    // write three attempts and silently corrupt Plan 3's deriveStats. Exactly one must be recorded.
    await vi.waitFor(async () => expect(await getAttempts(db)).toHaveLength(1));
    expect(await getAttempts(db)).toHaveLength(1);
  });

  it('note change saves a note; Next updates session.lastQuestionId', async () => {
    const db = await freshDb();
    const shadow = await runLoop(document, db, 'dev-1');
    (shadow.querySelector('.fp-start-list') as HTMLElement).click();
    document.body.innerHTML += mc;
    await vi.waitFor(() => expect(document.querySelector('.answer-content .fp-answer-host')).not.toBeNull());

    const note = inOverlay('.fp-note') as HTMLTextAreaElement;
    note.value = 'missed the trap'; note.dispatchEvent(new Event('change'));
    (inOverlay('.fp-next') as HTMLElement).click();

    await vi.waitFor(async () => expect((await getNotes(db)).length).toBe(1));
    expect((await getNotes(db))[0]!.text).toBe('missed the trap');
    expect((await getSession(db, 'SAT|Math|Algebra|Hard'))!.lastQuestionId).toBe('ab12cd34');
  });

  it('Start dismisses the start panel so the student can open a CB question', async () => {
    const db = await freshDb();
    const shadow = await runLoop(document, db, 'dev-1');
    expect(shadow.querySelector('.fp-start')).not.toBeNull();   // panel shown on boot (body host)
    (shadow.querySelector('.fp-start-list') as HTMLElement).click();
    expect(shadow.querySelector('.fp-start')).toBeNull();       // cleared so CB is reachable
    expect(overlay()).toBeNull();                               // no question opened → no overlay yet
  });

  it('Next dismisses the overlay when CB has no next question (no CB Next control present)', async () => {
    // Fallback path: with no CB "Next" in the DOM (last item / single-question view), Next removes our
    // overlay host from CB's .answer-content (CB's own question stays put).
    const db = await freshDb();
    const shadow = await runLoop(document, db, 'dev-1');
    (shadow.querySelector('.fp-start-list') as HTMLElement).click();
    document.body.innerHTML += mc;   // no CB "Next" button in this fixture
    await vi.waitFor(() => expect(document.querySelector('.answer-content .fp-answer-host')).not.toBeNull());
    (inOverlay('.fp-next') as HTMLElement).click();
    await vi.waitFor(() => expect(document.querySelector('.answer-content .fp-answer-host')).toBeNull());
  });

  it('Next advances by actuating CB\'s own Next (does not just remove the overlay)', async () => {
    // Our Next should move to the next question, not vanish. It clicks CB's own "Next" control;
    // observeQuestions then re-mounts the overlay for the question CB loads.
    const db = await freshDb();
    const shadow = await runLoop(document, db, 'dev-1');
    (shadow.querySelector('.fp-start-list') as HTMLElement).click();
    document.body.innerHTML += mc;
    const cbNext = document.createElement('button');   // CB's own in-modal Next (light DOM, outside our shadow)
    cbNext.textContent = 'Next';
    const cbNextClicked = vi.fn();
    cbNext.addEventListener('click', cbNextClicked);
    document.body.appendChild(cbNext);
    await vi.waitFor(() => expect(document.querySelector('.answer-content .fp-answer-host')).not.toBeNull());

    (inOverlay('.fp-next') as HTMLElement).click();   // our Next

    await vi.waitFor(() => expect(cbNextClicked).toHaveBeenCalledTimes(1));   // advanced via CB's Next
    expect(document.querySelector('.answer-content .fp-answer-host')).not.toBeNull();   // NOT removed — it follows CB
  });

  it('headers "Q n of N" from the live cb-table-react results list', async () => {
    const db = await freshDb();
    document.body.innerHTML +=
      '<table class="cb-table-react"><tbody>' +
      Array.from({ length: 5 }, () => '<tr><td>q</td></tr>').join('') + '</tbody></table>';
    const shadow = await runLoop(document, db, 'dev-1');
    (shadow.querySelector('.fp-start-list') as HTMLElement).click();
    document.body.innerHTML += mc;
    await vi.waitFor(() => expect(document.querySelector('.answer-content .fp-answer-host')).not.toBeNull());
    expect(inOverlay('.fp-progress')!.textContent).toContain('Q 1 of 5');
  });

  it('reads N at SHOW time, so "Q n of N" is right even if the list was not in the DOM at Start', async () => {
    // Live 2026-06-16: starting before the list rendered (or from a single-question view) left N at the
    // fallback 1 → "Q 2 of 1". The list is in the DOM behind the modal by show time; read it then.
    const db = await freshDb();
    const shadow = await runLoop(document, db, 'dev-1');   // NO list present at Start
    (shadow.querySelector('.fp-start-list') as HTMLElement).click();
    document.body.innerHTML +=
      '<table class="cb-table-react"><tbody>' +
      Array.from({ length: 7 }, () => '<tr><td>q</td></tr>').join('') + '</tbody></table>';
    document.body.innerHTML += mc;                          // list + question arrive after Start
    await vi.waitFor(() => expect(document.querySelector('.answer-content .fp-answer-host')).not.toBeNull());
    expect(inOverlay('.fp-progress')!.textContent).toContain('Q 1 of 7');   // not "Q 1 of 1"
  });

  it('Check with no answer prompts to answer (NOT "couldn\'t grade"), records nothing, and stays re-checkable', async () => {
    const db = await freshDb();
    const shadow = await runLoop(document, db, 'dev-1');
    (shadow.querySelector('.fp-start-list') as HTMLElement).click();
    document.body.innerHTML += mc;
    await vi.waitFor(() => expect(document.querySelector('.answer-content .fp-answer-host')).not.toBeNull());

    (inOverlay('.fp-check') as HTMLElement).click();              // Check WITHOUT selecting a choice
    expect(inOverlay('.fp-need-answer')).not.toBeNull();          // gentle prompt…
    expect(inOverlay('.fp-indeterminate')).toBeNull();            // …not the alarming "couldn't grade"
    expect(await getAttempts(db)).toHaveLength(0);

    // The empty Check did NOT consume the question — answering + re-checking still grades.
    (inOverlay('.fp-choice[data-letter="B"] .fp-pick') as HTMLElement).click();
    (inOverlay('.fp-check') as HTMLElement).click();
    await vi.waitFor(async () => expect(await getAttempts(db)).toHaveLength(1));
    expect(inOverlay('.fp-choice[data-letter="B"]')!.classList.contains('fp-correct')).toBe(true);
  });

  it('refuses to grade a card whose kind disagrees with CB\'s answer (stale card after an in-place swap)', async () => {
    const db = await freshDb();
    const shadow = await runLoop(document, db, 'dev-1');
    (shadow.querySelector('.fp-start-list') as HTMLElement).click();
    // CB swapped a grid-in question in place but left the previous MC question's choices: the card shows
    // MC options while CB's correct answer is a grid-in VALUE (33). Grading the pick would score it
    // against the WRONG question — the loop must refuse, not produce a verdict.
    document.body.innerHTML +=
      '<div role="dialog" class="cb-modal-container"><div class="cb-dialog-container">' +
      '<div class="cb-dialog-header"><h4>Question ID: ab12cd34</h4></div>' +
      '<div class="cb-dialog-content">' +
      '<table class="cb-table"><tbody>' +
      '<tr><th>Assessment</th><th>Section</th><th>Domain</th><th>Skill</th><th>Difficulty</th></tr>' +
      '<tr><td>SAT</td><td>Math</td><td>Algebra</td><td>S</td><td>Hard</td></tr></tbody></table>' +
      '<div class="question-content"><div class="question">stem [SYNTHETIC]</div></div>' +
      '<div class="answer-content"><div class="answer-choices"><ul><li>2</li><li>4</li><li>5</li><li>6</li></ul></div>' +
      '<div class="rationale"><p>Correct Answer: 33</p></div></div>' +
      '</div></div></div>';
    await vi.waitFor(() => expect(document.querySelector('.answer-content .fp-answer-host')).not.toBeNull());

    (inOverlay('.fp-choice[data-letter="C"] .fp-pick') as HTMLElement).click();
    (inOverlay('.fp-check') as HTMLElement).click();

    await vi.waitFor(() => expect(inOverlay('.fp-stale')).not.toBeNull());   // refused as out-of-sync
    expect(inOverlay('.fp-ok')).toBeNull();                                  // no wrong "Correct"…
    expect(inOverlay('.fp-no')).toBeNull();                                  // …or "Not quite"
    expect(inOverlay('.fp-indeterminate')).toBeNull();
    expect(await getAttempts(db)).toHaveLength(0);                                      // nothing recorded
  });

  it('grid-in Check→grade: typing the correct answer grades Correct; wrong answer grades Not quite', async () => {
    // End-to-end grid-in flow using the grid-in.html fixture (ef56ab78, Correct Answer: 5).
    // The fixture has a .rationale already present (no reveal box) and no .answer-choices.
    // The overlay must show a .fp-gridin input, read the typed value at Check, and grade correctly.
    const db = await freshDb();
    const shadow = await runLoop(document, db, 'dev-1');
    (shadow.querySelector('.fp-start-list') as HTMLElement).click();

    // --- Correct answer (5) ---
    document.body.innerHTML += gridIn;
    await vi.waitFor(() => expect(document.querySelector('.answer-content .fp-answer-host')).not.toBeNull());
    // Grid-in: no choices, just the text input.
    expect(inOverlay('.fp-gridin')).not.toBeNull();
    expect(inOverlay('.fp-choice')).toBeNull();

    (inOverlay('.fp-gridin') as HTMLInputElement).value = '5';
    (inOverlay('.fp-check') as HTMLElement).click();

    await vi.waitFor(async () => expect(await getAttempts(db)).toHaveLength(1));
    expect(inOverlay('.fp-verdict')!.textContent).toContain('Correct');
    expect(inOverlay('.fp-ok')).not.toBeNull();
    expect(inOverlay('.fp-indeterminate')).toBeNull();   // stale-card guard NOT tripped on a valid grid-in
    expect(inOverlay('.fp-stale')).toBeNull();
    const attempts = await getAttempts(db);
    expect(attempts[0]!.questionId).toBe('ef56ab78');
    expect(attempts[0]!.pick).toBe('5');
    expect(attempts[0]!.correct).toBe(true);
  });

  it('grid-in Check→grade: wrong answer shows Not quite', async () => {
    const db = await freshDb();
    const shadow = await runLoop(document, db, 'dev-1');
    (shadow.querySelector('.fp-start-list') as HTMLElement).click();

    document.body.innerHTML += gridIn;
    await vi.waitFor(() => expect(document.querySelector('.answer-content .fp-answer-host')).not.toBeNull());

    (inOverlay('.fp-gridin') as HTMLInputElement).value = '7';
    (inOverlay('.fp-check') as HTMLElement).click();

    await vi.waitFor(async () => expect(await getAttempts(db)).toHaveLength(1));
    expect(inOverlay('.fp-verdict')!.textContent).toContain('Not quite');
    expect(inOverlay('.fp-no')).not.toBeNull();
    expect(inOverlay('.fp-stale')).toBeNull();   // stale guard not wrongly tripped for a genuine grid-in wrong answer
    const attempts = await getAttempts(db);
    expect(attempts[0]!.correct).toBe(false);
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

    await vi.waitFor(() => expect(document.querySelector('.answer-content .fp-answer-host')).not.toBeNull());
    // The loop must have actuated the reveal box on show.
    expect(box.checked).toBe(true);
    expect(document.querySelector('.rationale')).not.toBeNull();

    // Pick B and Check. Scoring can only succeed if the loop re-read the answer at check time from the
    // live DOM — the QuestionView captured on show carried correctAnswer === null.
    (inOverlay('.fp-choice[data-letter="B"] .fp-pick') as HTMLElement).click();
    (inOverlay('.fp-check') as HTMLElement).click();

    await vi.waitFor(async () => expect(await getAttempts(db)).toHaveLength(1));
    const attempts = await getAttempts(db);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]!.correct).toBe(true);
    expect(inOverlay('.fp-choice[data-letter="B"]')!.classList.contains('fp-correct')).toBe(true);
  });

  it('Reveal un-hides CB\'s OWN native rationale (CB renders the explanation; we don\'t)', async () => {
    // New architecture: CB renders the question + rationale natively. The overlay HIDES CB's native
    // .rationale on mount; our Reveal button un-hides it (revealRationale) so the student reads CB's
    // actual words in CB's own layout — we never render the explanation ourselves. (Comment-free modal:
    // happy-dom mis-parses the HTML comments in the .html fixture, which corrupts .answer-content's
    // direct-children scan that mountAnswerOverlay's hide loop relies on.)
    const db = await freshDb();
    const shadow = await runLoop(document, db, 'dev-1');
    (shadow.querySelector('.fp-start-list') as HTMLElement).click();

    document.body.innerHTML +=
      '<div role="dialog" class="cb-modal-container"><div class="cb-dialog-container">' +
      '<div class="cb-dialog-header"><h4>Question ID: ab12cd34</h4></div>' +
      '<div class="cb-dialog-content">' +
      '<table class="cb-table"><tbody>' +
      '<tr><th>Assessment</th><th>Section</th><th>Domain</th><th>Skill</th><th>Difficulty</th></tr>' +
      '<tr><td>SAT</td><td>Math</td><td>Algebra</td><td>S</td><td>Hard</td></tr></tbody></table>' +
      '<div class="question-content"><div class="question">If 3x + 7 = 22, x = ? [SYNTHETIC]</div></div>' +
      '<div class="answer-content"><div class="answer-choices"><ul><li>3</li><li>5</li><li>7</li><li>15</li></ul></div>' +
      '<div class="rationale"><p>Correct Answer: B</p><div>Subtract 7, divide by 3. [SYNTHETIC]</div></div>' +
      '</div></div></div></div>';
    await vi.waitFor(() => expect(document.querySelector('.answer-content .fp-answer-host')).not.toBeNull());

    const rationale = document.querySelector('.answer-content .rationale') as HTMLElement;
    expect(rationale.style.display).toBe('none');   // overlay hid CB's native rationale on mount

    (inOverlay('.fp-reveal') as HTMLElement).click();   // Reveal → un-hide CB's own rationale
    expect(rationale.style.display).toBe('');           // now visible, in CB's native layout
    expect(rationale.textContent).toContain('Subtract 7');
  });

  it('polls for CB\'s answer when the rationale lands AFTER Check — no spurious "couldn\'t grade"', async () => {
    // Live 2026-06-16: a grid-in showed "couldn't grade" because CB injects the rationale a moment
    // after the reveal box is checked, and Check read an empty answer. The loop must poll, then grade.
    const db = await freshDb();
    const shadow = await runLoop(document, db, 'dev-1');
    (shadow.querySelector('.fp-start-list') as HTMLElement).click();

    document.body.innerHTML += unrevealedModal;
    const box = document.querySelector('.hide-rationale-checkbox input') as HTMLInputElement;
    box.addEventListener('change', () => {
      if (box.checked && !document.querySelector('.rationale')) {
        setTimeout(() => {   // CB injects the answer ~150ms after the box is checked
          // Idempotent + teardown-safe: a delayed CB injection that fires after the modal is gone (DOM
          // cleared) or after the rationale already landed must no-op, not throw — the loop's recovery
          // re-fires the reveal, so several of these can be queued.
          const slot = document.querySelector('.rationale-slot');
          if (slot && !document.querySelector('.rationale')) {
            slot.innerHTML = '<div class="rationale"><p>Correct Answer: B</p><div>because.</div></div>';
          }
        }, 150);
      }
    });
    await vi.waitFor(() => expect(document.querySelector('.answer-content .fp-answer-host')).not.toBeNull());

    // Pick B and Check immediately — the answer is NOT in the DOM at this instant.
    (inOverlay('.fp-choice[data-letter="B"] .fp-pick') as HTMLElement).click();
    (inOverlay('.fp-check') as HTMLElement).click();

    // The loop polls until the answer lands, then grades — never the indeterminate "couldn't grade".
    await vi.waitFor(async () => { expect(await getAttempts(db)).toHaveLength(1); }, { timeout: 2500 });
    expect(inOverlay('.fp-indeterminate')).toBeNull();
    expect(inOverlay('.fp-choice[data-letter="B"]')!.classList.contains('fp-correct')).toBe(true);
  });

  it('keeps CB\'s ASYNC-injected rationale HIDDEN until Reveal (no inline answer leak)', async () => {
    // Live regression (M1): showQuestion triggers CB's reveal, which injects .rationale ASYNCHRONOUSLY
    // (~150ms later) as a fresh sibling of our host. The old mount hid only the children present AT
    // mount time, so the late .rationale arrived VISIBLE → "Correct Answer: B" showed inline below our
    // choices before the student picked/checked. A MutationObserver on .answer-content must hide it.
    const db = await freshDb();
    const shadow = await runLoop(document, db, 'dev-1');
    (shadow.querySelector('.fp-start-list') as HTMLElement).click();

    // A dedicated unrevealed modal with NO .rationale-slot, so a stale setTimeout queued by an earlier
    // test (which injects into '.rationale-slot') can't pollute this modal — this test owns its DOM.
    // Use a fresh DOM (= not +=) so a stale .rationale from any prior test's setTimeout cannot
    // short-circuit ensureAnswerRevealed before our reveal box fires (test-hygiene fix).
    document.body.innerHTML = `
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
            </div>
          </div>
        </div>
      </div>`;
    const box = document.querySelector('.hide-rationale-checkbox input') as HTMLInputElement;
    const answerContent = document.querySelector('.answer-content') as HTMLElement;
    box.addEventListener('change', () => {
      if (box.checked && !answerContent.querySelector('.rationale')) {
        setTimeout(() => {   // CB injects the rationale ~150ms after the box is checked (the live delay)
          // CB injects .rationale as a DIRECT CHILD of .answer-content (this is the contract both
          // revealRationale and the mount hide loop assume — a child-list insertion the observer sees).
          if (!answerContent.querySelector('.rationale')) {
            const r = document.createElement('div');
            r.className = 'rationale';
            r.innerHTML = '<p>Correct Answer: B</p><div>because.</div>';
            answerContent.appendChild(r);
          }
        }, 150);
      }
    });

    await vi.waitFor(() => expect(document.querySelector('.answer-content .fp-answer-host')).not.toBeNull());

    // Wait for the delayed .rationale to land AND be hidden by the observer (the leak is closed). Assert
    // both in one waitFor: the observer fires async after the injection, so there's a brief window where
    // the node exists but display hasn't been set yet — poll until it settles to display:none.
    await vi.waitFor(() => {
      const r = document.querySelector('.answer-content .rationale') as HTMLElement | null;
      expect(r).not.toBeNull();
      expect(r!.style.display).toBe('none');   // HIDDEN, not leaked inline
    }, { timeout: 2500 });
    const rationale = document.querySelector('.answer-content .rationale') as HTMLElement;

    // Our Reveal button is the SOLE un-hider — only then does CB's answer become visible.
    (inOverlay('.fp-reveal') as HTMLElement).click();
    expect(rationale.style.display).toBe('');
    expect(rationale.textContent).toContain('Correct Answer: B');
  });

  it('RECOVERS when the reveal box reads "checked" but CB never injected the rationale (Q1 desync)', async () => {
    // Live 2026-06-16, "Q 1 of 10": on the first question the modal renders progressively, so the reveal
    // click can land BEFORE CB wires its handler — leaving the box `checked` with NO rationale. The old
    // `if (!box.checked) box.click()` guard then refused to re-trigger (it's already checked), so the
    // answer stayed unreadable forever and a perfectly gradeable question showed a permanent
    // "couldn't grade" + "no explanation". The loop must drive toward the GOAL state (rationale present),
    // not the checkbox state, and un-stick the reveal.
    const db = await freshDb();
    const shadow = await runLoop(document, db, 'dev-1');
    (shadow.querySelector('.fp-start-list') as HTMLElement).click();

    // Modal whose reveal box ALREADY reads `checked` but carries no rationale (the desync end-state).
    // CB injects ONLY on a fresh change→checked, so a box sitting `checked` yields nothing on its own —
    // exactly the live stuck state. The loop must re-toggle it to recover.
    document.body.innerHTML += `
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
              <label class="hide-rationale-checkbox"><input type="checkbox" checked /> Show correct answer and explanation</label>
              <div class="rationale-slot"></div>
            </div>
          </div>
        </div>
      </div>`;
    const box = document.querySelector('.hide-rationale-checkbox input') as HTMLInputElement;
    // Model CB's React value-tracker, which is what made this bug invisible to a naive mock: React only
    // fires onChange when the value differs from what it last TRACKED, and assigning `box.checked = …`
    // (the native setter, which is all the content script's isolated world can reach) does NOT update
    // that tracker. So the reveal must be driven by real CLICKS (which toggle AND emit a tracked change),
    // never by assigning `.checked` — assigning leaves the tracker stale so the next click reads as
    // "no change" and CB never injects. This mock fails the old `.checked = false; click()` approach and
    // passes the click-only fix — exactly the real isolated-world behavior (live 2026-06-16).
    let tracked = box.checked;
    box.addEventListener('change', () => {
      if (box.checked === tracked) return;   // React: value unchanged from tracker → onChange does NOT fire
      tracked = box.checked;
      if (box.checked && !document.querySelector('.rationale')) {
        (document.querySelector('.rationale-slot') as HTMLElement).innerHTML =
          '<div class="rationale"><p>Correct Answer: B</p><div>Subtract 7, divide by 3. [SYNTHETIC]</div></div>';
      }
    });

    await vi.waitFor(() => expect(document.querySelector('.answer-content .fp-answer-host')).not.toBeNull());

    // Pick B (correct) and Check. The loop must un-stick the reveal and grade — never "couldn't grade".
    (inOverlay('.fp-choice[data-letter="B"] .fp-pick') as HTMLElement).click();
    (inOverlay('.fp-check') as HTMLElement).click();

    await vi.waitFor(async () => { expect(await getAttempts(db)).toHaveLength(1); }, { timeout: 2500 });
    expect(inOverlay('.fp-indeterminate')).toBeNull();                                   // NOT "couldn't grade"
    expect((await getAttempts(db))[0]!.correct).toBe(true);
    expect(inOverlay('.fp-choice[data-letter="B"]')!.classList.contains('fp-correct')).toBe(true);
  });
});

// --- Plan 3 additions (badger + panel toggle + coachmark + resume) ---
import { refreshBadges, mountPanelToggle, bindPanelCoachmarks, resumeFor, handleMessage, findResultsList, watchResultsList } from './content';
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

// The LIVE CB results list is a bare `table.cb-table-react` with NO `.results-page` wrapper (spike
// 2026-06-15; list-reader.ts). These cases use that real DOM shape — not the synthetic-only
// `.results-page` — so the badger/resume/coachmark paths are proven against production markup, not a
// fixture-only selector. (INPUT DOM conformed to the frozen list-reader contract.)
const LIVE_LIST = `<table class="cb-table-react"><tbody>
  <tr class="result-row"><td class="checked-column"></td><td class="id-column"><button class="cb-btn">ab12cd34</button></td></tr>
  <tr class="result-row"><td class="checked-column"></td><td class="id-column"><button class="cb-btn">ef56ab78</button></td></tr>
</tbody></table>`;

describe('content wiring against the LIVE cb-table-react DOM (no .results-page wrapper)', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('findResultsList returns the live table.cb-table-react container', () => {
    document.body.innerHTML = LIVE_LIST;
    const list = findResultsList(document);
    expect(list).not.toBeNull();
    expect(list!.tagName).toBe('TABLE');
    expect(list!.classList.contains('cb-table-react')).toBe(true);
  });

  it('refreshBadges badges the real list rows found via findResultsList', async () => {
    const db = await freshDb();
    await recordAttempt(db, makeAttempt({ deviceId: 'd', questionId: 'ab12cd34', section: 'Math', domain: 'Algebra', skill: 'X', difficulty: 'Hard', pick: 'B', correct: false }));
    document.body.innerHTML = LIVE_LIST;
    await refreshBadges(db, findResultsList(document)!);
    const chips = document.querySelectorAll('.fp-badge');
    expect(chips).toHaveLength(2);
    expect(chips[0]!.getAttribute('data-state')).toBe('missed');   // ab12cd34 was missed
    expect(chips[1]!.getAttribute('data-state')).toBe('new');      // ef56ab78 unseen
  });

  it('handleMessage renders the panel and binds a real .fp-practice-link → coachmark → re-badge', async () => {
    const db = await freshDb();
    // One missed attempt → a weak-area row is rendered with a real a.fp-practice-link for its skill.
    await recordAttempt(db, makeAttempt({ deviceId: 'd', questionId: 'ab12cd34', section: 'Math', domain: 'Algebra', skill: 'Inferences', difficulty: 'Hard', pick: 'B', correct: false }));
    document.body.innerHTML = LIVE_LIST;

    await handleMessage(db, { type: 'open-journal' });   // mounts panel AND binds its coachmark links
    const host = document.getElementById(HOST_ID)!.shadowRoot!;
    const link = host.querySelector('a.fp-practice-link') as HTMLElement;
    expect(link).not.toBeNull();   // the panel actually rendered a Practice link

    link.click();                                                  // bound by handleMessage, not boot
    const mark = host.querySelector('.fp-coachmark')!;
    expect(mark.textContent).toContain('Inferences');
    (host.querySelector('.fp-coachmark-confirm') as HTMLElement).click();
    expect(document.querySelectorAll('.fp-badge').length).toBe(2); // confirm re-ran the badger
  });

  it('resumeFor scrolls to lastQuestionId using the live cb-table-react container (D9)', async () => {
    const db = await freshDb();
    const s = makeSession({ deviceId: 'd', filterContext: 'SAT|Math|Algebra|Hard', orderMode: 'list', shuffleSeed: 0 });
    s.lastQuestionId = 'ef56ab78';
    await saveSession(db, s);
    document.body.innerHTML = LIVE_LIST;
    const result = await resumeFor(db, findResultsList(document)!, 'SAT|Math|Algebra|Hard');
    expect(result).not.toBeNull();
    expect(result!.plan.resumeId).toBe('ef56ab78');
    expect(result!.scrolledTo).not.toBeNull();   // the row was found + scrolled in the live DOM
  });

  it('watchResultsList badges the list when CB renders it AFTER boot (list-load trigger, not question-modal)', async () => {
    // Live 2026-06-16: the React list is not in the DOM at document_idle, and the old re-badge trigger
    // (observeQuestions) only fires on question modals — so chips never appeared on the list view.
    const db = await freshDb();
    await recordAttempt(db, makeAttempt({ deviceId: 'd', questionId: 'ab12cd34', section: 'Math', domain: 'Algebra', skill: 'X', difficulty: 'Hard', pick: 'D', correct: true }));
    const stop = watchResultsList(document, db);   // starts with NO list (document_idle, pre-render)
    expect(document.querySelector('.fp-badge')).toBeNull();

    document.body.innerHTML = LIVE_LIST;           // CB renders the results list later
    await vi.waitFor(() => expect(document.querySelector('.fp-badge')).not.toBeNull());

    const chips = document.querySelectorAll('.fp-badge');
    expect(chips).toHaveLength(2);                  // both rows badged; no self-trigger duplicate
    expect(chips[0]!.getAttribute('data-state')).toBe('done');   // ab12cd34 answered correctly
    stop();
  });
});

// --- Plan 4: resilience gate + degraded path (appended; Plan 2/3 suites above are untouched) ---
import { handleQuestion, guardedStart, safeWrite } from './content';
import { isEnabled } from '../resilience/killswitch';
import { detectBlock } from '../resilience/block-detect';
import { BLOCK_NOTICE_ID } from '../resilience/contract-check';
import { mountHost } from '../ui/host';
import * as contract from '../resilience/contract-check';
import type { QuestionView } from '../cb/reader';

vi.mock('../resilience/killswitch', () => ({ isEnabled: vi.fn() }));
vi.mock('../resilience/block-detect', () => ({ detectBlock: vi.fn(() => null), BLOCK_REASON: {} }));

// QuestionView fixture for the §2.4 happy path (the existing Plan 2/3 suites use inline HTML strings,
// not a shared `view` const, so we declare a well-formed view here — INPUT DATA only, no assertion).
const view: QuestionView = {
  id: 'ab12cd34', section: 'Math', domain: 'Algebra', skill: 'Linear equations', difficulty: 'Hard',
  stem: 'stem', choices: [{ letter: 'A', text: '3' }, { letter: 'B', text: '5' }],
  correctAnswer: 'B',
};

describe('content bootstrap gate (§2.5 / §8.3)', () => {
  // Use the REAL Plan 2 mountHost here (not mocked) so we can assert the §8.3 notice actually lands
  // in the single shadow host; only the resilience inputs are mocked.
  beforeEach(() => { vi.clearAllMocks(); document.body.innerHTML = ''; });

  it('does NOT run the loop when the kill-switch is disabled', async () => {
    (isEnabled as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const runner = vi.fn(async () => {});
    await guardedStart(document, runner);
    expect(runner).not.toHaveBeenCalled();
    expect(mountHost(document).getElementById(BLOCK_NOTICE_ID)).toBeNull(); // nothing mounted
  });

  it('does NOT run the loop on a CB block — it mounts the §8.3 "use CB directly" notice instead', async () => {
    (isEnabled as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    (detectBlock as ReturnType<typeof vi.fn>).mockReturnValue('forbidden');
    const runner = vi.fn(async () => {});

    await guardedStart(document, runner);

    expect(runner).not.toHaveBeenCalled();   // disable, never retry, never call the API
    // §8.3: the real renderBlockNotice mounted a non-verdict "use CB directly" notice in the host
    const notice = mountHost(document).getElementById(BLOCK_NOTICE_ID)!;
    expect(notice).not.toBeNull();
    expect(notice.textContent).toMatch(/use the question bank directly on CB/i);
  });

  it('runs the loop when enabled and not blocked', async () => {
    (isEnabled as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    (detectBlock as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const runner = vi.fn(async () => {});
    await guardedStart(document, runner);
    expect(runner).toHaveBeenCalledTimes(1);
    expect(mountHost(document).getElementById(BLOCK_NOTICE_ID)).toBeNull(); // no block notice on the happy path
  });
});

describe('per-question degraded path (§2.4)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders the banner + bumps the counter on a failed contract check, and does NOT render the card', async () => {
    const shadow = {} as ShadowRoot;
    const renderQuestion = vi.fn();
    const banner = vi.spyOn(contract, 'renderBanner').mockImplementation(() => {});
    const bump = vi.spyOn(contract, 'bumpFailureCounter').mockResolvedValue(1);
    vi.spyOn(contract, 'checkContract').mockReturnValue({ ok: false, reason: 'unreadable' });

    await handleQuestion(shadow, null, renderQuestion);

    expect(banner).toHaveBeenCalledWith(shadow);
    expect(bump).toHaveBeenCalledTimes(1);
    expect(renderQuestion).not.toHaveBeenCalled();   // never render a card we couldn't fully read
  });

  it('runs Plan 2\'s renderQuestion thunk (not the banner) when the contract check passes', async () => {
    const shadow = {} as ShadowRoot;
    const renderQuestion = vi.fn();
    const banner = vi.spyOn(contract, 'renderBanner').mockImplementation(() => {});
    vi.spyOn(contract, 'checkContract').mockReturnValue({ ok: true });

    await handleQuestion(shadow, view, renderQuestion);

    expect(renderQuestion).toHaveBeenCalledTimes(1);  // the renderQuestion callback (mountAnswerOverlay in practice)
    expect(banner).not.toHaveBeenCalled();
  });
});

describe('§8.5 graceful degradation — IndexedDB write failure leaves the session working, untracked', () => {
  it('safeWrite swallows an IndexedDB write rejection (never throws into the loop)', async () => {
    await expect(safeWrite(Promise.reject(new Error('IDB write failed')))).resolves.toBeUndefined();
  });

  it('safeWrite resolves through a successful write', async () => {
    await expect(safeWrite(Promise.resolve())).resolves.toBeUndefined();
  });
});

// --- Overlay close + cross-question navigation (answer-overlay architecture) ---
describe('overlay close ✕ and cross-question navigation', () => {
  it('✕ removes our overlay host from CB\'s .answer-content (CB\'s own question stays put)', async () => {
    const db = await freshDb();
    const shadow = await runLoop(document, db, 'dev-1');
    (shadow.querySelector('.fp-start-list') as HTMLElement).click();

    document.body.innerHTML += mc;
    await vi.waitFor(() => expect(document.querySelector('.answer-content .fp-answer-host')).not.toBeNull());

    // ✕ → close: our overlay host is removed; CB's native .answer-content (and question) remains.
    (inOverlay('.fp-overlay-close') as HTMLElement).click();
    expect(document.querySelector('.answer-content .fp-answer-host')).toBeNull();
    expect(document.querySelector('.answer-content')).not.toBeNull();   // CB's own region untouched
  });

  it('navigating to a new CB question re-mounts the overlay into the new question\'s .answer-content', async () => {
    const db = await freshDb();
    const shadow = await runLoop(document, db, 'dev-1');
    (shadow.querySelector('.fp-start-list') as HTMLElement).click();

    document.body.innerHTML += mc;                          // question 1 (ab12cd34) — MC
    await vi.waitFor(() => expect(document.querySelector('.answer-content .fp-answer-host')).not.toBeNull());
    expect(inOverlay('.fp-choice')).not.toBeNull();         // MC overlay (choices present)

    // CB closes Q1's modal and opens Q2 (different id, grid-in) — observer fires showQuestion → re-mount
    document.querySelector('.cb-modal-container')!.remove();
    document.body.innerHTML += gridIn;                      // question 2 (ef56ab78) — grid-in
    await vi.waitFor(() => expect(document.querySelector('.answer-content .fp-answer-host')).not.toBeNull());
    // The new overlay is grid-in (no choices, a typed-answer input) — proves it re-mounted for Q2.
    await vi.waitFor(() => expect(inOverlay('.fp-gridin')).not.toBeNull());
    expect(inOverlay('.fp-choice')).toBeNull();
  });
});

// --- Task 14: telemetry hand-off at call sites ---
describe('content telemetry hand-off', () => {
  // Minimal chrome stub: emit() checks chrome.runtime.id; sendMessage is a spy.
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks(); // clear any spies that leaked from earlier describe blocks (e.g. checkContract spy)
    vi.stubGlobal('chrome', { runtime: { id: 'ext-test', sendMessage: vi.fn() } });
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  // Shared helper: runs Start → injects the MC fixture → picks B → clicks Check → waits for verdict.
  // Returns the DB used, so callers can inspect state if needed.
  async function driveOneGradedCheck() {
    const db = await freshDb();
    const shadow = await runLoop(document, db, 'dev-1');
    (shadow.querySelector('.fp-start-list') as HTMLElement).click();
    document.body.innerHTML += mc;
    await vi.waitFor(() => expect(document.querySelector('.answer-content .fp-answer-host')).not.toBeNull());
    (inOverlay('.fp-choice[data-letter="B"] .fp-pick') as HTMLElement).click();
    (inOverlay('.fp-check') as HTMLElement).click();
    await vi.waitFor(async () => expect(await getAttempts(db)).toHaveLength(1));
    return db;
  }

  it('emits dom_contract_failed when the contract check fails', async () => {
    const sent: any[] = [];
    (globalThis as any).chrome.runtime.sendMessage = (m: any) => sent.push(m);
    (globalThis as any).chrome.storage = { local: { get: async () => ({}), set: async () => {}, remove: async () => {} } };
    const shadow = document.createElement('div').attachShadow({ mode: 'open' });
    await handleQuestion(shadow, null, () => {}); // null view → contract fails
    expect(sent.some((m) => m?.event?.event === 'dom_contract_failed')).toBe(true);
  });

  // Telemetry hand-off: a TELEMETRY_EVENT is posted when a question is checked.
  it('emits question_attempted after a graded Check', async () => {
    const sent: any[] = [];
    // reuse this file's existing chrome stub; ensure runtime.sendMessage records messages:
    (globalThis as any).chrome.runtime.sendMessage = (m: any) => { sent.push(m); };
    await driveOneGradedCheck(); // helper already used by neighbouring tests to run a Check to verdict
    const ev = sent.find((m) => m?.type === 'telemetry-event' && m.event?.event === 'question_attempted');
    expect(ev).toBeTruthy();
    expect(ev.event.props.result).toBeDefined();
    expect(JSON.stringify(ev)).not.toMatch(/stem|passage|rationale/i); // no content leaks
  });

  it('emits journal_opened when the journal panel is opened', async () => {
    const sent: any[] = [];
    (globalThis as any).chrome.runtime.sendMessage = (m: any) => { sent.push(m); };
    const db = await freshDb();
    await handleMessage(db, { type: 'open-journal' });
    const ev = sent.find((m) => m?.type === 'telemetry-event' && m.event?.event === 'journal_opened');
    expect(ev).toBeTruthy();
    expect(JSON.stringify(ev)).not.toMatch(/stem|passage|rationale|note/i); // empty props, no content
  });

  it('emits practice_resumed (resume_index + total_in_order) when the student resumes a session', async () => {
    const sent: any[] = [];
    (globalThis as any).chrome.runtime.sendMessage = (m: any) => { sent.push(m); };
    const db = await freshDb();
    // A stored session for the filter the probe will read off the on-screen question modal.
    const s = makeSession({ deviceId: 'dev-1', filterContext: 'SAT|Math|Algebra|Hard', orderMode: 'list', shuffleSeed: 0 });
    s.lastQuestionId = 'ab12cd34';
    await saveSession(db, s);
    // The results list + a question modal must be present at runLoop time so the probe finds the
    // filterContext and getSession returns a session → the start panel renders the Resume button.
    document.body.innerHTML +=
      '<table class="cb-table-react"><tbody>' +
      '<tr class="result-row"><td class="id-column"><button class="cb-btn">ab12cd34</button></td></tr>' +
      '</tbody></table>';
    document.body.innerHTML += mc;

    const shadow = await runLoop(document, db, 'dev-1');
    const resume = shadow.querySelector('.fp-resume') as HTMLElement | null;
    expect(resume).not.toBeNull();   // a session exists → Resume is offered
    resume!.click();

    await vi.waitFor(() => {
      const ev = sent.find((m) => m?.type === 'telemetry-event' && m.event?.event === 'practice_resumed');
      expect(ev).toBeTruthy();
      expect(ev.event.props.total_in_order).toBe(1);   // one row loaded
      expect(ev.event.props.resume_index).toBe(0);      // ab12cd34 is at index 0
    });
  });

  it('emits session_ended on pagehide once a session is active (attempted/accuracy/duration buckets)', async () => {
    const sent: any[] = [];
    (globalThis as any).chrome.runtime.sendMessage = (m: any) => { sent.push(m); };
    await driveOneGradedCheck();   // starts a session and records one correct attempt

    (typeof self !== 'undefined' ? self : window).dispatchEvent(new Event('pagehide'));

    // Prior runLoop calls in this file register their own pagehide listeners; assert THIS session's
    // session_ended (one correct attempt → 100% accuracy) is among the emitted events.
    const ended = sent.filter((m) => m?.type === 'telemetry-event' && m.event?.event === 'session_ended');
    expect(ended.length).toBeGreaterThan(0);
    const ev = ended.find((m) => m.event.props.accuracy_bucket === '85-100' && m.event.props.attempted_bucket === '1-5');
    expect(ev).toBeTruthy();
    expect(ev.event.props.duration_bucket).toBeDefined();
  });
});
