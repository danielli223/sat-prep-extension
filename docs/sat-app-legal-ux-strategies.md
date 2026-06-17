# Legal Ways to Deliver the Loved UX with Real College Board Questions

*Last updated: 2026-06-16 · Companion to `sat-content-legal-playbook.md` (content/copyright/AI rules) and `sat-app-legal-architecture.md` (the chosen build, "R1"). Reads alongside the OnePrep customer-voice docs.*

> **Not legal advice** — a strategy brainstorm, updated with hands-on findings from the official Question Bank. Validate the chosen approach with an IP attorney before building.
>
> **What changed:** an earlier draft of this doc concluded a *scored* loop on real CB questions was impossible — the QB is preview-only, so "no answer event to read." Live testing then found CB renders the **correct answer + per-choice rationale in the page DOM**, so an overlay can supply its own answer UI and score locally — no native answer event needed. That scored overlay (**Strategy A**) became the shipped product; `sat-app-legal-architecture.md` is its authoritative spec. Strategies B–F below remain valid alternatives/complements.

---

## The reframe that makes this solvable

The real College Board questions are **already free to anyone**. The official **Educator Question Bank** opens with **no login at all** — browse, filter, preview, and PDF-export thousands of real items. The **Student Question Bank** (free CB account) is the same browse-and-export tool, not an answering environment.

So what OnePrep's users lost was **never the questions** — it's the **UX layer**: completion/progress tracking, right-vs-wrong history, a mistake journal, spaced review, resume, Desmos pinned alongside, and a motivating interface. **That layer is your own original software and copies zero CB content.** The strategy in one line: *be the UX layer; let College Board keep delivering the questions.*

## What we confirmed on the official Question Bank (hands-on, June 14 2026)

The make-or-break technical facts — no login; stable Question IDs (e.g. `ac472881`) but **no per-question URLs** (previews open in a modal; URL stays `/digital/results`); CB (not you) calls the private `qbank-api` backend behind **Akamai bot detection**; and the full question + all choices + **correct answer (`Correct Answer: B`) + per-choice rationale all render as DOM text** — are documented in detail in `sat-app-legal-architecture.md`. The implications specific to this strategy menu:

