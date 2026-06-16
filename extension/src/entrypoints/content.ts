import type { IDBPDatabase } from 'idb';
import { openStore, recordAttempt, saveNote, saveSession, getSession } from '../store';
import { makeAttempt, makeNote, makeSession, nowIso, newId } from '../model';
import { observeQuestions } from '../cb/observer';
import { readQuestion, type QuestionView } from '../cb/reader';
import { score } from '../scoring';
import { mountHost, cardSlot } from '../ui/host';
import { toCardVM, type LiveContent } from '../ui/view-model';
import { renderCard, renderVerdict, type CardHandlers } from '../ui/card';
import { renderStartPanel } from '../ui/start-panel';
import { toggleGeoGebra, openDesmos } from '../ui/calculator';
import { newSeed } from '../order';
import type { Session } from '../types';

const DEVICE_KEY = 'fp-device-id';
function deviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) { id = newId(); localStorage.setItem(DEVICE_KEY, id); }
  return id;
}

// "SAT|Math|<domain>|<difficulty-or-Any>" — derived from the question's own taxonomy (we never read
// CB's filter form, per Decision D3).
function filterContextOf(v: QuestionView): string {
  return `SAT|${v.section}|${v.domain}|${v.difficulty || 'Any'}`;
}

// Loaded-results count N for the "Q n of N" header. A plain count of CB's rendered result rows —
// NOT Plan 3's readListQuestionIds selector, and NOT a stored questionID→metadata index (spec §10).
// Falls back to 1 when CB shows a single open question with no surrounding list.
//
// table.cb-table-react tbody tr is the live CB results list (confirmed in the 2026-06-15 spike:
// 10 loaded rows). The other selectors are synthetic-fixture/defensive fallbacks. Plan 3 owns the
// verified list reader (readListQuestionIds) and may supersede this. Display-only ("Q n of N"),
// never stored — if every selector misses, N degrades gracefully to the documented 1 fallback.
function countLoadedResults(doc: Document): number {
  return Math.max(1, doc.querySelectorAll(
    'table.cb-table-react tbody tr, [data-testid="result-row"], table.results-list tbody tr').length);
}

// Spike addendum (2026-06-15, design spec §12.1): CB injects the rationale — and therefore the
// correct answer — into the DOM ONLY when its "Show correct answer and explanation" checkbox is
// checked; it is absent (not merely hidden) otherwise. Reads the rendered DOM + toggles ONE control
// on the CURRENT user-chosen question — no API call, no enumeration, no prefetch. The focus card
// overlays the dimmed CB page (D2), so the student never sees CB's revealed answer until our own
// verdict/explanation step. Selector observed live in the spike (.hide-rationale-checkbox).
function ensureAnswerRevealed(doc: Document): void {
  const box = doc.querySelector<HTMLInputElement>('.hide-rationale-checkbox input[type="checkbox"]');
  if (box && !box.checked) box.click();
}

// Find CB's live dialog container for a given question id. The QuestionView captured when the modal
// first appeared predates the reveal, so check-time/reveal-time reads must go back to the live DOM.
function currentModal(doc: Document, id: string): Element | null {
  return [...doc.querySelectorAll('.cb-dialog-container')]
    .find((el) => (el.textContent ?? '').includes(`Question ID: ${id}`)) ?? null;
}

// Read the correct answer AT CHECK TIME from the live container (correctAnswer === null at observe
// time, before CB injects the rationale on reveal).
function currentCorrectAnswer(doc: Document, id: string): string | null {
  const modal = currentModal(doc, id);
  return modal ? (readQuestion(modal)?.correctAnswer ?? null) : null;
}

// Read the explanation AT REVEAL/CHECK TIME from the live container. Like the answer, CB injects the
// rationale text into the DOM only after ensureAnswerRevealed clicks the reveal box, so the
// observe-time view.explanation is null in the real reveal-gated flow — never trust that snapshot.
function currentExplanation(doc: Document, id: string): string | null {
  const modal = currentModal(doc, id);
  return modal ? (readQuestion(modal)?.explanation ?? null) : null;
}

