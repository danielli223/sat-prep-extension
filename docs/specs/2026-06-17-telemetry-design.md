# Product Telemetry — Design

*Date: 2026-06-17 · Status: approved (brainstorm), pending implementation plan*

> **Not legal advice.** The compliance sections are design inputs that **require
> IP/privacy-attorney sign-off *before* implementation begins** — specifically on
> retention, disclosure language, COPPA posture, and Chrome-Web-Store form alignment.
> This is consistent with the project's existing pre-launch legal-review posture.

## Problem

The extension is free, local-only, and accountless. We have **no visibility** into
how it's actually used: do people start a practice loop, finish it, come back; which
features matter (journal, badger, calculator, resume); and — critically for a layer
that reads College Board's live DOM — **is CB silently breaking us** (DOM-contract
failures, block pages, unscored fallbacks) without anyone noticing.

We want telemetry that answers both **product-behavior** and **operational-health**
questions through one pipeline, *without* eroding the product's core identity: a
privacy- and legal-minimal study layer aimed at an audience that is largely **minors**
(SAT students ~14–18).

## Decision summary

Ship **opt-in, no-PII product analytics** to **PostHog US Cloud**, reached via its
HTTP ingestion API with plain `fetch` (no remote SDK, no vendor cookies).

- **Goal:** product behavior + operational health, equally — one pipeline.
- **Consent:** **opt-in, OFF by default.** A fresh install is silent. No `install_id`
  is generated and **no event of any kind fires** — product *or* health — until the
  user affirmatively opts in.
- **Identity:** a locally-generated random `install_id` (UUID), **no login**, stored
  only on-device, resettable, deleted on opt-out. Pseudonymous, never tied to PII.
- **Vendor:** PostHog **US Cloud** (`us.i.posthog.com`). US fits a US SAT audience and
  a US entity; hosting location does not change COPPA/CCPA obligations. IP capture,
  autocapture, and session recording are disabled in the PostHog **project config**
  (operational, not code-enforced — see Resilience).
- **Boundary:** an allowlist **scrubber** (Appendix A) is the legal boundary — only
  allowlisted, short, non-free-text fields can ever leave the device. Question **text**,
  passages, choices, explanations, note text, CB URLs, stack traces, and PII can never
  be sent.
- **Question IDs ARE sent** (`question_id` in `question_attempted`) — a deliberate call
  to unlock item-level analytics (most-missed items, difficulty, content gaps). This is
  an *identifier*, never content. It creates a per-install behavioral record of which CB
  items a student practiced, which **widens the disclosure duty** (Compliance) — but
  keeps the content invariant intact.
- **Egress:** all network egress routed through the **background service worker** — a
  single auditable exit, consistent with the project's "one network destination" ethos.
- **Never blocks the app:** every emit is fire-and-forget (`void emit(...)`, never
  awaited, never throws). What makes a failure invisible is the **on-disk queue**, not
  the existing `safeWrite` IDB helper (which only swallows IndexedDB errors).

## Event taxonomy

Every event carries a fixed set of **super-properties**, injected centrally in the
background before egress: `install_id` (the PostHog `distinct_id`), `session_id`,
`app_version`, `browser` (chrome|firefox|edge), `consent_version`,
`days_since_install_bucket`, plus the PostHog hygiene flags `$process_person_profile:
false` and `$ip: null`. No event may carry any key outside Appendix A.

**`session_id`** identifies one practice loop locally (minted when a session is created,
reset on a new `practice_started`/`practice_resumed`). It groups events within a sitting;
it is **not** persisted to the journal and does not affect the user's progress view.

**Product / behavior**
- `onboarding_shown`
- `practice_started` — `order_mode` (list|random), `result_count_bucket`, `filter_context`
- `practice_resumed` — `resume_index`, `total_in_order`
- `question_attempted` — `question_id`, `question_type` (mc|grid, derived from
  `view.choices.length`), `result` (correct|incorrect|unscored, derived from `ScoreResult`),
  `reveal_used` (bool), `section`, `domain`, `skill`, `difficulty`
- `note_added` — `note_length` (integer; **never the text**); emitted only when `length > 0`
- `calculator_opened` — `calculator_type` (geogebra|desmos)
- `journal_opened`, `badge_clicked`
- `session_ended` — `attempted_bucket`, `accuracy_bucket`, `duration_bucket`