- **Rich official filtering already exists** to wrap: Assessment → Section → Domain → Skill → Difficulty, plus "exclude questions already on full-length practice tests" and state-standard alignment.
- **No inline calculator** in the web QB (it's a static preview / PDF-worksheet builder). You **supply your own** — easy and fully legal, since it's a third party with zero CB involvement. (The build embeds **GeoGebra**, which permits embedding, and offers a one-click link to the real **Desmos** test-day tool rather than iframing it.)
- **Student QB = Educator QB, functionally.** Tested signed-in: same modal previews, same Question IDs, URL pinned at `/questionbank/results`, no per-question links, no inline Desmos. You *preview, select, and PDF-export* — you do **not** answer-and-get-scored *inside CB's UI*.
- **The key correction:** "no native answering inside CB" is **not** "can't score." Because the **correct answer renders in the DOM**, an overlay supplies its own answer UI and scores locally against the answer CB already painted — turning the QB into a real scored practice tool (Strategy A / R1). Interactive answering does **not** have to run on your own questions or be exiled to Bluebook, as the earlier draft assumed.

## The one rule that keeps it all legal

- **Never copy, host, cache, scrape, or feed CB question text/passages into anything — and never call the `qbank-api` backend.** Read only the rendered DOM, in the user's own session, and discard it.
- **Store only Question IDs + the user's own performance data** ("got `ac472881` wrong, skill = linear equations"). IDs and a user's own results are facts, not CB's protected expression — **the Question ID is your legal primitive.**
- **Let College Board deliver the questions** — via the student's own authorized session, or by linking to their official site.

If the questions live on CB's servers and only your *user's own data* lives on yours, there is nothing of theirs to infringe. (Full legal basis, bright-line guardrails, and residual risks: `sat-app-legal-architecture.md`.)

---

## The strategies

### A. Browser-extension overlay on the official Question Bank — the full scored loop ★ shipped (R1)
Augment CB's **live** question in the browser with your own answer UI (select, cross-off choices, explicit **Check**), **instant right/wrong scored against the correct answer read from the rendered DOM**, CB's own rationale revealed in place, a local mistake journal + weak-area tracking + re-surface badging, and a pinned **GeoGebra** calculator (your own embed) plus a one-click **Open real Desmos** link (the free test-day tool). The question never leaves CB's page.
- **Legality:** strong *if* you read the rendered DOM only, never scrape or store question text, and never touch the backend API. This is the chosen architecture — see `sat-app-legal-architecture.md` for the legal basis (browser-is-yours / PayPal Honey precedent / transient-copy doctrine), bright-line guardrails, and residual risks (C&D, Web Store delisting, mobile gap).
- **UX match:** delivers the **whole** loved bundle on real questions — browse/curate *and* answer-with-instant-tracking.
- **Solo feasibility:** desktop-browser first; mobile extensions are limited; only the web QB is overlayable (Bluebook is a native app you can't overlay).
- **Correction from the prior draft:** A was previously scoped to *browsing/curation only* because auto-scoring was thought impossible (preview-only, "no answer event"). Live testing showed the correct answer is in the DOM, so A is the full scored loop.

### B. Filtered hand-off launcher + planner/tracker
Your app owns the study plan, analytics, mistake journal, and spaced-repetition queue. When it's time to practice, it **sends the student to the official QB filtered to the right skill/difficulty** (not to an individual item — those aren't linkable) and the student logs results back by **Question ID**.
- **Legality:** very clean — linking is *expressly permitted* by CB, and you store only IDs + user data.
- **UX match:** good on tracking/planning; the hand-off is to a filtered list rather than a single question, so slightly less seamless than the overlay.
- **Solo feasibility:** excellent — no question hosting, cheap, cross-platform (**covers mobile, where overlays can't run**).
- **Note:** deep-linking to an exact question is **not possible** (confirmed — no per-question URL); hand off at the filter level.

### C. Content-agnostic "study cockpit" / mistake journal — bulletproof fallback
Your app holds **zero** CB content. The student practices anywhere (official QB, Bluebook, a book) and logs results; you provide weak-area dashboards, spaced repetition, a timer, **your own calculator**, and a structured mistake journal (a behavior power users already do by hand).
- **Legality:** airtight — nothing of CB's ever touches your app.
- **UX match:** the analytics/tracking/calculator half of the bundle; not "questions in-app."
- **Solo feasibility:** excellent; ships fastest. The safe baseline the overlay (A) builds on, and the natural fallback when the student isn't on the QB page.

### D. Hybrid — your own original questions native + official questions via the overlay/links
Add **your own original questions** (the playbook's clean authored path) for a fully-owned, in-app interactive bank, layered on top of A/B for official items.
- **Legality:** strong (your content + reading-not-copying + linking).
- **UX match:** high and fully native for your content; an owned asset that removes dependence on CB's delivery.
- **Solo feasibility:** medium — writing good original items is the work. **Optional expansion, not required:** with A delivering the scored loop on *real* questions, own-content is no longer the *only* way to get "answer + instant feedback" (as the earlier draft assumed). See `sat-content-legal-playbook.md` for the clean authoring path.

### E. Official permission / partnership (parallel long shot)
Apply via CB's Permission form, but pitch a **tools/UX partnership** (you never take their content; you improve practice around it) or an education/nonprofit framing — not a content license.
- **Legality:** gold standard if granted. **Reality:** low odds for a commercial solo project, slow — but free to ask and the only route to *natively bundling* real questions. Run it in the background; don't block on it.

### F. Community explanations keyed to Question IDs
Students and tutors write and upvote explanations **attached to official Question IDs** (confirmed stable) while the user has the question open on CB. Attacks the "bad/AI explanations" pain directly (OnePrep's failure mode) without you authoring questions.
- **Legality:** workable if you reference questions by ID/skill and keep any quoting short and sparse.
- **UX match:** a differentiator CB doesn't offer (and that OnePrep's AI got wrong).
- **Solo feasibility:** medium (needs a community to seed); high moat if it catches.

### Dead ends (and why)
- **Reverse-engineering / scraping `qbank-api` to pull per-question content** → "scrape / data-mine" (prohibited) + reproduction; bot-defended; the clone-site path (satquestionbank.org, 1600.lol) that gets DMCA'd. **Off-limits.**
- **Hosting / caching / iframing the Question Bank** → reproduction + ToS breach.
- **Feeding real questions into AI, or "spiraling" / AI-rewriting them** → derivative-work risk + the exact move the market is punishing OnePrep for (see `sat-content-legal-playbook.md`).
- **The noncommercial "administer a practice test" carve-out** → requires noncommercial use and forbids incorporating into your own product; a monetized/loss-leader app fails both.

---

## Recommended blend for a solo builder

1. **Ship A (the R1 scored overlay) as the product** — the only legal way to deliver the loved "answer + instant feedback" loop on *real* official questions. See `sat-app-legal-architecture.md` for the build sequence (DOM-contract spike → local-only core → minimal IDs-only backend → multi-browser packaging + kill-switch).
2. **Keep C as the safe baseline/fallback** — content-agnostic tracking that works no matter where the student practices (and when not on the QB page).
3. **Add B for reach** — filtered hand-off + Bluebook routing where overlays can't run (notably mobile).
4. **Treat D as optional upside** — your own original interactive bank if/when you want a fully-owned asset.
5. **Pursue E and F in parallel** — partnership as long-shot upside; community explanations (keyed to Question IDs) as a differentiator and moat.

Net: users get organized access to real official questions **plus** an interactive scored practice loop — while you never copy a question or call CB's backend.

## Legal guardrails (this doc's additions)

The authoritative bright-line guardrails (read-DOM-only, IDs-only persistence, no AI on CB content, nominative-use-only, kill-switch, MV3 scoping) live in `sat-app-legal-architecture.md`. Specific to this strategy menu:

- [ ] **Supply your own calculator** (the build embeds GeoGebra; the real Desmos is offered as an external link, not iframed) — third party, no CB involvement.
- [ ] If you author content (D), generate it **only** from public specs — never feed CB content into any AI (`sat-content-legal-playbook.md`).
- [ ] Real questions stay delivered by College Board (the student's own session / links), never reproduced.
- [ ] Attorney review before launch, especially for the overlay (A) and any quoting (F).

## Open questions

- **Resolved by the build:** browser-extension feasibility and the read-only/additive ToS posture against the QB page — built and live-validated (see `project-brief.md`). Scored practice no longer needs routing to Bluebook; the overlay scores on the QB directly (Bluebook routing is now an optional, B-style complement).
- **Still open:** mobile coverage (overlays are desktop-first — a Safari Web Extension container vs. a mobile-web launcher); the precise line of what an overlay may attach without "interfering" with CB's service (confirm with the IP attorney + the live prototype); and a low-risk gut-check on storing a large **index of Question IDs + your own tags** (IDs are facts; generate your own tags).
