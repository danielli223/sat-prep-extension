import { readQuestion, type QuestionView } from './reader';

// Watches the results page for CB's question modal and emits each distinct question once.
// CB renders the question inside div.cb-dialog-container — NOT inside the [role="dialog"] node
// (that node is the modal chrome, and a cookie-consent banner also uses role="dialog"). So we match
// the dialog container that actually holds the "Question ID:" heading.
export function observeQuestions(doc: Document, onShown: (view: QuestionView) => void): () => void {
  let lastId: string | null = null;

  const check = () => {
    if (!doc.location.pathname.includes('/digital/results')) return;
    const modal = [...doc.querySelectorAll('.cb-dialog-container')]
      .find((el) => /Question ID:/i.test(el.textContent ?? '')) ?? null;
    if (!modal) { lastId = null; return; }
    const view = readQuestion(modal);
    if (view && view.id !== lastId) { lastId = view.id; onShown(view); }
  };

  const obs = new MutationObserver(check);
  obs.observe(doc.body, { childList: true, subtree: true });
  check(); // catch an already-present modal
  return () => obs.disconnect();
}
