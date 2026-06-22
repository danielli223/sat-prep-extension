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
// The note + Calculator + Desmos now live in a SEPARATE extras host (`.fp-extras-host`), appended as the
// LAST child of .answer-content so they render below CB's .rationale. These mirror the pair above but
// resolve the extras shadow; `null` until the extras host is mounted.
function extrasOverlay(): ShadowRoot | null {
  return document.querySelector('.answer-content .fp-extras-host')?.shadowRoot ?? null;
}
function inExtras(sel: string): Element | null {
  return extrasOverlay()?.querySelector(sel) ?? null;
}

beforeEach(() => { document.body.innerHTML = ''; history.replaceState({}, '', '/digital/results'); });

describe('content loop wiring', () => {
  it('Start → Check(correct) records one attempt and writes the session', async () => {
    const db = await freshDb();
    // CB's loaded results list (10 rows) is on the page BEFORE Start.
    const rows = Array.from({ length: 10 }, () => '<tr><td>row</td></tr>').join('');
    document.body.innerHTML += `<table class="results-list"><tbody>${rows}</tbody></table>`;

    const shadow = await runLoop(document, db, 'dev-1');
    (shadow.querySelector('.fp-start-list') as HTMLElement).click();      // user-gated start

    document.body.innerHTML += mc;                                        // CB renders a question
    // The overlay mounts INSIDE CB's .answer-content (not the body host).
    await vi.waitFor(() => expect(document.querySelector('.answer-content .fp-answer-host')).not.toBeNull());
    expect(inOverlay('.fp-choice')).not.toBeNull();   // our interaction rendered in CB's answer region

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

  it('Check repaints the underlying results-list chip live (no page refresh needed)', async () => {
    const db = await freshDb();
    // The live CB results list (rows ab12cd34 + ef56ab78) is on the page behind the modal. ab12cd34 is
    // the question the student is about to answer; ef56ab78 stays unseen. No chips yet (the list-load
    // badger isn't wired in this unit harness — only onCheck's live repaint is under test).
    document.body.innerHTML += `<table class="cb-table-react"><tbody>
      <tr class="result-row"><td class="checked-column"></td><td class="id-column"><button class="cb-btn">ab12cd34</button></td></tr>
      <tr class="result-row"><td class="checked-column"></td><td class="id-column"><button class="cb-btn">ef56ab78</button></td></tr>
    </tbody></table>`;

    const shadow = await runLoop(document, db, 'dev-1');
    (shadow.querySelector('.fp-start-list') as HTMLElement).click();

    document.body.innerHTML += mc;                                        // CB renders question ab12cd34
    await vi.waitFor(() => expect(document.querySelector('.answer-content .fp-answer-host')).not.toBeNull());

    (inOverlay('.fp-choice[data-letter="B"] .fp-pick') as HTMLElement).click();
    (inOverlay('.fp-check') as HTMLElement).click();

    // Once the attempt is recorded, the row's chip flips to "done" WITHOUT a reload — the whole gap this
    // fixes. The repaint is store-driven, so the still-unseen ef56ab78 row reads "new".
    await vi.waitFor(() => {
      const chip = document.querySelector('table.cb-table-react tbody tr:nth-child(1) .id-column .fp-badge');
      expect(chip?.getAttribute('data-state')).toBe('done');
    });
    const ef = document.querySelector('table.cb-table-react tbody tr:nth-child(2) .id-column .fp-badge');
    expect(ef?.getAttribute('data-state')).toBe('new');
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

    const note = inExtras('.fp-note') as HTMLTextAreaElement;   // note moved to the extras shadow (below the explanation)
    note.value = 'missed the trap'; note.dispatchEvent(new Event('change'));
    (inOverlay('.fp-next') as HTMLElement).click();             // Next stays in the interaction shadow

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

  // Issue #28: the overlay shows a "seen before" badge derived from the student's OWN attempt journal.
  // (recordAttempt/makeAttempt are imported lower in this file; ESM hoists those imports, so they're
  // available here at run time.)
  it('shows the seen-before badge for a previously MISSED question', async () => {
    const db = await freshDb();
    // The current question (ab12cd34) was attempted WRONG in a previous sitting → getSeen → 'missed'.
    await recordAttempt(db, makeAttempt({ deviceId: 'dev-1', questionId: 'ab12cd34', section: 'Math', domain: 'Algebra', skill: 'X', difficulty: 'Hard', pick: 'A', correct: false }));

    const shadow = await runLoop(document, db, 'dev-1');
    (shadow.querySelector('.fp-start-list') as HTMLElement).click();
    document.body.innerHTML += mc;                                        // CB renders question ab12cd34
    await vi.waitFor(() => expect(document.querySelector('.answer-content .fp-answer-host')).not.toBeNull());

    const seen = inOverlay('.fp-seen');
    expect(seen).not.toBeNull();
    expect(seen!.getAttribute('data-prior')).toBe('missed');   // looked up against the student's journal
    expect(seen!.textContent).toContain('missed');
  });

  it('shows "New to you" for a never-seen question', async () => {
    const db = await freshDb();                                           // fresh journal → ab12cd34 unseen
    const shadow = await runLoop(document, db, 'dev-1');
    (shadow.querySelector('.fp-start-list') as HTMLElement).click();
    document.body.innerHTML += mc;
    await vi.waitFor(() => expect(document.querySelector('.answer-content .fp-answer-host')).not.toBeNull());

    const seen = inOverlay('.fp-seen');
    expect(seen).not.toBeNull();
    expect(seen!.getAttribute('data-prior')).toBe('new');
    expect(seen!.textContent).toContain('New to you');
  });

  it('keeps the seen badge after answering when you go to another question and come back (priorSeen refresh)', async () => {
    const db = await freshDb();
    const shadow = await runLoop(document, db, 'dev-1');
    (shadow.querySelector('.fp-start-list') as HTMLElement).click();

    // Q1 (ab12cd34) — never seen → "New to you".
    document.body.innerHTML += mc;
    await vi.waitFor(() => expect(document.querySelector('.answer-content .fp-answer-host')).not.toBeNull());
    expect(inOverlay('.fp-seen')!.getAttribute('data-prior')).toBe('new');

    // Answer it correctly (choice B): records 'done' AND must refresh the in-session seen map.
    (inOverlay('.fp-choice[data-letter="B"] .fp-pick') as HTMLElement).click();
    (inOverlay('.fp-check') as HTMLElement).click();
    await vi.waitFor(async () => expect(await getAttempts(db)).toHaveLength(1));
    expect(inOverlay('.fp-seen')!.getAttribute('data-prior')).toBe('done');   // immediate, in-place

    // Go FORWARD to Q2 (grid-in, ef56ab78)…
    document.querySelector('.cb-modal-container')!.remove();
    document.body.innerHTML += gridIn;
    await vi.waitFor(() => expect(inOverlay('.fp-gridin')).not.toBeNull());

    // …then COME BACK to Q1 (ab12cd34) — CB re-renders it, the observer re-mounts our overlay.
    document.querySelector('.cb-modal-container')!.remove();
    document.body.innerHTML += mc;
    await vi.waitFor(() => expect(inOverlay('.fp-choice')).not.toBeNull());

    // THE BUG: without refreshing priorSeen, the re-mounted Q1 badge reverts to "New to you".
    expect(inOverlay('.fp-seen')!.getAttribute('data-prior')).toBe('done');
    expect(inOverlay('.fp-seen')!.textContent).toContain('got it right');
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

// --- Plan 3 additions (badger + stats widget + resume) ---
import { refreshBadges, mountStatsWidget, updateStatsWidget, setStatsWidgetVisible, resumeFor, handleMessage, findResultsList, watchResultsList } from './content';
import { observeQuestionPresence } from '../cb/observer';
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

  it('mountStatsWidget adds a single widget (idempotent) and renders the supplied numbers', () => {
    mountStatsWidget(document);
    mountStatsWidget(document);
    expect(document.querySelectorAll('.fp-stats-widget')).toHaveLength(1);   // one widget, not two

    updateStatsWidget(document, { total: 12, accuracy: 0.75, streakDays: 3 });
    const text = document.querySelector('.fp-stats-widget')!.textContent ?? '';
    expect(text).toContain('12');     // done count
    expect(text).toContain('75%');    // Math.round(accuracy * 100)%
    expect(text).toContain('3');      // day streak
  });

  it('updateStatsWidget is a no-op when the widget is not mounted', () => {
    // The boot mounts before first update, but a stray update must not throw or create a widget.
    expect(() => updateStatsWidget(document, { total: 5, accuracy: 0.5, streakDays: 1 })).not.toThrow();
    expect(document.querySelector('.fp-stats-widget')).toBeNull();
  });

  it('clicking the widget opens the journal (onOpen handler)', () => {
    const onOpen = vi.fn();
    const btn = mountStatsWidget(document, onOpen);
    btn.click();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('the widget swallows its own pointer events so CB never closes the open question modal', () => {
    // The stats widget lives in the LIGHT DOM (doc.body), OUTSIDE our overlay host's stopPropagation
    // guard. CB closes its question modal on an outside pointer-down/click, so without its own guard a
    // click on the widget bubbles to the document and trips CB's close — the open problem page vanishes
    // (reported 2026-06-18, carried over from the old launcher). The widget must stop its own pointer
    // events, exactly like the host does.
    const onOpen = vi.fn();
    const btn = mountStatsWidget(document, onOpen);
    const onDocPointerdown = vi.fn();
    const onDocMousedown = vi.fn();
    const onDocClick = vi.fn();
    document.addEventListener('pointerdown', onDocPointerdown);   // mimic CB's close-on-outside listeners
    document.addEventListener('mousedown', onDocMousedown);
    document.addEventListener('click', onDocClick);

    btn.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onDocPointerdown).not.toHaveBeenCalled();   // stopped at the button — never reaches CB's listener
    expect(onDocMousedown).not.toHaveBeenCalled();
    expect(onDocClick).not.toHaveBeenCalled();
    expect(onOpen).toHaveBeenCalledTimes(1);            // ...yet the widget's own open-journal handler still fires
    document.removeEventListener('pointerdown', onDocPointerdown);
    document.removeEventListener('mousedown', onDocMousedown);
    document.removeEventListener('click', onDocClick);
  });

  it('setStatsWidgetVisible toggles the widget between hidden and shown', () => {
    mountStatsWidget(document);
    const widget = document.querySelector<HTMLElement>('.fp-stats-widget')!;

    setStatsWidgetVisible(document, false);
    expect(widget.style.display).toBe('none');         // hidden while a question modal is open

    setStatsWidgetVisible(document, true);
    expect(widget.style.display).not.toBe('none');     // re-shown back on the results list
  });

  it('integration: observeQuestionPresence hides the widget while the modal is open and re-shows it on the list', async () => {
    // No chrome boot needed — wire the CB-presence signal straight to the widget's visibility, the way
    // guardedStart will: hidden when a question is open, shown when back on the list.
    history.replaceState({}, '', '/digital/results');
    document.body.innerHTML = '';
    mountStatsWidget(document);
    const widget = document.querySelector<HTMLElement>('.fp-stats-widget')!;

    const stop = observeQuestionPresence(document, (open) => setStatsWidgetVisible(document, !open));

    // Append (not replace) so the widget node itself survives — only the CB modal comes and goes.
    const modal = document.createElement('div');
    modal.innerHTML = mc;
    document.body.appendChild(modal);                  // CB renders a question modal → widget should hide
    await vi.waitFor(() => expect(widget.style.display).toBe('none'));

    modal.remove();                                    // modal closed, back on the list → widget shown
    await vi.waitFor(() => expect(widget.style.display).not.toBe('none'));

    stop();
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

  it('handleMessage mounts the panel with NO dead .fp-practice-link / coachmark hand-off (#33)', async () => {
    const db = await freshDb();
    // One missed attempt → a weak-area row IS rendered for its skill; #33 just strips the dead links.
    await recordAttempt(db, makeAttempt({ deviceId: 'd', questionId: 'ab12cd34', section: 'Math', domain: 'Algebra', skill: 'Inferences', difficulty: 'Hard', pick: 'B', correct: false }));
    document.body.innerHTML = LIVE_LIST;

    await handleMessage(db, { type: 'open-journal' });   // mounts the panel
    const host = document.getElementById(HOST_ID)!.shadowRoot!;
    expect(host.querySelector('.fp-panel')).not.toBeNull();        // panel mounted
    expect(host.querySelector('.fp-weak-area')).not.toBeNull();    // weak-area row still rendered
    // Issue #33: the bare-/search links and their coachmark hand-off are gone — nothing to bind.
    expect(host.querySelector('a.fp-practice-link')).toBeNull();
    expect(host.querySelector('a.fp-find-link')).toBeNull();
    expect(host.querySelector('.fp-coachmark')).toBeNull();
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

// --- Issue #31: Randomize (loaded results) — GUIDED shuffle navigation -----------------------------
// Random mode must FOLLOW shuffleIds(loadedIds, seed) by scrolling the next row into view (the Resume
// posture), NEVER by auto-loading or id-navigating CB (bright lines #1 & #4). It must NOT click CB's
// native "Next" (that yields CB list order). The seed is read back from the persisted session so the
// expected order is computed from the REAL minted seed — deterministic and seed-agnostic.
import { shuffleIds } from '../order';
import { readListQuestionIds } from '../cb/list-reader';

// A real cb-table-react results list with MULTIPLE real-8-hex rows so shuffleIds actually permutes and
// readListQuestionIds finds every row. ab12cd34 is the MC fixture's question id, so opening that
// fixture forms the session over THIS loaded set. Synthetic ids only — no CB content.
const RANDOM_LIST = `<table class="cb-table-react"><tbody>
  <tr class="result-row"><td class="checked-column"></td><td class="id-column"><button class="cb-btn">ab12cd34</button></td></tr>
  <tr class="result-row"><td class="checked-column"></td><td class="id-column"><button class="cb-btn">ef56ab78</button></td></tr>
  <tr class="result-row"><td class="checked-column"></td><td class="id-column"><button class="cb-btn">99ff00aa</button></td></tr>
  <tr class="result-row"><td class="checked-column"></td><td class="id-column"><button class="cb-btn">dead0001</button></td></tr>
  <tr class="result-row"><td class="checked-column"></td><td class="id-column"><button class="cb-btn">beef0002</button></td></tr>
</tbody></table>`;

// The <tr> node for a given id within the on-page list (the same node readListQuestionIds/scrollToResume
// targets), so we can spy scrollIntoView on the EXACT row the extension should guide to.
function rowFor(id: string): Element {
  const row = readListQuestionIds(findResultsList(document)!).find((r) => r.id === id);
  expect(row, `expected loaded row for ${id}`).toBeTruthy();
  return row!.node;
}

describe('Issue #31 — random mode follows the shuffled order by GUIDED scrolling', () => {
  beforeEach(() => { document.body.innerHTML = ''; history.replaceState({}, '', '/digital/results'); });

  it('random START scrolls the FIRST shuffled-order row into view (computed from the persisted seed)', async () => {
    const db = await freshDb();
    document.body.innerHTML += RANDOM_LIST;            // loaded results present BEFORE Start

    // Spy scrollIntoView on EVERY loaded row up front: we can't know which is first-in-order until the
    // seed is minted, so we instrument all of them, then assert only the shuffled-order[0] row scrolled.
    const loadedIds = readListQuestionIds(findResultsList(document)!).map((r) => r.id);
    const spies = new Map(loadedIds.map((id) => [id, vi.spyOn(rowFor(id), 'scrollIntoView').mockImplementation(() => {})]));

    const shadow = await runLoop(document, db, 'dev-1');
    (shadow.querySelector('.fp-start-random') as HTMLElement).click();   // RANDOM start

    document.body.innerHTML += mc;                     // CB renders question ab12cd34 → session forms
    await vi.waitFor(() => expect(document.querySelector('.answer-content .fp-answer-host')).not.toBeNull());

    // Read the REAL minted seed back from the persisted random session.
    const session = await getSession(db, 'SAT|Math|Algebra|Hard');
    expect(session!.orderMode).toBe('random');
    expect(session!.shuffleSeed).not.toBe(0);
    const order = shuffleIds(loadedIds, session!.shuffleSeed);

    // The extension must have guided the student to the FIRST question of the shuffled order — by
    // scrolling that row into view, never by opening it.
    await vi.waitFor(() => expect(spies.get(order[0]!)!).toHaveBeenCalled());
  });

  it('random NEXT scrolls the NEXT shuffled-order row into view and does NOT click CB\'s native Next', async () => {
    const db = await freshDb();
    document.body.innerHTML += RANDOM_LIST;

    const loadedIds = readListQuestionIds(findResultsList(document)!).map((r) => r.id);

    const shadow = await runLoop(document, db, 'dev-1');
    (shadow.querySelector('.fp-start-random') as HTMLElement).click();

    document.body.innerHTML += mc;                     // open ab12cd34 → random session forms
    await vi.waitFor(() => expect(document.querySelector('.answer-content .fp-answer-host')).not.toBeNull());

    // A spied CB native "Next" (light DOM, like the existing list-mode onNext test) — random mode must
    // NOT actuate it (clicking it would advance in CB LIST order, defeating the shuffle). Appended AFTER
    // `+= mc` so the live button keeps its listener (the `+=` idiom re-parses the body and would detach a
    // node added earlier, making the negative assertion vacuous).
    const cbNext = document.createElement('button');
    cbNext.textContent = 'Next';
    const cbNextClicked = vi.fn();
    cbNext.addEventListener('click', cbNextClicked);
    document.body.appendChild(cbNext);

    const session = await getSession(db, 'SAT|Math|Algebra|Hard');
    expect(session!.orderMode).toBe('random');
    const order = shuffleIds(loadedIds, session!.shuffleSeed);

    // Spy the NEXT shuffled-order row (position 1 — start guided position 0). On our Next, random mode
    // must scroll THIS row into view, returning the student to the list to click it themselves.
    const nextRow = rowFor(order[1]!);
    const nextScroll = vi.spyOn(nextRow, 'scrollIntoView').mockImplementation(() => {});

    (inOverlay('.fp-next') as HTMLElement).click();    // our Next, in random mode

    await vi.waitFor(() => expect(nextScroll).toHaveBeenCalled());   // guided to the next shuffled row
    expect(cbNextClicked).not.toHaveBeenCalled();                    // CB's native Next NOT actuated
  });
});

// --- Issue #38: answer-content FOUC (flash of CB's unstyled answers before our overlay loads) ---
//
// THE BUG: observeQuestions (src/cb/observer.ts) DEBOUNCES its read by 150ms — it emits the view, and
// thus mounts the overlay (the FIRST thing that masks CB's `.answer-content` children via display:none),
// only AFTER CB's modal stops mutating. So for >=150ms after CB paints `.answer-content`, its native
// `.answer-choices` are fully VISIBLE and unstyled — that flash is the FOUC.
//
// THE FIX: the instant CB's answer region is OBSERVED — decoupled from the 150ms read-debounce — drop an
// opaque "white rectangle" host over it (mountCurtain) that both hides CB's raw children AND covers the
// area, so nothing flashes. The real interactive overlay fills that SAME host later, on the settled read.
//
// We use a comment-free inline MC modal (NOT the multiple-choice.html fixture) on purpose: happy-dom
// mis-parses the HTML comments in that .html fixture and re-parents `.answer-choices` so it is NOT a
// direct child of `.answer-content` — which would make the masking (a direct-child sweep) unobservable
// here. The neighbouring "ASYNC-injected rationale" test documents the same comment-parse hazard.
const FOUC_MC_MODAL =
  '<div role="dialog" class="cb-modal-container"><div class="cb-dialog-container">' +
  '<div class="cb-dialog-header"><h4>Question ID: ab12cd34</h4></div>' +
  '<div class="cb-dialog-content">' +
  '<table class="cb-table"><tbody>' +
  '<tr><th>Assessment</th><th>Section</th><th>Domain</th><th>Skill</th><th>Difficulty</th></tr>' +
  '<tr><td>SAT</td><td>Math</td><td>Algebra</td><td>S</td><td>Hard</td></tr></tbody></table>' +
  '<div class="question-content"><div class="question">stem [SYNTHETIC]</div></div>' +
  '<div class="answer-content"><div class="answer-choices"><ul><li>3 [SYNTHETIC]</li><li>5 [SYNTHETIC]</li>' +
  '<li>7 [SYNTHETIC]</li><li>15 [SYNTHETIC]</li></ul></div></div>' +
  '</div></div></div>';

describe('answer-content FOUC (#38): CB\'s raw choices are masked BEFORE the overlay mounts', () => {
  beforeEach(() => { document.body.innerHTML = ''; history.replaceState({}, '', '/digital/results'); });

  it('masks CB\'s native .answer-choices at the first microtask — before (not after) the 150ms-debounced overlay mount', async () => {
    const db = await freshDb();
    const shadow = await runLoop(document, db, 'dev-1');
    (shadow.querySelector('.fp-start-list') as HTMLElement).click();   // masking is only active during a session

    document.body.innerHTML += FOUC_MC_MODAL;                          // CB paints .answer-content
    // setTimeout(0) flushes happy-dom's MutationObserver microtask (where an EARLY mask would run) but is
    // FAR below observeQuestions' 150ms read-debounce — so the overlay has NOT mounted yet at this instant.
    await new Promise((r) => setTimeout(r, 0));

    const choices = document.querySelector('.answer-content .answer-choices') as HTMLElement;
    // FOUC is CLOSED at this instant: CB's raw choices are hidden AND an opaque white rectangle
    // (.fp-curtain) covers the region...
    expect(choices.style.display).toBe('none');
    expect(document.querySelector('.answer-content .fp-curtain')).not.toBeNull();
    // ...but the real interactive overlay host has NOT mounted yet (it waits for the 150ms-debounced read).
    expect(document.querySelector('.answer-content .fp-answer-host')).toBeNull();

    // Now let the read settle: the real overlay mounts (~150ms later), the white rectangle is removed,
    // and the choices stay masked.
    await vi.waitFor(() => expect(document.querySelector('.answer-content .fp-answer-host')).not.toBeNull());
    expect(document.querySelector('.answer-content .fp-curtain')).toBeNull();
    expect((document.querySelector('.answer-content .answer-choices') as HTMLElement).style.display).toBe('none');
  });

  it('curtains the region even when CB paints the header BEFORE .answer-content (the real race)', async () => {
    const db = await freshDb();
    const shadow = await runLoop(document, db, 'dev-1');
    (shadow.querySelector('.fp-start-list') as HTMLElement).click();

    // Stage 1: CB paints ONLY the modal header (Question ID) — .answer-content not in the DOM yet.
    document.body.innerHTML +=
      '<div role="dialog" class="cb-modal-container"><div class="cb-dialog-container" id="fouc-m1">' +
      '<div class="cb-dialog-header"><h4>Question ID: ab12cd34</h4></div></div></div>';
    await new Promise((r) => setTimeout(r, 0));
    expect(document.querySelector('.answer-content')).toBeNull();   // nothing to curtain yet

    // Stage 2: CB paints .cb-dialog-content (with .answer-content) a beat later. The curtain must land
    // NOW — before the 150ms-debounced mount — even though the early hook already saw the bare modal.
    document.getElementById('fouc-m1')!.innerHTML +=
      '<div class="cb-dialog-content">' +
      '<table class="cb-table"><tbody><tr><th>A</th><th>S</th><th>D</th><th>Sk</th><th>Df</th></tr>' +
      '<tr><td>SAT</td><td>Math</td><td>Algebra</td><td>S</td><td>Hard</td></tr></tbody></table>' +
      '<div class="question-content"><div class="question">stem [SYNTHETIC]</div></div>' +
      '<div class="answer-content"><div class="answer-choices"><ul><li>3 [SYNTHETIC]</li><li>5 [SYNTHETIC]</li></ul></div></div></div>';
    await new Promise((r) => setTimeout(r, 0));

    // FOUC closed: choices hidden AND the white rectangle present — both before the debounced overlay mount.
    expect((document.querySelector('.answer-content .answer-choices') as HTMLElement).style.display).toBe('none');
    expect(document.querySelector('.answer-content .fp-curtain')).not.toBeNull();
  });
});

// --- Issue #70: login-path-aware boot (student bank SPA-routes into /questionbank/results after a
// /login redirect with NO fresh document load, so the overlay never injects without a hard reload).
// The match broadens to *://mypractice.collegeboard.org/* (so the script injects on /login too) and
// the boot becomes PATH-AWARE: our UI activates only on a question-bank results page and re-evaluates
// on SPA navigation. These three pure units pin that contract; they need NO chrome and NO IndexedDB.
import { isQuestionBankPage, setOverlayActive, installOverlayLifecycle } from './content';
import { mountHost as mountHost70, HOST_ID as HOST_ID70 } from '../ui/host';

describe('Issue #70 — isQuestionBankPage (path-aware activation)', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('is TRUE on the student question-bank results page (/questionbank/results)', () => {
    history.replaceState({}, '', '/questionbank/results');
    expect(isQuestionBankPage(document)).toBe(true);
  });

  it('is TRUE on /questionbank/results with a trailing query/hash', () => {
    history.replaceState({}, '', '/questionbank/results?foo=1');
    expect(isQuestionBankPage(document)).toBe(true);
  });

  it('is TRUE on the educator results page (/digital/results) — no regression', () => {
    history.replaceState({}, '', '/digital/results');
    expect(isQuestionBankPage(document)).toBe(true);
  });

  it('is FALSE on /login', () => {
    history.replaceState({}, '', '/login');
    expect(isQuestionBankPage(document)).toBe(false);
  });

  it('is FALSE on /dashboard', () => {
    history.replaceState({}, '', '/dashboard');
    expect(isQuestionBankPage(document)).toBe(false);
  });

  it('is FALSE on /details', () => {
    history.replaceState({}, '', '/details');
    expect(isQuestionBankPage(document)).toBe(false);
  });

  it('is FALSE on a bare /questionbank (no /results)', () => {
    history.replaceState({}, '', '/questionbank');
    expect(isQuestionBankPage(document)).toBe(false);
  });
});

describe('Issue #70 — setOverlayActive (one-call show/hide of all our furniture)', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('hides BOTH the overlay host and the stats widget when off, restores them when on', () => {
    mountHost70(document);                 // <div id="focused-practice-root">
    mountStatsWidget(document);            // .fp-stats-widget
    const host = document.getElementById(HOST_ID70)!;
    const widget = document.querySelector<HTMLElement>('.fp-stats-widget')!;

    setOverlayActive(document, false);
    expect(host.style.display).toBe('none');
    expect(widget.style.display).toBe('none');

    setOverlayActive(document, true);
    expect(host.style.display).toBe('');
    expect(widget.style.display).toBe('');
  });

  it('is a no-op (no throw) when neither the host nor the widget is mounted', () => {
    expect(() => setOverlayActive(document, false)).not.toThrow();
    expect(() => setOverlayActive(document, true)).not.toThrow();
    expect(document.getElementById(HOST_ID70)).toBeNull();
    expect(document.querySelector('.fp-stats-widget')).toBeNull();
  });
});

describe('Issue #70 — installOverlayLifecycle (path-aware, SPA-navigation-aware boot)', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('does NOTHING on install when already off a question-bank page (/login)', () => {
    history.replaceState({}, '', '/login');
    const activate = vi.fn();
    const deactivate = vi.fn();
    const teardown = installOverlayLifecycle(document, activate, deactivate);
    expect(activate).not.toHaveBeenCalled();      // not a QB page → no activate
    expect(deactivate).not.toHaveBeenCalled();    // and NOT a spurious deactivate on first eval
    teardown();
  });

  it('activates exactly once on install when already on /questionbank/results', () => {
    history.replaceState({}, '', '/questionbank/results');
    const activate = vi.fn();
    const deactivate = vi.fn();
    const teardown = installOverlayLifecycle(document, activate, deactivate);
    expect(activate).toHaveBeenCalledTimes(1);
    expect(deactivate).not.toHaveBeenCalled();
    teardown();
  });

  it('CORE REGRESSION: activates on SPA pushState into /questionbank/results WITHOUT a reload', () => {
    history.replaceState({}, '', '/login');                  // CB's post-login landing — not a QB page
    const activate = vi.fn();
    const deactivate = vi.fn();
    const teardown = installOverlayLifecycle(document, activate, deactivate);
    expect(activate).not.toHaveBeenCalled();                 // inert on /login

    history.pushState({}, '', '/questionbank/results');      // SPA route in — NO fresh document load
    expect(activate).toHaveBeenCalledTimes(1);               // overlay must come up anyway (the bug)
    expect(deactivate).not.toHaveBeenCalled();
    teardown();
  });

  it('deactivates on SPA pushState OFF a question-bank page (results → /dashboard)', () => {
    history.replaceState({}, '', '/questionbank/results');
    const activate = vi.fn();
    const deactivate = vi.fn();
    const teardown = installOverlayLifecycle(document, activate, deactivate);
    expect(activate).toHaveBeenCalledTimes(1);

    history.pushState({}, '', '/dashboard');                 // SPA route away from the QB
    expect(deactivate).toHaveBeenCalledTimes(1);
    teardown();
  });

  it('does NOT re-fire on a QB→QB navigation (results → results?x=1)', () => {
    history.replaceState({}, '', '/questionbank/results');
    const activate = vi.fn();
    const deactivate = vi.fn();
    const teardown = installOverlayLifecycle(document, activate, deactivate);
    expect(activate).toHaveBeenCalledTimes(1);

    history.pushState({}, '', '/questionbank/results?x=1');   // still a QB page → no transition
    expect(activate).toHaveBeenCalledTimes(1);                // still just the one activate
    expect(deactivate).not.toHaveBeenCalled();
    teardown();
  });

  it('re-evaluates on popstate (browser back/forward into /questionbank/results)', () => {
    history.replaceState({}, '', '/login');
    const activate = vi.fn();
    const deactivate = vi.fn();
    const teardown = installOverlayLifecycle(document, activate, deactivate);
    expect(activate).not.toHaveBeenCalled();                  // inert on /login

    history.replaceState({}, '', '/questionbank/results');    // browser changed the URL...
    window.dispatchEvent(new PopStateEvent('popstate'));      // ...and emitted popstate
    expect(activate).toHaveBeenCalled();                      // lifecycle re-evaluated → activated
    teardown();
  });

  it('teardown unpatches history so a later pushState does NOT activate (and pushState still works)', () => {
    history.replaceState({}, '', '/login');
    const activate = vi.fn();
    const deactivate = vi.fn();
    const teardown = installOverlayLifecycle(document, activate, deactivate);
    teardown();

    history.pushState({}, '', '/questionbank/results');       // after teardown → no re-evaluation
    expect(activate).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/questionbank/results');   // ...but pushState still navigates
  });
});
