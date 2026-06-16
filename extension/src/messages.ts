// Shared message-type contract between the popup and the content script. The popup posts
// `{ type: OPEN_JOURNAL }` via chrome.tabs.sendMessage; the content script's runtime.onMessage
// listener routes it into handleMessage. Both sides import this ONE constant so a rename can never
// silently break the hand-off (the string would otherwise be duplicated as a bare literal).
export const OPEN_JOURNAL = 'open-journal';
