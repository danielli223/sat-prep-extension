# The Legal Architecture for the "Experience Layer" SAT App

*Last updated: 2026-06-14 · Companion to `sat-app-legal-ux-strategies.md`*

> **Not legal advice** — an engineering + risk synthesis. It combines (a) hands-on
> testing of the live College Board Question Bank on 2026-06-14 and (b) an
> adversarially-verified legal research pass (6 topics, each researched then
> attacked by an independent verifier). Get an IP attorney to sign off before launch.

---

## Verdict

**Yes — there is a legal way to build this, with one honest reframing.**

You cannot put real official questions *inside your app* (that requires copying CB's
content onto your servers — the one thing the principle forbids). But you can deliver
the **exact same student experience** — choose a skill/difficulty/set → a real official
question appears → answer → instant right/wrong → next, with a calculator, auto-tracked
progress, weak areas, and a mistake journal — by building a **client-side overlay** that
runs in the student's own browser, on the student's own authorized College Board session.
The question lives and dies on CB's page in the student's tab; **your app is the scoring
and journal layer around it**, and the only things that ever reach your servers are
**question IDs + the student's own data**.

Every researched legal topic landed on the same grade: **"supports the architecture, with
conditions."** None said "build it exactly as the brief words it, unconditionally." The
conditions are the bright lines below.

---

## The one reframing you must accept

| Brief says | Physically requires | Verdict |
|---|---|---|
| "the student practices entirely **inside our app**… the real official question **appears right there**" | rendering CB's question text on a surface you control = **copying it onto your infra** | ❌ impossible without breaking the principle |
| "we are a **better experience layer**, not a question bank… questions served **live from their official source**" | the question renders on **CB's** page; you augment it in place | ✅ this is the buildable product |

The only thing that changes versus the brief: **where the question pixels live** — on CB's
surface, augmented by you, never relocated into you. Market it truthfully as *"a smooth
scoring + mistake-journal layer on top of the official College Board question bank,"* not
*"official questions inside our app."* Same student value; legal.

---

## Why it's possible — what I confirmed live (2026-06-14)

I drove the public **Educator Question Bank** (`satsuiteeducatorquestionbank.collegeboard.org`)
and verified the make-or-break technical facts:

- **No login.** Browse/filter/preview/PDF-export with no account. (Low-CFAA public surface.)
- **The scored loop is synthesizable client-side.** Opening a question renders, as
  machine-readable DOM text, **the full question, all answer choices** (`class="answer-choices"`),
  **the correct answer** (literally `Correct Answer: B`), and **per-choice rationale**. So a
  content script can read what CB already painted, present its own answer UI, and **score
  instantly** by comparing the student's pick to the correct answer already on the page.
- **It's HTML text, not a canvas/image** → readable by a content script.
- **No per-question URL** (previews open in a modal; URL stays `/digital/results`), and CB's
  page — not you — calls the backend (`qbank-api.collegeboard.org/.../get-question`). **Akamai
  Bot Manager is present.**

Those last two facts **rule out** the tempting alternatives (you can't iframe/deep-link a
question that has no URL, and you must never call `qbank-api` yourself) and **rule in** the
in-place overlay.

---

## The architecture (client-side overlay — "R1")

| Component | Runs where | Data that moves | Touches your servers? |
|---|---|---|---|
| CB question render | CB's page, student's tab | CB calls `qbank-api`; **you never do** | No |
| Content script (DOM reader) | Student's browser, injected only on `*://*.collegeboard.org/*` | reads rendered question/choices/answer/rationale into local RAM | No |
| Scoring engine | Student's browser (local JS) | compares pick → right/wrong | No |
| Overlay UI (answer flow, next) | Student's browser, via **Shadow DOM + TrustedHTML** | renders locally; **discards question content after each item** | No |
| Desmos calculator | Student's browser | none of CB's content | No |
| Mistake journal + progress/weak-areas | Local-first (IndexedDB), optional sync | **only** `{questionID, student answer, correct/incorrect, timestamp, student's own notes}` | **Yes — IDs + student data only** |
| Your backend | Your infra | stores those reference rows; **never** receives question text/answer/explanation | **Yes — zero CB content ever lands here** |

**The invariant the entire legal case rests on:** question text, passages, answers, and
explanations are **read from the rendered DOM, used in RAM, and discarded** — never written to
disk, never sent to your servers, never shown to a second user, never fed to any AI call.

