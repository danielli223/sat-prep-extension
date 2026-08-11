# Competitor Landscape — who else is between the student and CB's Question Bank

*Last updated: 2026-08-11. First cut.*

> **Why this doc exists.** The two OnePrep files are *customer-voice research* — what students
> say and feel about one incumbent. They are not a competitor map, and stuffing a competitor
> map into them would corrupt what they are. The 2026-08-11 refresh sweep turned up a category
> the knowledge base had never recorded: **browser extensions that overlay College Board's own
> Question Bank** — i.e. our exact architecture, shipped by other people, already in the Chrome
> Web Store. That belongs here.
>
> **Provenance warning, read before citing this doc.** Everything below was gathered on
> 2026-08-11 through the **web search index only**. The environment this sweep ran in blocks
> outbound page fetches, so **no listing, store page, or site was read directly** — no install,
> no manifest inspection, no permissions review, no hands-on use. Treat every feature claim as
> *"the listing/index says"*, not *"verified"*. Anything load-bearing (especially the
> "they do / don't do X" comparisons) needs a hands-on pass before it drives a decision.

## The three postures

Everyone competing for "real official SAT questions in a better study experience" picks one of
three postures toward CB's content. The posture — not the feature list — is what determines the
legal exposure.

| Posture | What it does | Who | Exposure |
|---|---|---|---|
| **Overlay** (ours) | Leaves the questions on CB's page; adds interaction/scoring/tracking client-side | Us; 4+ Chrome extensions (below) | Lowest — nothing copied, stored, or redistributed |
| **Clone / mirror** | Re-hosts CB's questions on its own site with a better UI | satquestionbank.org, satquestionbank.net, 1600.lol, easy1600.org, satslayer.org | Direct copyright + terms exposure |
| **Substitute** | Replaces CB's questions with its own (human- or AI-written) | OnePrep (post-acquisition), AlphaTest, Aniko, UWorld, Stellar Learning | No CB copyright issue; loses the authenticity that students say they want |

Our whole thesis is that posture 1 is the only one that keeps *"the questions are real and
unaltered"* true and defensible at the same time. The rest of this doc is who else is standing
in each column.

---

## 1. Overlay extensions — the direct competitors (NEW to this knowledge base)

Four extensions in the Chrome Web Store do a subset of what we do, on the same surface, with the
same basic move: read CB's already-rendered Question Bank page and add study affordances on top.

| Extension | ID | What the listing claims | Signal |
|---|---|---|---|
| **SAT Question Bank Plus** | `kafniddgjcmgpbnkcjnpfmgbnbffodhi` | Reveal/hide answers with animation, green-highlight the correct choice, Back/Next navigation inside CB's modal; works on **both** the Student and Educator banks | ~**747 users**, **4.0★** (chrome-stats). Also indexed under the title "SAT® Question Bank Answer Hider" |
| **SAT Question-bank tool** | `kdppehknjmcaamnehhkiiehegncpelbf` | "Converts the official Collegeboard question-bank into an effective study tool": hide the answer on open, **mark right/wrong**, **flag for revisit** | Newer; chrome-stats reports too few users to profile. Ships an explicit non-affiliation disclaimer |
| **SAT Suite Question Bank Improved** | `eglgcjlcglfbdaiijaogojflnaiemaaf` | Dims out already-completed questions on the SAT Suite site; select-all / deselect-all conveniences. Explicitly **does not backfill** history from before install | Our re-surface badger, minus the journal |
| **SAT Question Bank Tracker** | `eeinjoeegjkhiddemncmbbgianhliopi` | Progress tracking over the question bank (listing not read) | Unknown scale |

### What this changes for us

**The category is validated but not ours by default.** "Overlay CB's own bank, hide the answer,
mark right/wrong, track what you've done" is not a novel idea — it is shipping, in the same
store, today. The June customer-voice work established the *demand*; this establishes that other
builders reached the same conclusion about how to serve it.

**Nobody observed is shipping the whole loop.** Each of the four covers a slice — reveal/hide,
or marking, or completion dimming. None of the listings describes the combination our v1 has:
scored check → mistake journal → weak-area stats → guided resume → calculator → re-surface
badger across sessions. The differentiated claim is the *loop*, not the overlay.
**Caveat:** this is read off listing copy, not off installs. Verify before putting it in
marketing copy.

**All four put "SAT" in the extension name — we deliberately do not.** `SAT Question Bank Plus`,
`SAT Question-bank tool`, `SAT Suite Question Bank Improved`, `SAT Question Bank Tracker`. That is
exactly the naming invariant #5 forbids us (see
[`sat-app-legal-architecture.md`](sat-app-legal-architecture.md) and
[`cb-legal-sources/college-board-trademark-guidelines.md`](cb-legal-sources/college-board-trademark-guidelines.md)).
Two conclusions, and the second matters more:

1. It is a real differentiator — we are the compliant-by-construction one.
2. **Their survival is not evidence that the naming is safe.** They have not been visibly
   enforced against; that is absence of enforcement, not permission. Do not let "but they do it"
   erode invariant #5. If anything they are the control group for what we chose not to risk.

