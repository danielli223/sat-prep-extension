# Design Spec — SAT Practice Overlay (v1)

*Created: 2026-06-15 · Status: approved design, ready for implementation planning*
*Companions: `sat-app-legal-architecture.md`, `sat-app-legal-ux-strategies.md`, `sat-content-legal-playbook.md`, `oneprep-customer-voice-synthesis.md`*

> **Not legal advice.** The legal posture summarized here is grounded in the companion docs (hands-on testing of the live CB Question Bank + an adversarially-verified research pass). Have an IP attorney sign off before launch.

---

## 1. What we're building

A **browser extension** that gives students a noticeably better SAT practice experience than College Board's own tools — a smooth answer-and-score loop, a calculator, a mistake journal, and weak-area tracking — **without ever copying, storing, caching, or redistributing the questions**.

The real official questions are served live from College Board's own page in the student's own browser. Our extension is a **client-side experience layer** on top of that page. The only things that ever persist are **question IDs + the student's own data** (answers, progress, notes).

**Positioning (from the customer voice):** OnePrep lost its audience by AI-rewriting CB questions — *"AI slop," "explanations seem plausible but they're actually just wrong."* Our entire edge is the opposite: the questions are unmistakably **real and unaltered**, because we never touch them. The legal rule (never put CB content through AI, never reproduce it) and the market's #1 demand (real questions + mistake tracking + Desmos, free) point the same way. The named job-to-be-done we are serving, verbatim: *"a question bank, that doesnt use 'ai rewritten' questions, tracks my mistakes and the questions I have right, and has desmos on the side."*

---

## 2. Scope

**v1 (this spec):** the local study companion — scored loop + calculator + mistake journal + progress/weak-areas — running entirely client-side, **local-only (no accounts, no server), free.**

**Explicitly out of v1** (but the data model is built to accommodate them — see §7):
- User accounts / login, cloud sync, and a separate **website dashboard** for comprehensive progress and scores. (v2.)
- Mobile (extensions are desktop-only; iOS would need a Safari Web Extension container later).
- Any AI feature touching CB content (permanently out — legal + trust).
- Filter by SAT test/release date (CB's Educator bank doesn't expose it; only skill/domain/difficulty).
- Auto-driving CB's filter form (we stay "student drives" — see Decision D3).
- Full-length / module-wise practice tests — can't be legally rebuilt from the Question Bank (that's assembling a test); route full-test practice to **Bluebook** and track by ID. (v2 consideration.)
- Study planner — genuinely divisive in the customer voice ("great" vs "not essential"); defer to v2.

---

## 3. Decisions log

| # | Decision | Choice | Why |
|---|---|---|---|
| D1 | v1 scope | Medium: loop + journal + calculator + tracking, local-only, free | Validate the experience before investing in backend/accounts; matches the loved OnePrep bundle |
| D2 | Presentation model | **C — focus card over a dimmed CB page** | Immersive "real test" feel, but clearly an additive overlay (safe trademark optics) and keeps CB visibly underneath, which *strengthens* the "these are real" trust story. Full reskin (B) was rejected as worst-optics + self-defeating |
| D3 | Entry point | **Activate on CB's page (student drives filters)** | Most conservative legal posture — we never touch CB's controls; the student filters on CB's own form, we offer "Start focused practice" on the results page |
| D4 | Answer commit | **Explicit "Check" button** (not auto-score) | Enables answer-elimination workflow, deliberate commit, test discipline; prevents mis-tap scoring |
| D5 | Explanations | **CB's own, revealed in place — never AI** | Legal (no AI on CB content; minimal re-display) + trust (students distrust AI explanations) |
| D6 | Mistake journal | **Notes + weak-area stats + guided re-surface** | Tracks right/wrong by ID, weak areas, optional why-I-missed-it notes; badges previously-seen questions when they reappear in CB's list |
| D7 | Calculator | **Embed GeoGebra (free) + one-click "Open real Desmos" free side-window** | GeoGebra gives an integrated free calc; the Desmos launcher opens Desmos's own free public site (`desmos.com/calculator` — zero-cost/zero-license, the "Desmos in another tab" students already do) to close the **by-name #1 calculator want** + test-day familiarity. *Open item: GeoGebra commercial-embed license (O1)* |
| D8 | Question order | **Randomize within loaded results (optional)** | Restores a named OnePrep loss ("randomize question order easily"); legal because it only reorders IDs already on screen — scoped to loaded results, no bank traversal |
| D9 | Resume | **Guided resume of session context** | Persist filter + position locally and bring the student back via the badger. Guided (not one-click) given no per-question URLs |

