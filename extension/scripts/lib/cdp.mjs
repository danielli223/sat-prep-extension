// Minimal Chrome DevTools Protocol client over Node's built-in fetch + WebSocket (Node 22+). No deps.
// Used by the dev-Chrome harness (dev-chrome.mjs / reload-ext.mjs / cdp-eval.mjs) so Claude can launch,
// reload, and drive a dedicated dev Chrome with no manual clicks. Talks to the debug endpoint that
// dev-chrome.mjs opens with --remote-debugging-port (on a non-default --user-data-dir, required since
// Chrome 136). Nothing here ships in the extension — it's pure local dev tooling.
const PORT = process.env.CDP_PORT || 9222;
const HOST = `http://127.0.0.1:${PORT}`;

export async function isUp() {
  try { const r = await fetch(`${HOST}/json/version`); return r.ok; } catch { return false; }
}

export async function listTargets() {
  const r = await fetch(`${HOST}/json`);
  return r.json();
}

// Open a CDP session to one target's webSocketDebuggerUrl, run fn(send), then close. `send(method,
// params)` returns the command result (or rejects on a protocol error).
export async function withTarget(wsUrl, fn) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    let msg; try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    try { ws.send(JSON.stringify({ id, method, params })); } catch (e) { reject(e); }
  });
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('CDP socket error')), { once: true });
  });
  try { return await fn(send); } finally { try { ws.close(); } catch {} }
}

// Evaluate an expression in a target (page or worker) and return its value.
export async function evalIn(wsUrl, expression) {
  return withTarget(wsUrl, async (send) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result?.value;
  });
}

// Open a CDP session against the BROWSER endpoint (for Target.* / privileged work). fn gets
// send(method, params, sessionId) — pass a sessionId to route into an attached target (flat protocol).
export async function withBrowser(fn) {
  const v = await (await fetch(`${HOST}/json/version`)).json();
  const ws = new WebSocket(v.webSocketDebuggerUrl);
  let nextId = 1;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(m.error.message)) : resolve(m.result);
    }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('CDP browser socket error')), { once: true });
  });
  try { return await fn(send); } finally { try { ws.close(); } catch {} }
}

// Open `url` (e.g. chrome://extensions, which has no debuggable ws in /json) in a transient tab, run
// `expression` there with privileged page APIs (chrome.developerPrivate, etc.), then close the tab.
export async function evalInNewTab(url, expression) {
  return withBrowser(async (send) => {
    const { targetId } = await send('Target.createTarget', { url });
    try {
      await new Promise((r) => setTimeout(r, 1200));
      const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
      await send('Runtime.enable', {}, sessionId);
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result?.value;
    } finally { await send('Target.closeTarget', { targetId }).catch(() => {}); }
  });
}

export const CB_HOST = process.env.EXT_HOST_MATCH || 'satsuiteeducatorquestionbank.collegeboard.org';