**Operational health** (also require opt-in — see semantics below)
- `dom_contract_failed` — `failure_reason` (unreadable|missing-id|no-answerable-content), `question_id`|null
- `unscored_fallback` — the never-guess path fired (`ScoreResult.graded === false`)
- `block_detected` — `block_reason` (access-denied|rate-limited|forbidden)
- `killswitch_activated`
- `js_error` — `error_code` (a fixed **enum**, e.g. `DOM_UNREADABLE`, `STORAGE_QUOTA`,
  `BOOT_FAILURE`) + `component` (short enum). **Never** a raw message or stack trace.

**Lifecycle**
- `telemetry_disabled` — emitted once with the *current* `install_id` immediately before
  opt-out deletes it, so opt-out rate is measurable without retaining identity.

**Bucketing schemes** (defined here so they're deterministic and testable, timezone-agnostic):
- `result_count_bucket`: `1-5 | 6-20 | 21-50 | 51+`
- `days_since_install_bucket`: `day_0 | day_1-7 | day_8-30 | day_31-90 | day_90+`
- `attempted_bucket`: `1-5 | 6-20 | 21-50 | 51+`
- `accuracy_bucket`: `0-49 | 50-69 | 70-84 | 85-100` (percent)
- `duration_bucket`: `0-1m | 1-5m | 5-15m | 15-60m | 60m+`

**Health-event consent semantics (explicit):** `isTelemetryEnabled() = userOptedIn &&
remoteAllowed`. Health events are **not** exempt from user consent — they fire only if
the user opted in. "Independent of the overlay kill-switch" means only that they can
still report when the *overlay UI* is remotely disabled (so we learn *why* it was
disabled), **not** that they bypass opt-in.

**Hard no-send list (enforced by the scrubber, not convention):** question stems,
passages, choices, explanations/rationale, note text, any CB URL, any free text, any
stack trace, any PII.

## Privacy posture & consent

- **Default OFF.** Opt-in only. No id, no events, no network before opt-in.
- **Consent UI is new and must be built** (today `onboarding.ts` only logs a trust line
  and `popup.html` has no toggle):
  - A plain-language consent **card rendered during first-run onboarding**: what's
    collected (question IDs + correctness + usage events, tied to a random id), what's
    never collected (question text, your notes, anything identifying you), **where it
    goes (PostHog, a US company)**, retention period, and a single toggle.
  - A **permanent, always-accessible toggle in the popup** so consent is reversible
    anytime — not buried in a one-time flow.
- **Teen-readable copy.** Final disclosure text is a compliance deliverable subject to
  legal review (draft in Compliance below); it must match the CWS form verbatim in
  substance.
- **Age gate:** a lightweight **"I'm 13 or older"** self-attestation. This is a **UX
  measure to support a general-audience (not under-13-directed) posture — it is NOT
  COPPA-compliant consent** and does not by itself discharge COPPA duties (see Compliance).
- **Delete-my-data** affordance (see ID lifecycle + open question on server-side delete).

## ID lifecycle

- **Opt-in →** generate a random UUID, store in `chrome.storage.local`.
- **Opt-out →** in strict order: (1) emit one final `telemetry_disabled` carrying the
  *current* `install_id`; (2) **delete** the `install_id`; (3) **purge** the pending
  queue; (4) set `consent = false`. Order matters: the disabled-event must capture the
  id before deletion, and the queue must not outlive consent.
- **Reset →** regenerate the UUID (fresh start; breaks linkage). Already-queued events
  keep the old id; new events use the new one.
- **Effective gate** = `userOptedIn && remoteAllowed`. User opt-in defaults **off**; the
  remote flag defaults **on-when-unreachable** (it is a force-disable only, so a network
  blip never silences a consented user). Both gates checked with **AND**, at the emit
  call site *and* re-checked authoritatively in the background.

## Architecture — `src/telemetry/` module

One public entry point — `emit(eventName, props)` — so each call site is a one-liner and
all policy lives in one place. `emit()` is fire-and-forget: callers use `void emit(...)`;
it never throws and never blocks.

- **`telemetry/events.ts`** — event-name constants + one typed *builder* per event. Each
  builder enforces its schema and runs the scrubber (fail-fast in dev/tests). Many event
  constants (unlike `messages.ts`, which centralizes the single `OPEN_JOURNAL` message —
  same *intent*, larger surface).
- **`telemetry/scrubber.ts`** — `assertTelemetrySafe(payload)`, a sibling of `guard.ts`'s
  `assertNoQuestionContent`: the **allowlist + per-field max-length** in Appendix A;
  throws on any unknown key or over-long / free-text-shaped value. **This is the legal
  boundary.** Runs authoritatively in the background before egress (and in builders for
  fail-fast).
- **`telemetry/consent.ts`** — opt-in state + `install_id` lifecycle in
  `chrome.storage.local`; the AND-gate; and a remote kill flag fetched with the **exact
  `killswitch.ts` pattern** (4s timeout + cache + safe default). Remote flag source: a
  new field on the existing `config.focusedpractice.app/v1/flags.json`
  (`{ "telemetryAllowed": true }`) — one file, no new host, default-on-when-unreachable.
- **`telemetry/queue.ts`** — `chrome.storage.local`-backed buffer (survives MV3
  service-worker death) flushed on a timer; exponential-backoff retry on network/5xx; drop
  on 4xx. ISO-8601 `timestamp` is stamped **at capture time** and never rewritten on
  retry/flush. **Flush trigger is browser-aware:** `chrome.alarms` on Chrome/Edge; on
  Firefox (event-page background) a storage-backed `setTimeout`/on-wake flush fallback —
  identical payloads across browsers. `alarms` is added to `permissions`.
- **`telemetry/transport.ts`** — batch POST to `https://us.i.posthog.com/batch/` via an
  **injectable `fetch` seam** (`sendBatch(events, fetchImpl = fetch)`) so tests inject a
  mock and never hit the network. Ships only the **public project token** (`phc_…`, safe
  in client bundles, write-only, single-project); the personal key is never bundled. A CI
  guard asserts no `phx_`/private-key prefix in `dist/`.

### Data flow

call site → `void emit(name, props)` → typed builder + scrubber (fail-fast) →
`chrome.runtime.sendMessage({ type: TELEMETRY_EVENT, event })` (fire-and-forget, not
awaited) → **background `onMessage` listener** (new) → re-run scrubber (authoritative) →
AND-gate → inject super-properties → enqueue → timer flush → batched POST.

`TELEMETRY_EVENT` is a **new** constant in `messages.ts`; the background telemetry
`onMessage` listener and flush handler are **new** code in/around `background.ts` (today
it only has an `onInstalled` hook).

**Exact PostHog US batch body** (pin this; **verify against PostHog docs + one live dev
call during the spike**, since field placement is the single most error-prone detail):

```json
{
  "api_key": "phc_...",
  "historical_migration": false,
  "batch": [
    {
      "event": "question_attempted",
      "timestamp": "2026-06-17T12:00:00.000Z",
      "properties": {
        "distinct_id": "<install_id>",
        "$process_person_profile": false,
        "$ip": null,
        "session_id": "<session_id>",
        "app_version": "0.0.1",
        "browser": "chrome",
        "question_id": "abc123",
        "result": "incorrect"
      }
    }
  ]
}
```

`api_key` is top-level once; per-event `distinct_id` rides **inside `properties`** in the
batch format (this differs from the single-capture endpoint, where `distinct_id` is
top-level — the spike confirms the batch placement before we build on it).

### Call sites — *target insertion points* (emit() calls do NOT exist yet)

These are where `void emit(...)` **will be added**; line numbers are approximate as of
2026-06-17 and must be re-verified at implementation (the code currently has guard/handler
logic at these spots, not telemetry):

`practice_started` after session save (~`content.ts:209-215`); `question_attempted` after
`recordAttempt` succeeds and only if it succeeded, inside the per-question `checked` guard,
before `renderVerdict` (~`:302-305`); `note_added` (~`:244`, non-empty only);
`calculator_opened` (~`:248`/`:249`); `dom_contract_failed` at the contract-failure branch
(~`:152`); `block_detected` (~`:167`); `killswitch_activated` (~`:166`); `unscored_fallback`
on `graded === false`; `practice_resumed` (~`:190-193`); `journal_opened` (~`:406-416`);
`onboarding_shown` (new emit in `onboarding.ts`); `js_error` from a new boot-level
try/catch + a global `unhandledrejection` listener.

`question_attempted` dedup: the existing per-question `checked` flag gates both
`recordAttempt` and the emit, so rapid clicks can't double-emit; if `recordAttempt` fails,
the emit does not fire.

### Manifest / permissions

Add `https://us.i.posthog.com/*` to `host_permissions` **and** `alarms` to `permissions`
in **all three** manifests (`manifest.json`, `manifest.firefox.json`, `manifest.edge.json`).
**No CSP change** — outbound `fetch` of JSON isn't governed by the script CSP, and bundling
our own transport (not the CDN `posthog-js` snippet) keeps us clear of the MV3 remote-code ban.

## Resilience

- **Telemetry failure is invisible to the user** because emits are `void` and buffered to
  the on-disk queue; a fetch/JSON/sendMessage error is caught and (optionally) debug-logged,
  never propagated into the observer loop or the check flow.
- **Health events still require opt-in** (see semantics above); the only "independence" is
  from the *overlay* kill-switch, so we can learn why the overlay was disabled.
- **Remote kill flag** (`telemetryAllowed` on `flags.json`) is the instant global off-switch.
- **PostHog project config is operational, not code-enforced.** IP/autocapture/session-recording
  OFF and the retention TTL are set in the PostHog dashboard. A **pre-launch config audit
  (with screenshot) and a 30-day re-audit** are launch-checklist items. Defense in depth: the
  scrubber also rejects IP-shaped values.
- **Stale-state guard:** `session_id` (and `install_id`) are read fresh per event, since the
  session object mutates in memory.

## Testing (TDD)

Tests authored and locked **before** implementation, per the workspace playbook. The test
*assertions* below are the design intent; exact code lands in the implementation plan. Each
must be **mutation-resistant** (a plausible mutant fails the test), mirroring the rigor of
the existing `guard.test.ts` / `killswitch.test.ts` / `block-detect.test.ts`.

- **`scrubber.test.ts`** (most important) — accepts each Appendix-A field; **rejects every
  disallowed key** (e.g. `question_stem`, `note_text`, `page_url`, `user_ip`, raw
  `error_stack`); rejects over-long / nested / free-text values. Proves no content/PII can
  reach PostHog.
- **`consent.test.ts`** — globally stub `fetch` **and** `chrome.runtime.sendMessage` and
  assert **zero calls before opt-in**; the full **AND-matrix** of `[optedIn]×[remote
  true/false/unreachable]` (incl. default-on-when-unreachable); opt-out emits
  `telemetry_disabled` with the *original* id **then** deletes id **then** purges queue (order
  asserted via call-order capture); reset regenerates the id; `isTelemetryEnabled()` is
  independent of the overlay kill-switch.
- **`queue.test.ts`** — buffer persists across a simulated SW restart; backoff on 5xx/network;
  drop on 4xx; `timestamp` frozen at capture time across flush+retry; `question_attempted`
  dedup on rapid identical emits.
- **`transport.test.ts`** — inspects the mock-`fetch` POST body: exact batch shape; **every**
  event carries `distinct_id`, `$process_person_profile:false`, `$ip:null` and the
  super-properties; token is `phc_`-prefixed (public).
- **`events.test.ts`** — each builder returns only allowlisted keys and correct bucket
  constants for boundary inputs (e.g. `days=0/1/7/8/30/90`); `note_added` not emitted when
  `length === 0`.
- **CI egress guard** (extend the existing `guard-ci` check) — the only analytics URL is the
  single `POSTHOG_URL` constant in `config.ts`; fail on any hardcoded `posthog` literal
  elsewhere or any `phx_` in `dist/`.

Live PostHog verification runs only manually against a **dev** project — never in CI.

## Compliance deliverables (require attorney sign-off *before* implementation)

- **Retention is a pre-launch requirement, not open.** Choose, disclose, and configure a
  concrete TTL before launch. **Proposed default: 12-month event TTL in PostHog** (data
  minimization for a minor audience may argue shorter, e.g. 6 months — confirm with counsel).
  No indefinite retention. The chosen number ships in `PRIVACY.md`.
- **Rewrite `PRIVACY.md`.** Current lines ("no server, no backend… do not transfer it to
  third parties"; "the only network request… is to our own configuration host") become
  **false** once analytics ship and are themselves a removal trigger. New policy must state:
  what's shared (question IDs + per-question correctness + usage events) and what's never
  shared (text/notes/PII/stack traces); that question IDs let us see *which topics you
  struggle with*, linked to a random install-id, persisting until opt-out; the
  **PostHog-US processor** relationship; opt-in + how to turn off + how to delete; the
  **retention period (number)**; HTTPS; and a COPPA-aligned minors note naming the **specific
  internal-operations purposes** (product improvement + service-health) and how the id is
  prevented from being used to contact/profile an individual (as the in-effect 2025 COPPA
  Rule amendments require).
- **COPPA posture — stated conditionally, not as a safe harbor.** A random-id used solely
  for internal operations (analytics; no ads, no profiling, no contact) *may* avoid the need
  for verifiable parental consent under the internal-operations exception **only if** (a) the
  specific internal-operations purposes and (b) the retention period are disclosed before
  opt-in, and (c) counsel confirms 2025-amendment compliance. The exception removes the
  *parental-consent* requirement, **not** the disclosure/retention duties. If an under-13
  user is ever identified, their telemetry must be deleted promptly. The 13+ self-attestation
  supports the general-audience claim but is not consent.
- **State laws.** No-sale / no-ads / no-profiling avoids the principal CCPA-under-16 and
  CT/CO minor triggers; keep analytics aggregate and product-improvement-only.
- **Chrome Web Store data disclosure** (form, policy, and runtime behavior must match exactly):
  declare **User activity** (question IDs, correctness, session duration, feature use, note
  *count*); **not** PII; certify **not sold / no third-party ads / not for creditworthiness**;
  include the **Limited Use** statement; keep `host_permissions` minimal and justify the
  PostHog endpoint as product-improvement analytics.
- **PostHog project config:** US instance; autocapture, session recording, IP capture **OFF**;
  person profiles off (`$process_person_profile:false`); retention TTL = the chosen number.

## Rollout

1. Ship the `telemetry/` module **dark** (built, no call sites wired).
2. **Spike:** confirm the PostHog batch `distinct_id` placement + a 200 from a live dev
   project; confirm the Firefox flush fallback.
3. Wire call sites behind the off-by-default opt-in.
4. Verify against the **dev** PostHog project across Chrome/Firefox/Edge.
5. Legal sign-off on `PRIVACY.md` + the CWS form + retention.
6. Flip the consent UI live alongside the rewritten policy + CWS disclosure.

The remote kill flag is the instant off-switch if anything looks wrong post-launch.

## Out of scope / open

- **Accounts / login / cloud sync** — explicitly out. The data model's sync envelope means
  identified analytics *could* be added later as a separate decision; this MVP stays
  accountless and pseudonymous.
- **A/B experimentation / feature flags** — out for v1.
- **Open decision — server-side "delete my data".** Local delete (purge id + queue) is
  immediate and specified. True server-side deletion of past events tied to an install-id
  needs PostHog's authenticated delete API, which we can't call client-side (the private key
  can't ship). Two options to resolve at the review gate: **(a)** a tiny deletion-only
  endpoint (e.g., a Cloudflare Worker holding the private key) the extension calls with the
  install-id — a real delete right, but reintroduces a small backend; **(b)** local delete +
  forget-the-id (orphaning past events so they can't link to anything) + reliance on the
  retention TTL to expire them — no backend, weaker "delete now" guarantee. Recommendation:
  **(a)** for a minor audience with deletion rights.

---

## Appendix A — Scrubber allowlist (the legal boundary)

The scrubber accepts **only** these keys; everything else throws. All string values are
bounded; any value that is free-text-shaped, a URL, or over-length is rejected.

| Key | Type | Max len / domain |
|---|---|---|
| `event` (name) | enum | known event names only |
| `install_id` | string (uuid) | 64 |
| `session_id` | string | 64 |
| `app_version` | string | 16 |
| `browser` | enum | chrome\|firefox\|edge |
| `consent_version` | string | 16 |
| `days_since_install_bucket` | enum | bucket constants |
| `$process_person_profile` | bool | must be `false` |
| `$ip` | null | must be `null` |
| `question_id` | string | 64 |
| `question_type` | enum | mc\|grid |
| `result` | enum | correct\|incorrect\|unscored |
| `reveal_used` | bool | — |
| `section` / `domain` / `skill` | string | 64 each (taxonomy labels) |
| `difficulty` | enum | E\|M\|H\|Any |
| `order_mode` | enum | list\|random |
| `filter_context` | string | 96 (taxonomy join; no nulls — null parts → `Any`/`General`) |
| `result_count_bucket` / `attempted_bucket` / `accuracy_bucket` / `duration_bucket` | enum | bucket constants |
| `note_length` | integer | 0–10000 |
| `calculator_type` | enum | geogebra\|desmos |
| `resume_index` / `total_in_order` | integer | ≥0 |
| `failure_reason` | enum | unreadable\|missing-id\|no-answerable-content |
| `block_reason` | enum | access-denied\|rate-limited\|forbidden |
| `error_code` | enum | DOM_UNREADABLE\|STORAGE_QUOTA\|BOOT_FAILURE\|… |
| `component` | enum | short component names |

**Always rejected (examples, must have test cases):** `question_stem`, `passage`,
`choices`, `rationale`, `note_text`, any `*_url`/`*Url`, `user_ip`, raw `error_message` /
`error_stack`, any nested object, any string over its bound.
