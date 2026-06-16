import type { IDBPDatabase } from 'idb';
import { openStore, recordAttempt, saveNote, saveSession, getSession, getAttempts } from '../store';
import { makeAttempt, makeNote, makeSession, nowIso, newId } from '../model';
import { observeQuestions } from '../cb/observer';
import { readQuestion, type QuestionView } from '../cb/reader';
import { score } from '../scoring';
import { mountHost, cardSlot } from '../ui/host';
import { toCardVM, type LiveContent } from '../ui/view-model';
import { renderCard, renderVerdict, type CardHandlers } from '../ui/card';
import { renderStartPanel } from '../ui/start-panel';
import { renderPanel } from '../ui/panel';
import { toggleGeoGebra, openDesmos } from '../ui/calculator';
import { newSeed } from '../order';
import type { Session } from '../types';
import { badge } from '../ui/badger';
import { getSeen, getMistakes } from '../journal';
import { deriveStats } from '../stats';
import { resumeSession, type ResumeResult } from '../ui/resume';
import { dropCoachmark, COACHMARK_CLASS } from '../ui/coachmark';
import { OPEN_JOURNAL } from '../messages';
import { readListQuestionIds } from '../cb/list-reader';

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
    onResume: async () => {
      const list = findResultsList(doc);
      if (list && existing) await resumeFor(db, list, existing.filterContext);   // read getSession, rebuild order, scroll
      void start(existing?.orderMode ?? 'list');
    },
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
        // Fire-and-forget from inside the MutationObserver callback. The observer outlives a single
        // runLoop, so a stale write can land after the page (or, in tests, the DB connection) is torn
        // down — that loses to the teardown and is a harmless no-op, never an unhandled rejection.
        void saveSession(db, session).catch(() => {});
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

// Find CB's results list on the page (isolated row→node knowledge stays in list-reader; here we
// only need the container the badger walks). The LIVE CB list is table.cb-table-react with NO
// .results-page wrapper (spike 2026-06-15; see list-reader.ts) — returning the bare table is what the
// real DOM exposes. readListQuestionIds self-matches the table, so the badger anchors on real rows.
export function findResultsList(doc: Document): Element | null {
  return doc.querySelector('table.cb-table-react');
}

/** Read the store and (re)badge the on-screen results list with done/missed/new chips. */
export async function refreshBadges(db: IDBPDatabase, listRoot: Element): Promise<void> {
  badge(listRoot, await getSeen(db));
}

/** Add the journal-panel toggle button to the page (idempotent). Clicking mounts the panel. */
export function mountPanelToggle(doc: Document, onOpen: () => void = () => {}): HTMLButtonElement {
  const existing = doc.querySelector<HTMLButtonElement>('.fp-panel-toggle');
  if (existing) return existing;
  const btn = doc.createElement('button');
  btn.className = 'fp-panel-toggle';
  btn.textContent = 'Journal';
  btn.addEventListener('click', onOpen);
  doc.body.appendChild(btn);
  return btn;
}

/** Contract §2.3 resume read, used by the start panel's onResume and the integration boot. */
export function resumeFor(db: IDBPDatabase, listRoot: Element, filterContext: string): Promise<ResumeResult | null> {
  return resumeSession(db, listRoot, filterContext);
}

/** Wire the panel's Practice/Find coachmark links: open CB (the <a> default) AND drop a coachmark
 *  that, on confirm, re-runs the badger to highlight the now-filtered questions (spec §7 hand-off).
 *  We never automate CB's filter — the student sets it (D3); confirm only re-badges what's on screen. */
export function bindPanelCoachmarks(host: ShadowRoot, db: IDBPDatabase, listRoot: Element): void {
  host.querySelectorAll<HTMLAnchorElement>('a.fp-practice-link, a.fp-find-link').forEach((a) => {
    a.addEventListener('click', () => {
      const skill = a.dataset.skill ?? '';
      dropCoachmark(host, {
        skill,
        onConfirm: () => {
          // Paint chips synchronously for an instant highlight, then reconcile with the store's
          // done/missed map (idempotent: the async pass replaces these chips, never duplicates).
          badge(listRoot, {});
          void refreshBadges(db, listRoot);
        },
      });
    });
  });
}

/** Badge the results list now and whenever CB (re)renders it. The React list is NOT in the DOM at
 *  document_idle, so a one-shot boot badge misses it, and observeQuestions only fires on question
 *  modals — not list changes (live 2026-06-16: chips never appeared on the list view). Gate on the
 *  row-id signature so the badger's OWN chip mutations don't re-trigger (no mutate→observe→mutate loop;
 *  readListQuestionIds ignores chip text, so the signature is stable once badged). Returns disconnect. */
export function watchResultsList(doc: Document, db: IDBPDatabase): () => void {
  let lastSig = '';
  const reBadge = (): void => {
    const list = findResultsList(doc);
    if (!list) return;
    const sig = readListQuestionIds(list).map((r) => r.id).join(',');
    if (sig && sig !== lastSig) { lastSig = sig; void refreshBadges(db, list); }
  };
  reBadge();
  const mo = new MutationObserver(reBadge);
  mo.observe(doc.body, { childList: true, subtree: true });
  return () => mo.disconnect();
}

/** Single panel-mount path: the toggle button and the popup's open-journal message both call this. */
export async function handleMessage(db: IDBPDatabase, msg: { type?: string }): Promise<void> {
  if (msg?.type !== OPEN_JOURNAL) return;
  const host = mountHost(document);
  // Clear any coachmark left over from a prior open (the panel re-renders into the same .fp-panel,
  // but a stale .fp-coachmark would otherwise persist across re-opens).
  host.querySelector(`.${COACHMARK_CLASS}`)?.remove();
  renderPanel(host, { stats: deriveStats(await getAttempts(db)), mistakes: await getMistakes(db) });
  // Bind the coachmark links AFTER the panel exists — renderPanel injects a.fp-practice-link /
  // a.fp-find-link, so binding earlier (e.g. at boot, against an empty host) matches nothing.
  const list = findResultsList(document);
  if (list) bindPanelCoachmarks(host, db, list);
}

// Boot (skipped under test: no chrome runtime). Plan 2 runs the scored loop; Plan 3 adds the
// badger + journal panel toggle + coachmark binding + the open-journal message listener.
if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
  void (async () => {
    const db = await openStore();
    await runLoop(document, db, deviceId());                  // Plan 2 scored loop (unchanged)

    mountPanelToggle(document, () => void handleMessage(db, { type: OPEN_JOURNAL }));
    watchResultsList(document, db);   // badge on list render + whenever CB re-renders it (coachmarks bind on panel open)
    chrome.runtime.onMessage.addListener((m: { type?: string }) => { void handleMessage(db, m); });
  })();
}
