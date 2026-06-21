import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { observeQuestions, observeQuestionPresence } from './observer';

const here = dirname(fileURLToPath(import.meta.url));
const mc = readFileSync(join(here, '__fixtures__', 'multiple-choice.html'), 'utf8');
const studentMc = readFileSync(join(here, '__fixtures__', 'student-mc.html'), 'utf8');
const studentTimer = readFileSync(join(here, '__fixtures__', 'student-timer-modal.html'), 'utf8');

describe('observeQuestions', () => {
  it('fires onShown once when a question modal appears on the results page', async () => {
    history.replaceState({}, '', '/digital/results');
    document.body.innerHTML = '';
    const onShown = vi.fn();
    const stop = observeQuestions(document, onShown);

    document.body.innerHTML = mc;                 // simulate CB rendering the modal
    await vi.waitFor(() => expect(onShown).toHaveBeenCalledTimes(1));
    expect(onShown.mock.calls[0]![0].id).toBe('ab12cd34');

    stop();
  });

  it('waits for the meta to render before emitting (no partial view on progressive render)', async () => {
    // The live modal renders the header (with the id) BEFORE .cb-dialog-content (meta + choices).
    // The observer must not emit until the content is ready, or dedup-by-id locks in a partial view
    // with empty taxonomy/choices (observed in the live spike, 2026-06-15).
    history.replaceState({}, '', '/digital/results');
    document.body.innerHTML = '';
    const onShown = vi.fn();
    const stop = observeQuestions(document, onShown);

    // Stage 1: container + id present, but no meta table yet.
    document.body.innerHTML =
      '<div class="cb-dialog-container"><div class="cb-dialog-header"><h4>Question ID: ab12cd34</h4></div></div>';
    await new Promise((r) => setTimeout(r, 30));
    expect(onShown).not.toHaveBeenCalled();

    // Stage 2: full content arrives → emit once, with the meta populated.
    document.body.innerHTML = mc;
    await vi.waitFor(() => expect(onShown).toHaveBeenCalledTimes(1));
    expect(onShown.mock.calls[0]![0].skill).toBe('Linear equations in one variable');
    stop();
  });

  it('does not fire when not on the results page', async () => {
    history.replaceState({}, '', '/digital/search');
    document.body.innerHTML = '';
    const onShown = vi.fn();
    const stop = observeQuestions(document, onShown);
    document.body.innerHTML = mc;
    await new Promise((r) => setTimeout(r, 50));
    expect(onShown).not.toHaveBeenCalled();
    stop();
  });

  it('after CB\'s in-place "Next" swap, emits the SETTLED view — never a stem-less/choiceless partial', async () => {
    // Live 2026-06-16: CB's in-modal "Next" swaps the question IN PLACE and progressively — the new id
    // lands while the body is momentarily cleared, then the stem + choices paint a beat later. Reading on
    // that first mutation captured a blank card (no stem, no choices → a grid-in for an MC question), and
    // id-only dedup locked it in. The final emit must carry the complete content.
    history.replaceState({}, '', '/digital/results');
    document.body.innerHTML = '';
    const onShown = vi.fn();
    const stop = observeQuestions(document, onShown);

    document.body.innerHTML = mc;                                   // question A: id ab12cd34, full content
    await vi.waitFor(() => expect(onShown).toHaveBeenCalledTimes(1));

    const c = document.querySelector('.cb-dialog-container')!;
    c.querySelector('h4')!.textContent = 'Question ID: ef56ab78';   // B's id lands…
    c.querySelector('.question-content .question')!.textContent = '';   // …body momentarily cleared
    c.querySelector('.answer-choices ul')!.innerHTML = '';
    await new Promise((r) => setTimeout(r, 230));                   // a settle fires HERE on the empty body
    c.querySelector('.question-content .question')!.textContent = 'B stem [SYNTHETIC]';  // …then it fills
    c.querySelector('.answer-choices ul')!.innerHTML = '<li>B-one</li><li>B-two</li>';

    await vi.waitFor(() => {
      const last = onShown.mock.calls.at(-1)![0];
      expect(last.id).toBe('ef56ab78');
      expect(last.stem).toContain('B stem');                                              // not a blank stem
      expect(last.choices.map((x: { text: string }) => x.text)).toEqual(['B-one', 'B-two']);  // not empty/grid
    });
    stop();
  });
});

