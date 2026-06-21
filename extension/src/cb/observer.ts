import { readQuestion, type QuestionView } from './reader';

// Watches the results page for CB's question modal and emits each distinct question once.
// CB renders the question inside div.cb-dialog-container — NOT inside the [role="dialog"] node
// (that node is the modal chrome, and a cookie-consent banner also uses role="dialog"). So we match
// the dialog container that actually holds the "Question ID:" heading.
export function observeQuestions(doc: Document, onShown: (view: QuestionView) => void): () => void {
  let lastSig: string | null = null;
  let settle: ReturnType<typeof setTimeout> | null = null;

  const read = () => {
    if (!doc.location.pathname.includes('/digital/results')) return;
    const modal = [...doc.querySelectorAll('.cb-dialog-container')]
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

// Reports whether CB's question modal is open, and notifies on every open<->closed transition.
// observeQuestions has no "closed" signal — it only fires on a question being SHOWN — but the stats
// widget needs both: hide when a question opens, re-show when the modal closes. "Open" reuses the SAME
// matcher observeQuestions keys on: a .cb-dialog-container holding the "Question ID:" heading on the
// /digital/results page. This is a boolean presence signal (not a settled-view read), so it does NOT
// wait for the meta table — and it needs no debounce; a redundant onChange(true) while the modal paints
// is idempotent for the widget's visibility toggle. Fires the current state synchronously so the boot
// can set visibility without an empty flash, then fires onChange(now) only when the boolean flips.
export function observeQuestionPresence(doc: Document, onChange: (open: boolean) => void): () => void {
  const isOpen = (): boolean => {
    if (!doc.location.pathname.includes('/digital/results')) return false;
    return [...doc.querySelectorAll('.cb-dialog-container')]
      .some((el) => /Question ID:/i.test(el.textContent ?? ''));
  };

  let last = isOpen();
  onChange(last); // synchronous initial state

  const obs = new MutationObserver(() => {
    const now = isOpen();
    if (now !== last) { last = now; onChange(now); }
  });
  obs.observe(doc.body, { childList: true, subtree: true });
  return () => obs.disconnect();
}
