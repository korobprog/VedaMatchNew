import { Injectable, Logger } from '@nestjs/common';
import type { AstroQuotaState } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AstroSettingsService,
  type AstroSettingsValues,
} from './astro-settings.service';

/**
 * Учёт расхода и защита бюджета беты.
 *
 * Три рубежа поверх вечного кэша: дневная квота пользователя, общий дневной бюджет
 * сервиса и аварийный выключатель. При исчерпании бюджета сервис не ломается, а
 * деградирует: карта, даши и уже сгенерированные тексты остаются, новых не появляется.
 */

export type QuotaDecision =
  | { allowed: true }
  | { allowed: false; reason: 'quota_exhausted' | 'ai_unavailable' };

export interface TokenUsage {
  tokensIn: number;
  tokensOut: number;
}

/** Поля строки бюджета, нужные для решения об остановке. */
interface BudgetSnapshot extends TokenUsage {
  costUsdCents: number;
  haltedAt: Date | null;
}

/** Календарный день в UTC — ключ обеих таблиц расхода. */
export function usageDay(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

@Injectable()
export class AstroQuotaService {
  private readonly logger = new Logger(AstroQuotaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AstroSettingsService,
  ) {}

  async state(
    userId: string,
    now: Date = new Date(),
  ): Promise<AstroQuotaState> {
    const settings = await this.settings.get();
    const [usage, budget] = await Promise.all([
      this.prisma.astroUsage.findUnique({
        where: { userId_day: { userId, day: usageDay(now) } },
      }),
      this.prisma.astroBudgetDay.findUnique({ where: { day: usageDay(now) } }),
    ]);

    const budgetHalted = this.isHalted(settings, budget);

    return {
      readingsLeft: Math.max(
        0,
        settings.dailyReadingsPerUser - (usage?.readings ?? 0),
      ),
      readingsPerDay: settings.dailyReadingsPerUser,
      aiAvailable: settings.aiEnabled && !budgetHalted,
      budgetHalted,
    };
  }

  /** Проверка ПЕРЕД обращением к провайдеру: платить за отказ не хочется. */
  async check(userId: string, now: Date = new Date()): Promise<QuotaDecision> {
    const settings = await this.settings.get();
    if (!settings.aiEnabled) {
      return { allowed: false, reason: 'ai_unavailable' };
    }

    const day = usageDay(now);
    const [usage, budget] = await Promise.all([
      this.prisma.astroUsage.findUnique({
        where: { userId_day: { userId, day } },
      }),
      this.prisma.astroBudgetDay.findUnique({ where: { day } }),
    ]);

    if (this.isHalted(settings, budget)) {
      return { allowed: false, reason: 'ai_unavailable' };
    }
    if ((usage?.readings ?? 0) >= settings.dailyReadingsPerUser) {
      return { allowed: false, reason: 'quota_exhausted' };
    }
    if (
      (usage?.tokensIn ?? 0) + (usage?.tokensOut ?? 0) >=
      settings.dailyTokensPerUser
    ) {
      return { allowed: false, reason: 'quota_exhausted' };
    }
    return { allowed: true };
  }

  /**
   * Запись фактического расхода ПОСЛЕ ответа провайдера: списывать надо
   * потраченное, а не запрошенное. Аварийная остановка проставляется здесь же —
   * в тот момент, когда лимит оказался превышен.
   */
  async record(
    userId: string,
    usage: TokenUsage,
    now: Date = new Date(),
  ): Promise<void> {
    const settings = await this.settings.get();
    const day = usageDay(now);
    const total = usage.tokensIn + usage.tokensOut;
    const costUsdCents = this.costOf(usage);

    await this.prisma.astroUsage.upsert({
      where: { userId_day: { userId, day } },
      create: {
        userId,
        day,
        readings: 1,
        tokensIn: usage.tokensIn,
        tokensOut: usage.tokensOut,
      },
      update: {
        readings: { increment: 1 },
        tokensIn: { increment: usage.tokensIn },
        tokensOut: { increment: usage.tokensOut },
      },
    });

    const budget = await this.prisma.astroBudgetDay.upsert({
      where: { day },
      create: {
        day,
        tokensIn: usage.tokensIn,
        tokensOut: usage.tokensOut,
        costUsdCents,
      },
      update: {
        tokensIn: { increment: usage.tokensIn },
        tokensOut: { increment: usage.tokensOut },
        costUsdCents: { increment: costUsdCents },
      },
    });

    if (!budget.haltedAt && this.overLimit(settings, budget)) {
      await this.prisma.astroBudgetDay.update({
        where: { day },
        data: { haltedAt: now },
      });
      this.logger.warn(
        `Дневной бюджет astro исчерпан (${budget.tokensIn + budget.tokensOut} токенов, ` +
          `${budget.costUsdCents} центов) — генерация остановлена до конца суток`,
      );
    } else if (total === 0) {
      // Провайдер не вернул usage. Расход есть, а учесть его нечем — без этого
      // предупреждения бюджет молча считал бы такие вызовы бесплатными.
      this.logger.warn('Провайдер не вернул расход токенов; учёт неполон');
    }
  }

  /**
   * Доступен ли ИИ прямо сейчас, без привязки к конкретному пользователю.
   * Для расходов, которые не принадлежат одному человеку — общая фраза дня
   * генерируется один раз на бхаву и разделяется между всеми, у кого она
   * сегодня совпала, поэтому у неё нет персональной квоты, только общий
   * выключатель и бюджет.
   */
  async aiAvailable(now: Date = new Date()): Promise<boolean> {
    const settings = await this.settings.get();
    if (!settings.aiEnabled) return false;
    const budget = await this.prisma.astroBudgetDay.findUnique({
      where: { day: usageDay(now) },
    });
    return !this.isHalted(settings, budget);
  }

  /**
   * Расход, не принадлежащий одному пользователю. Идёт в общий дневной бюджет
   * и может сработать как kill-switch наравне с обычными разборами, но
   * НЕ пишется в AstroUsage — иначе случайный человек, чья бхава совпала с
   * ещё не сгенерированной фразой, выглядел бы в админке так, будто это он
   * потратил чужую квоту.
   */
  async recordSystemUsage(
    usage: TokenUsage,
    now: Date = new Date(),
  ): Promise<void> {
    const settings = await this.settings.get();
    const day = usageDay(now);
    const costUsdCents = this.costOf(usage);

    const budget = await this.prisma.astroBudgetDay.upsert({
      where: { day },
      create: {
        day,
        tokensIn: usage.tokensIn,
        tokensOut: usage.tokensOut,
        costUsdCents,
      },
      update: {
        tokensIn: { increment: usage.tokensIn },
        tokensOut: { increment: usage.tokensOut },
        costUsdCents: { increment: costUsdCents },
      },
    });

    if (!budget.haltedAt && this.overLimit(settings, budget)) {
      await this.prisma.astroBudgetDay.update({
        where: { day },
        data: { haltedAt: now },
      });
      this.logger.warn(
        `Дневной бюджет astro исчерпан (${budget.tokensIn + budget.tokensOut} токенов, ` +
          `${budget.costUsdCents} центов) — генерация остановлена до конца суток`,
      );
    }
  }

  /** Снятие аварийной остановки вручную из админки. */
  async resume(now: Date = new Date()): Promise<void> {
    await this.prisma.astroBudgetDay.updateMany({
      where: { day: usageDay(now) },
      data: { haltedAt: null },
    });
  }

  private isHalted(
    settings: AstroSettingsValues,
    budget: BudgetSnapshot | null,
  ): boolean {
    // Проверяются оба условия: отметка остановки и фактическое превышение. Отметку
    // могли снять вручную, а расход при этом остаться за лимитом — тогда генерация
    // не должна возобновиться сама собой до конца суток.
    return budget?.haltedAt != null || this.overLimit(settings, budget);
  }

  private overLimit(
    settings: AstroSettingsValues,
    budget: BudgetSnapshot | null,
  ): boolean {
    if (!budget) return false;
    if (budget.tokensIn + budget.tokensOut >= settings.dailyTokenBudget) {
      return true;
    }
    // Денежный лимит работает, только когда заданы цены (см. costOf).
    return (
      settings.dailyCostLimitUsdCents > 0 &&
      budget.costUsdCents >= settings.dailyCostLimitUsdCents
    );
  }

  /**
   * Стоимость в центах. Цены зависят от модели и меняются, поэтому берутся из
   * окружения; без них считается ноль, и денежный лимит просто не срабатывает —
   * токенный при этом продолжает защищать бюджет.
   */
  private costOf(usage: TokenUsage): number {
    const inRate = Number(process.env.ASTRO_AI_USD_CENTS_PER_MTOK_IN ?? 0);
    const outRate = Number(process.env.ASTRO_AI_USD_CENTS_PER_MTOK_OUT ?? 0);
    if (!Number.isFinite(inRate) || !Number.isFinite(outRate)) return 0;
    return Math.round(
      (usage.tokensIn * inRate + usage.tokensOut * outRate) / 1_000_000,
    );
  }
}
