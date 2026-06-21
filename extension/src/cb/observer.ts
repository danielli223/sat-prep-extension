import { readQuestion, type QuestionView } from './reader';

// The question-modal wrapper differs by bank: the EDUCATOR bank renders the question inside
// `.cb-dialog-container`, the STUDENT bank inside `.cb-modal-container` (which IS its [role=dialog]).
// One source of truth for both shapes; consumers still filter on the "Question ID:" heading so the
// student bank's sibling inactivity-timer popup (also a `.cb-modal`, no id) is excluded.
export const QUESTION_MODAL_SELECTOR = '.cb-dialog-container, .cb-modal-container';

// Watches the results page for CB's question modal and emits each distinct question once.
// CB renders the question inside the QUESTION_MODAL_SELECTOR wrapper — NOT inside the bare
// [role="dialog"] node where that differs from it (that node is the modal chrome, and a
// cookie-consent banner also uses role="dialog"). So we match the wrapper that actually holds the
// "Question ID:" heading.
export function observeQuestions(doc: Document, onShown: (view: QuestionView) => void): () => void {
  let lastSig: string | null = null;
  let settle: ReturnType<typeof setTimeout> | null = null;

  const read = () => {
    const p = doc.location.pathname;
    if (!p.includes('/digital/results') && !p.includes('/questionbank/results')) return;
    const modal = [...doc.querySelectorAll(QUESTION_MODAL_SELECTOR)]
      .find((el) => /Question ID:/i.test(el.textContent ?? '')) ?? null;
    if (!modal) { lastSig = null; return; }
    // The modal renders progressively: the header (with the id) appears before .cb-dialog-content
    // (meta table + answer choices). Wait until the meta data row is present so we never emit a
    // partial view — otherwise dedup would lock in empty taxonomy/choices (spike 2026-06-15).
    if (!modal.querySelector('table.cb-table td')) return;
    const view = readQuestion(modal);
    if (!view) return;
    // Dedup on the RENDERED CONTENT (id + stem + kind + choices), not the id alone. CB's in-modal "Next"
    // swaps the question IN PLACE and progressively — it clears the body, then paints the new stem and
    // choices over a few frames. Reading on the first mutation (id present, body still empty) captured a
    // stem-less, choiceless card — a blank grid-in for an MC question — and id-only dedup locked it in
    // (live 2026-06-16). Keying on the content means a late stem/choices update re-emits a corrected,
    // complete view. These re-emits land during the render, before the student has read or answered.
    const sig = view.id + '' + view.stem + '' + (view.choices.length ? 'mc' : 'grid')
      + '' + view.choices.map((c) => c.text).join('');
    if (sig !== lastSig) { lastSig = sig; onShown(view); }
  };

  // Debounce reads to the moment the modal STOPS mutating, so an in-place swap settles before we read it.
  const onMutate = () => { if (settle) clearTimeout(settle); settle = setTimeout(read, 150); };
  const obs = new MutationObserver(onMutate);
  obs.observe(doc.body, { childList: true, subtree: true });
  read(); // catch an already-present, settled modal synchronously (e.g. runLoop's resume probe)
  return () => { if (settle) clearTimeout(settle); obs.disconnect(); };
}