export async function runLoop(doc: Document, db: IDBPDatabase, dev: string): Promise<ShadowRoot> {
  const shadow = mountHost(doc);

  // Probe an already-present question so the start panel can offer Resume when a session exists.
  let probedFilter: string | null = null;
  const probeStop = observeQuestions(doc, (v) => { probedFilter ??= filterContextOf(v); });
  probeStop();
  const existing = probedFilter ? await getSession(db, probedFilter) : undefined;

  renderStartPanel(shadow, { hasSession: !!existing }, {
    onStartList: () => start('list'),
    onStartRandom: () => start('random'),
    onResume: () => start(existing?.orderMode ?? 'list'),   // Plan 3 deepens resume; here we just begin the loop
  });

  let session: Session | null = null;
  let stop: (() => void) | null = null;
  let total = 1;   // loaded-results count N for "Q n of N"; fixed at Start

  function start(orderMode: 'list' | 'random'): void {
    cardSlot(shadow).replaceChildren();   // dismiss the start panel so the student can open a CB question
    total = countLoadedResults(doc);   // read N once, before the first card paints
    let started = false;
    stop = observeQuestions(doc, (view) => {
      if (!started) {
        started = true;
        session = makeSession({
          deviceId: dev, filterContext: filterContextOf(view), orderMode,
          shuffleSeed: orderMode === 'random' ? newSeed() : 0,
        });
        void saveSession(db, session);
      }
      showQuestion(view);
    });
  }

  let index = 0;
  let checked = false;   // per-question guard: at most one attempt recorded per Check session (reset on show)
  function showQuestion(view: QuestionView): void {
    checked = false;   // new question on screen → re-arm scoring
    ensureAnswerRevealed(doc);   // trigger CB's reveal so the answer is in the DOM by Check time (spike)
    // Read the explanation LIVE from the post-reveal DOM, never the observe-time snapshot (which is
    // null before CB injects the rationale). Falls back to the snapshot only if the live read fails.
    const live: LiveContent = {
      stem: view.stem,
      explanationGetter: () => currentExplanation(doc, view.id) ?? view.explanation,
    };
    const handlers: CardHandlers = {
      onSelect: () => {},
      onEliminate: () => {},
      onCheck: (pick) => onCheck(view, pick),
      onReveal: () => {},
      onNote: (text) => { if (text) void saveNote(db, makeNote({ deviceId: dev, questionId: view.id, text })); },
      onNext: () => onNext(view),
      onToggleCalc: () => toggleGeoGebra(shadow),
      onOpenDesmos: () => openDesmos(),
    };
    renderCard(shadow, toCardVM(view, index, total), live, handlers);   // "Q n of N", never "Q n of n"
  }

  async function onCheck(view: QuestionView, pick: string): Promise<void> {
    if (checked) return;   // ignore repeat Check clicks: makeAttempt mints a fresh id, so re-recording
                           // would write duplicate attempts and corrupt Plan 3's deriveStats.
    checked = true;
    // Read the answer at CHECK TIME from the live DOM (spike) — the QuestionView captured on show
    // predates CB's reveal, so its correctAnswer may be stale/null.
    const answer = currentCorrectAnswer(doc, view.id);
    const result = score(pick, answer ?? '');
    const live: LiveContent = {
      stem: view.stem,
      explanationGetter: () => currentExplanation(doc, view.id) ?? view.explanation,
    };
    if (result.graded && answer) {
      // mark the correct choice so renderVerdict can light it green even on a wrong pick
      const correctLetter = answer.trim().toUpperCase();
      shadow.querySelector(`.fp-choice[data-letter="${correctLetter}"]`)?.setAttribute('data-correct', 'true');
      await recordAttempt(db, makeAttempt({
        deviceId: dev, questionId: view.id, section: view.section, domain: view.domain,
        skill: view.skill, difficulty: view.difficulty, pick, correct: result.correct,
      }));
    }
    renderVerdict(shadow, { pick, result }, live);   // graded===false → non-verdict state (contract §2.4)
  }

  async function onNext(view: QuestionView): Promise<void> {
    index++;
    cardSlot(shadow).replaceChildren();   // clear our card so the student can navigate CB to the next question
    if (session) {
      session.lastQuestionId = view.id;
      session.updatedAt = nowIso();
      session.dirty = true;
      await saveSession(db, session);
    }
    // No auto-advance / prefetch: the next question appears only when the student navigates CB.
  }

  return shadow;
}

// Boot (only fires in the extension, not in unit tests which import runLoop directly).
if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
  void openStore().then((db) => runLoop(document, db, deviceId()));
}
