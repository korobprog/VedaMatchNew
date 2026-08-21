import type { Prisma } from '@prisma/client';
import type { NotificationAudienceFilter } from '@vedamatch/shared';

/** Размер пакета отправки. Компромисс: меньше — лишние ходы в базу, больше —
 *  тик воркера дольше держит лиз и дольше не отпускает рассылку. */
export const BROADCAST_BATCH_SIZE = 200;

/**
 * Кому уходит рассылка. Заблокированные и удалённые исключены жёстко, а не
 * фильтром: рассылка администрации не должна доходить до того, кого эта же
 * администрация закрыла.
 *
 * Роль в базе пишется через подчёркивание (`service_admin`), наружу — через
 * дефис; преобразование здесь, чтобы фильтр принимал внешние значения.
 */
export function buildAudienceWhere(
  filter: NotificationAudienceFilter,
  now: Date,
): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = {
    accountStatus: 'active',
    deletedAt: null,
  };

  if (filter.stages && filter.stages.length > 0) {
    where.spiritualStage = { in: filter.stages };
  }

  if (filter.roles && filter.roles.length > 0) {
    where.role = {
      in: filter.roles.map(
        (role) => role.replace('-', '_') as Prisma.UserWhereInput['role'],
      ),
    } as Prisma.UserWhereInput['role'];
  }

  // «Платит» — это активный платный доступ прямо сейчас. Пробный период сюда
  // не входит: его конец вычисляется от createdAt и в SQL-фильтр не ложится.
  if (filter.payment === 'paid') {
    where.subscriptionPaidUntil = { gt: now };
  } else if (filter.payment === 'unpaid') {
    where.OR = [
      { subscriptionPaidUntil: null },
      { subscriptionPaidUntil: { lte: now } },
    ];
  }

  if (filter.withPushOnly) {
    where.pushSubscriptions = { some: {} };
  }

  return where;
}

/**
 * Нормализация фильтра из тела запроса. Пустые массивы приравниваются к
 * «неважно», чтобы `{stages: []}` и `{}` означали одно и то же и не давали
 * двух разных выборок при одинаковой форме.
 */
export function normalizeAudience(
  input: NotificationAudienceFilter | undefined,
): NotificationAudienceFilter {
  const filter: NotificationAudienceFilter = {};
  if (input?.stages && input.stages.length > 0) filter.stages = input.stages;
  if (input?.roles && input.roles.length > 0) filter.roles = input.roles;
  if (input?.payment === 'paid' || input?.payment === 'unpaid') {
    filter.payment = input.payment;
  }
  if (input?.withPushOnly) filter.withPushOnly = true;
  return filter;
}
