import { firstRunOnboarding } from './onboarding';

// Minimal service worker. On install, surface the one-time trust line (spec §7).
chrome.runtime.onInstalled.addListener(() => {
  console.log('[focused-practice] installed');
  void firstRunOnboarding().then((line) => { if (line) console.log('[focused-practice]', line); });
});
