import type { IDBPDatabase } from 'idb';
import { openStore, recordAttempt, saveNote, saveSession, getSession, getAttempts } from '../store';
import { makeAttempt, makeNote, makeSession, nowIso, newId } from '../model';
import { observeQuestions } from '../cb/observer';
import { readQuestion, type QuestionView } from '../cb/reader';
import { score } from '../scoring';
import { mountHost, cardSlot } from '../ui/host';
import { toCardVM } from '../ui/view-model';
import {
  findAnswerContent, mountAnswerOverlay, unmountAnswerOverlay, renderVerdict, renderNeedAnswer,
  renderStaleCard, revealRationale, type AnswerHandlers,
} from '../ui/answer-overlay';
import { renderStartPanel } from '../ui/start-panel';
import { renderPanel } from '../ui/panel';
import { openDesmos } from '../ui/calculator';
import { newSeed } from '../order';
import type { Session, Attempt } from '../types';
import { badge } from '../ui/badger';
import { getSeen, getMistakes } from '../journal';
import { deriveStats } from '../stats';
import { resumeSession, type ResumeResult } from '../ui/resume';
import { dropCoachmark, COACHMARK_CLASS } from '../ui/coachmark';
import { OPEN_JOURNAL } from '../messages';
import { emit } from '../telemetry/emit';
import {
  buildPracticeStarted, buildQuestionAttempted, buildNoteAdded, buildCalculatorOpened,
  buildPracticeResumed, buildSessionEnded, JOURNAL_OPENED,
  DOM_CONTRACT_FAILED, BLOCK_DETECTED, KILLSWITCH_ACTIVATED, UNSCORED_FALLBACK, JS_ERROR,
} from '../telemetry/events';
import { readListQuestionIds } from '../cb/list-reader';
import { isEnabled } from '../resilience/killswitch';    // Plan 4 (§2.5)
import { detectBlock } from '../resilience/block-detect';// Plan 4 (§8.3)
import { checkContract, renderBanner, renderBlockNotice, bumpFailureCounter } from '../resilience/contract-check'; // Plan 4 (§2.4/§8.3)

const DEVICE_KEY = 'fp-device-id';
function deviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) { id = newId(); localStorage.setItem(DEVICE_KEY, id); }
  return id;
}

// Issue #34: the difficulty options for the journal's multi-select filter, derived solely from the
// difficulties present in the student's own attempts. Canonical order first (Easy/Medium/Hard), then
// any others alphabetically, so the control stays stable across re-opens. Skips tombstoned attempts.
const DIFFICULTY_ORDER = ['Easy', 'Medium', 'Hard'];
function difficultyOptions(attempts: Attempt[]): string[] {
  const present = new Set<string>();
  for (const a of attempts) { if (!a.deleted && a.difficulty) present.add(a.difficulty); }
  const known = DIFFICULTY_ORDER.filter((d) => present.has(d));
  const others = [...present].filter((d) => !DIFFICULTY_ORDER.includes(d)).sort();
  return [...known, ...others];
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
  if (!box) return;
  if (doc.querySelector('.rationale')) return;   // goal already met — rationale is in the DOM, nothing to do
  // No rationale yet. Drive CB's reveal with real CLICKS ONLY — never by assigning `box.checked`. From
  // the content script's isolated world, `box.checked = …` writes through the native setter and does NOT
  // update React's internal value-tracker (which lives in the page's main world), so CB's onChange sees
  // "no change" on the following click and never injects the rationale — a permanent "couldn't grade"
  // even with the box reading checked (live 2026-06-16; confirmed by tracing the reveal poll in the real
  // extension). A genuine click performs the native toggle AND dispatches the change React processes, keeping its tracker in
  // sync. Gate on the GOAL (rationale present), not the checkbox state: click once to flip; if that left
  // it unchecked, click again to land it checked → CB injects.
  box.click();
  if (!box.checked) box.click();
}

