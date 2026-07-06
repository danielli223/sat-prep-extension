# Chrome Web Store listing — Scorely

> Last updated: 2026-07-06. Copy for the Developer Dashboard's listing fields — these are
> NOT shipped in the extension zip (except the manifest description, which is).
> Generated via a 3-angle draft + judge pass (trust/free, feature-completeness,
> outcome-focused); the trust/free angle won on legal-compliance and clarity scores and is
> used below. Re-run if the feature set changes materially.

## Title (manifest "name")

Scorely

*(No "SAT"/"College Board" in the name — this repo's own CLAUDE.md invariant #5 and
`docs/sat-app-legal-architecture.md`'s Web Store DON'T list both flag the extension name as
the #1 trademark-delisting trigger. Nominative "SAT" use is confined to the description
fields below.)*

## Manifest description (132-char hard limit — currently 127)

```
Free, local-first SAT practice & prep: score the Question Bank, journal mistakes, track weak areas, flag questions, calculator.
```

## Detailed description (paste into the Web Store dashboard's "Detailed description" field)

Scorely turns the College Board's official Digital SAT Question Bank into a real practice
engine — for free, with nothing sent anywhere. If you've used a prep app that hid your
weak-area report behind a paywall, or wanted a credit card and an email address before
showing you anything useful, Scorely is built to be the opposite: no account, no server,
no catch. It's a free browser extension that layers scoring, tracking, and review tools
directly on top of the Question Bank page you're already using, so every practice session
actually counts instead of disappearing the moment you close the tab.

**What Scorely adds on top of the Question Bank:**

- Instant scoring — see right or wrong as you answer, no more manually checking against an answer key
- Mistake journal — every question you get wrong is logged automatically, so you can revisit it instead of losing it
- Weak-area tracking by skill and domain — see exactly which SAT Math and Reading & Writing skills are dragging your score down, not just one overall percentage
- Flag questions for review — mark any question mid-practice to come back to later, whether it's a careless slip or a topic you want to drill again
- Built-in calculator — a real Desmos graphing calculator, one click away, no tab-switching required

**How it works:** Scorely runs entirely client-side, inside your own browser. It reads the
Digital SAT Question Bank page you already have open — it never calls a College Board API,
and it never fetches, stores, or transmits question text, passages, or answer explanations.
The only thing it saves is your own data: which question IDs you attempted, your answers,
your notes, and your flags, kept locally in your browser. Nothing is uploaded, no account is
required, and there is no server on the other end reading your practice history. It's a
scoring and journaling layer, not a question source — you still get every official Digital
SAT question straight from College Board's own site.

This is for students who are already grinding through the SAT Question Bank and are tired of
losing track of what they got wrong or re-deriving, session after session, which skills
actually need work. Whether you're doing focused SAT practice by domain, reviewing a
full-length set, or just want a straightforward SAT mistake tracker that doesn't ask you to
sign up for anything, Scorely turns raw question-bank repetition into an actual study plan —
a digital SAT prep tool that respects your data as much as your time.

**Not affiliated with, authorized, or endorsed by College Board. SAT is a trademark of the
College Board, which does not sponsor or endorse this product.**

## Target keywords (for your own reference — the Web Store has no literal keywords field;
category + description keyword density is what drives its search)

- SAT practice extension
- digital SAT prep tool
- SAT Question Bank scoring
- SAT mistake tracker
- SAT weak area tracker
- free SAT prep
- SAT score tracker
- Digital SAT Question Bank helper
- SAT study companion
- SAT skill tracker by domain
- SAT calculator extension
- SAT mistake journal

## Category

Education (Chrome Web Store's closest fit; not "Productivity")

## Screenshots / promo images

Not generated in this pass — the dashboard requires 1280×800 or 640×400 PNG/JPEG
screenshots of the actual overlay in use. Capture these from a live dev build before
submitting (recommended: the answer overlay with a flagged question, and the journal panel
showing the "Flagged for review" section).
