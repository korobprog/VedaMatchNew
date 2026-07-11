import request from 'supertest';

describe('Gitabase API (e2e)', () => {
  const apiURL =
    process.env.TEST_API_URL ??
    process.env.API_PUBLIC_URL ??
    'http://localhost:4000';
  const testAccessToken = requiredEnvironmentVariable('TEST_ACCESS_TOKEN');

  it('rejects an unauthenticated Gitabase library request', async () => {
    await request(apiURL).get('/gitabase/library').expect(401);
  });

  it(
    'returns the Gitabase library for TEST_ACCESS_TOKEN',
    async () => {
      const response = await request(apiURL)
        .get('/gitabase/library')
        .set('Authorization', `Bearer ${testAccessToken}`)
        .expect(200);

      const body: unknown = response.body;
      expect(isRecord(body)).toBe(true);
      if (!isRecord(body)) {
        throw new Error('Gitabase library must be an object');
      }
      expect(typeof body.formatVersion).toBe('number');
      expect(Array.isArray(body.books)).toBe(true);
    },
  );
});

function requiredEnvironmentVariable(name: 'TEST_ACCESS_TOKEN'): string {
  const value = process.env[name]?.trim();
  if (value) return value;
  throw new Error(`${name} is required for Gitabase API acceptance tests.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
