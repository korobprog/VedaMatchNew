import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { RuPrismaService } from '../../prisma/ru-prisma.service';

const TICK_MS = 30_000;
const LOCK_KEY = 'ru-contour:copy:lease';
const LOCK_TTL_MS = 300_000;

/** Клейм старше этого считается брошенным: реплика умерла, не дописав. */
export const COPY_STUCK_MS = 5 * 60_000;

/** Выше предела запись перестаёт браться и ждёт разбора руками. */
export const COPY_MAX_ATTEMPTS = 5;

/**
 * Досылка копий из московской базы в амстердамскую.
 *
 * Транзакции на две базы не существует. Если московская запись прошла, а
 * амстердамская нет, `copiedAt` остаётся `null`, и расхождение чинит эта
 * стадия: **источник истины — Москва**, копия догоняет.
 *
 * После смены правила резидентности (2026-09-04, «неизвестно — значит Россия»)
 * стадия перестала быть необязательной: `ru` теперь у всех, и расхождение
 * между базами касается каждого, а не единиц.
 *
 * Устройство повторяет `MotivationWorkerService` — единственный воркер
 * репозитория: тик под Redis-лизом, клейм через `updateMany`, ретраи,
 * восстановление зависших по возрасту клейма.
 */
@Injectable()
export class PersonalCopyWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PersonalCopyWorkerService.name);
  private readonly redis: Redis | null;
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ru: RuPrismaService,
    config: ConfigService,
  ) {
    const host = config.get<string>('REDIS_HOST');
    this.redis = host
      ? new Redis({
          host,
          port: Number(config.get('REDIS_PORT') || 6379),
          db: Number(config.get('REDIS_DB') || 0),
          password: config.get<string>('REDIS_PASSWORD') || undefined,
          lazyConnect: true,
          maxRetriesPerRequest: 1,
        })
      : null;
  }

  async onModuleInit() {
    if (!this.ru.isEnabled) return;
    if (this.redis)
      await this.redis
        .connect()
        .catch((error) =>
          this.logger.warn(`Redis недоступен: ${String(error)}`),
        );
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref();
    void this.tick();
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.redis?.status === 'ready') await this.redis.quit();
  }

  /** Одна попытка досылки. Публичный, чтобы тест не ждал таймера. */
  async tick(): Promise<void> {
    if (!this.ru.isEnabled) return;
    if (this.running) return;
    this.running = true;

    const token = randomUUID();
    if (this.redis?.status === 'ready') {
      const acquired = await this.redis
        .set(LOCK_KEY, token, 'PX', LOCK_TTL_MS, 'NX')
        .catch(() => null);
      if (!acquired) {
        this.running = false;
        return;
      }
    }

    try {
      await this.copyOne();
    } catch (error) {
      this.logger.error(
        `Досылка копии не удалась: ${(error as Error).message}`,
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      if (this.redis?.status === 'ready')
        await this.redis
          .eval(
            "if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end",
            1,
            LOCK_KEY,
            token,
          )
          .catch(() => null);
      this.running = false;
    }
  }

  private async copyOne(): Promise<void> {
    const stuckBefore = new Date(Date.now() - COPY_STUCK_MS);

    const record = await this.ru.db.personalRecord.findFirst({
      where: {
        copiedAt: null,
        copyAttempts: { lt: COPY_MAX_ATTEMPTS },
        // Либо ещё никто не брал, либо взявший не вернулся: клейм протух.
        OR: [{ copyStartedAt: null }, { copyStartedAt: { lt: stuckBefore } }],
      },
      orderBy: { updatedAt: 'asc' },
      include: { birth: true },
    });
    if (!record) return;

    // Клейм тем же условием, что и поиск: между поиском и клеймом запись мог
    // забрать сосед, и тогда count будет ноль.
    const claimed = await this.ru.db.personalRecord.updateMany({
      where: {
        id: record.id,
        copiedAt: null,
        OR: [{ copyStartedAt: null }, { copyStartedAt: { lt: stuckBefore } }],
      },
      data: { copyStartedAt: new Date(), copyAttempts: { increment: 1 } },
    });
    if (!claimed.count) return;

    // Аккаунта в Амстердаме может не быть: регистрация упала после московской
    // записи, или удаление прошло только там. Не воскрешаем — создать человека
    // из копии значило бы вернуть к жизни то, чего в основной базе нет.
    // Попытки досчитаются до предела, и запись останется на разбор руками.
    const exists = await this.prisma.user.findUnique({
      where: { id: record.id },
      select: { id: true },
    });
    if (!exists) {
      this.logger.warn(
        `Копия ${record.id}: в основной базе такого аккаунта нет, пропуск`,
      );
      return;
    }

    await this.prisma.user.update({
      where: { id: record.id },
      data: {
        email: record.email,
        name: record.name,
        spiritualName: record.spiritualName,
        birthDate: record.birthDate,
        // Пол в московской схеме строкой: энум там не дублируется.
        gender: (record.gender as 'male' | 'female' | null) ?? null,
        avatarKey: record.avatarKey,
      },
    });

    if (record.birth) {
      await this.prisma.astroBirthData.upsert({
        where: { userId: record.id },
        create: {
          userId: record.id,
          bornAtUtc: record.birth.bornAtUtc,
          birthDateLocal: record.birth.birthDateLocal,
          birthTimeLocal: record.birth.birthTimeLocal,
          placeLabel: record.birth.placeLabel,
          latitude: record.birth.latitude,
          longitude: record.birth.longitude,
          timezone: record.birth.timeZone,
        },
        update: {
          bornAtUtc: record.birth.bornAtUtc,
          birthDateLocal: record.birth.birthDateLocal,
          birthTimeLocal: record.birth.birthTimeLocal,
          placeLabel: record.birth.placeLabel,
          latitude: record.birth.latitude,
          longitude: record.birth.longitude,
          timezone: record.birth.timeZone,
        },
      });
    }

    // Ключи фотографий сюда не копируются: в основной базе они живут строками
    // UserPhoto со своими размерами и порядком, и восстановить их из одних
    // ключей нельзя. Расхождение по ним самоизлечивается при следующей правке
    // галереи, когда набор пересобирается из основной базы.

    await this.ru.db.personalRecord.updateMany({
      where: { id: record.id },
      data: { copiedAt: new Date(), copyStartedAt: null },
    });
  }
}
