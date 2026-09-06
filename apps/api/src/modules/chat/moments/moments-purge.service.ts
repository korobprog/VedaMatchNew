import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { orphanStorageKeys } from '../chat-purge';
import { ChatUploadsService } from '../chat-uploads.service';
import { graceDays, purgeCutoff } from './moments-lifetime';

/**
 * Уборка сгоревших моментов: строка и объект в бакете.
 *
 * Своего таймера и своего лиза в Redis у уборки нет — её вызывает тик
 * `ChatRetentionService` под уже взятым лизом. Пятое соединение с Redis
 * внутри одного модуля ради чистки, которая укладывается в тот же тик, —
 * это расход без выигрыша.
 *
 * Правило жизни момента при этом остаётся здесь, в папке моментов: уборщик
 * знает, когда пришло время, а что именно убирать — знает этот файл.
 */
@Injectable()
export class ChatMomentsPurger {
  private readonly logger = new Logger(ChatMomentsPurger.name);
  private readonly days: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: ChatUploadsService,
    config: ConfigService,
  ) {
    this.days = graceDays(config.get<string>('CHAT_MOMENT_GRACE_DAYS'));
  }

  get graceDays(): number {
    return this.days;
  }

  /** Одна пачка. Возвращает, сколько моментов убрано. */
  async purgeExpired(now = new Date()): Promise<number> {
    const cutoff = purgeCutoff(now, this.days);
    const moments = await this.prisma.chatMoment.findMany({
      where: {
        expiresAt: { lt: cutoff },
        // Жалобу разбирают дольше суток. Пока она открыта, момент остаётся:
        // иначе модератор открывает пустоту и решает вслепую.
        reports: { none: { status: 'open' } },
      },
      select: { id: true, key: true, previewKey: true },
      orderBy: { expiresAt: 'asc' },
      take: BATCH,
    });
    if (moments.length === 0) return 0;

    // У ролика два объекта: он сам и постер. Постер уезжает снимком в ответы,
    // сам ролик — нет, но собираем оба одним списком: выживших всё равно
    // проверяем поимённо.
    const keys = moments
      .flatMap((moment) => [moment.key, moment.previewKey])
      .filter((key): key is string => Boolean(key));

    // Ответ на момент уносит его картинку снимком, переиспользуя тот же
    // объект в бакете. Удалять объект можно, только если на него не
    // ссылается ни одно уцелевшее вложение — тот же расчёт, что при уходе
    // аккаунта и чистке удалённых сообщений.
    const survivors = keys.length
      ? await this.prisma.chatAttachment.findMany({
          where: { key: { in: keys } },
          select: { key: true },
        })
      : [];

    await this.prisma.chatMoment.deleteMany({
      where: { id: { in: moments.map((moment) => moment.id) } },
    });

    const orphans = orphanStorageKeys(
      keys,
      survivors.map((attachment) => attachment.key),
    );
    await this.uploads.removeMany(orphans);

    this.logger.log(
      `Убрано сгоревших моментов: ${moments.length}, файлов: ${orphans.length}` +
        (keys.length > orphans.length
          ? `; ${keys.length - orphans.length} оставлены — они уехали снимком в переписку`
          : ''),
    );
    if (moments.length === BATCH)
      this.logger.log('Пачка заполнена — уборка продолжится следующим тиком');

    return moments.length;
  }
}

/** Объекты крупнее сообщений, и удаление идёт по одному — пачка меньше. */
const BATCH = 200;