---

## The legal basis (why the safe core is safe)

- **"Your browser is yours."** A user (and a tool acting as their agent in their own browser)
  may restyle, reorder, hide, and augment a page lawfully delivered to them. This is a
  ubiquitous, US-unchallenged category: ad blockers, password managers (inject autofill UI),
  **Grammarly** (injects into every text field), **PayPal Honey** (injects panels into
  third-party checkout), Reader Mode, screen readers, Tampermonkey userscripts.
- **The most on-point precedent went our way.** *In re PayPal Honey Browser Extension
  Litigation* (N.D. Cal., dismissed Nov 2025, reaffirmed Dec 2025) — a UI-injecting,
  third-party-page-modifying extension — had CFAA, ECPA, CIPA/CDAFA, trespass, and
  tortious-interference claims **all dismissed**. Honey's exposure came from **diverting
  affiliate revenue**, not from injecting UI. We divert nothing.
- **Copyright mechanics are protected.** The rendered DOM copy is created by the *user's own*
  authorized request, and "automated, non-volitional conduct in response to a user's request
  does not constitute direct infringement" + serving a page grants an **implied license** to
  ordinary browser processing (*Field v. Google*, 2006). Restyling what's already on screen,
  with nothing fixed or redistributed, is not reproduction or a derivative work; transient
  RAM copies don't "bite" unless **you store** them (*MAI v. Peak*; *Cartoon Network v.
  Cablevision*). Fair use backstops any residual theory (*Perfect 10 v. Amazon*).
- **Public, no-login surface = low CFAA.** *hiQ v. LinkedIn* + *Van Buren* — reading data you're
  authorized to view, with no gate, is not "unauthorized access."

---

## Bright-line guardrails (each tied to its basis)

**DO**
- **Read the rendered DOM only. Never call `qbank-api` or any collegeboard.org endpoint; never
  replay Akamai tokens.** *(Implied-license/ordinary-processing; avoids CFAA code-barrier +
  bot-circumvention triggers.)*
- **Every question transition is user-initiated.** No auto-advance, no prefetch, no ID
  enumeration, no batch reads. *(One user-chosen on-screen question is the weakest possible
  "scrape" fact; automation + traversal + volume is what makes reading into scraping.)*
- **Persist only `{ID, answer, correct/incorrect, timestamp, notes}`.** *(Transient-copy
  doctrine — the copy bites only if you store CB content.)*
- **Operate only inside the user's own authorized session; the tool is the user's agent.**
- **Ship a kill-switch; stop instantly on any CB 403/block/C&D.** *(Stays on the hiQ side, off
  the BrandTotal post-revocation-CFAA side.)*
- **Point any AI feature ONLY at the student's own data** (their answers, notes, weak-area
  stats). *(CB independently bans use of its content "in conjunction with generative AI.")*
- **Scope `host_permissions` to `*://*.collegeboard.org/*`; all logic in-package, zero
  remotely-hosted code; ship a Limited-Use privacy statement.** *(Chrome Web Store MV3 +
  fast-review posture.)*
- **Inject UI via Shadow DOM + a TrustedHTML policy from day one.** *(Pre-empts a CB
  Trusted-Types/CSP rollout silently breaking the overlay — exactly what YouTube did to
  injection extensions in July 2024.)*

**DON'T**
- **Don't copy, cache, mirror, store, or redistribute any question content; never let two users
  share content through your servers.** *(Turns ephemeral display into reproduction +
  hot-news/free-riding — INS v. AP / AP v. Meltwater.)*
- **Don't pipe any CB question/passage/explanation into an LLM** — not for hints, rephrasing,
  or explanations. *(CB generative-AI ban; this is also the OnePrep failure mode.)*
- **Don't put "SAT" or "College Board" in the extension name, icon, logo, or trade dress.** Use
  them only nominatively in the listing body. *(Web Store impersonation/IP delisting is the #1
  trigger; visibility drops on *mere belief* of infringement, and a TM-symbol + disclaimer did
  NOT save the Instagram-downloader extension.)*
- **Don't market it as official/endorsed, or as a "question-delivery service."** Frame it as a
  generic **study/practice companion** that works on top of what CB already shows you.