// CB's question modal carries its own "Next" control that advances to the next question IN PLACE. On the
// student's Next we actuate it — same posture as ensureAnswerRevealed: actuate CB's own control on the
// current user-chosen question, no API call / no enumeration / no prefetch — and observeQuestions then
// re-renders our card for the question CB loads. Returns false when there's no enabled Next (the last
// item / a single-question view) so the caller can fall back to dismissing the card. Our own .fp-next
// lives inside the shadow root, so this light-DOM query never matches it.
function clickCbNext(doc: Document): boolean {
  const btn = [...doc.querySelectorAll<HTMLButtonElement>('button')]
    .find((b) => (b.textContent ?? '').trim() === 'Next' && !b.disabled);
  if (!btn) return false;
  btn.click();
  return true;
}

// Find CB's live dialog container for a given question id. The QuestionView captured when the modal
// first appeared predates the reveal, so check-time/reveal-time reads (and the overlay mount) must go
// back to the live DOM.
function currentModal(doc: Document, id: string): Element | null {
  // Defense-in-depth: CB question ids are exactly 8 hex. VALIDATE the id to that shape before
  // interpolating it into a RegExp, so a malformed/hostile id can't inject regex metacharacters or
  // broaden the match — anything that isn't 8 hex never reaches the pattern. (A trailing
  // `(?![0-9a-f])` lookahead is NOT usable here: in textContent the id abuts CB's own markup with no
  // separator — e.g. "…dead9999Assessment" — so a following hex-range letter would false-reject the
  // real match. The 8-hex validation is the load-bearing guard.)
  if (!/^[0-9a-f]{8}$/i.test(id)) return null;
  const re = new RegExp(`Question ID:\\s*${id}`, 'i');
  return [...doc.querySelectorAll('.cb-dialog-container')]
    .find((el) => re.test(el.textContent ?? '')) ?? null;
}

// The overlay's shadow root for a given question id, or null if its host isn't mounted (the modal is
// gone, or CB has no .answer-content). Check-time helpers retarget the verdict/state to THIS shadow.
function overlayShadow(doc: Document, id: string): ShadowRoot | null {
  const modal = currentModal(doc, id);
  const ac = modal ? findAnswerContent(modal) : null;
  return ac?.querySelector('.fp-answer-host')?.shadowRoot ?? null;
}

// Read the correct answer AT CHECK TIME from the live container (correctAnswer === null at observe
// time, before CB injects the rationale on reveal).
function currentCorrectAnswer(doc: Document, id: string): string | null {
  const modal = currentModal(doc, id);
  return modal ? (readQuestion(modal)?.correctAnswer ?? null) : null;
}

// CB injects the rationale — and thus the correct answer — into the DOM ASYNCHRONOUSLY after the
// reveal box is checked. If the student clicks Check before it lands (they checked fast, or just
// navigated to this question), the answer reads as null and a perfectly gradeable question would
// wrongly show "couldn't grade" (a trust-killer, live 2026-06-16). Re-nudge the reveal and poll
// briefly (~1s) before giving up; the common case (answer already present) returns on the first read.
async function awaitCorrectAnswer(doc: Document, id: string): Promise<string | null> {
  let answer = currentCorrectAnswer(doc, id);
  for (let i = 0; answer === null && i < 10; i++) {
    ensureAnswerRevealed(doc);
    await new Promise((r) => setTimeout(r, 100));
    answer = currentCorrectAnswer(doc, id);
  }
  return answer;
}

// §8.5 graceful degradation: an IndexedDB write failure must leave the session WORKING but untracked,
// never throw into the loop. Wrap each Plan 2 store write (recordAttempt / saveNote / saveSession) in this.
export async function safeWrite(write: Promise<unknown>): Promise<void> {
  try { await write; } catch { /* §8.5: session works, this datum is just untracked */ }
}

