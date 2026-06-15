// ISOLATED CB-DOM KNOWLEDGE. The only place (with observer.ts) that knows CB's HTML shape.
// Pure read: returns a clean view-model. Question text is for in-RAM spotlighting only — never stored.
export interface Choice { letter: string; text: string; }
export interface QuestionView {
  id: string;
  section: string; domain: string; skill: string; difficulty: string;
  stem: string;                        // RAM-only (spotlight); never persisted
  choices: Choice[];
  correctAnswer: string | null;        // present once CB renders the answer/rationale
  explanation: string | null;          // RAM-only; never persisted
}

const ID_RE = /Question ID:\s*([0-9a-f]{6,})/i;
const ANS_RE = /Correct Answer:\s*([^\n]+)/i;   // capture the FULL answer string (may list multiple acceptable forms)

export function readQuestion(root: Element): QuestionView | null {
  const text = (sel: string) => root.querySelector(sel)?.textContent?.trim() ?? '';
  const idMatch = (root.textContent ?? '').match(ID_RE);
  if (!idMatch) return null;

  const metaCells = root.querySelectorAll('table.meta tr:nth-child(2) td');
  const cell = (i: number) => metaCells[i]?.textContent?.trim() ?? '';

  const choices: Choice[] = [...root.querySelectorAll('.answer-choices .choice')].map((li) => ({
    letter: li.querySelector('.letter')?.textContent?.trim() ?? '',
    text: (li.textContent ?? '').replace(/^\s*[A-D]\s*/, '').trim(),
  }));

  const ansMatch = (text('.correct-answer') || (root.textContent ?? '')).match(ANS_RE);

  return {
    id: idMatch[1]!,
    section: cell(1), domain: cell(2), skill: cell(3), difficulty: cell(4),
    stem: text('.question-stem'),
    choices,
    correctAnswer: ansMatch ? ansMatch[1]!.trim() : null,   // raw string; scoring.ts parses multiple forms
    explanation: text('.rationale') || null,
  };
}
