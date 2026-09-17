import { UnauthorizedException } from '@nestjs/common';
import type { Prisma, PrismaClient, User } from '@prisma/client';

/** Сколько дней у пользователя есть на отмену самостоятельного удаления. */
export const SELF_DELETE_GRACE_DAYS = 14;

export function deletionEligibleAt(pendingDeletionAt: Date): Date {
  return new Date(
    pendingDeletionAt.getTime() + SELF_DELETE_GRACE_DAYS * 24 * 60 * 60 * 1000,
  );
}

type StatusFields = Pick<
  User,
  'accountStatus' | 'blockedUntil' | 'pendingDeletionAt'
>;

/**
 * Чистая функция: чем должен быть статус аккаунта прямо сейчас с учётом
 * истёкших сроков блокировки/удаления. Не пишет в БД — см. finalizeAccountStatus.
 */
export function resolveAccountStatus(
  user: StatusFields,
  now: Date = new Date(),
): 'active' | 'blocked' | 'deleted' {
  if (user.accountStatus === 'blocked') {
    if (user.blockedUntil && user.blockedUntil <= now) return 'active';
    return 'blocked';
  }
  if (user.accountStatus === 'active' && user.pendingDeletionAt) {
    if (deletionEligibleAt(user.pendingDeletionAt) <= now) return 'deleted';
  }
  return user.accountStatus;
}

/**
 * Приводит запись пользователя в актуальное состояние, если срок блокировки
 * истёк или окно отмены удаления закрылось. Отзывает refresh-токены при
 * финализации удаления. Возвращает актуального пользователя (без записи, если
 * ничего не изменилось).
 */
export async function finalizeAccountStatus(
  prisma: PrismaClient,
  user: User,
): Promise<User> {
  const resolved = resolveAccountStatus(user);
  if (resolved === user.accountStatus) return user;

  if (resolved === 'active') {
    return prisma.user.update({
      where: { id: user.id },
      data: {
        accountStatus: 'active',
        blockedUntil: null,
        statusReason: null,
        statusActor: 'system',
        statusChangedAt: new Date(),
      },
    });
  }

  // resolved === 'deleted' (окно отмены self-delete закрылось)
  const [, updated] = await prisma.$transaction([
    prisma.refreshToken.updateMany({
      where: { userId: user.id },
      data: { revoked: true },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: {
        accountStatus: 'deleted',
        deletedAt: new Date(),
        statusActor: 'system',
        statusChangedAt: new Date(),
      },
    }),
  ]);
  return updated;
}

/**
 * Финализирует статус и бросает UnauthorizedException, если аккаунт
 * заблокирован или удалён. Используется на всех точках входа (гвард, логин,
 * refresh), чтобы не раздавать/продлевать доступ отключённому аккаунту.
 */
export async function assertAccountActive(
  prisma: PrismaClient,
  user: User,
): Promise<User> {
  const current = await finalizeAccountStatus(prisma, user);
  if (current.accountStatus === 'blocked') {
    throw new UnauthorizedException('Аккаунт заблокирован администрацией');
  }
  if (current.accountStatus === 'deleted') {
    throw new UnauthorizedException('Аккаунт удалён');
  }
  return current;
}

/**
 * Кандидаты на фоновое завершение самостоятельного удаления: окно отмены
 * истекло, а `accountStatus` всё ещё `active`. `finalizeAccountStatus`
 * переводит такой аккаунт в `deleted` только при живом входе (гвард, логин,
 * refresh) — человек, который запросил удаление и после этого ни разу не
 * открыл портал, никогда бы туда не попал, и `AccountAnonymizeService` (он
 * смотрит только на уже `deleted`) никогда бы его не анонимизировал.
 */
export function pendingSelfDeleteWhere(
  now: Date = new Date(),
): Prisma.UserWhereInput {
  return {
    accountStatus: 'active',
    pendingDeletionAt: {
      not: null,
      lte: new Date(
        now.getTime() - SELF_DELETE_GRACE_DAYS * 24 * 60 * 60 * 1000,
      ),
    },
  };
}

/**
 * Пакетно доводит просроченные самостоятельные запросы на удаление до
 * `deleted`, отзывая refresh-токены — тот же переход, что и у
 * `finalizeAccountStatus`, вызванный фоновым тиком вместо запроса живого
 * человека. Переиспользует `resolveAccountStatus`, чтобы условие перехода
 * не разошлось в двух местах. Возвращает число завершённых аккаунтов —
 * вызывающая сторона (`AccountAnonymizeService.tick`) использует его для лога.
 */
export async function finalizeExpiredSelfDeletions(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<number> {
  const candidates = await prisma.user.findMany({
    where: pendingSelfDeleteWhere(now),
  });
  let count = 0;
  for (const user of candidates) {
    if (resolveAccountStatus(user, now) !== 'deleted') continue;
    await prisma.$transaction([
      prisma.refreshToken.updateMany({
        where: { userId: user.id, revoked: false },
        data: { revoked: true },
      }),
      prisma.user.update({
        where: { id: user.id },
        data: {
          accountStatus: 'deleted',
          deletedAt: now,
          statusActor: 'system',
          statusChangedAt: now,
        },
      }),
    ]);
    count += 1;
  }
  return count;
}
