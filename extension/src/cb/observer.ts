import { readQuestion, type QuestionView } from './reader';

// Watches the results page for a rendered question modal and emits each distinct question once.
export function observeQuestions(doc: Document, onShown: (view: QuestionView) => void): () => void {
  let lastId: string | null = null;

  const check = () => {
    if (!doc.location.pathname.includes('/digital/results')) return;
    const modal = doc.querySelector('[role="dialog"]');
    if (!modal) { lastId = null; return; }
    const view = readQuestion(modal);
    if (view && view.id !== lastId) { lastId = view.id; onShown(view); }
  };

  const obs = new MutationObserver(check);
  obs.observe(doc.body, { childList: true, subtree: true });
  check(); // catch an already-present modal
  return () => obs.disconnect();
}