// §2.4 degraded path, extracted from showQuestion so it is unit-testable. On a failed contract check
// we show the non-verdict banner in the BODY host + bump the failure counter and DO NOT mount the
// overlay. `renderQuestion` is showQuestion's overlay-mount thunk (mountAnswerOverlay into CB's
// .answer-content); the gate's shape is unchanged — only what the thunk does is now the overlay mount.
export async function handleQuestion(
  shadow: ShadowRoot,
  view: QuestionView | null,
  renderQuestion: () => void,
): Promise<void> {
  const contract = checkContract(view);
  if (!contract.ok) {
    renderBanner(shadow);
    await bumpFailureCounter();
    emit({ event: DOM_CONTRACT_FAILED, props: { failure_reason: contract.reason ?? 'unreadable', question_id: view?.id ?? null } });
    return;
  }
  renderQuestion(); // contract passed → mount the answer overlay into CB's live .answer-content
}

// §2.5 + §8.3 gate that wraps Plan 2/3's start. `runner` is the post-Plan-3 startup body (runLoop +
// badger + panel toggle + handleMessage listener). Disabled flag → mount nothing. CB block → mount
// the §8.3 "use CB directly" notice and return; never retry, never call the API.
export async function guardedStart(doc: Document, runner: () => Promise<void>): Promise<void> {
  // isEnabled() fetches OUR config host only (never CB) — so a takedown flag wins over a block, and
  // the §8.3 "never call the API" rule is intact: the only network here is to our own kill-switch.
  if (!(await isEnabled())) { emit({ event: KILLSWITCH_ACTIVATED, props: {} }); return; } // §2.5: hosted kill-switch off
  if (detectBlock(doc) !== null) {                  // §8.3: CB block — pure DOM read, no network
    emit({ event: BLOCK_DETECTED, props: { block_reason: detectBlock(doc) ?? 'forbidden' } });
    renderBlockNotice(mountHost(doc));              // disable AND point the student to CB
    return;
  }
  await runner();
}

