# SAT Content & AI — Legal Playbook

*Last updated: 2026-06-14 · Scope: using SAT/College Board content in a free SAT-prep app*

> **Not legal advice.** This is a working summary of research, not a lawyer's opinion. Before you scale, have an IP attorney confirm.

---

## Bottom line

Do **not** redistribute, modify, or feed College Board's actual SAT questions into an AI. Instead, **author original questions aligned to the publicly published SAT spec** — the same method mainstream prep companies (Kaplan, Princeton Review, Barron's) have always used. That path is legally defensible; everything that touches their real items is not.

---

## The three legal layers

1. **Copyright** protects *expression* (the exact wording of questions, passages, answer choices, and the selection/arrangement of a set) — **not** the underlying ideas, facts, skills, or question *formats* (17 U.S.C. §102(b)). You may freely study the test and build around the concepts. Independent creation is a complete defense.
2. **College Board's terms of use** are a separate contract you accept to access their materials. They bar distributing, reproducing, modifying, or **using their content "in conjunction with generative AI,"** and bar training AI on it. This applies regardless of copyright.
3. **Trademark** — "SAT" and the acorn logo are College Board marks. You may use "SAT" *nominatively* ("practice for the SAT") with a non-affiliation disclaimer, but not the logo and not in any way implying endorsement.

## Key trap: a free app is still "commercial"

College Board defines commercial use as use "intended for commercial advantage," and says **"this includes test-prep settings."** A free app built as a loss-leader to grow an audience you intend to monetize is a commercial test-prep product. So the narrow noncommercial classroom exceptions (a teacher administering an unaltered practice test to their own students) **do not apply to you.**

---

## Do / Don't

**Don't**
- Redistribute the official Question Bank or Bluebook items — even free, even "noncommercial." (Hosting them in an app = redistribution.)
- Modify or paraphrase real questions. There is **no safe percentage** to change — the test is "substantial similarity," not a word count.
- Put real SAT questions into any AI for any purpose (see table below).

**Do**
- Author original questions from the **publicly published SAT skill domains / test specs.**
- **Link** to the free official resources (Khan Academy, Bluebook) — linking is expressly permitted.
- Use "SAT" nominatively + add *"not affiliated with or endorsed by College Board"*; no acorn logo.

---

## AI workflows — safe vs. unsafe

The decisive variable is **what ingests the real questions, and how.** Only unprotectable *ideas* should cross the line, and they should cross through a *human*, not by feeding the protected items into a model.

| Workflow | Real questions enter AI? | Verdict |
|---|---|---|
| Feed real questions → AI generates new ones → redistribute | Yes | ❌ Breaches the no-AI term **and** builds a derivative-work chain |
| Feed real questions → AI distills an "instruction/spec" → AI generates from it | Yes | ❌ Same breach; the middle step doesn't launder it — fidelity-distillation carries expression forward and destroys your independent-creation defense |
| Human studies public tests → **human** writes an abstract spec (skill, format, difficulty) → AI generates from the human spec → screen outputs | **No** | ✅ Clean: only unprotectable ideas cross, via a human; no CB content touches the AI |

**Why the human step matters:** a human reading a work and absorbing its ideas is the normal, permitted use — and ideas aren't copyrightable. A model ingesting the actual items is a "content-into-AI" use that breaches the terms *and* documents your access and copying path.

### Guardrails for the clean path
- Keep the spec **abstract** — construct, skill, difficulty, format ("word problem on systems of linear equations, 4 choices, distractors reflecting common sign errors"). Never paste or paraphrase a specific real stem, scenario, or distractor set.
- **Passages are the highest-risk element** (long, original expression). Use your own, licensed, or public-domain passages — never have the AI reproduce or closely paraphrase a College Board passage.
- **Screen outputs** for accidental close matches to real items (models sometimes regurgitate memorized questions).
- Prefer learning from the **public practice materials** over the educator-gated Question Bank, whose license is narrower (classroom teaching / internal reporting only).
- Note: purely AI-generated questions may not be copyrightable by *you* (no human authorship) — add human authorship/editing if you want to own the output.

---

## "They'll never catch it" is a weak premise

- College Board **actively enforces**: it sued a test-prep company for using SAT questions in practice materials and obtained a **$1M settlement**, refers cases to law enforcement, and acts on whistleblowers, competitors, and user reports.
- It has a registered copyright agent — meaning **DMCA takedowns** can kill your product at the host or app store **without a lawsuit.**
- **Your own goal is the detection vector.** The plan is a large, public, "SAT"-branded audience. Success = visibility = discoverability by their brand monitoring; similarity is checkable by direct comparison.
- The AI pipeline is **self-incriminating**: in litigation, discovery shows you knowingly fed their questions in — that's *willful* infringement (statutory damages up to **$150K per work**, plus possible attorney's fees).
- Even if never sued, infringing IP at the core makes the business **uninvestable and unsellable** — it's the first thing diligence finds, which guts the "monetize/sell the audience later" thesis.

---

## The only sanctioned route to official content

Submit College Board's **Copyright & Trademark Permission Request Form** (allow 4–6 weeks). Note they've stated SAT materials are **not available for commercial license** — so for a commercial product, plan on original content, not licensed items.

---

## Sources

- [College Board — Copyright & Trademark Permission Instructions](https://privacy.collegeboard.org/copyright-trademark/request-instructions)
- [College Board — Legal Terms for Educators and Institutions](https://privacy.collegeboard.org/educator-legal-terms)
- [College Board — Guidelines for Using Trademarks (generative-AI prohibition)](https://privacy.collegeboard.org/copyright-trademark/guidelines)
- [Educator Question Bank — SAT Suite (license scope)](https://satsuite.collegeboard.org/k12-educators/tools-resources/question-bank)
- [Substantial similarity in copyright — DLA Piper](https://www.dlapiper.com/en/insights/publications/intellectual-property-news/2022/ipt-news-q4-2020/substantial-similarity-in-copyright)
- [U.S. Copyright Office on AI & fair use — Skadden summary](https://www.skadden.com/insights/publications/2025/05/copyright-office-report)
- [Generative AI and Copyright Law — Congressional Research Service](https://www.congress.gov/crs-product/LSB10922)
- [College Board accuses company of circulating SAT questions — Chronicle](https://www.chronicle.com/article/in-lawsuit-college-board-accuses-company-of-circulating-copyright-protected-sat-questions-114369/)
- [College Board settles copyright suit ($1M) — Chronicle](https://www.chronicle.com/article/college-board-settles-with-test-prep-company-accused-of-copyright-infringement/)
