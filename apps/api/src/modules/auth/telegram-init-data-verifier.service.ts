import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  verifyTelegramInitData,
  type TelegramInitDataResult,
} from './telegram-init-data';

/**
 * Обёртка над `verifyTelegramInitData` с токеном бота из конфигурации.
 *
 * Портальная инфраструктура наравне с `AuthGuard`: `notifications` вправе
 * импортировать `AuthModule` (см. CLAUDE.md, «Контракт сервисного модуля»),
 * а этот сервис не трогает `UserIdentity` и вообще не ходит в базу — только
 * проверяет подпись присланной строки. Так «Уведомления» могут подтвердить
 * `POST /notifications/telegram/enable`, не читая чужую таблицу.
 */
@Injectable()
export class TelegramInitDataVerifierService {
  constructor(private readonly config: ConfigService) {}

  verify(raw: unknown): TelegramInitDataResult {
    return verifyTelegramInitData({
      raw,
      botToken: this.config.get<string>('TELEGRAM_BOT_TOKEN'),
      nowSec: Math.floor(Date.now() / 1000),
    });
  }
}