---

## 4. End-to-end flow

1. Student clicks our toolbar button → we open CB's Educator Question Bank in a tab (**a plain link — expressly permitted**) with a coachmark: "pick your skill & difficulty, then Search."
2. Student filters and searches **on CB's own form** (we never touch it).
3. Content script detects the `/digital/results` page → injects a **"Start focused practice"** panel: start in CB's list order or **Randomize** (within the loaded results), and — if a saved session exists for this filter — **Resume where you left off** (guided via the badger).
4. **The loop**, per question:
   - Focus card spotlights CB's current question (dimmed CB behind) + our answer UI.
   - **Calculator** available anytime: integrated **GeoGebra**, or one-click **Open real Desmos** (free, separate window) for test-day familiarity.
   - Student may **cross off** choices (⊘), then selects one and clicks **Check**.
   - **Instant right/wrong**: chosen + correct choices light red/green, scored against the correct answer **read from CB's DOM**.
   - Student reveals **CB's own explanation** (in place, labeled "unaltered").
   - Optional **"why did you miss it?"** note → saved to journal.
   - **Next** advances to the next question (one at a time, user-initiated) — in CB's list order, or your **randomized** order over the loaded results.
5. Throughout, each result is recorded locally; previously-missed IDs are **badged** in CB's results list (guided re-surface).
6. The toolbar also opens our **journal/progress panel** (our own surface, not over CB).

---

## 5. Components

Each is a focused, independently-testable unit. **All fragile "what CB's HTML looks like" knowledge lives only in #1 and #2**; everything downstream works on clean data and survives CB redesigns.

| # | Component | Responsibility | Interface (sketch) | Depends on |
|---|---|---|---|---|
| 1 | **Page observer** | Detect `/digital/results` + the question modal; know when a question is shown and which ID | emits `questionShown({id, skill, difficulty, choices, correctAnswer, explanationNode})` | CB DOM (isolated) |
| 2 | **DOM reader** | Pull question/choices/correct-answer/explanation from CB's DOM. Pure read | `read(node) → QuestionView` | CB DOM (isolated) |
| 3 | **Scoring engine** | Compare pick to correct answer | `score(pick, correctAnswer) → {correct}` — pure, no DOM | nothing |
| 4 | **Overlay UI** | Focus card: choices, cross-off, Check, explanation reveal, Next, calculator toggle. Shadow DOM + TrustedHTML | `render(viewModel, {onSelect,onEliminate,onCheck,onReveal,onNote,onNext})` | view-model only |
| 5 | **Local store** | The only thing that persists. Guarded to reject question-text-shaped payloads | `recordAttempt / saveNote / getStats / getSeen / getMistakes / saveSession / getSession` | IndexedDB |
| 6 | **Journal/stats** | Derive weak-areas, accuracy, streaks, mistakes list | reads store | store |
| 7 | **Re-surface badger** | Match on-screen IDs against store, inject done/missed/new badges | `badge(listNode)` | store, CB list DOM |
| 8 | **Calculator** | GeoGebra embed (toggled) + "Open real Desmos" launcher (free site, separate window — not an iframe) | `toggleGeoGebra()` / `openDesmos()` | GeoGebra; desmos.com (link only) |
| 9 | **Toolbar/popup** | Open CB QB (link) + open journal/progress panel | — | — |
| 10 | **Kill-switch / resilience** | Disable overlay on remote flag / 403 / DOM-contract failure | `isEnabled()` | hosted config |

---

## 6. Data model (sync-ready, account-ready)

Local **IndexedDB** is the only store in v1. Every record carries a **sync envelope** so v2 can push to a server and merge across devices with no migration.