- **Don't have the *maker* log into College Board for the build, or register any CB account the
  product relies on.** *(The BrandTotal "Muppet-account" trap: if you personally assent to CB's
  ToS, you convert a hard tortious-interference claim into the easy breach-of-contract claim CB
  has actually won. Develop against the public no-login Educator surface.)*
- **Don't treat the Chrome Web Store listing as durable, and don't rely on disclaimers as a
  legal shield** — they're optics, not protection.

---

## Residual risks (these remain even when you do everything right)

1. **A cease-and-desist to the maker — the dominant, near-certain risk.** Smarterbook (an
   overlay on McGraw-Hill's SmartBook) died in ~48h from a law-firm letter the solo dev chose
   not to fight. *Distinguisher in our favor:* Smarterbook **copied** question text into
   Quizlet/AI and was framed as a cheating tool; we copy nothing and exfiltrate no answer key —
   a materially better posture, but the cost/risk asymmetry of the letter is identical.
   **Mitigation:** incorporate as an LLC; pre-write the counter-narrative ("reads only what the
   user's own browser already rendered; stores no question content; the user is authorized");
   keep the legal surface minimal; instant kill-switch.
2. **Web Store delisting on an IP/trademark complaint** (applied first, argued later).
   **Mitigation:** ship the *same* WebExtension to **Firefox AMO + Edge Add-ons from day one**
   (less aggressive on third-party IP takedowns); support sideload/load-unpacked; keep all
   student data **local-first** so a delisting never destroys their journal/progress.
3. **The copyright-license scope line.** CB's "for classroom teaching and internal reporting
   only" purpose-limit is presented on the public Help page and survives the no-login analysis
   (copyright needs no assent). Re-displaying CB's *explanation text* in your UI is the part
   most exposed. **Mitigation:** keep the fair-use story tight (single authorized user,
   transformative scoring/journal, nothing redistributed); consider letting the student reveal
   CB's explanation **in CB's own native panel** rather than re-rendering it in your chrome.
4. **Mobile gap (real).** Desktop extensions don't run on iOS/Android. **Best least-bad path:**
   desktop-first; wrap the same MV3 code into a **Safari Web Extension** for iOS via Apple's
   converter (one codebase) — but expect stricter Apple review ("facilitating cheating"/IP),
   where CB can also complain. Android has effectively no extension path. **Don't promise
   polished mobile in v1.**
5. **Substitution / hot-news.** Stay a *layer*. The moment the product becomes a competing
   *question-delivery service* running on CB's live feed, the INS-v-AP free-riding theory wakes
   up. Adding scoring/journal UI for one authorized user is not that; rebroadcasting CB's bank is.

---

## Build sequence (ordered to kill the biggest risk first)

1. **Spike the DOM contract (highest technical risk).** In a real authorized session on the
   public Educator QB, confirm you can reliably read question + choices + **correct
   answer/explanation** and inject an overlay via Shadow DOM + TrustedHTML. *(Already
   smoke-confirmed on 2026-06-14; harden it across question types — grid-ins, multi-part,
   figures.)* If the answer key ever isn't in the rendered DOM on a surface, the scoring loop
   assumption breaks — find that out before building anything else.
2. **Build the local-only core, no backend.** Content script → scoring → answer UI →
   user-gesture-gated next → Desmos → IndexedDB mistake journal. Nothing leaves the browser.
3. **Add the minimal backend last:** sync of `{ID, answer, correct/incorrect, timestamp,
   notes}` only. **Add a CI guard that fails the build if any code path (a) calls
   `collegeboard.org`/`qbank-api`, or (b) persists/transmits question text.** Make the
   guardrail a machine-checkable test, not a memo (per the workspace TDD playbook: enforce with
   CI, not prose).
4. **Package for Chrome + Firefox + Edge simultaneously;** wire the kill-switch + 403/block
   detection; write the privacy policy with the Limited-Use statement and a prominent
   non-affiliation notice ("Not affiliated with, authorized, or endorsed by College Board; SAT
   is a trademark of the College Board").
5. **Only then** evaluate the iOS Safari-container wrapper. Mobile stays out of v1's promises.

---

## The one sentence that keeps you legal

*The official question lives and dies on College Board's own page in the student's own browser;
we are only the scoring-and-journal layer around it, and the only things that ever reach us are
question IDs and the student's own data.*
