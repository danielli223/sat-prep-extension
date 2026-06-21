# Move Note + Calculator + Desmos Below the Answer Explanation — Design

*Date: 2026-06-20 · Issue #22 · Status: approved (triage: BUILDABLE, no invariant at risk)*

## Problem

In the answer overlay, the **"Why did you miss it?"** note textarea and the
**Calculator** / **Open real Desmos** buttons render *above* College Board's answer
explanation. Issue #22 originally asked to *remove* the note; the owner's interactive
decision superseded that:

> "We can move all these below the answer explanation section."

…with a screenshot showing the note, Calculator, and Desmos controls together. The
resolved intent: **keep these controls, but render them below the answer-explanation
section** (CB's native `.rationale`, which the overlay un-hides below itself on Reveal).

## Why no bright line is touched

Pure client-side repositioning of *our own* Shadow-DOM controls. The note is the
student's **own** free-text — invariant #2 explicitly permits persisting notes, and
`guard.ts` already bounds it (`text` ≤ 2000). No CB content is read, stored, or sent;
moving controls below CB's rationale only changes where *our* nodes sit relative to a
CB node we already manage — we never read the rationale's text into JS, the store, or a
model (#3). No `qbank-api`/CB endpoint, no new host (#1). No prefetch/auto-advance;
Reveal and Next stay user-initiated (#4). No branding/kill-switch change (#5, #6). The
fragile `src/cb/` layer is untouched.

## The DOM constraint that forces the design

Our overlay host is inserted as the **first child** of CB's `.answer-content`
(`answer-overlay.ts` `insertBefore(host, answerContent.firstChild)`). CB's `.rationale`
is a **sibling** direct-child that is hidden on mount and un-hidden *in place* below our
host by `revealRationale` on Reveal. The note/calc/Desmos block lives *inside* the
first-child host, so it renders **above** the rationale.

A single first-child host cannot straddle a sibling node. So "below the explanation"
requires the note/calc/Desmos block to become a **separate node placed after
`.rationale`** in DOM order.

## Approach: split into two Shadow hosts

`mountAnswerOverlay` mounts **two** hosts inside `.answer-content`:

- **Interaction host** (`fp-answer-host`, inserted as **first** child) — head, progress,
  choices, actions (Check / Reveal / Next), verdict. Unchanged content; this is the
  shadow `mountAnswerOverlay` returns (preserves the existing return contract).
- **Extras host** (`fp-extras-host`, appended as **last** child) — the
  `fp-note-label` + textarea and the `fp-calc` (Calculator + Desmos) block.

The extras host must end up **after** CB's `.rationale` in document order so the note/calc
render below the explanation. But CB injects `.rationale` **asynchronously (~150ms after
mount)** as a fresh last child — so simply appending the extras host at mount time is
**not** enough: CB's later `appendChild(.rationale)` would land *after* the extras host,
putting the note/calc back above the explanation (the bug #22 fixes). Two cases:

- **Sync** (`.rationale` already present at mount): appending the extras host last places
  it after the rationale — done.
- **Async** (the live reveal path: `.rationale` injected after mount): the **same
  MutationObserver** that masks CB's late nodes also **re-anchors the extras host back to
  last** whenever a non-host CB node is added. So when CB appends `.rationale`, the extras
  host is moved to sit after it. Re-anchoring is guarded to fire only on a *CB* node
  addition (the extras host carries `isOurHost`, so moving it never re-triggers the move —
  no observer re-entrancy loop), and is a no-op when the extras host is already last.

Net: the ordering is timing-independent — the note/calc render below the rationale in both
paths. (A "move only on reveal" approach was rejected — more fragile across CB re-renders;
the observer already runs for masking, so re-anchoring there is the smaller, robust change.)

### Invariants the implementation must preserve (else existing guards break)

1. **Both hosts are exempt from masking.** The whitelist sweep and the MutationObserver
   in `mountAnswerOverlay` hide *every* non-host direct child (`hideCbNode`). The extras
   host must be recognized as ours so it is never `display:none`'d — extend the host
   guard to exempt **both** host classes (e.g. a shared `isOurHost(el)` check), used in
   both the sweep and `hideCbNode`.
2. **Idempotent re-mount reuses both hosts.** `mountAnswerOverlay` is called on every
   question emit. It must find and reuse the existing interaction host *and* extras host
   (no duplicate overlays). Find each by its own class.
3. **Observer stays `childList` only** (no `subtree:true`) — never hide CB's nested nodes.
4. **`revealRationale` stays the sole un-hider** of `.rationale`, still via the
   `.children` scan (no `:scope >` — unsupported in happy-dom), still returns `false`
   when absent.
5. **`unmountAnswerOverlay` tears down BOTH hosts** and restores every `[data-fp-hidden]`
   CB node (no blanked CB question on teardown).
6. **Wiring split:** note/calc/Desmos handlers (`onNote`, `onToggleCalc`, `onOpenDesmos`)
   move to the extras shadow; choices/actions/close stay in the interaction shadow. The
   handler *signatures* are unchanged, so `content.ts` does not change.

## Test surface (`src/ui/answer-overlay.test.ts`)

Existing tests encode the single-host layout and must be updated by the test author:

- The "wires the remaining controls" test currently queries `.fp-note`/`.fp-calc-pin`/
  `.fp-desmos` on the returned (interaction) shadow — these now live in the extras
  shadow and must be queried there.
- "re-mounting reuses the single host" generalizes to: re-mount yields exactly one
  interaction host **and** one extras host.

New/updated assertions:

- **DOM order (sync):** the extras host is a **later** direct child of `.answer-content`
  than CB's `.rationale` (assert via `compareDocumentPosition` /
  `DOCUMENT_POSITION_FOLLOWING`), both before and after `revealRationale`.
- **DOM order (async — the live path):** mount against an `.answer-content` with **no**
  `.rationale`, then `appendChild` a `.rationale` after mount (as the masking-observer
  test does), let the observer run, and assert the extras host **still follows** the
  late-injected `.rationale` (and is the last child). This is the assertion that actually
  exercises CB's ~150ms async reveal — the sync fixture passes vacuously without it.
- **Masking exemption:** the extras host is **not** hidden by the whitelist sweep, and a
  CB node injected after mount is still hidden (observer unaffected by the second host).
- **Reveal still works:** `revealRationale` un-hides `.rationale`; the extras host sits
  after it.
- **Teardown:** `unmountAnswerOverlay` removes both hosts and restores all masked CB
  nodes; no `[data-fp-hidden]` remains.
- **Handlers fire** from their new (extras) location: `onNote`/`onToggleCalc`/
  `onOpenDesmos`.

## Out of scope

No copy/wording change to the note prompt (a separate question the owner raised). No
store/journal/telemetry change — the note data path is untouched. `src/cb/` untouched.

## Visual verification

This is a `src/ui/` change. The PR notes that a reviewer should run `/verify-overlay`
(dev Chrome harness on a real CB question, content-free probes) before merge — advisory,
not blocking.
