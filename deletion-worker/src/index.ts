export interface Env {
  POSTHOG_PERSONAL_API_KEY: string;
  POSTHOG_PROJECT_ID: string;
  POSTHOG_API_HOST?: string;
  RATE_LIMITER?: RateLimit;
}

const DELETE_PATH = '/v1/delete';

const INSTALL_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidInstallId(v: unknown): v is string { return typeof v === 'string' && INSTALL_ID_RE.test(v); }

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin') ?? '';
  // Only reflect a chrome-extension origin; never echo arbitrary web origins for a deletion endpoint.
  const allow = origin.startsWith('chrome-extension://') ? origin : 'null';
  return {
    'Access-Control-Allow-Origin': allow,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function withCors(request: Request, res: Response): Response {
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries(corsHeaders(request))) h.set(k, v);
  return new Response(res.body, { status: res.status, headers: h });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
    if (pathname !== DELETE_PATH) return new Response('Not Found', { status: 404 });
    if (request.method !== 'POST') return withCors(request, new Response('Method Not Allowed', { status: 405 }));

    if (!request.headers.get('Content-Type')?.includes('application/json'))
      return withCors(request, json({ error: 'expected application/json' }, 415));

    let body: unknown;
    try { body = await request.json(); } catch { return withCors(request, json({ error: 'invalid JSON' }, 400)); }
    const install_id = (body as { install_id?: unknown })?.install_id;
    if (!isValidInstallId(install_id))
      return withCors(request, json({ error: 'missing or invalid install_id' }, 400));

    const host = env.POSTHOG_API_HOST ?? 'https://us.posthog.com';
    const url = `${host}/api/projects/${env.POSTHOG_PROJECT_ID}/persons/bulk_delete/`;
    let phRes: Response;
    try {
      phRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.POSTHOG_PERSONAL_API_KEY}` },
        body: JSON.stringify({ distinct_ids: [install_id], delete_events: true }),
      });
    } catch {
      return withCors(request, json({ ok: false, error: 'upstream_unreachable' }, 502));
    }
    if (!phRes.ok) return withCors(request, json({ ok: false, error: 'upstream_failed' }, 502));
    // 202 = queued; PostHog deletes events asynchronously (off-peak/weekend windows). We never claim completion.
    const result = (await phRes.json().catch(() => ({}))) as { persons_found?: number };
    return withCors(request, json({ ok: true, submitted: true, matched: (result.persons_found ?? 0) > 0 }, 202));
  },
} satisfies ExportedHandler<Env>;