describe('observeQuestionPresence', () => {
  it('reports the current closed state synchronously (no modal on the results page)', () => {
    // The widget boot needs the open/closed boolean immediately so it can set visibility without an
    // empty flash — so the VERY FIRST onChange must fire synchronously with the present state.
    history.replaceState({}, '', '/digital/results');
    document.body.innerHTML = '';
    const onChange = vi.fn();
    const stop = observeQuestionPresence(document, onChange);

    expect(onChange).toHaveBeenCalledTimes(1);   // fired synchronously, before any mutation
    expect(onChange.mock.calls[0]![0]).toBe(false);   // empty body → modal closed

    stop();
  });

  it('fires onChange(true) when the question modal appears on the results page', async () => {
    history.replaceState({}, '', '/digital/results');
    document.body.innerHTML = '';
    const onChange = vi.fn();
    const stop = observeQuestionPresence(document, onChange);
    onChange.mockClear();                          // drop the synchronous initial false

    document.body.innerHTML = mc;                  // CB renders the question modal (.cb-dialog-container)
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith(true));

    stop();
  });

  it('fires onChange(false) when the modal is removed (back on the list)', async () => {
    history.replaceState({}, '', '/digital/results');
    document.body.innerHTML = mc;                  // start with the modal already open
    const onChange = vi.fn();
    const stop = observeQuestionPresence(document, onChange);
    onChange.mockClear();                          // drop the synchronous initial true

    document.body.innerHTML = '';                  // student closes the modal → back on the results list
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith(false));

    stop();
  });

  it('does not report the modal as open when off the results path', async () => {
    history.replaceState({}, '', '/digital/search');
    document.body.innerHTML = '';
    const onChange = vi.fn();
    const stop = observeQuestionPresence(document, onChange);

    document.body.innerHTML = mc;                  // a .cb-dialog-container, but NOT on /digital/results
    await new Promise((r) => setTimeout(r, 50));
    expect(onChange).not.toHaveBeenCalledWith(true);   // never reported open off the results path

    stop();
  });
});

// Issue #55 — STUDENT bank (mypractice.collegeboard.org/questionbank/results).
// PRIMARY failing test: the overlay never mounts on the student bank today because the
// observer (a) gates on `/digital/results` only and (b) looks for `.cb-dialog-container`.
// The student bank serves the question from a `.cb-modal-container` ([role=dialog]) under
// `/questionbank/results`. The observer must emit ONE QuestionView for the question modal
// and must NOT emit for the sibling inactivity-timer popup (also `.cb-modal.cb-open`, but
// with NO "Question ID:"). These FAIL until the maker generalizes the path gate + selector.
describe('observeQuestions — student bank (.cb-modal-container, /questionbank/results)', () => {
  it('emits ONE complete view for the student question modal on the student results path', async () => {
    history.replaceState({}, '', '/questionbank/results');
    document.body.innerHTML = '';
    const onShown = vi.fn();
    const stop = observeQuestions(document, onShown);

    document.body.innerHTML = studentMc;            // CB renders the student question modal
    await vi.waitFor(() => expect(onShown).toHaveBeenCalledTimes(1));

    const view = onShown.mock.calls[0]![0];
    expect(view.id).toBe('ab12cd34');
    expect(view.section).toBe('Reading and Writing');
    expect(view.domain).toBe('Information and Ideas');
    expect(view.skill).toBe('Central Ideas and Details');
    expect(view.difficulty).toBe('Medium');
    expect(view.choices.map((c: { letter: string }) => c.letter)).toEqual(['A', 'B', 'C', 'D']);
    expect(view.stem).toContain('placeholder stem');
    stop();
  });

  it('ignores the inactivity-timer popup (a sibling .cb-modal.cb-open with no "Question ID:")', async () => {
    history.replaceState({}, '', '/questionbank/results');
    document.body.innerHTML = '';
    const onShown = vi.fn();
    const stop = observeQuestions(document, onShown);

    // The timer modal appears ALONE first — it is a .cb-modal.cb-open with a
    // .cb-modal-container [role=dialog] but carries NO "Question ID:" text. A naive
    // generalization to a bare .cb-modal match would wrongly fire here.
    document.body.innerHTML = studentTimer;
    await new Promise((r) => setTimeout(r, 50));
    expect(onShown).not.toHaveBeenCalled();

    // Then the real question modal arrives alongside it → exactly one emission, for the question.
    document.body.innerHTML = studentTimer + studentMc;
    await vi.waitFor(() => expect(onShown).toHaveBeenCalledTimes(1));
    expect(onShown.mock.calls[0]![0].id).toBe('ab12cd34');
    stop();
  });

  // REVEAL CONTROL (NOT unit-tested here, by design): the student bank's reveal trigger is
  // `.cb-checkbox.inline-rationale-toggle input` (vs the educator `.hide-rationale-checkbox
  // input`). That is driven by the internal `ensureAnswerRevealed` in content.ts and depends
  // on CB's React change-tracker, which happy-dom cannot model (see the
  // `cb-react-isolated-world-reveal` memory note). It is verified by the LIVE /verify-overlay
  // pass, not in a unit test. The maker's reveal-selector change is gated by that live pass.
});

