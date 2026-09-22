import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  conferenceEmptyDays,
  conferenceSweepCutoff,
  conferenceSweepVerdict,
} from './conference-retention';
import { conferenceLinkState } from './conference-link';

/**
 * Уборка пустых комнат быстрой конференции.
 *
 * Правило и его обоснование — в `conference-retention.ts`; здесь только
 * его исполнение. Коротко: убирается ТОЛЬКО комната, в которой не сказано
 * ни слова и чья дверь закрылась больше `CHAT_CONFERENCE_EMPTY_DAYS` суток
 * назад. Комната с перепиской не трогается никогда.
 *
 * Устройство — как у `ChatRetentionService` по соседству, единственного
 * образца фоновой работы в сервисе: тик по таймеру, лиз в Redis
 * (`SET NX PX`), чтобы два инстанса API не убирали одно и то же, и тихая
 * работа без Redis для одного контейнера и локальной разработки.
 *
 * Отдельный воркер, а не ветка в `ChatRetentionService`: там чистка тел
 * удалённых сообщений с походами в S3, лиз держится минутами, и пристроить
 * к ней удаление бесед означало бы связать два несвязанных срока одним
 * таймером. Свой лиз — свой темп.
 */
const LEASE_KEY = 'chat:conference:sweep:lease';
const LEASE_MS = 5 * 60_000;
/**
 * Раз в час. Срок измеряется сутками, и минута туда-сюда ничего не
 * решает; частый тик тут — только лишние запросы.
 */
const TICK_MS = 60 * 60_000;
/** Пачками: на первом запуске накопленного может быть много. */
const BATCH = 200;

@Injectable()
export class ChatConferenceRetentionService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ChatConferenceRetentionService.name);
  private readonly redis: Redis | null;
  private readonly days: number;
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.days = conferenceEmptyDays(
      config.get<string>('CHAT_CONFERENCE_EMPTY_DAYS'),
    );
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
    if (this.redis)
      await this.redis
        .connect()
        .catch((error) =>
          this.logger.warn(`Redis недоступен: ${String(error)}`),
        );
    this.logger.log(
      `Пустые комнаты конференций убираются через ${this.days} дн. после закрытия ссылки`,
    );
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    // unref, иначе таймер держит процесс и тесты не завершаются.
    this.timer.unref();
    void this.tick();
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.redis?.status === 'ready') await this.redis.quit();
  }

  async tick(now = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    if (this.redis?.status === 'ready') {
      const acquired = await this.redis
        .set(LEASE_KEY, randomUUID(), 'PX', LEASE_MS, 'NX')
        .catch(() => null);
      if (!acquired) {
        this.running = false;
        return 0;
      }
    }
    try {
      return await this.sweep(now);
    } catch (error) {
      this.logger.error(
        'Уборка пустых конференций не удалась',
        error instanceof Error ? error.stack : undefined,
      );
      return 0;
    } finally {
      this.running = false;
    }
  }

  /**
   * Одна пачка.
   *
   * Выборка отбирает кандидатов, а приговор всё равно выносит чистый
   * `conferenceSweepVerdict` по тем же данным. Дублирование намеренное:
   * условие в SQL легко разъехаться с правилом, а цена такого расхождения
   * — удалённая переписка. Чистая функция проверена таблицей случаев,
   * запрос — нет, поэтому последнее слово за ней.
   *
   * `messages: { none: {} }` отбирает комнаты вообще без сообщений, в том
   * числе без мягко удалённых: строка удалённого сообщения остаётся (на неё
   * ссылаются цитаты), и комната с ней пустой не считается.
   */
  private async sweep(now: Date): Promise<number> {
    const cutoff = conferenceSweepCutoff(now, this.days);
    const candidates = await this.prisma.chatConferenceLink.findMany({
      where: {
        // min(revokedAt, expiresAt) < cutoff — ровно эта дизъюнкция.
        OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }],
        conversation: { messages: { none: {} } },
      },
      select: {
        id: true,
        conversationId: true,
        expiresAt: true,
        revokedAt: true,
      },
      orderBy: { expiresAt: 'asc' },
      take: BATCH,
    });

    let removed = 0;
    for (const link of candidates) {
      const verdict = conferenceSweepVerdict(
        {
          state: conferenceLinkState(link, now),
          // Сообщений нет по условию выборки; пересчитывать незачем, но
          // приговор всё равно проходит через общую функцию.
          messageCount: 0,
          expiresAt: link.expiresAt,
          revokedAt: link.revokedAt,
        },
        now,
        this.days,
      );
      if (verdict.kind !== 'delete') continue;
      // Беседа уходит целиком: участники, ссылка и тема — каскадом по FK.
      // Вложений быть не может, раз не было сообщений, поэтому чистить
      // бакет тут нечего.
      await this.prisma.chatConversation.delete({
        where: { id: link.conversationId },
      });
      removed += 1;
    }

    if (removed)
      this.logger.log(`Убрано пустых комнат конференций: ${removed}`);
    return removed;
  }
}
