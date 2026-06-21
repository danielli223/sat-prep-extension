import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { observeQuestions } from './observer';

const here = dirname(fileURLToPath(import.meta.url));
const mc = readFileSync(join(here, '__fixtures__', 'multiple-choice.html'), 'utf8');

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

  it('does not fire onModalAppear off the results page', async () => {
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
