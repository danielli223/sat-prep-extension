import { describe, it, expect } from 'vitest';
import {
  EDUCATOR_BANK_HOST,
  STUDENT_BANK_HOST,
  EDUCATOR_BANK_URL,
  STUDENT_BANK_URL,
  bankUrlForHost,
} from './banks';

// Issue #32: the overlay now runs on the STUDENT question bank too. banks.ts is the single place that
// names the two CB bank origins and maps a hostname -> the bank URL to point a blocked student back to.
// These are pure string facts — no fetch, no DOM (bright line §1: a host string is not network access).

describe('banks — CB bank origin constants', () => {
  it('names the exact educator + student hosts (specific origins, no wildcard)', () => {
    expect(EDUCATOR_BANK_HOST).toBe('satsuiteeducatorquestionbank.collegeboard.org');
    expect(STUDENT_BANK_HOST).toBe('mypractice.collegeboard.org');
    expect(EDUCATOR_BANK_HOST).not.toContain('*');
    expect(STUDENT_BANK_HOST).not.toContain('*');
  });

  it('names the exact educator + student bank URLs (specific origins, no wildcard)', () => {
    expect(EDUCATOR_BANK_URL).toBe('https://satsuiteeducatorquestionbank.collegeboard.org/');
    expect(STUDENT_BANK_URL).toBe('https://mypractice.collegeboard.org/questionbank/results');
    // a specific origin — never a *.collegeboard.org wildcard
    expect(STUDENT_BANK_URL).toContain('mypractice.collegeboard.org');
    expect(STUDENT_BANK_URL).not.toContain('*');
    expect(EDUCATOR_BANK_URL).not.toContain('*');
  });
});

describe('bankUrlForHost', () => {
  it('maps the student host -> the student bank URL', () => {
    expect(bankUrlForHost('mypractice.collegeboard.org')).toBe(STUDENT_BANK_URL);
  });

  it('maps the educator host -> the educator bank URL', () => {
    expect(bankUrlForHost('satsuiteeducatorquestionbank.collegeboard.org')).toBe(EDUCATOR_BANK_URL);
  });

  it('falls back to the educator bank (safe public default) for unknown / empty / undefined hosts', () => {
    // educator is the safe default: it is public (no login) and serves the same questions, so it is a
    // valid entry point for ANY caller whose host we cannot positively identify as the student bank.
    expect(bankUrlForHost('example.com')).toBe(EDUCATOR_BANK_URL);
    expect(bankUrlForHost('')).toBe(EDUCATOR_BANK_URL);
    expect(bankUrlForHost(undefined)).toBe(EDUCATOR_BANK_URL);
  });
});
