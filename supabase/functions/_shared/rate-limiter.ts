/**
 * In-memory sliding-window rate limiter for Supabase Edge Functions.
 *
 * Limits are per-IP per warm instance. Cold starts reset the window, which
 * is acceptable — the goal is to stop sustained automated abuse, not to
 * enforce billing-grade quotas.
 */

interface HitRecord {
  timestamps: number[];
}

const store = new Map<string, HitRecord>();

const CLEANUP_INTERVAL_MS = 60_000; // prune stale keys every 60 s
let lastCleanup = Date.now();

function pruneStale(windowMs: number): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  const cutoff = now - windowMs;
  for (const [key, record] of store) {
    record.timestamps = record.timestamps.filter((t) => t > cutoff);
    if (record.timestamps.length === 0) store.delete(key);
  }
}

export interface RateLimitConfig {
  /** Maximum requests allowed within the window. */
  maxRequests: number;
  /** Window duration in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number | null;
}

/**
 * Check whether the request from `clientIp` is within the rate limit.
 * Returns `{ allowed, remaining, retryAfterMs }`.
 */
export function checkRateLimit(
  clientIp: string,
  config: RateLimitConfig,
): RateLimitResult {
  const now = Date.now();
  const cutoff = now - config.windowMs;

  pruneStale(config.windowMs);

  let record = store.get(clientIp);
  if (!record) {
    record = { timestamps: [] };
    store.set(clientIp, record);
  }

  // Drop timestamps outside the current window
  record.timestamps = record.timestamps.filter((t) => t > cutoff);

  if (record.timestamps.length >= config.maxRequests) {
    const oldestInWindow = record.timestamps[0];
    const retryAfterMs = oldestInWindow + config.windowMs - now;
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(retryAfterMs, 0),
    };
  }

  record.timestamps.push(now);
  return {
    allowed: true,
    remaining: config.maxRequests - record.timestamps.length,
    retryAfterMs: null,
  };
}

/**
 * Extract the most likely client IP from the request headers.
 * Supabase Edge Functions run behind a reverse proxy that sets
 * x-forwarded-for. Falls back to a generic key.
 */
export function resolveClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    // First IP in the chain is the original client
    const first = forwarded.split(',')[0].trim();
    if (first) return first;
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  return 'unknown';
}

/**
 * Build a standard 429 JSON response with Retry-After header.
 */
export function rateLimitResponse(
  retryAfterMs: number,
  origin: string | null,
  corsHeaders: Record<string, string>,
): Response {
  const retryAfterSeconds = Math.ceil((retryAfterMs || 1000) / 1000);
  return new Response(
    JSON.stringify({ error: 'Too many requests. Please try again later.' }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfterSeconds),
      },
    },
  );
}
