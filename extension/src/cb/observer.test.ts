import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { observeQuestions, observeQuestionPresence } from './observer';

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