export async function runLoop(doc: Document, db: IDBPDatabase, dev: string): Promise<ShadowRoot> {
  // The BODY host (single shadow root) still owns the start panel and the floating calculator. The
  // QUESTION overlay mounts inside CB's live .answer-content (not this host) — onClose removes the
  // overlay host from .answer-content directly, leaving CB's own question intact.
  const shadow = mountHost(doc);

  // Probe an already-present question so the start panel can offer Resume when a session exists.
  let probedFilter: string | null = null;
  const probeStop = observeQuestions(doc, (v) => { probedFilter ??= filterContextOf(v); });
  probeStop();
  const existing = probedFilter ? await getSession(db, probedFilter) : undefined;

  renderStartPanel(shadow, { hasSession: !!existing }, {
    onStartList: () => start('list'),
    onStartRandom: () => start('random'),
    onClose: () => cardSlot(shadow).replaceChildren(),   // hide the start panel without starting a session
    onResume: async () => {
      const list = findResultsList(doc);
      if (list && existing) {
        const resumed = await resumeFor(db, list, existing.filterContext);   // read getSession, rebuild order, scroll
        if (resumed) {
          emit(buildPracticeResumed({
            sessionId: resumed.session.sessionId,
            resumeIndex: Math.max(0, resumed.plan.resumeIndex),
            totalInOrder: resumed.plan.order.length,
          }));
        }
      }
      void start(existing?.orderMode ?? 'list');
    },
  });

  let session: Session | null = null;
  let stop: (() => void) | null = null;
  let total = 1;   // loaded-results count N for "Q n of N"; fixed at Start
  const revealedIds = new Set<string>(); // per-question reveal tracking (reset on new session, keyed by question id)

  // Per-session stats for session_ended (emitted once on pagehide if a session is active). Reset when a
  // new session is created. Counts attempts that recorded (graded) and how many were correct.
  let sessionStartMs = 0;
  let attempted = 0;
  let correct = 0;

  const revealedFor = (id: string) => revealedIds.has(id);

  // session_ended fires once, when the page goes away (pagehide), if a session was active this sitting.
  // pagehide is the reliable MV3/bfcache-safe teardown signal (unload is unreliable). Best-effort emit.
  const onPageHide = (): void => {
    if (!session) return;
    emit(buildSessionEnded({
      sessionId: session.sessionId, attempted,
      accuracyPct: attempted ? Math.round((correct / attempted) * 100) : 0,
      durationMs: Date.now() - sessionStartMs,
    }));
  };
  (typeof self !== 'undefined' ? self : window).addEventListener?.('pagehide', onPageHide);

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
        sessionStartMs = Date.now(); attempted = 0; correct = 0;   // start the session_ended stat window
        // Fire-and-forget from inside the MutationObserver callback. The observer outlives a single
        // runLoop, so a stale write can land after the page (or, in tests, the DB connection) is torn
        // down — that loses to the teardown and is a harmless no-op, never an unhandled rejection.
        void safeWrite(saveSession(db, session));   // §8.5: best-effort; an IDB failure leaves the session untracked, not broken
        emit(buildPracticeStarted({
          sessionId: session.sessionId, orderMode, resultCount: total,
          filterContext: session.filterContext,
        }));
      }
      showQuestion(view);
    });
  }

  let index = 0;
  let checked = false;   // per-question guard: at most one attempt recorded per Check session (reset on show)
  function showQuestion(view: QuestionView): void {
    checked = false;   // new question on screen → re-arm scoring
    // Refresh "Q n of N": the results list may not have been in the DOM at Start (e.g. the student
    // opened a question first), which left N stuck at the fallback 1 ("Q 2 of 1", live 2026-06-16).
    // It is in the DOM behind the modal now. Never let N drop below the current position.
    total = Math.max(total, countLoadedResults(doc), index + 1);

    // Locate CB's live modal + its .answer-content. We render ONLY our interaction INSIDE that region;
    // CB renders the question stem + rationale natively. No card fallback — if the answerable region
    // isn't there yet, no-op (the observer re-emits when the modal finishes rendering).
    const modal = currentModal(doc, view.id);
    const answerContent = modal ? findAnswerContent(modal) : null;
    if (!answerContent) return;

    const handlers: AnswerHandlers = {
      onSelect: () => {},
      onEliminate: () => {},
      onCheck: (pick) => onCheck(view, pick),
      // Reveal: un-hide CB's OWN rationale (the overlay hid it on mount/observer) — CB renders the
      // explanation natively now, so there's nothing for us to render. Sole un-hider.
      onReveal: () => { revealedIds.add(view.id); revealRationale(answerContent); },
      onNote: (text) => {
        if (text) {
          void safeWrite(saveNote(db, makeNote({ deviceId: dev, questionId: view.id, text })));
          emit(buildNoteAdded({ sessionId: session?.sessionId ?? '', questionId: view.id, noteLength: text.length }));
        }
      },
      onNext: () => onNext(view),
      // The one calculator IS the real Desmos (issue #17): open it externally — never an in-page
      // embed. A new window each click; nothing persists in our shadow.
      onOpenDesmos: () => { openDesmos(); emit(buildCalculatorOpened({ sessionId: session?.sessionId ?? '', calculatorType: 'desmos' })); },
      // ✕ tears down our overlay AND restores CB's masked native nodes, so closing never leaves CB's
      // own question blanked at display:none.
      onClose: () => { unmountAnswerOverlay(answerContent); },
    };

    // §2.4: only mount the overlay when the DOM contract holds; otherwise degrade to the banner in the
    // body host. The renderQuestion thunk mounts the overlay into CB's .answer-content ("Q n of N").
    void handleQuestion(shadow, view, () => {
      mountAnswerOverlay(answerContent, toCardVM(view, index, total), handlers);
      // Trigger CB's reveal ONLY after the overlay is mounted (S1): so (a) a failed contract never
      // reveals CB's answer un-masked, and (b) the hide-observer installed by mount is live BEFORE CB
      // injects .rationale (~150ms later) → the late node gets hidden, not leaked inline. Scoring
      // still reads the (hidden) rationale at Check time (awaitCorrectAnswer / currentCorrectAnswer).
      ensureAnswerRevealed(doc);
    });
  }

  async function onCheck(view: QuestionView, pick: string): Promise<void> {
    if (checked) return;   // ignore repeat Check clicks: makeAttempt mints a fresh id, so re-recording
                           // would write duplicate attempts and corrupt Plan 3's deriveStats.
    // Everything we render now lands in the OVERLAY shadow (mounted in CB's .answer-content), not the
    // body host. Re-resolve it each time: CB can swap .answer-content on its in-place Next.
    const overlay = overlayShadow(doc, view.id);
    // Empty answer: there's nothing to grade — prompt the student rather than show the alarming
    // "couldn't grade". Do NOT consume the per-question guard, so they can answer and press Check again.
    if (pick.trim() === '') { if (overlay) renderNeedAnswer(overlay, view.choices.length ? 'mc' : 'grid'); return; }
    checked = true;
    // Read the answer at CHECK TIME from the live DOM (spike) — the QuestionView captured on show
    // predates CB's reveal. Usually it's already present (synchronous fast path); only if it isn't —
    // CB injects the rationale async after reveal and a too-fast Check can beat it — do we poll, so a
    // gradeable question never shows a spurious "couldn't grade" (live 2026-06-16).
    let answer = currentCorrectAnswer(doc, view.id);
    if (answer === null) answer = await awaitCorrectAnswer(doc, view.id);
    // Stale-card guard: if the overlay's kind (MC vs grid-in) disagrees with CB's answer format — an MC
    // overlay whose answer is a grid-in value, or vice versa — the overlay is out of sync with the live
    // question. CB swaps questions IN PLACE and can leave the previous question's choices behind (live
    // 2026-06-16), so grading the pick would score it against the WRONG question. Refuse rather than emit
    // a bogus verdict; reopening the question re-mounts a fresh, consistent overlay.
    if (answer && (view.choices.length > 0) !== /^[A-D]$/i.test(answer.trim())) {
      if (overlay) renderStaleCard(overlay);
      return;
    }
    const result = score(pick, answer ?? '');
    if (result.graded && answer) {
      // mark the correct choice on the OVERLAY shadow so renderVerdict can light it green even on a
      // wrong pick
      const correctLetter = answer.trim().toUpperCase();
      // Defense-in-depth: only interpolate a known A–D letter into the selector (grid-in answers were
      // already turned away by the stale-card guard above). Anything else → don't build a selector.
      if (overlay && /^[A-D]$/.test(correctLetter)) {
        overlay.querySelector(`.fp-choice[data-letter="${correctLetter}"]`)?.setAttribute('data-correct', 'true');
      }
      await safeWrite(recordAttempt(db, makeAttempt({
        deviceId: dev, questionId: view.id, section: view.section, domain: view.domain,
        skill: view.skill, difficulty: view.difficulty, pick, correct: result.correct,
      })));
      attempted++; if (result.correct) correct++;   // feed session_ended's accuracy/attempted buckets
      // Reflect the just-recorded result on the underlying results list NOW, so its done/missed chip
      // updates without a manual page refresh. The list sits behind the modal; watchResultsList only
      // repaints when the row-ID set changes, not when the student's own data does — so this answer-
      // driven change has no other repaint path. Safe re-entrancy: readListQuestionIds ignores chip
      // text, so this chip mutation leaves the ID signature stable and never re-triggers that observer.
      // Fire-and-forget (same posture as the coachmark re-badge): the chip lives behind the modal, so a
      // background repaint must never delay the verdict the student is waiting on, and we already
      // awaited recordAttempt above, so getSeen reads the just-recorded result.
      const list = findResultsList(doc);
      if (list) void refreshBadges(db, list);
    }
    emit(buildQuestionAttempted({
      sessionId: session?.sessionId ?? '', questionId: view.id, choicesLength: view.choices.length,
      result, revealUsed: revealedFor(view.id), section: view.section, domain: view.domain,
      skill: view.skill, difficulty: view.difficulty,
    }));
    if (!result.graded) emit({ event: UNSCORED_FALLBACK, props: { session_id: session?.sessionId ?? '', question_id: view.id } });
    if (overlay) renderVerdict(overlay, { pick, result });   // graded===false → non-verdict state (contract §2.4)
  }

  async function onNext(view: QuestionView): Promise<void> {
    index++;
    if (session) {
      session.lastQuestionId = view.id;
      session.updatedAt = nowIso();
      session.dirty = true;
      await safeWrite(saveSession(db, session));
    }
    // Advance: actuate CB's own Next so it loads the next question; observeQuestions then re-mounts the
    // overlay for it (no spurious "the card just closed"). Only dismiss the overlay when CB has no next
    // question (last item / single-question view), so the student isn't left staring at a stale overlay.
    // The fallback tears down our overlay AND restores CB's masked native nodes; CB's question stays put.
    if (!clickCbNext(doc)) {
      const modal = currentModal(doc, view.id);
      const ac = modal ? findAnswerContent(modal) : null;
      if (ac) unmountAnswerOverlay(ac);
    }
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
  btn.textContent = '📓 Journal';
  // Light-DOM launcher (not in our shadow), so style inline: a fixed pill in the top-right corner.
  btn.style.cssText = 'position:fixed;top:12px;right:12px;z-index:2147483000;background:#3b82f6;color:#fff;' +
    'border:none;border-radius:9px;padding:8px 14px;font:700 13px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;' +
    'cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.2);';
  // This launcher is in the LIGHT DOM, OUTSIDE the overlay host — so it misses the host's pointer guard
  // (host.ts). CB closes its open question modal on an outside pointer-down/click, so a real click here
  // would bubble to the document and trip that close, dismissing the open problem page (reported
  // 2026-06-18). Swallow our own pointer events at the button, exactly as the host does for the overlay.
  for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'] as const) {
    btn.addEventListener(t, (e) => e.stopPropagation());
  }
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
  const attempts = await getAttempts(db);
  // Issue #34: the difficulty option list is derived from the student's own attempts, in a stable
  // canonical order (Easy/Medium/Hard first, then any others), so the multi-select only ever offers
  // difficulties the student has actually answered. No selection = all (the empty Set).
  const difficulties = difficultyOptions(attempts);
  renderPanel(host, {
    stats: deriveStats(attempts),
    mistakes: await getMistakes(db),
    attempts,
    difficulties,
    selected: new Set<string>(),
  });
  void emit({ event: JOURNAL_OPENED, props: {} });
  // Bind the coachmark links AFTER the panel exists — renderPanel injects a.fp-practice-link /
  // a.fp-find-link, so binding earlier (e.g. at boot, against an empty host) matches nothing.
  const list = findResultsList(document);
  if (list) bindPanelCoachmarks(host, db, list);
}

