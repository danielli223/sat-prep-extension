---
description: Lint the docs/ knowledge base — stale index rows, superseded legal analysis, contradictions, dishonest dates. Read-only; flags contradictions in place; emits a findings report.
---

Run the **docs-lint** skill (`.claude/skills/docs-lint/SKILL.md`) over this repo's
`docs/` knowledge base and follow it exactly.

Do all four checks: (1) stale `docs/index.md` rows, (2) derived legal analysis
superseded by a newer retrieval in `docs/cb-legal-sources/`, (3) contradictions
between derived docs, (4) dishonest `Last updated:` / retrieval dates. Flag
contradictions and superseded claims **in place** (visible `DOCS-LINT` HTML comment,
dated, naming the conflicting doc/clause) — surface, never silently overwrite. Apply
only safe mechanical fixes (dead index links, provably-stale date stamps); leave
legal substance to a human/attorney. Never edit `docs/cb-legal-sources/` (immutable)
and never feed CB content to a model.

Then output the findings report grouped by severity (blockers / warnings / nits),
listing any flags inserted and any auto-corrections made.

Optional argument: `$ARGUMENTS` — if a specific doc or check is named, focus there;
otherwise lint the whole `docs/` tree.
