/**
 * Написал ли пост администратор «Вдохновения».
 *
 * У воркера нет токена, поэтому права берутся строкой из базы, а не через
 * `is-admin.ts`: тот отвечает на тот же вопрос, но по полезной нагрузке
 * запроса. Правило то же самое — портальный администратор может всё, а
 * администратор сервиса только свой сервис.
 *
 * Роль в базе пишется через подчёркивание (`service_admin`), а в токене через
 * дефис (`service-admin`); здесь именно базовое написание.
 */
export interface AuthorRightsRow {
  role: string;
  serviceAdminScopes: Array<{ service: { slug: string } }>;
}

export function isMotivationAdminRow(
  row: AuthorRightsRow | null | undefined,
): boolean {
  // Автора нет вовсе — пост нашёл конвейер, и решать за человека нечего.
  if (!row) return false;
  if (row.role === 'admin') return true;
  if (row.role !== 'service_admin') return false;
  return row.serviceAdminScopes.some(
    (scope) => scope.service.slug === 'motivation',
  );
}
