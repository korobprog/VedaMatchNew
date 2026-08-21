import { collectIntegrationStatuses } from './integration-status';

/** Окружение, в котором задано всё перечисленное и больше ничего. */
function envWith(keys: string[]): (key: string) => string | undefined {
  return (key) => (keys.includes(key) ? 'value' : undefined);
}

describe('collectIntegrationStatuses', () => {
  it('пустое окружение — всё не настроено', () => {
    const statuses = collectIntegrationStatuses(() => undefined);

    expect(statuses.every((status) => !status.configured)).toBe(true);
    expect(statuses.map((status) => status.key)).toEqual([
      'google-oauth',
      'storage',
      'push',
      'redis',
      'motivation-ai',
      'motivation-media',
      'astro-ai',
    ]);
  });

  it('называет недостающие переменные, а не значения', () => {
    const push = collectIntegrationStatuses(envWith(['VAPID_PUBLIC_KEY'])).find(
      (status) => status.key === 'push',
    );

    expect(push).toEqual({
      key: 'push',
      configured: false,
      missing: ['VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'],
    });
  });

  it('полностью заданная интеграция считается настроенной', () => {
    const redis = collectIntegrationStatuses(envWith(['REDIS_HOST'])).find(
      (status) => status.key === 'redis',
    );

    expect(redis).toEqual({ key: 'redis', configured: true, missing: [] });
  });

  it('пробелы вместо значения — это не настройка', () => {
    const redis = collectIntegrationStatuses((key) =>
      key === 'REDIS_HOST' ? '   ' : undefined,
    ).find((status) => status.key === 'redis');

    expect(redis?.configured).toBe(false);
    expect(redis?.missing).toEqual(['REDIS_HOST']);
  });

  it('интеграции независимы: настроенное хранилище не чинит пуши', () => {
    const statuses = collectIntegrationStatuses(
      envWith([
        'S3_REGION',
        'S3_ACCESS_KEY',
        'S3_SECRET_KEY',
        'S3_BUCKET_NAME',
        'S3_ENDPOINT',
      ]),
    );

    expect(statuses.find((s) => s.key === 'storage')?.configured).toBe(true);
    expect(statuses.find((s) => s.key === 'push')?.configured).toBe(false);
  });
});
