// CB bank URL knowledge. The overlay runs on TWO College Board question-bank origins — the public
// educator bank and the logged-in student bank (issue #32) — and this is the single place those two
// origins are named. CB-shape knowledge lives in src/cb/ (repo convention), and a bank origin is part
// of that shape. These are constant strings ONLY: they are never fetched. We read the already-rendered
// DOM and only LINK a blocked student to CB's own page; the legal guard (bright line §1) forbids any
// network call to collegeboard.org.

export const EDUCATOR_BANK_HOST = 'satsuiteeducatorquestionbank.collegeboard.org';
export const STUDENT_BANK_HOST = 'mypractice.collegeboard.org';

export const EDUCATOR_BANK_URL = 'https://satsuiteeducatorquestionbank.collegeboard.org/';
export const STUDENT_BANK_URL = 'https://mypractice.collegeboard.org/questionbank/results';

// Map a page hostname to the bank URL a blocked student should be pointed back to. Only the exact
// student host resolves to the student bank; everything else (educator, unknown, empty, undefined)
// falls back to the educator bank — public, login-free, and serving the same questions, so it is a
// safe entry point for any caller whose host we cannot positively identify as the student bank.
export function bankUrlForHost(hostname?: string): string {
  return hostname === STUDENT_BANK_HOST ? STUDENT_BANK_URL : EDUCATOR_BANK_URL;
}
