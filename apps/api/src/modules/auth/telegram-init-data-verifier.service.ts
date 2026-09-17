import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import {
  verifyTelegramInitData,
  type TelegramInitDataResult,
  type TelegramUser,
} from './telegram-init-data';

/** Причины отказа `verifyForUser`: те же, что у `verify()`, плюс
 *  `'not-linked'` — подпись подлинная, но этот Telegram не привязан именно к
 *  вызывающему аккаунту. */
export type TelegramInitDataForUserReason =
  Extract<TelegramInitDataResult, { ok: false }>['reason'] | 'not-linked';

export type TelegramInitDataForUserResult =
  | { ok: true; user: TelegramUser; authDate: number }
  | { ok: false; reason: TelegramInitDataForUserReason };

/**
 * Обёртка над `verifyTelegramInitData` с токеном бота из конфигурации.
 *
 * Портальная инфраструктура наравне с `AuthGuard`: `notifications` вправе
 * импортировать `AuthModule` (см. CLAUDE.md, «Контракт сервисного модуля»).
 *
 * `verify()` — только подпись, в базу не ходит: им подтверждается вход и
 * привязка (`AuthService`), где владение ещё не установлено — это как раз
 * действие, которое его устанавливает.
 *
 * `verifyForUser()` — для случаев, где владение уже обязано быть: помимо
 * подписи проверяет, что подписанный `telegramUserId` привязан именно к
 * `userId` (`UserIdentity(provider: 'telegram')`). Читает `UserIdentity`
 * здесь, в `auth` — модуле, которому эта таблица принадлежит, а не в
 * `notifications`: наружу уходит только да/нет
 * (`POST /notifications/telegram/enable`), сырая идентичность не покидает
 * `auth`. Раньше `enable()` доверял одной подписи и позволял привязать чат
 * ЛЮБОГО телеграм-пользователя, чья подпись подлинна, к текущей сессии —
 * включая чужой, уже привязанный к другому аккаунту чат (угон устройства
 * уведомлений, подтверждено на живом стенде).
 */
@Injectable()
export class TelegramInitDataVerifierService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  verify(raw: unknown): TelegramInitDataResult {
    return verifyTelegramInitData({
      raw,
      botToken: this.config.get<string>('TELEGRAM_BOT_TOKEN'),
      nowSec: Math.floor(Date.now() / 1000),
    });
  }

  async verifyForUser(
    raw: unknown,
    userId: string,
  ): Promise<TelegramInitDataForUserResult> {
    const verified = this.verify(raw);
    if (!verified.ok) return verified;
    const identity = await this.prisma.userIdentity.findUnique({
      where: {
        provider_externalId: {
          provider: 'telegram',
          externalId: String(verified.user.id),
        },
      },
      select: { userId: true },
    });
    if (!identity || identity.userId !== userId) {
      return { ok: false, reason: 'not-linked' };
    }
    return verified;
  }
}
