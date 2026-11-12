import { test } from 'node:test';
import assert from 'node:assert/strict';
import { consumeRedisRateLimit } from './redis-rate-limit.ts';

const settings = { UPSTASH_REDIS_REST_URL: 'https://redis.example', UPSTASH_REDIS_REST_TOKEN: 'test-token' };
const env = (name) => settings[name];
const input = { tenantId: 'tenant-a', userId: 'user-a', bucket: 'read', limit: 120, window: 60 };
const reply = (result) => async () => Response.json({ result });

test('unconfigured Redis uses the existing database limiter', async () => {
  assert.equal(await consumeRedisRateLimit(() => undefined, input, () => assert.fail('unexpected network')), null);
});
test('partial configuration fails instead of bypassing limits', async () => {
  await assert.rejects(consumeRedisRateLimit((name) => name.endsWith('_URL') ? settings.UPSTASH_REDIS_REST_URL : undefined, input));
});
test('last allowed request and first blocked request preserve Retry-After', async () => {
  assert.deepEqual(await consumeRedisRateLimit(env, input, reply([120, 12])), { allowed: true, retry_after_seconds: 12 });
  assert.deepEqual(await consumeRedisRateLimit(env, input, reply([121, 0])), { allowed: false, retry_after_seconds: 1 });
});
test('keys isolate tenants, users and buckets; expiry is part of the atomic script', async () => {
  const commands = [];
  const fetcher = async (_url, options) => { commands.push(JSON.parse(options.body)); return Response.json({ result: [1, 60] }); };
  await consumeRedisRateLimit(env, input, fetcher);
  await consumeRedisRateLimit(env, { ...input, tenantId: 'tenant-b' }, fetcher);
  await consumeRedisRateLimit(env, { ...input, userId: 'user-b' }, fetcher);
  await consumeRedisRateLimit(env, { ...input, bucket: 'write' }, fetcher);
  assert.equal(new Set(commands.map((command) => command[3])).size, 4);
  assert.equal(commands[0][0], 'EVAL');
  assert.match(commands[0][1], /EXPIRE/);
  assert.equal(commands[0][4], '60');
});
test('outages and malformed counters fail closed', async () => {
  for (const fetcher of [async () => { throw new Error('offline'); }, async () => new Response('', { status: 503 }), reply([0, 60]), reply([1, -1]), reply(['1', 60]), async () => Response.json({ error: 'ERR' })]) {
    await assert.rejects(consumeRedisRateLimit(env, input, fetcher));
  }
});
