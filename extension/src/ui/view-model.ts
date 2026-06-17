import type { QuestionView } from '../cb/reader';

// CardVM is what the renderer consumes. It DELIBERATELY excludes stem + explanation: those are
// RAM-only LiveContent (contract §0) passed to renderCard separately and discarded, never modelled
// into anything that could reach the store.
export interface ChoiceVM { letter: string; text: string; }
export interface CardVM {
  id: string;
  section: string; domain: string; skill: string; difficulty: string;
  kind: 'mc' | 'grid';
  choices: ChoiceVM[];           // empty for grid-in
  answerKnown: boolean;          // CB has rendered the correct answer (reveal happened)
  position: { index: number; total: number };   // 1-based, for "Q n of N"
  // Index signature so the leak-guard test can read `vm.stem`/`vm.explanation` as a plain bag and
  // assert they are undefined (RAM-only LiveContent never enters the VM) without an `unknown` cast.
  [key: string]: unknown;
}

// LiveContent is the RAM-only twin handed to the renderer alongside the VM. It is never returned
// from a store getter, never persisted, never passed to model factories. Type lives here so call
// sites can name it without importing reader internals.
// explanationHtmlGetter returns CB's rationale as sanitized allowlist HTML (reader.ts) — read LIVE at
// reveal/Check time and injected un-escaped, the same XSS boundary as stemHtml. Empty string = none.
export interface LiveContent { stem: string; stemHtml: string; explanationHtmlGetter: () => string; }

export function toCardVM(view: QuestionView, index0: number, total: number): CardVM {
  return {
    id: view.id,
    section: view.section, domain: view.domain, skill: view.skill, difficulty: view.difficulty,
    kind: view.choices.length > 0 ? 'mc' : 'grid',
    choices: view.choices.map((c) => ({ letter: c.letter, text: c.text })),
    answerKnown: view.correctAnswer !== null,
    position: { index: index0 + 1, total },
  };
}
