# Plan — Flag a question for review

> Last updated: 2026-07-05

Triage verdict: **BUILDABLE** (feature; crosses no bright line — persists only the
student's own questionId + a boolean, same posture as Note).

## Design

- `Flag` (types.ts): `{ questionId, flagged } & Envelope`, keyed by `questionId` itself
  (one row per question, upserted) — unlike Attempt/Note this is current STATE, not an
  event log, so there is no "latest of many rows" reduction to derive it.
- `flags` object store, `store.ts` `DB_VERSION` 1→2 so existing installs pick up the
  new store on next open.
- `journal.ts`: `getFlaggedMap` (questionId → flagged, for seeding the overlay) and
  `getFlaggedQuestions` (list for the panel, LEFT-joined against the latest attempt for
  skill/difficulty — nullable, since a question can be flagged before it's ever
  attempted). The join uses `Map<string, Attempt>`, mirroring `getMistakes`, to stay
  clear of the spec §10 questionId→metadata-index guard (`tests/guard-ci.test.ts`).
- UI: a `🚩` toggle button in `fp-answer-head` beside the ✕ close button (not the
  extras block — more discoverable, and no extra shadow-root wiring). Toggling reads/
  writes its own `aria-pressed` attribute at click time (not a closure variable), so it
  stays correct across CB's in-place re-mounts.
- `content.ts`: `flaggedMap` snapshot at sitting-start, same posture as `priorSeen`.
- Panel: a "Flagged for review" section, sibling to "Mistakes".
- Telemetry: `question_flagged` event; `flagged` added to the scrubber's `BOOL_KEYS`.

## Invariant guardrails held

- No question text persisted; the flag is `{questionId, flagged}` only.
- Skill/difficulty in the panel view come from the per-attempt join (`Map<string,
  Attempt>`), never a standalone questionId→metadata index.
- Telemetry carries only `session_id`/`question_id`/`flagged` — no free text.
