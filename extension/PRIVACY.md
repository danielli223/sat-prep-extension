# Privacy Policy — Focused Practice

_Last updated: 2026-06-21_

## The short version

- Your practice data — **which questions you did, your answers, right/wrong, your notes,
  and your progress — stays on your device**, in your browser. We never store the question
  text itself.
- We **never** run College Board content through AI.
- There is **one optional thing** that can leave your device: **anonymous usage analytics**.
  It is **off unless you turn it on**. If you turn it on, we share a small amount of
  anonymous, non-identifying usage data with our analytics provider, **PostHog**.
- We **never sell** your data, **never show ads**, and **never build a profile** of you.

## What stays on your device

Focused Practice stores **only the question ID and your own data** — your selected answer,
whether it was correct, your optional notes, and your session/progress. This is what lets
you stop and **come back to where you left off**. It lives in your browser's local storage
(IndexedDB). There is **no account** and your journal is **not** uploaded anywhere.

We **never store the question content or text** (the stem, passages, answer choices, or
explanations). College Board's questions are read live from the page in your browser, shown
to you live, and discarded from memory — never written to disk, never cached, never sent
anywhere.

## Optional anonymous analytics (off by default)

To improve the extension and to detect when it breaks, we offer an **opt-in** analytics
feature. It is the only thing that ever sends data off your device.

### It's your choice, and it's off until you turn it on

- **Off by default.** Nothing is collected or sent until you turn it on.
- You turn it on with a **toggle in the extension's popup**, after confirming you are
  **13 or older**. It is not a notification and is never pushed at you.
- You can **turn it off again at any time** in the same place.

### What we share (only if you opt in)

- The **ID numbers** of the questions you practice and **whether you got each one right or
  wrong**.
- **Which features you use** (for example: opened the calculator, opened the journal, added
  a note) and rough **counts in ranges** (for example "6–20 questions", never exact totals).
- A **random ID** so these events can be grouped together. It contains **no personal
  information** — no name, no email, no login (there is none), and **no IP address**.

### What we NEVER share

- The **question text**, passages, answer choices, or explanations.
- **Your notes.** (We may send *how long* a note is — a number — but **never what it says**.)
- Anything that **identifies you**: name, email, account, or IP address.
- Error messages, stack traces, or any College Board web address.

A safety filter built into the extension blocks anything outside a fixed allowlist from ever
leaving your device.

### Who processes it

If you opt in, this anonymous data is sent over **HTTPS** to **PostHog**, a US company that
stores and processes it **on our behalf** (our data processor), on its US cloud. PostHog is
configured so that **IP addresses are not collected** and no session recording or automatic
page capture takes place.

### What we use it for

Only **internal operations**: **product improvement** (understanding which features help
students) and **service health** (noticing when the extension stops working — for example
when College Board changes its page). We **never** use it for advertising, **never** sell it,
and **never** use it to profile or contact you.

### How long we keep it

Analytics events are kept for **12 months**, then automatically deleted.

### Your controls

- **Turn it off** anytime with the popup toggle.
- **"Delete my analytics data"** erases your events from PostHog. The request is submitted
  immediately; PostHog completes the deletion within a few days.

## A note for students under 18

Focused Practice is intended for a **general audience and is not directed to children under
13**. The "I'm 13 or older" confirmation supports this; it is **not** a substitute for
parental consent. If analytics is enabled, the random ID is used **solely for the internal
operations above** (product improvement and service health) and is **never** used to contact
or build a profile of any individual. If we learn that data belongs to a child under 13, we
will delete it promptly.

## Other network activity

The extension also checks a single on/off flag on our own configuration host
(`config.focusedpractice.app`) so we can disable the overlay or analytics instantly if
needed. This request carries **no personal data and no credentials**. We **never** contact
`collegeboard.org` programmatically.

## Limited Use

Apart from the optional analytics described above, all of your data stays on your device. We
**do not sell** your data, **do not** use it for advertising, and **do not** build a profile
of you. The extension's use of data is limited to providing the in-browser study features you
see (scoring, journal, progress) and the opt-in product analytics you choose to enable.

## We never use AI on College Board content

We **never** run any College Board content — questions, passages, answer choices, or
explanations — through AI. Ever.

## Not affiliated

Not affiliated with, authorized, or endorsed by College Board; SAT is a trademark of the College Board.

## Contact

Questions about this policy: privacy@focusedpractice.app
