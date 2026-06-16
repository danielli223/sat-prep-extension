# Legal Ways to Deliver the Loved UX with Real College Board Questions

*Last updated: 2026-06-14 · Companion to `sat-content-legal-playbook.md` and the OnePrep evaluation*

> **Not legal advice** — a strategy brainstorm, updated with hands-on findings from the official Question Bank. Validate the chosen approach with an IP attorney before building.

---

## The reframe that makes this solvable

The real College Board questions are **already free to anyone**. The official **Educator Question Bank** opens with **no login at all** — you can browse, filter, preview, and even PDF-export thousands of real items. The **Student Question Bank** (free College Board account) is the interactive version. Both already let you filter by assessment, section, domain, skill, and difficulty.

So what OnePrep's users lost was **never the questions** — it's the **UX layer**: completion/progress tracking, right-vs-wrong history, a mistake journal, spaced review, resume, Desmos pinned alongside, and a motivating interface.

**That layer is your own original software and requires copying zero CB content.** The entire strategy: *be the UX layer; let College Board keep delivering the questions.*

## What we confirmed on the official Question Bank (hands-on, June 14, 2026)

Browsed and inspected `satsuiteeducatorquestionbank.collegeboard.org` directly:

- **Open access, no login** to browse/filter/preview/PDF-export. (CB's no-redistribution terms still bind regardless of the missing gate.)
- **Rich official filtering already exists:** Assessment → Section → Domain → Skill → Difficulty, plus "exclude questions already on full-length practice tests" and state-standard alignment.
- **Stable Question IDs (e.g., `ac472881`), but NO per-question URLs.** Previews open in a **modal** while the URL stays `/digital/results`; routing/history reflect the open question **nowhere**, and there's no share/copy-link control. There is nothing to link to.
- **The only per-question handle is a private internal API** (`qbank-api.collegeboard.org/.../questionbank/digital/get-question`). Pulling questions from it = **"scrape / data-mine"** (banned by CB's terms) **and** reproduction of copyrighted content. It's how the clone sites (satquestionbank.org, 1600.lol) work, and a big reason they get DMCA'd. The site also runs **Akamai bot detection**, so the API is actively defended. **This path is off-limits.**
- **No inline Desmos** in the web QB (it's a static preview / PDF-worksheet builder). You must **supply your own calculator** — easy and fully legal, because **Desmos is a separate company** with a free embeddable calculator API; zero College Board involvement.
- **Answers + explanations are available** per item.
- **Tested the Student QB too (signed in):** it is the **same browse-and-export tool** as the educator side — **not** an interactive answering environment. Same modal previews, same Question IDs, URL pinned at `/questionbank/results`, **no per-question links, no Desmos.** You *preview, select, and PDF-export* questions; you do **not** answer them and get scored inside it.
- **Key implication:** the part of OnePrep users loved most — *answering real questions with instant right/wrong tracking* — is exactly what CB's free tools don't expose in a wrappable form. Interactive answering + Desmos lives only in **Bluebook** (a native app you can't overlay) or in full practice tests. OnePrep bridged that gap by putting CB's real questions into its **own** interactive UI — which is the copyright violation. So interactive answering must run on **your own questions** (Strategy D) or be handed off to Bluebook; an overlay can enhance *browsing/curation* of real questions but can't turn the Question Bank into a scored practice tool.

## The one rule that keeps it all legal

- **Never copy, host, cache, scrape, or feed CB question text/passages into anything** — and **never call the `qbank-api` backend.**
- **Store only Question IDs + the user's own performance data** ("got `ac472881` wrong, skill = linear equations"). IDs and a user's own results are facts, not CB's protected expression.
- **Let College Board deliver the questions** — via the student's own authorized session, or by linking to their official site.
- **The Question ID is your legal primitive.** It's a stable fact you can key tracking, analytics, and review scheduling to — without ever holding the content.

If the questions live on College Board's servers and only your *user's own data* lives on yours, there is nothing of theirs to infringe.

---

## The strategies (updated with what we now know)

### A. Browser-extension overlay on the official Question Bank — enhances *browsing/curation* (not scoring)
Augment CB's QB page in the browser with: a pinned **Desmos** panel (your own embed), a **manual mistake journal**, flagging/tracking of which Question IDs you've reviewed or struggled with, spaced-repetition scheduling by ID, and nicer styling. The questions never leave CB's site.
- **What it can't do (corrected after testing):** auto-capture right/wrong — the QB is **preview-only**, so there's no answer event to read. Tracking is by the user's own input, keyed to the visible **Question ID**.
- **Legality:** strong *if* you don't scrape or store question text and don't touch the backend API — render only your own UI, supply your own Desmos. Read-only augmentation, no caching.
- **UX match:** good for the *browse/curate/review* half of the loved bundle; not the interactive-answering half.
- **Solo feasibility:** desktop-browser first; mobile extensions are limited; Bluebook (native app) can't be overlaid — only the web QB.
- **Main risk:** the ToS gray zone around "interfering with" their service. Keep it purely additive and user-side; get this one lawyer-reviewed.

### B. Filtered hand-off launcher + planner/tracker (revised — no per-question deep-links)
Your app owns the study plan, analytics, mistake journal, and spaced-repetition queue. When it's time to practice, it **sends the student to the official QB filtered to the right skill/difficulty** (not to an individual item — those aren't linkable) and the student logs results back by **Question ID**.
- **Legality:** very clean — linking is *expressly permitted* by CB, and you store only IDs + user data.
- **UX match:** good on tracking/planning; the hand-off is to a filtered list rather than a single question, so slightly less seamless than hoped.
- **Solo feasibility:** excellent — no question hosting, cheap, cross-platform (covers mobile where overlays can't).
- **Changed from the prior draft:** the original "deep-link to the exact question" idea is **not possible** (confirmed). Hand off at the filter level instead.

### C. Content-agnostic "study cockpit" / mistake journal — bulletproof, fastest v1
Your app holds **zero** CB content. The student practices anywhere (official QB, Bluebook, a book) and logs results; you provide weak-area dashboards, spaced repetition, a timer, **your own Desmos**, and a structured mistake journal (a behavior power users already do by hand).
- **Legality:** airtight — nothing of CB's ever touches your app.
- **UX match:** delivers the analytics/tracking/Desmos half of the loved bundle; not "questions in-app."
- **Solo feasibility:** excellent; ships fastest. A strong, safe v1 you can launch immediately.

### D. Hybrid — your own original questions native + official questions via links
Native in-app content is **your own original questions** (the playbook's clean path), giving the seamless tracked experience. Layer B on top for students who want *official* items.
- **Legality:** strong (your content + linking).
- **UX match:** high and fully native for your content; official practice stays a hand-off away.
- **Solo feasibility:** medium — writing good original items is the work, but it's the only fully-owned asset and removes dependence on CB's delivery. More important now that you can't lean on seamless CB delivery.

### E. Official permission / partnership (parallel long shot)
Apply via CB's Permission form, but pitch a **tools/UX partnership** (you never take their content; you improve practice around it) or an education/nonprofit framing — not a content license.
- **Legality:** gold standard if granted. **Reality:** low odds for a commercial solo project, slow — but free to ask and the only route to *natively bundling* real questions. Run it in the background; don't block on it.

### F. Community explanations keyed to Question IDs
Attack the "bad/AI explanations" pain directly: students and tutors write and upvote explanations **attached to official Question IDs** (confirmed stable) while the user has the question open on CB. Fixes a top complaint without you authoring questions.
- **Legality:** workable if you reference questions by ID/skill and keep any quoting short and sparse.
- **UX match:** a differentiator CB doesn't offer (and that OnePrep's AI got wrong).
- **Solo feasibility:** medium (needs a community to seed), high moat if it catches.

### Dead ends (and why)
- **Reverse-engineering / scraping the `qbank-api` to pull per-question content** → "scrape / data-mine" (prohibited) + reproduction; bot-defended; the clone-site path that gets taken down. **Off-limits.**
- **Hosting / caching / iframing the Question Bank** → reproduction + ToS breach.
- **Feeding real questions into AI, or "spiraling" / AI-rewriting them** → derivative-work risk + the exact move the market is punishing OnePrep for (see playbook).
- **The noncommercial "administer a practice test" carve-out** → requires noncommercial use and forbids incorporating into your own product; a monetized app fails both.

---

## Recommended blend for a solo builder (re-sequenced after testing the Student QB)

The loved bundle has **two halves**: (1) browse/select real questions, and (2) answer them with instant tracking + Desmos. You can legally wrap **half 1**; **half 2 can't be wrapped on real questions** — there's no interactive surface to attach to, and hosting their questions is infringement — so it must run on your own content or in Bluebook.

1. **Ship C first** — the content-agnostic study cockpit + mistake journal. Safe, fast, immediately useful; it's the tracking/analytics value-add and works no matter where the student practices.
2. **Make D the core** — your own original, interactive, auto-scored questions with tracking + your Desmos. This is the **only legal way to deliver the "answer + instant feedback" loop** users loved, and it's your only owned asset.
3. **Add A / B as the official-content layer** — an overlay (A) to enhance *browsing/curation* of the real QB with your Desmos and a mistake journal, and a filtered hand-off (B) that points students to the official QB to view and to Bluebook for real scored practice — all tracked by Question ID.
4. **Pursue E and F in parallel** — partnership as long-shot upside; community explanations (keyed to Question IDs) as a differentiator and moat.

Net: users get organized access to real official questions **plus** an interactive practice loop — while you never copy a question or call CB's backend.

## Legal guardrails checklist

- [ ] No CB question text/passages stored, cached, or served by you — **Question IDs + user performance only**.
- [ ] **Never call the `qbank-api` backend**; no scraping or data-mining; overlays are read-only, user-side, additive.
- [ ] Real questions are delivered by College Board (the student's own session / links), never reproduced.
- [ ] **Supply your own Desmos** via Desmos's embeddable calculator (third party — no CB involvement).
- [ ] No CB content fed into any AI; AI only generates *your own* original content from public specs.
- [ ] "SAT" used nominatively only, with a clear **"not affiliated with or endorsed by College Board"** disclaimer; **no acorn logo**.
- [ ] Attorney review before launch, especially for the overlay (A) and any quoting (F).

## Still to verify before building

- Browser-extension feasibility and ToS posture against the QB page specifically (overlays must stay read-only / additive).
- Mobile coverage: overlays are desktop-first — companion app vs. mobile-web launcher.
- Exactly what an overlay may attach to the QB without "interfering" (lawyer + a small prototype).
- Whether to route real *scored* practice to **Bluebook** (native) and how to track that back by Question ID.
- Low-risk legal gut-check: storing a large **index of Question IDs + your own tags** (generate your own tags; IDs are facts, not CB's expression).
