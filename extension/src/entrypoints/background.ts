// Minimal service worker for Plan 1. Real kill-switch/config arrives in Plan 4.
chrome.runtime.onInstalled.addListener(() => {
  console.log('[focused-practice] installed');
});