**Weak, non-dispositive support for the architecture.** Read-the-rendered-DOM overlays over the
Question Bank have persisted publicly (one with ~750 users) without visible CB action. That is
mild corroboration that the overlay posture does not draw immediate fire — and *nothing more*.
It establishes no license, sets no precedent, and does not touch any bright line. The legal
architecture stands on the analysis in `sat-app-legal-architecture.md`, not on this.

**Open questions a hands-on pass should answer:** do any of them call `qbank-api` rather than
reading the DOM (invariant #1)? What do they persist, and do they store question *text*
(invariant #2)? What host permissions do they request? Are any of them AI-backed (invariant #3)?
Their answers don't change our invariants, but they do calibrate how differentiated
"we never touch the questions" actually is as a claim.

## 2. Clone / mirror sites — the copy posture we rejected

The free-clone tier the June evidence ledger tracked has **grown, not shrunk**, and now markets
the same feature list we do:

- **satquestionbank.org** — up. Positions itself explicitly as "uses official SAT Suite Question
  Bank Questions" with "a better interface": real-timing timer (32 min / 27 RW, 35 min / 22 Math),
  **built-in Desmos on every math question**, instant answer checking, explanations, filtering by
  test / content area / difficulty. This is our value proposition delivered by re-hosting.
- **satquestionbank.net** — a separate site (not the `.org`), running a content/blog operation
  ("SAT Question Bank with Desmos", "How the SAT Question Bank Works").
- **1600.lol** — materially bigger than the June record. Now claims **12,000+ free questions, no
  signup**, built-in graphing calculator, instant feedback, progress tracking, current-format
  item types. June recorded it as freemium (15 free Qs/day, $19 lifetime); that appears
  superseded.
- **easy1600.org** — **new entrant**, free SAT question bank (RW + Math).
- **satslayer.org**, **practicesat.vercel.app**, **oly.st / ap.oly.st** — carried over from June,
  status not re-verified this sweep.

**Read for us:** the demand is being served, loudly, by the posture we ruled out. Their
persistence tells us CB is not aggressively enforcing right now, which is a fact about *this
moment*, not about the law — and their exposure is precisely what our overlay design exists to
avoid. If CB's posture changes, this tier is what changes first; that is also the tier whose
users would be looking for a replacement.

## 3. Substitutes — own-content platforms

- **OnePrep (MyDojo Inc. / RevisionDojo)** — the incumbent the customer-voice docs cover in
  depth. As of this sweep it has moved well beyond SAT: ACT and AP question banks, a schools/B2B
  offering, a scholarship program, and a pay-once pricing model replacing the subscription.
  See [`oneprep-customer-voice-synthesis.md`](oneprep-customer-voice-synthesis.md) §"Refresh
  sweep, 2026-08-11".
- **AlphaTest** (alphatestai.com) — paid AI SAT tool; runs the largest anti-OnePrep SEO cluster.
  Not user voice; see the "discount" list in the evidence ledger.
- **Stellar Learning** (stellarlearning.app) — **new**. Self-describes as a nonprofit offering
  its full suite free; publishes `why-stellar/stellar-vs-oneprep` (and vs-Knowt, vs-Fiveable)
  comparison pages. Same competitor-comparison SEO playbook, "free nonprofit" positioning.
- **Point One Prep** (pointoneprep.com) — **new**; publishes `oneprep-vs-point-one-prep`.
- **UWorld / Magoosh / Princeton Review** — the established paid banks; UWorld remains the
  consistent "if you'll pay" recommendation in the customer-voice data.

**Read for us:** the substitute tier competes on *volume and features*, and cannot compete on
authenticity. Every one of them has to answer "are these real SAT questions?" with a qualified
no. That question is the one students in the r/SAT data keep asking, and it is the only axis
where our architecture wins by construction.

---

## Where we actually sit

Nobody in the map occupies our exact square: **the full scored loop, over CB's real unmodified
questions, free, with the questions never copied.** The overlay extensions have the posture but
not the loop. The clones have the loop-ish features but copy the questions. The substitutes have
the polish but not the questions.

That is a real position — and a narrow one. The two things that would erode it fastest are one of
the four extensions growing into a full loop, or a clone site surviving long enough to be treated
as the default. Worth re-sweeping this doc quarterly, and worth one hands-on pass over the four
extensions before any launch positioning is written.

## Sources (all search-index, 2026-08-11, none fetched directly)

- Chrome Web Store listings: `chromewebstore.google.com/detail/sat-question-bank-plus/kafniddgjcmgpbnkcjnpfmgbnbffodhi`,
  `.../sat-question-bank-tool/kdppehknjmcaamnehhkiiehegncpelbf`,
  `.../sat-suite-question-bank-i/eglgcjlcglfbdaiijaogojflnaiemaaf`,
  `.../sat-question-bank-tracker/eeinjoeegjkhiddemncmbbgianhliopi`
- chrome-stats profiles for `kafniddgjcmgpbnkcjnpfmgbnbffodhi` (747 users, 4.0★) and
  `kdppehknjmcaamnehhkiiehegncpelbf`
- satquestionbank.org (+ `/about`), satquestionbank.net, 1600.lol (+ `/question-bank`), easy1600.org
- stellarlearning.app/why-stellar/stellar-vs-oneprep; pointoneprep.com/blog/oneprep-vs-point-one-prep;
  alphatestai.com blog cluster
