export type RateLimitResult = { allowed: boolean; retry_after_seconds: number };

// INCR and expiry must be atomic: an interrupted request cannot leave a permanent key.
const script = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('TTL', KEYS[1])
if ttl < 0 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {count, ttl}
`;

export async function consumeRedisRateLimit(
  env: (name: string) => string | undefined,
  input: { tenantId: string; userId: string; bucket: string; limit: number; window: number },
  fetcher: typeof fetch = fetch,
): Promise<RateLimitResult | null> {
  const url = env('UPSTASH_REDIS_REST_URL');
  const token = env('UPSTASH_REDIS_REST_TOKEN');
  if (!url && !token) return null;
  if (!url || !token || new URL(url).protocol !== 'https:') throw new Error('Invalid Redis configuration');
  const namespace = env('REDIS_KEY_PREFIX') ?? 'transport-management:production';
  const key = [namespace, 'rate:v1', input.tenantId, input.userId, input.bucket]
    .map(encodeURIComponent).join(':');
  const response = await fetcher(url.replace(/\/$/, ''), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(['EVAL', script, '1', key, String(input.window)]),
    signal: AbortSignal.timeout(2000),
  });
  if (!response.ok) throw new Error('Redis unavailable');
  const payload = await response.json();
  if (payload.error || !Array.isArray(payload.result) || payload.result.length !== 2) {
    throw new Error('Invalid Redis response');
  }
  const [count, ttl] = payload.result;
  if (!Number.isInteger(count) || count < 1 || !Number.isInteger(ttl) || ttl < 0) {
    throw new Error('Invalid Redis counter');
  }
  return { allowed: count <= input.limit, retry_after_seconds: Math.max(1, ttl) };
}
