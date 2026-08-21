import type { AdminIntegrationStatus } from '@vedamatch/shared';

/**
 * Какие переменные нужны каждой интеграции. Список ровно тот, что читают сами
 * сервисы: если сюда попадёт лишняя переменная, админка будет ругаться на
 * рабочее окружение, а если не хватит — молчать о сломанном.
 */
const REQUIRED: Record<AdminIntegrationStatus['key'], string[]> = {
  'google-oauth': ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
  storage: [
    'S3_REGION',
    'S3_ACCESS_KEY',
    'S3_SECRET_KEY',
    'S3_BUCKET_NAME',
    'S3_ENDPOINT',
  ],
  push: ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'],
  redis: ['REDIS_HOST'],
  'motivation-ai': ['MOTIVATION_AI_API_KEY'],
  'motivation-media': ['FAL_KEY'],
  'astro-ai': ['ASTRO_AI_API_KEY'],
};

/**
 * Состояние интеграций по окружению. Наружу уходит только факт настройки и
 * имена недостающих переменных — сами значения не покидают сервер даже в
 * админке: это ключи доступа, а не настройка.
 */
export function collectIntegrationStatuses(
  read: (key: string) => string | undefined,
): AdminIntegrationStatus[] {
  return (Object.keys(REQUIRED) as Array<AdminIntegrationStatus['key']>).map(
    (key) => {
      const missing = REQUIRED[key].filter(
        (variable) => !read(variable)?.trim(),
      );
      return { key, configured: missing.length === 0, missing };
    },
  );
}
