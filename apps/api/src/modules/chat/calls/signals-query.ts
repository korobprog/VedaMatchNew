import { BadRequestException } from '@nestjs/common';

/**
 * Разбор `?after=` у `GET /chat/calls/:id/signals` (VED-261). Чистый модуль
 * — сам контроллер тянет `AuthGuard` → `jwt.service` → `jose` (чистый ESM,
 * `jest`/`ts-jest` этого проекта не транспилирует `node_modules`), поэтому
 * юнит-тест контроллера целиком в этом репозитории не заводят — разбор
 * параметра тестируется отдельно, а контроллер остаётся тонкой проброской.
 */
export function parseSignalsAfter(raw: string | undefined): number {
  if (raw === undefined || raw === '') return 0;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0)
    throw new BadRequestException('Неверный параметр after');
  return value;
}
