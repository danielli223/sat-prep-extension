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
});
