import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import {
  admitToRun,
  checkCostUsdMicros,
  readCheckSettings,
  startOfUtcDay,
} from './check-budget';
import type { ParsedCheckResponse } from './check-request';
import { decideCheck, levelSources, pagesToFetch } from './check-rule';
import { catalogFingerprint } from './composition-compare';
import { matchIngredients } from './ingredient-match';
import { parseComposition } from './ingredient-parse';
import {
  CheckProviderError,
  WellnessAiCheckService,
} from './wellness-ai-check.service';
import { WellnessCheckService } from './wellness-check.service';
import { WellnessSourceFetchService } from './wellness-source-fetch.service';
import { WellnessService } from './wellness.service';

/** Код «провайдер занят» и пауза до следующей попытки — как у Мотивации. */
export const PROVIDER_BUSY = 'provider_busy';
export const PROVIDER_BUSY_PAUSE_MS = 5 * 60_000;
export const MAX_ATTEMPTS = 3;
export const TICK_MS = 30_000;
/**
 * Лиз и порог «зависла» — с запасом над худшим случаем одной проверки:
 * 150 с на ответ ИИ и по 8 с на каждую из четырёх страниц с пересылками.
 */
export const LEASE_MS = 10 * 60_000;
export const LEASE_KEY = 'wellness:check-worker:lease';

/**
 * Воркер автопроверки карточек «Здоровья» (VED-384). Устроен ровно как
 * единственный воркер портала, `MotivationWorkerService`: тик раз в 30 с под
 * Redis-лизом (`SET NX PX`), клейм задачи через `updateMany` с проверкой
 * статуса, до трёх попыток, занятость провайдера попыткой не считается,
 * зависшие по `updatedAt` возвращаются в очередь. За тик — одна карточка:
 * это и есть ограничение частоты платных вызовов.
 */