// #38 (FOUC): the early-mask hook must fire when the maskable region (.answer-content) is actually
// present — NOT merely when the modal header appears (CB renders the header first) — and must re-fire
// when CB swaps .answer-content for a new element on the in-place "Next". The original latched on the
// modal element and so missed both cases, leaving the flash the fix was meant to close.
describe('early FOUC hook — onModalAppear (#38)', () => {
  const HEADER_ONLY =
    '<div class="cb-dialog-container"><div class="cb-dialog-header"><h4>Question ID: ab12cd34</h4></div></div>';
  const withAnswerContent = (id = 'ab12cd34') =>
    '<div class="cb-dialog-container"><div class="cb-dialog-header"><h4>Question ID: ' + id + '</h4></div>' +
    '<div class="cb-dialog-content">' +
    '<table class="cb-table"><tbody><tr><th>A</th><th>S</th><th>D</th><th>Sk</th><th>Df</th></tr>' +
    '<tr><td>SAT</td><td>Math</td><td>Algebra</td><td>S</td><td>Hard</td></tr></tbody></table>' +
    '<div class="answer-content"><div class="answer-choices"><ul><li>3</li></ul></div></div></div></div>';

  it('does NOT fire until .answer-content exists, then fires once it does (header-first render)', async () => {
    history.replaceState({}, '', '/digital/results');
    document.body.innerHTML = '';
    const onModalAppear = vi.fn();
    const stop = observeQuestions(document, vi.fn(), onModalAppear);

    document.body.innerHTML = HEADER_ONLY;                 // header only — region not painted yet
    await new Promise((r) => setTimeout(r, 20));
    expect(onModalAppear).not.toHaveBeenCalled();          // must NOT latch onto the bare modal

    document.body.innerHTML = withAnswerContent();         // .answer-content arrives a beat later
    await vi.waitFor(() => expect(onModalAppear).toHaveBeenCalledTimes(1));
    expect(onModalAppear.mock.calls[0]![0].querySelector('.answer-content')).not.toBeNull();
    stop();
  });

  it('re-fires for a NEW .answer-content (CB\'s in-place "Next" replaces the region)', async () => {
    history.replaceState({}, '', '/digital/results');
    document.body.innerHTML = '';
    const onModalAppear = vi.fn();
    const stop = observeQuestions(document, vi.fn(), onModalAppear);

    document.body.innerHTML = withAnswerContent('ab12cd34');
    await vi.waitFor(() => expect(onModalAppear).toHaveBeenCalledTimes(1));

    const content = document.querySelector('.cb-dialog-content')!;
    content.querySelector('.answer-content')!.remove();    // Next: old region detaches…
    const fresh = document.createElement('div');
    fresh.className = 'answer-content';
    fresh.innerHTML = '<div class="answer-choices"><ul><li>9</li></ul></div>';
    content.appendChild(fresh);                            // …a NEW region attaches
    await vi.waitFor(() => expect(onModalAppear).toHaveBeenCalledTimes(2));
    stop();
  });

  it('also fires on the student bank modal/path (bank-agnostic selector + /results gate)', async () => {
    history.replaceState({}, '', '/questionbank/results');
    document.body.innerHTML = '';
    const onModalAppear = vi.fn();
    const stop = observeQuestions(document, vi.fn(), onModalAppear);
    document.body.innerHTML =
      '<div class="cb-modal-container"><div class="cb-dialog-header"><h4>Question ID: ab12cd34</h4></div>' +
      '<div class="answer-content"><div class="answer-choices"><ul><li>3</li></ul></div></div></div>';
    await vi.waitFor(() => expect(onModalAppear).toHaveBeenCalledTimes(1));
    stop();
  });

  it('does not fire onModalAppear off any results page', async () => {
    history.replaceState({}, '', '/digital/search');
    document.body.innerHTML = '';
    const onModalAppear = vi.fn();
    const stop = observeQuestions(document, vi.fn(), onModalAppear);
    document.body.innerHTML = withAnswerContent();
    await new Promise((r) => setTimeout(r, 50));
    expect(onModalAppear).not.toHaveBeenCalled();
    stop();
  });
});