// Boot (skipped under test: no chrome runtime). Plan 2 runs the scored loop; Plan 3 adds the
// badger + journal panel toggle + coachmark binding + the open-journal message listener.
if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
  // Plan 4: the whole post-Plan-3 startup body runs through the §2.5/§8.3 gate. isEnabled() off →
  // mount nothing; a CB block → mount the §8.3 "use CB directly" notice and return (never retry,
  // never call the API). When enabled and unblocked, the runner is Plan 2/3's startup verbatim.
  self.addEventListener?.('unhandledrejection', () => emit({ event: JS_ERROR, props: { component: 'unhandledrejection', error_code: 'BOOT_FAILURE' } }));
  void guardedStart(document, async () => {
    try {
      const db = await openStore();
      await runLoop(document, db, deviceId());                  // Plan 2 scored loop (unchanged)

      mountPanelToggle(document, () => void handleMessage(db, { type: OPEN_JOURNAL }));
      watchResultsList(document, db);   // badge on list render + whenever CB re-renders it (coachmarks bind on panel open)
      chrome.runtime.onMessage.addListener((m: { type?: string }) => { void handleMessage(db, m); });
    } catch { emit({ event: JS_ERROR, props: { component: 'boot', error_code: 'BOOT_FAILURE' } }); }
  });
}
