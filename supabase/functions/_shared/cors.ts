const STATIC_ORIGINS = [
  'https://flow-ops78.netlify.app',
];

const isAllowedOrigin = (origin: string | null): origin is string => {
  if (!origin) return false;

  if (STATIC_ORIGINS.includes(origin)) return true;

  if (origin.endsWith('.workers.dev')) return true;

  return false;
};

export const getCorsHeaders = (origin: string | null) => ({
  'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? origin : 'null',
  Vary: 'Origin',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
});
