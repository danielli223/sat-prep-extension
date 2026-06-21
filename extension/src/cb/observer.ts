import { readQuestion, type QuestionView } from './reader';

// At most ONE active question-observer per document. A content page runs a single session loop, so a
// second observeQuestions (a fresh runLoop, or this loop's own resume-probe→session handoff) means the
// previous watcher is defunct: leaving it connected would let a stale watcher keep re-emitting questions
// and re-mounting overlays after its session is gone. Supersede it. Keyed weakly so it's GC-safe and
// never pins a document.
const activeStops = new WeakMap<Document, () => void>();

// The question-modal wrapper differs by bank: the EDUCATOR bank renders the question inside
// `.cb-dialog-container`, the STUDENT bank inside `.cb-modal-container` (which IS its [role=dialog]).
// One source of truth for both shapes; consumers still filter on the "Question ID:" heading so the
// student bank's sibling inactivity-timer popup (also a `.cb-modal`, no id) is excluded.
export const QUESTION_MODAL_SELECTOR = '.cb-dialog-container, .cb-modal-container';

// Watches the results page for CB's question modal and emits each distinct question once.
// CB renders the question inside the QUESTION_MODAL_SELECTOR wrapper — NOT inside the bare
// [role="dialog"] node where that differs from it (that node is the modal chrome, and a cookie-consent
// banner also uses role="dialog"). So we match the wrapper that actually holds the "Question ID:" heading.
//
// onModalAppear (optional, #38) fires SYNCHRONOUSLY — off the non-debounced mutation handler — the moment
// a question modal AND its `.answer-content` are present, BEFORE the 150ms read settle. It lets the
// orchestrator curtain CB's raw answer DOM early so it can't flash before the debounced overlay mount. We
// DETECT the region here only; the curtain itself lives in the UI layer (this module must not import src/ui/).
export function observeQuestions(
  doc: Document,
  onShown: (view: QuestionView) => void,
  onModalAppear?: (modal: Element) => void,
): () => void {
  let lastSig: string | null = null;
  let settle: ReturnType<typeof setTimeout> | null = null;
  let lastMasked: Element | null = null;   // #38: the .answer-content we last fired onModalAppear for (dedup)

  // #38 (FOUC): signal the question modal before the 150ms settle so the orchestrator can curtain CB's
  // raw answer region early. CRITICAL: latch on the `.answer-content` ELEMENT, not the modal. CB renders
  // the header BEFORE `.answer-content`, and swaps `.answer-content` for a NEW element on the in-place
  // "Next". Latching on the modal fired once on the bare header (when `.answer-content` did not exist yet,
  // so nothing got curtained) and never re-fired when the region appeared or was replaced — the exact
  // FOUC this was meant to close. Gating on `.answer-content` fires the instant it exists and re-fires for
  // each new one. Uses the SAME bank-agnostic gate/selector as read() so it covers the student bank too.
  // Resets when no modal/region is present so a re-opened question re-fires.
  const signalModal = () => {
    if (!onModalAppear) return;
    // Cheap short-circuit: once we've curtained an `.answer-content` that's STILL connected, later
    // mutations can't be its first appearance (a same-element re-render is handled by the curtain's own
    // child observer), so skip the scan. Falls through the instant CB replaces it (the old node detaches).
    if (lastMasked && lastMasked.isConnected) return;
    if (!doc.location.pathname.includes('/results')) { lastMasked = null; return; }
    const modal = [...doc.querySelectorAll(QUESTION_MODAL_SELECTOR)]
      .find((el) => /Question ID:/i.test(el.textContent ?? '')) ?? null;
    if (!modal) { lastMasked = null; return; }
    const answerContent = modal.querySelector('.answer-content');
    if (!answerContent) return;          // region not rendered yet — retry on the next mutation (don't latch)
    lastMasked = answerContent;
    onModalAppear(modal);
  };

  const read = () => {
    // Bank-agnostic results-page gate: both banks open questions on a `.../results` page (educator
    // `/digital/results`, student `/questionbank/results`), and the manifest only injects us on the two
    // question-bank hosts — so a single `/results` check covers both without naming either bank.
    if (!doc.location.pathname.includes('/results')) return;
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
    const sig = view.id + '' + view.stem + '' + (view.choices.length ? 'mc' : 'grid')
      + '' + view.choices.map((c) => c.text).join('');
    if (sig !== lastSig) { lastSig = sig; onShown(view); }
  };

  // Supersede any still-running watcher for this document before we start (single active watcher
  // invariant above). The previous loop's debounced read/mount won't fire over ours.
  activeStops.get(doc)?.();

  // Debounce reads to the moment the modal STOPS mutating, so an in-place swap settles before we read it.
  // The early curtain (signalModal) runs OFF this same handler but UN-debounced, so it lands before the
  // 150ms settle closes the FOUC window (#38).
  const onMutate = () => { signalModal(); if (settle) clearTimeout(settle); settle = setTimeout(read, 150); };
  const obs = new MutationObserver(onMutate);
  obs.observe(doc.body, { childList: true, subtree: true });
  signalModal(); // #38: curtain an already-present modal synchronously, before the settled read below
  read(); // catch an already-present, settled modal synchronously (e.g. runLoop's resume probe)
  const stop = () => { if (settle) clearTimeout(settle); obs.disconnect(); if (activeStops.get(doc) === stop) activeStops.delete(doc); };
  activeStops.set(doc, stop);
  return stop;
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
