const STATIC_ORIGINS = [
  'https://flow-ops78.netlify.app',
  'https://flowops.flowops78.workers.dev',
  'https://cloudflare-workers-autoconfig-flowops.flowops78.workers.dev',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:3002',
];

const ALLOWED_ORIGIN_ENV_KEYS = [
  'FLOW_OPS_ALLOWED_ORIGINS',
  'APP_ALLOWED_ORIGINS',
  'PUBLIC_APP_URL',
  'SITE_URL',
];

const normalizeOrigin = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
};

const parseOriginList = (value: string | null | undefined): string[] => {
  if (!value) return [];

  return value
    .split(',')
    .map((item) => normalizeOrigin(item))
    .filter((item): item is string => Boolean(item));
};

const ALLOWED_ORIGINS = Array.from(new Set([
  ...STATIC_ORIGINS,
  ...ALLOWED_ORIGIN_ENV_KEYS.flatMap((key) => parseOriginList(Deno.env.get(key))),
]));

const isAllowedOrigin = (origin: string | null): origin is string => {
  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) return false;

  return ALLOWED_ORIGINS.includes(normalizedOrigin);
};

export const getCorsHeaders = (origin: string | null) => ({
  'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? origin : 'null',
  Vary: 'Origin',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
});
