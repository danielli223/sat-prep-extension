// Shared message-type contract between the popup and the content script. The popup posts
// `{ type: OPEN_JOURNAL }` via chrome.tabs.sendMessage; the content script's runtime.onMessage
// listener routes it into handleMessage. Both sides import this ONE constant so a rename can never
// silently break the hand-off (the string would otherwise be duplicated as a bare literal).
export const OPEN_JOURNAL = 'open-journal';

// Telemetry hand-off. Content/popup post these; the background worker is the sole consumer + egress
// point. TELEMETRY_EVENT carries one built event; TELEMETRY_DELETE triggers server-side erasure.
export const TELEMETRY_EVENT = 'telemetry-event';
export const TELEMETRY_DELETE = 'telemetry-delete';
