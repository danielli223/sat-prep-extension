export interface Env {
  POSTHOG_PERSONAL_API_KEY: string;
  POSTHOG_PROJECT_ID: string;
  POSTHOG_API_HOST?: string;
  RATE_LIMITER?: RateLimit;
}

export default {
  async fetch(_request: Request, _env: Env): Promise<Response> {
    return new Response('Not Found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