@Injectable()
export class WellnessCheckWorkerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(WellnessCheckWorkerService.name);
  private readonly redis: Redis | null;
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly wellness: WellnessService,
    private readonly checks: WellnessCheckService,
    private readonly ai: WellnessAiCheckService,
    private readonly pages: WellnessSourceFetchService,
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
    if (this.redis)
      await this.redis
        .connect()
        .catch((error) =>
          this.logger.warn(`Redis unavailable: ${String(error)}`),
        );
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref();
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.redis?.status === 'ready') await this.redis.quit();
  }

  async tick(now = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    const token = crypto.randomUUID();
    if (this.redis?.status === 'ready') {
      const acquired = await this.redis
        .set(LEASE_KEY, token, 'PX', LEASE_MS, 'NX')
        .catch(() => null);
      if (!acquired) {
        this.running = false;
        return;
      }
    }
    try {
      await this.recoverExpired(now);
      const next = await this.prisma.wellnessProductCheck.findFirst({
        where: {
          status: 'queued',
          attemptCount: { lt: MAX_ATTEMPTS },
          // Занятого провайдера ждём молча: тик раз в 30 секунд бил бы в ту
          // же стену и копил отказы.
          OR: [
            { errorCode: null },
            { errorCode: { not: PROVIDER_BUSY } },
            {
              updatedAt: {
                lt: new Date(now.getTime() - PROVIDER_BUSY_PAUSE_MS),
              },
            },
          ],
        },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      if (!next) return;
      const claimed = await this.prisma.wellnessProductCheck.updateMany({
        where: { id: next.id, status: 'queued' },
        data: { status: 'running', attemptCount: { increment: 1 } },
      });
      if (!claimed.count) return;
      await this.process(next.id, now);
    } catch (error) {
      this.logger.error(
        'Wellness check tick failed',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      if (this.redis?.status === 'ready')
        await this.redis
          .eval(
            "if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end",
            1,
            LEASE_KEY,
            token,
          )
          .catch(() => undefined);
      this.running = false;
    }
  }

  /**
   * Проверка, начатая упавшим процессом, возвращается в очередь; исчерпавшая
   * попытки — уходит человеку с уведомлением.
   */
  private async recoverExpired(now: Date): Promise<void> {
    const expiredAt = new Date(now.getTime() - LEASE_MS);
    await this.prisma.wellnessProductCheck.updateMany({
      where: {
        status: 'running',
        updatedAt: { lt: expiredAt },
        attemptCount: { lt: MAX_ATTEMPTS },
      },
      data: { status: 'queued', errorCode: 'lease_expired' },
    });
    const exhausted = await this.prisma.wellnessProductCheck.findMany({
      where: {
        status: 'running',
        updatedAt: { lt: expiredAt },
        attemptCount: { gte: MAX_ATTEMPTS },
      },
      select: { id: true },
      take: 20,
    });
    for (const row of exhausted) {
      await this.checks.finish(row.id, {
        outcome: 'review',
        reasons: ['ai_failed'],
        errorCode: 'lease_expired',
      });
    }
  }

  private async process(id: string, now: Date): Promise<void> {
    const check = await this.prisma.wellnessProductCheck.findUnique({
      where: { id },
      select: {
        status: true,
        submittedName: true,
        submittedBrand: true,
        submittedIngredients: true,
        labelImageDataUrl: true,
        product: { select: { barcode: true, status: true } },
      },
    });
    if (!check || check.status !== 'running') return;
    if (check.product.status !== 'draft') {
      await this.checks.cancel(id);
      return;
    }

    const settings = readCheckSettings(process.env);
    const since = startOfUtcDay(now);
    const [spent, ran] = await Promise.all([
      this.prisma.wellnessProductCheck.aggregate({
        _sum: { costUsdMicros: true },
        where: { finishedAt: { gte: since } },
      }),
      this.prisma.wellnessProductCheck.count({
        where: { finishedAt: { gte: since }, model: { not: null } },
      }),
    ]);
    const blocked = admitToRun({
      settings,
      spentTodayUsdMicros: spent._sum.costUsdMicros ?? 0,
      checksRunToday: ran,
    });
    if (blocked) {
      await this.checks.finish(id, { outcome: 'review', reasons: [blocked] });
      return;
    }

    const submitted = {
      name: check.submittedName,
      brand: check.submittedBrand,
      ingredientsRaw: check.submittedIngredients,
    };
    let parsed: ParsedCheckResponse;
    try {
      parsed = await this.ai.check({
        barcode: check.product.barcode,
        ...submitted,
        imageDataUrl: check.labelImageDataUrl,
      });
    } catch (error) {
      await this.failAttempt(id, error);
      return;
    }

    const proposal = parsed.proposal;
    const pages = new Map<string, string | null>();
    if (proposal) {
      for (const url of pagesToFetch(proposal.sources, parsed.seenUrls)) {
        pages.set(url, await this.pages.fetchText(url));
      }
    }
    const sources = proposal
      ? levelSources({
          claimed: proposal.sources,
          seenUrls: parsed.seenUrls,
          pages,
          barcode: check.product.barcode,
          composition: proposal.ingredientsRaw,
        })
      : [];

    const entries = await this.wellness.ingredients();
    const fingerprint = (text: string) =>
      catalogFingerprint(
        matchIngredients(parseComposition(text), entries).matches,
      );
    const decision = decideCheck({
      submitted,
      proposal,
      sources,
      catalog: {
        submitted: fingerprint(submitted.ingredientsRaw),
        proposal: proposal?.ingredientsRaw
          ? fingerprint(proposal.ingredientsRaw)
          : [],
      },
    });

    await this.checks.finish(id, {
      ...decision,
      ai: {
        proposal,
        sources,
        model: this.ai.model,
        usage: parsed.usage,
        searchCalls: parsed.searchCalls,
        costUsdMicros: checkCostUsdMicros(
          parsed.usage,
          parsed.searchCalls,
          settings.rates,
        ),
      },
    });
  }

  /**
   * Попытка не удалась. Занятость провайдера попыткой не считается — иначе
   * три отказа за полторы минуты хоронили бы карточку, которую просто некому
   * было проверить. Исчерпанные попытки и снятый ключ — к человеку.
   */
  private async failAttempt(id: string, error: unknown): Promise<void> {
    const message =
      error instanceof Error ? error.message.slice(0, 200) : 'check_failed';
    this.logger.warn(`Автопроверка ${id} не удалась: ${message}`);

    if (error instanceof CheckProviderError && message === 'not_configured') {
      await this.checks.finish(id, {
        outcome: 'review',
        reasons: ['ai_unavailable'],
        errorCode: message,
      });
      return;
    }

    const current = await this.prisma.wellnessProductCheck.findUnique({
      where: { id },
      select: { attemptCount: true, status: true },
    });
    if (current?.status !== 'running') return;
    const busy = error instanceof CheckProviderError && error.busy;
    if (busy || current.attemptCount < MAX_ATTEMPTS) {
      await this.prisma.wellnessProductCheck.updateMany({
        where: { id, status: 'running' },
        data: {
          status: 'queued',
          errorCode: busy ? PROVIDER_BUSY : message,
          ...(busy ? { attemptCount: { decrement: 1 } } : {}),
        },
      });
      return;
    }
    await this.checks.finish(id, {
      outcome: 'review',
      reasons: ['ai_failed'],
      errorCode: message,
    });
  }
}
