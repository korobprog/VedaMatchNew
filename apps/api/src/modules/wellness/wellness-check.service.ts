import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import type {
  NotificationEvent,
  WellnessCheckReason,
  WellnessCheckSource,
  WellnessProductCard,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { admitToQueue, readCheckSettings, startOfUtcDay } from './check-budget';
import type { CheckProposal } from './check-request';
import type { CheckOutcome, RefinedField } from './check-rule';
import type { ParsedProductInput } from './wellness-dto';
import { WellnessAiCheckService } from './wellness-ai-check.service';
import { WellnessService } from './wellness.service';

/** Итог проверки, который записывается в базу и уходит человеку. */
export interface CheckFinish {
  outcome: CheckOutcome;
  reasons: WellnessCheckReason[];
  apply?: { name: string; brand: string | null; ingredientsRaw: string } | null;
  refined?: RefinedField[];
  errorCode?: string | null;
  ai?: {
    proposal: CheckProposal | null;
    sources: WellnessCheckSource[];
    model: string;
    usage: { inputTokens: number; outputTokens: number };
    searchCalls: number;
    costUsdMicros: number;
  };
}

/**
 * Причины, при которых карточка ушла человеку без вызова ИИ. Они не
 * считаются в дневной лимит человека: денег на них не потрачено.
 */
const FREE_REASONS: WellnessCheckReason[] = [
  'ai_unavailable',
  'user_daily_limit',
];

/**
 * Автопроверка карточек «Здоровья» (VED-384): постановка в очередь, запись
 * итога и уведомление человеку. Сам поиск и правило — в воркере
 * (`wellness-check-worker.service.ts`) и в `check-rule.ts`.
 *
 * Уведомления — через шину: издатель сообщает факт (что решено, кем и по
 * каким причинам), формулировку собирает подписчик в «Уведомлениях».
 */
@Injectable()
export class WellnessCheckService {
  private readonly log = new Logger(WellnessCheckService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wellness: WellnessService,
    private readonly ai: WellnessAiCheckService,
    private readonly bus: EventEmitter2,
  ) {}

  /**
   * Карточка от человека: создать черновик и поставить на автопроверку.
   * Штрихкод уже в базе — отдаём, что есть, и ничего не ставим: одну карточку
   * по кругу не проверяем.
   */
  async submit(
    userId: string,
    input: ParsedProductInput,
    labelImageDataUrl: string | null,
  ): Promise<WellnessProductCard> {
    const existed = await this.prisma.wellnessProduct.findUnique({
      where: { barcode: input.barcode },
      select: { id: true },
    });
    const card = await this.wellness.createProduct(userId, input);
    if (!existed) await this.enqueue(card, userId, labelImageDataUrl);
    return card;
  }

  private async enqueue(
    card: WellnessProductCard,
    userId: string,
    labelImageDataUrl: string | null,
  ): Promise<void> {
    const userChecksToday = await this.prisma.wellnessProductCheck.count({
      where: {
        createdAt: { gte: startOfUtcDay(new Date()) },
        product: { addedById: userId },
        NOT: { reasons: { hasSome: FREE_REASONS } },
      },
    });
    const blocked = admitToQueue({
      settings: readCheckSettings(process.env),
      providerConfigured: this.ai.configured,
      userChecksToday,
    });

    try {
      await this.prisma.wellnessProductCheck.create({
        data: {
          productId: card.id,
          status: blocked ? 'review' : 'queued',
          reasons: blocked ? [blocked] : [],
          submittedName: card.name,
          submittedBrand: card.brand,
          submittedIngredients: card.ingredientsRaw,
          labelImageDataUrl: blocked ? null : labelImageDataUrl,
          finishedAt: blocked ? new Date() : null,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return;
      }
      throw error;
    }

    if (blocked) {
      this.notify({
        recipientId: userId,
        product: card,
        outcome: 'review',
        decidedBy: 'ai',
        refined: [],
        reasons: [blocked],
        comment: null,
      });
    }
  }

  /**
   * Итог проверки. Пишется только из `running`: проверку, которую уже
   * закончил кто-то другой, не переписываем. Карточка меняется только из
   * черновика — если модератор успел решить сам, его решение остаётся, а
   * проверка помечается отменённой.
   *
   * `true` — итог записан и человек уведомлён.
   */
  async finish(checkId: string, result: CheckFinish): Promise<boolean> {
    const check = await this.prisma.wellnessProductCheck.findUnique({
      where: { id: checkId },
      select: {
        product: {
          select: {
            id: true,
            barcode: true,
            name: true,
            brand: true,
            ingredientsRaw: true,
            addedById: true,
          },
        },
      },
    });
    if (!check) return false;
    const product = check.product;
    const proposal = result.ai?.proposal ?? null;

    const state = await this.prisma.$transaction(async (tx) => {
      const closed = await tx.wellnessProductCheck.updateMany({
        where: { id: checkId, status: 'running' },
        data: {
          status: result.outcome,
          reasons: result.reasons,
          errorCode: result.errorCode ?? null,
          labelImageDataUrl: null,
          finishedAt: new Date(),
          ...(result.ai
            ? {
                aiFound: proposal?.found ?? null,
                aiNotFood: proposal?.notFood ?? null,
                aiName: proposal?.name ?? null,
                aiBrand: proposal?.brand ?? null,
                aiIngredients: proposal?.ingredientsRaw ?? null,
                aiConflicts: proposal?.conflicts ?? [],
                sources: result.ai.sources as unknown as Prisma.InputJsonValue,
                model: result.ai.model,
                inputTokens: result.ai.usage.inputTokens,
                outputTokens: result.ai.usage.outputTokens,
                searchCalls: result.ai.searchCalls,
                costUsdMicros: result.ai.costUsdMicros,
              }
            : {}),
        },
      });
      if (!closed.count) return 'lost' as const;
      if (result.outcome === 'review') return 'done' as const;

      const now = new Date();
      const moved = await tx.wellnessProduct.updateMany({
        where: { id: product.id, status: 'draft' },
        data:
          result.outcome === 'rejected'
            ? {
                status: 'rejected',
                reviewedAt: now,
                rejectReason: 'Автопроверка: не продукт питания',
              }
            : {
                status: 'published',
                reviewedAt: now,
                rejectReason: null,
                ...(result.apply ?? {}),
              },
      });
      if (!moved.count) {
        await tx.wellnessProductCheck.update({
          where: { id: checkId },
          data: { status: 'cancelled' },
        });
        return 'cancelled' as const;
      }
      return 'done' as const;
    });
    if (state !== 'done') return false;

    const ingredientsRaw =
      result.apply?.ingredientsRaw ?? product.ingredientsRaw;
    if (result.outcome === 'accepted' || result.outcome === 'refined') {
      // Разбор заново, как при одобрении модератором: справочник мог
      // пополниться, а состав — смениться уточнённым.
      await this.wellness.storeComposition(product.id, ingredientsRaw);
    }

    if (product.addedById) {
      this.notify({
        recipientId: product.addedById,
        product: {
          id: product.id,
          barcode: product.barcode,
          name: result.apply?.name ?? product.name,
        },
        outcome: result.outcome,
        decidedBy: 'ai',
        refined: result.refined ?? [],
        reasons: result.reasons,
        comment: null,
      });
    }
    return true;
  }

  /** Модератор решил раньше очереди: проверка больше не нужна. */
  async cancel(checkId: string): Promise<void> {
    await this.prisma.wellnessProductCheck.updateMany({
      where: { id: checkId, status: { in: ['queued', 'running'] } },
      data: {
        status: 'cancelled',
        labelImageDataUrl: null,
        finishedAt: new Date(),
      },
    });
  }

  /**
   * Решение модератора — человек узнаёт о нём тем же уведомлением, что и о
   * решении ИИ. Незаконченная автопроверка отменяется: платить за поиск по
   * уже решённой карточке незачем.
   */
  async moderatorDecided(input: {
    product: {
      id: string;
      barcode: string;
      name: string;
      addedById: string | null;
    };
    approved: boolean;
    comment: string | null;
  }): Promise<void> {
    const check = await this.prisma.wellnessProductCheck.findUnique({
      where: { productId: input.product.id },
      select: { id: true },
    });
    if (check) await this.cancel(check.id);
    if (!input.product.addedById) return;
    this.notify({
      recipientId: input.product.addedById,
      product: input.product,
      outcome: input.approved ? 'accepted' : 'rejected',
      decidedBy: 'moderator',
      refined: [],
      reasons: [],
      comment: input.comment,
    });
  }

  private notify(input: {
    recipientId: string;
    product: { id: string; barcode: string; name: string };
    outcome: CheckOutcome;
    decidedBy: 'ai' | 'moderator';
    refined: RefinedField[];
    reasons: WellnessCheckReason[];
    comment: string | null;
  }): void {
    const event: NotificationEvent = {
      name: 'wellness.product.checked',
      recipientId: input.recipientId,
      productId: input.product.id,
      barcode: input.product.barcode,
      productName: input.product.name,
      outcome: input.outcome,
      decidedBy: input.decidedBy,
      refined: input.refined,
      reasons: input.reasons,
      comment: input.comment,
    };
    try {
      this.bus.emit(event.name, event);
    } catch (error) {
      // Уведомление — не повод откатывать решение по карточке.
      this.log.warn(`Уведомление не ушло: ${String(error)}`);
    }
  }
}
