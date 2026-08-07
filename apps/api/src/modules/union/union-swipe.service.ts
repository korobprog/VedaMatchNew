import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  UnionSwipeDecision,
  UnionSwipeRequest,
  UnionSwipeResult,
  UnionSwipeUndoResult,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { UnionConnectionService } from './union-connection.service';
import {
  SUPERLIKES_PER_DAY,
  UNDO_PER_DAY,
  quotaWindowStart,
} from './union-limits';

const DECISIONS: UnionSwipeDecision[] = ['like', 'superlike', 'pass'];

/**
 * Решения по анкетам в колоде. До появления этой таблицы пропуск жил только
 * в состоянии страницы и человек возвращался в выдачу после перезагрузки.
 *
 * Лайк — источник правды об интересе, заявка на знакомство создаётся уже по
 * нему: при встречном лайке сразу принятой (мэтч), иначе — по режиму анкеты
 * получателя (`contactMode`).
 */
@Injectable()
export class UnionSwipeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly connections: UnionConnectionService,
  ) {}

  async decide(
    fromUserId: string,
    body: UnionSwipeRequest,
  ): Promise<UnionSwipeResult> {
    const toUserId = String(body?.toUserId ?? '').trim();
    if (!toUserId) throw new BadRequestException('toUserId is required');
    if (toUserId === fromUserId) {
      throw new BadRequestException('Cannot swipe on yourself');
    }
    const decision = body?.decision;
    if (!DECISIONS.includes(decision)) {
      throw new BadRequestException('Unknown decision');
    }

    const target = await this.prisma.unionProfile.findUnique({
      where: { userId: toUserId },
    });
    if (!target) throw new NotFoundException('Union profile not found');

    if (decision === 'superlike') await this.requireSuperlikeQuota(fromUserId);

    // Повторный свайп по тому же человеку перезаписывает решение: колода могла
    // вернуть его после отката, и последнее слово должно остаться за человеком.
    await this.prisma.unionSwipe.upsert({
      where: { fromUserId_toUserId: { fromUserId, toUserId } },
      create: { fromUserId, toUserId, decision },
      update: { decision, createdAt: new Date(), undoneAt: null },
    });

    if (decision === 'pass') {
      return { toUserId, decision, matched: false, connection: null };
    }

    const likedMe = await this.likedMe(fromUserId, toUserId);
    // В строгом режиме односторонний лайк не превращается в заявку: человек
    // узнает об интересе, только если ответит взаимностью.
    if (!likedMe && target.contactMode === 'mutual_only') {
      return { toUserId, decision, matched: false, connection: null };
    }
    // Взаимность есть, но встречной заявки нет — так бывает после лайка в
    // строгом режиме. Заводим её от того, кто лайкнул первым, чтобы обычная
    // логика заявок увидела встречный интерес и сразу открыла чат.
    if (likedMe) await this.ensureIncomingRequest(fromUserId, toUserId);

    const connection = await this.connections.create(fromUserId, {
      toUserId,
      message: body.message ?? null,
      isSuperlike: decision === 'superlike',
    });
    return {
      toUserId,
      decision,
      matched: connection.status === 'accepted',
      connection,
    };
  }

  /**
   * Откат последнего свайпа. Отменяет и заявку, если она ещё висит без ответа:
   * состоявшийся мэтч или уже отвеченную заявку откатывать нельзя — второй
   * человек её видел.
   */
  async undoLast(fromUserId: string): Promise<UnionSwipeUndoResult> {
    await this.requireUndoQuota(fromUserId);

    const last = await this.prisma.unionSwipe.findFirst({
      where: { fromUserId, undoneAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!last) throw new NotFoundException('Откатывать нечего');

    if (last.decision !== 'pass') {
      const request = await this.prisma.unionConnectionRequest.findUnique({
        where: {
          fromUserId_toUserId: { fromUserId, toUserId: last.toUserId },
        },
      });
      if (request && request.status !== 'pending') {
        throw new BadRequestException(
          'Знакомство уже состоялось — вернуть анкету нельзя',
        );
      }
      if (request) {
        await this.prisma.unionConnectionRequest.update({
          where: { id: request.id },
          data: { status: 'cancelled', respondedAt: new Date() },
        });
      }
    }

    await this.prisma.unionSwipe.update({
      where: { id: last.id },
      data: { undoneAt: new Date() },
    });

    return { toUserId: last.toUserId, decision: last.decision };
  }

  /** Кого уже отсмотрели: эти анкеты не должны возвращаться в колоду. */
  async swipedUserIds(fromUserId: string): Promise<Set<string>> {
    const rows = await this.prisma.unionSwipe.findMany({
      where: { fromUserId, undoneAt: null },
      select: { toUserId: true },
    });
    return new Set(rows.map((row) => row.toUserId));
  }

  /** Суточная квота суперлайков. В бете щедрая, см. union-limits.ts. */
  private async requireSuperlikeQuota(fromUserId: string): Promise<void> {
    const used = await this.prisma.unionSwipe.count({
      where: {
        fromUserId,
        decision: 'superlike',
        undoneAt: null,
        createdAt: { gte: quotaWindowStart() },
      },
    });
    if (used >= SUPERLIKES_PER_DAY) {
      throw new BadRequestException(
        `Суперлайки на сегодня закончились: не больше ${SUPERLIKES_PER_DAY} в сутки`,
      );
    }
  }

  /** Суточная квота откатов. */
  private async requireUndoQuota(fromUserId: string): Promise<void> {
    const used = await this.prisma.unionSwipe.count({
      where: { fromUserId, undoneAt: { gte: quotaWindowStart() } },
    });
    if (used >= UNDO_PER_DAY) {
      throw new BadRequestException(
        `Откаты на сегодня закончились: не больше ${UNDO_PER_DAY} в сутки`,
      );
    }
  }

  private async ensureIncomingRequest(
    userId: string,
    otherUserId: string,
  ): Promise<void> {
    const existing = await this.prisma.unionConnectionRequest.findUnique({
      where: {
        fromUserId_toUserId: { fromUserId: otherUserId, toUserId: userId },
      },
    });
    if (existing) return;
    try {
      await this.connections.create(otherUserId, { toUserId: userId });
    } catch {
      // Например, я принимаю запросы только от подтверждённых преданных.
      // Тогда заявка уйдёт обычным путём — от меня к ним.
    }
  }

  private async likedMe(userId: string, otherUserId: string): Promise<boolean> {
    const reverse = await this.prisma.unionSwipe.findUnique({
      where: {
        fromUserId_toUserId: { fromUserId: otherUserId, toUserId: userId },
      },
    });
    return (
      reverse !== null &&
      reverse.undoneAt === null &&
      reverse.decision !== 'pass'
    );
  }
}
