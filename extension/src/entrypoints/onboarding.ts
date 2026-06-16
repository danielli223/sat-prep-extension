// First-run trust onboarding (spec §7). The literal counter to the OnePrep "AI slop" / "pirate site"
// wound. Shown exactly once. The line is verbatim from the spec.
export const ONBOARDING_KEY = 'onboarding.seen';
export const TRUST_LINE =
  "These are College Board's own questions, served live from collegeboard.org. " +
  'We never rewrite them, never run them through AI, and never store them — only your answers and progress.';

export async function firstRunOnboarding(): Promise<string | null> {
  try {
    const got = await chrome.storage.local.get(ONBOARDING_KEY);
    if ((got as Record<string, unknown>)[ONBOARDING_KEY] === true) return null;
    await chrome.storage.local.set({ [ONBOARDING_KEY]: true });
    return TRUST_LINE;
  } catch {
    return null; // never block startup on a storage hiccup
  }
}
