import type { QuestionView } from '../cb/reader';

// CardVM is what the overlay renderer (answer-overlay.ts renderBody) consumes. It DELIBERATELY
// excludes stem: that field is RAM-only, used for observer dedup and discarded — never modelled
// into anything that could reach the store.
export interface ChoiceVM { letter: string; text: string; imgSrc?: string; }
export interface CardVM {
  id: string;
  section: string; domain: string; skill: string; difficulty: string;
  kind: 'mc' | 'grid';
  choices: ChoiceVM[];           // empty for grid-in
  answerKnown: boolean;          // CB has rendered the correct answer (reveal happened)
  position: { index: number; total: number };   // 1-based, for "Q n of N"
  // Issue #28: the student's prior status for THIS question, derived from their own attempt journal
  // (getSeen). OPTIONAL so VM literals that omit it still typecheck; the overlay defaults it to 'new'.
  priorStatus?: 'new' | 'done' | 'missed';
  // Index signature so the leak-guard test can read `vm.stem` as a plain bag and
  // assert it is undefined (RAM-only stem never enters the VM) without an `unknown` cast.
  [key: string]: unknown;
}


export function toCardVM(
  view: QuestionView, index0: number, total: number,
  priorStatus: 'new' | 'done' | 'missed' = 'new',
): CardVM {
  return {
    id: view.id,
    section: view.section, domain: view.domain, skill: view.skill, difficulty: view.difficulty,
    kind: view.choices.length > 0 ? 'mc' : 'grid',
    choices: view.choices.map((c) => ({ letter: c.letter, text: c.text, imgSrc: c.imgSrc })),
    answerKnown: view.correctAnswer !== null,
    position: { index: index0 + 1, total },
    priorStatus,
  };
}