```
attempt {                       // APPEND-ONLY event log (one row per answer)
  attemptId:   uuid             // client-generated, globally unique (crypto.randomUUID)
  userId:      null             // null in v1; stamped on login in v2 (same schema both eras)
  deviceId:    uuid             // per-install; lets v2 claim anonymous history into an account
  questionId:  "ac472881"       // CB reference — never content
  section, domain, skill, difficulty   // CB taxonomy, as context for THIS attempt only
  pick                          // student's chosen answer (their data)
  correct:     bool
  createdAt, updatedAt
  deleted:     false            // tombstone for delete-sync
  dirty:       true             // "not yet synced" (no-op in v1)
  schemaVersion: 1
}

note     { noteId, userId:null, deviceId, questionId, text, createdAt, updatedAt, deleted, dirty, schemaVersion }
settings { key, value, updatedAt }          // local prefs (calculator on/off, etc.)
meta     { deviceId, schemaVersion }        // install-level
session  { sessionId, userId:null, deviceId, filterContext, orderMode, shuffleSeed, lastQuestionId, updatedAt, deleted, dirty, schemaVersion }   // guided resume + randomize order
```

**Why append-only attempts:** the v2 website dashboard shows **scores/progress over time**; an immutable event log preserves the raw history that derived rollups (accuracy, weak-areas) are computed from. Overwriting last-state would throw that history away.

**Repository boundary (the v2 swap point):** all data access goes through a repository interface. v1's only implementation is IndexedDB. v2 adds a **SyncEngine** behind the same interface (push `dirty` → API, pull remote, merge by `id + updatedAt + deleted`, last-write-wins). UI, scoring, and stats never learn whether data is local or synced.

**Identity claim (v2):** on first login, local rows with `userId:null` matching this `deviceId` are claimed into the account and pushed — so **anonymous v1 usage is retroactively captured** (the audience-wedge thesis is preserved despite shipping account-free).

**Legal alignment:** because we only ever store IDs + the user's own data, that data is exactly what's safe to sync to our server and render on a website later — the dashboard **never holds CB question content** (it links back to CB to view a question).

---

## 7. UI/UX summary

