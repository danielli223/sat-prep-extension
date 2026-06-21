import { readQuestion, type QuestionView } from './reader';

// At most ONE active question-observer per document. A content page runs a single session loop, so a
// second observeQuestions (a fresh runLoop, or this loop's own resume-probe→session handoff) means the
// previous watcher is defunct: leaving it connected would let a stale watcher keep re-emitting questions
// and re-mounting overlays after its session is gone. Supersede it. Keyed weakly so it's GC-safe and
// never pins a document.
const activeStops = new WeakMap<Document, () => void>();

// Watches the results page for CB's question modal and emits each distinct question once.
// CB renders the question inside div.cb-dialog-container — NOT inside the [role="dialog"] node
// (that node is the modal chrome, and a cookie-consent banner also uses role="dialog"). So we match
// the dialog container that actually holds the "Question ID:" heading.
//
// onModalAppear (optional, #38) fires SYNCHRONOUSLY — off the non-debounced mutation handler — the
// moment a question modal is present, BEFORE the 150ms read settle. It lets the orchestrator mask CB's
// raw answer DOM early so it can't flash before the debounced overlay mount. We DETECT the modal here
// only; the masking itself lives in the UI layer (this module must not import src/ui/). Fired once per
// distinct modal (tracked by identity) so it doesn't thrash on every mutation; reset when no modal.
export function observeQuestions(
  doc: Document,
  onShown: (view: QuestionView) => void,
  onModalAppear?: (modal: Element) => void,
): () => void {
  let lastSig: string | null = null;
  let settle: ReturnType<typeof setTimeout> | null = null;
  let lastSignaled: Element | null = null;   // #38: the modal we last fired onModalAppear for (dedup)

  // #38: detect CB's question modal under the SAME gates the read uses (results page + the
  // "Question ID:" heading present), and signal it once before the 150ms settle. Resets the dedup when
  // no modal is on screen so a re-opened modal re-fires.
  const signalModal = () => {
    if (!onModalAppear) return;
    // Cheap short-circuit before the DOM scan: once we've signaled a modal that's STILL connected, this
    // mutation can't be its first appearance, so skip the scan entirely (it would dedup anyway). This
    // keeps the un-debounced per-mutation hook nearly free until the modal is actually swapped/removed.
    if (lastSignaled && lastSignaled.isConnected) return;
    if (!doc.location.pathname.includes('/digital/results')) { lastSignaled = null; return; }
    const modal = [...doc.querySelectorAll('.cb-dialog-container')]
      .find((el) => /Question ID:/i.test(el.textContent ?? '')) ?? null;
    if (!modal) { lastSignaled = null; return; }
    if (modal === lastSignaled) return;   // already masked this modal — don't thrash on every mutation
    lastSignaled = modal;
    onModalAppear(modal);
  };

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

  // Supersede any still-running watcher for this document before we start (single active watcher
  // invariant above). The previous loop's debounced read/mount won't fire over ours.
  activeStops.get(doc)?.();

  // Debounce reads to the moment the modal STOPS mutating, so an in-place swap settles before we read it.
  // The early mask (signalModal) runs OFF this same handler but UN-debounced, so it lands before the
  // 150ms settle closes the FOUC window (#38).
  const onMutate = () => { signalModal(); if (settle) clearTimeout(settle); settle = setTimeout(read, 150); };
  const obs = new MutationObserver(onMutate);
  obs.observe(doc.body, { childList: true, subtree: true });
  signalModal(); // #38: mask an already-present modal synchronously, before the settled read below
  read(); // catch an already-present, settled modal synchronously (e.g. runLoop's resume probe)
  const stop = () => { if (settle) clearTimeout(settle); obs.disconnect(); if (activeStops.get(doc) === stop) activeStops.delete(doc); };
  activeStops.set(doc, stop);
  return stop;
}