- **Focus card** (mockup approved): trust badge ("Real College Board question · live, unaltered"), question spotlight, A–D choices with cross-off (⊘), Check, instant red/green scoring, CB's own explanation in place, one-line mistake note, Next, calculator pin, progress header (`skill › difficulty`, `Q n of N`, session score).
  - **Explanation reveal (resolves the mockup's ambiguity):** surfaces **CB's own explanation element** — read live, never stored, never altered, never AI-processed. Preferred implementation is revealing CB's **native** explanation panel in place (per guardrail O6); if it is presented within our card instead, the text is read live from the DOM and discarded, never persisted. The illustrative mockup showed in-card text; the bright line is "CB's words, live, unstored."
- **Journal/progress panel** (mockup approved, our own surface): progress stats (done, accuracy, streak), weak-area bars worst-first with one-click "Practice [skill] on CB," mistakes list (note + ID/skill/difficulty/date + "Practice skill"/"Find on CB"), and the guided-re-surface badged list (`✓ done / ⚠ missed / new`).
- **"Practice skill" / "Find on CB"** opens CB's QB with a coachmark to set that filter (student drives — consistent with D3); the badger then highlights the relevant questions in the results.
- **Start panel** (on the results page): choose **list order** or **Randomize (loaded results)**; **Resume** appears if a saved session exists for this filter.
- **Calculator**: integrated **GeoGebra**, plus a one-click **Open real Desmos** button (opens `desmos.com/calculator` in a separate pinned window — the real test-day tool, free, no license).
- **Trust onboarding** (first run): a plain line — *"These are College Board's own questions, served live from collegeboard.org. We never rewrite them, never run them through AI, and never store them — only your answers and progress."* This is the literal counter to the OnePrep "AI slop" wound and the "pirate site" accusation.

---

## 8. Error handling & resilience

1. **DOM-contract self-check** — verify expected nodes per question; on extraction failure, **never guess a score** → "Couldn't read this one — answer it directly on CB," bump a local failure counter. A wrong right/wrong would destroy the trust that is our entire edge.
2. **Kill-switch** — a tiny hosted config flag can disable the overlay instantly (C&D / terms change) without waiting for users to update.
3. **403/block detection** — on CB errors or block signals, disable and point the user to CB directly. Never retry, never call the API.
4. **Shadow DOM + TrustedHTML from day one** — survive a future CB Trusted-Types/CSP rollout.
5. **Graceful degradation** — IndexedDB write failure → session works, untracked. Unknown question type → ungraded fallback, logged.
6. **Question-type coverage v1** — multiple-choice + grid-in (student-produced response); others → ungraded fallback.

---

## 9. Testing strategy (per the workspace TDD playbook — enforce with CI, not prose)

- **Headline guard (the legal invariant as a failing test):** CI fails the build if any code path (a) issues a `collegeboard.org` / `qbank-api` network request, or (b) writes question-text-shaped data to the store.
- **Pure unit tests (no browser):** scoring engine (all question types), stats/weak-area derivation, sync-envelope merge (last-write-wins + tombstones), the store guard.
- **DOM-contract tests** against **synthetic fixtures** that mimic CB's DOM structure (class names, node shape) — **never real CB question text committed to the repo** (that would violate our own invariant). When CB changes, these go red and pinpoint the fix.
- **Live spike** (build step 1): verify against the real site in a real session across question types. No AI in v1, so no LLM-output eval complexity.

---

## 10. Legal guardrails (bright lines — from `sat-app-legal-architecture.md`)

- Read the **rendered DOM only**; never call `qbank-api` / any collegeboard.org endpoint; never replay Akamai tokens.
- **Every question transition is user-initiated.** No auto-advance, no prefetch, no ID enumeration, no batch reads.
- Persist **only** `{ID, the user's own data}`; question text is read in RAM and discarded.
- **No AI on CB content**, ever (questions, passages, or explanations).
- Don't put "SAT"/"College Board" in the extension **name, icon, or branding**; nominative use only, with a prominent **"Not affiliated with, authorized, or endorsed by College Board; SAT is a trademark of the College Board"** notice.
- Don't have the **maker** log into CB for the build (BrandTotal assent trap) — develop against the public no-login Educator bank.
- New guardrail (from §6): store CB taxonomy labels only as per-attempt context; **never build/expose a comprehensive `questionID → metadata` index** (data-mining line).

---

## 11. Open items / risks

| # | Item | Action |
|---|---|---|
| O1 | **GeoGebra commercial-embed license** | Verify GeoGebra's terms for a commercial product before launch. Lower-stakes now: the **"Open real Desmos" free side-window (D7) already ships a zero-license calculator**, so if GeoGebra's terms don't clear, Desmos covers the need (and could even become the only calculator) |
| O2 | **Cease-and-desist (dominant risk)** | Incorporate as LLC; pre-write the "reads only what the user already rendered; stores no question content" counter-narrative; ship the kill-switch |
| O3 | **Chrome Web Store delisting on IP complaint** | Package for Firefox + Edge too; support sideload; keep all data local-first so delisting never destroys a user's journal |
| O4 | **Mobile gap** | Desktop-first; don't promise mobile in v1; evaluate Safari Web Extension container later |
| O5 | **CB DOM changes** | Isolated readers + contract tests + kill-switch; expect ongoing maintenance |
| O6 | **Re-display of CB explanation text** | Prefer revealing CB's native explanation in place over re-rendering it in our chrome |
| O7 | **Open-source as a trust/community asset (strategic)** | Strongly consider open-sourcing the extension: it makes the "we store nothing of theirs / never AI" claim *verifiable*, counters the astroturfing distrust that defines this market, and mirrors what users praised in *practicesat* (MIT, hobbyist). Decide license + what (if anything) stays closed |

---

## 12. Build sequence (de-risk highest-risk-first)

1. **DOM-contract spike** — in a real authorized session on the public Educator bank, confirm reliable reading of question + choices + correct answer + explanation across question types, and Shadow DOM + TrustedHTML injection. *If the answer key isn't reliably in the DOM on some surface, that breaks the scoring assumption — find out first.* (Smoke-confirmed 2026-06-14 for multiple-choice + grid-in.)
2. **Local-only core, no backend** — content script → scoring → focus-card UI → user-gated Next (list **or randomized** order) → GeoGebra + **Open-real-Desmos** launcher → IndexedDB journal/stats. Nothing leaves the browser.
3. **Re-surface badger + journal/progress panel + guided resume** (persist & restore session context).
4. **Resilience** — kill-switch, 403/block detection, DOM-contract self-check, CI guard.
5. **Package** for Chrome (first) + Firefox + Edge; privacy policy with Limited-Use statement + non-affiliation notice.

---

## 13. The one sentence that keeps it legal

*The official question lives and dies on College Board's own page in the student's own browser; we are only the scoring-and-journal layer around it, and the only things that ever reach us are question IDs and the student's own data.*
