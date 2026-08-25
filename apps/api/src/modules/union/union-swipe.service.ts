import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { UnionSwipe } from '@prisma/client';
import type {
  UnionCycleResetResult,
  UnionSwipeDecision,
  UnionSwipeRequest,
  UnionSwipeResetResult,
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

    // Запоминаем прежнее состояние строки: если заявка не создастся, свайп
    // нужно откатить ровно к нему, а не просто удалить (иначе потеряем,
    // например, откатанный суперлайк, который всё ещё считается в квоте).
    const previous = await this.prisma.unionSwipe.findUnique({
      where: { fromUserId_toUserId: { fromUserId, toUserId } },
    });

    // Повторный свайп по тому же человеку перезаписывает решение: колода могла
    // вернуть его после отката, и последнее слово должно остаться за человеком.
    //
    // Свайп пишем ДО заявки, а не после: встречная заявка при взаимности
    // (`ensureIncomingRequest`) проходит через проверку «лайкнул ли я» в моём
    // строгом режиме, и без записанного свайпа мэтч бы не открылся.
    await this.prisma.unionSwipe.upsert({
      where: { fromUserId_toUserId: { fromUserId, toUserId } },
      create: { fromUserId, toUserId, decision },
      update: { decision, createdAt: new Date(), undoneAt: null },
    });

    if (decision === 'pass') {
      return { toUserId, decision, matched: false, connection: null };
    }

    try {
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
    } catch (error) {
      // Заявка не создалась (скрыт модерацией, «только подтверждённые»,
      // «только по взаимным лайкам» и т.п.). Без отката человек исчезал бы
      // из колоды, а заявки при этом не было — лайк терялся молча.
      await this.rollbackSwipe(fromUserId, toUserId, previous);
      throw error;
    }
  }

  /**
   * Возвращает строку свайпа к состоянию до `decide`: не было — удаляем,
   * была — восстанавливаем решение, время и отметку отката.
   */
  private async rollbackSwipe(
    fromUserId: string,
    toUserId: string,
    previous: Pick<UnionSwipe, 'decision' | 'createdAt' | 'undoneAt'> | null,
  ): Promise<void> {
    const where = { fromUserId_toUserId: { fromUserId, toUserId } };
    if (!previous) {
      await this.prisma.unionSwipe.delete({ where });
      return;
    }
    await this.prisma.unionSwipe.update({
      where,
      data: {
        decision: previous.decision,
        createdAt: previous.createdAt,
        undoneAt: previous.undoneAt,
      },
    });
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

  /**
   * Сброс истории показов: возвращает в колоду все отсмотренные анкеты, кроме
   * уже состоявшихся знакомств (мэтч необратим — второй человек его видел).
   * Отдельное действие от сброса фильтров: фильтры сужают выдачу, а история
   * решает, кто уже был отсмотрен, и «Сбросить фильтры» её не трогает.
   */
  async resetHistory(fromUserId: string): Promise<UnionSwipeResetResult> {
    const rows = await this.prisma.unionSwipe.findMany({
      where: { fromUserId, undoneAt: null },
    });

    let restoredCount = 0;
    for (const row of rows) {
      if (row.decision !== 'pass') {
        const request = await this.prisma.unionConnectionRequest.findUnique({
          where: {
            fromUserId_toUserId: { fromUserId, toUserId: row.toUserId },
          },
        });
        if (request && request.status !== 'pending') continue;
        if (request) {
          await this.prisma.unionConnectionRequest.update({
            where: { id: request.id },
            data: { status: 'cancelled', respondedAt: new Date() },
          });
        }
      }

      await this.prisma.unionSwipe.update({
        where: { id: row.id },
        data: { undoneAt: new Date() },
      });
      restoredCount += 1;
    }

    return { restoredCount };
  }

  /**
   * Новый круг: снимаем только пропуски. Лайки, суперлайки и архив
   * переживают его — по лайку уже ушла заявка, и отменять её человек не
   * просил, а архив на то и архив. Этим начало круга отличается от
   * `resetHistory`, которое стирает вообще всё и отменяет заявки.
   *
   * Переиспользуем `undoneAt`: выдача и так считает откатанные свайпы
   * несуществующими, отдельного признака «круг» заводить не нужно.
   */
  async startNewCycle(fromUserId: string): Promise<UnionCycleResetResult> {
    const { count } = await this.prisma.unionSwipe.updateMany({
      where: { fromUserId, decision: 'pass', undoneAt: null },
      data: { undoneAt: new Date() },
    });
    return { restoredCount: count };
  }

  /** Кого уже отсмотрели: эти анкеты не должны возвращаться в колоду. */
  async swipedUserIds(fromUserId: string): Promise<Set<string>> {
    const rows = await this.prisma.unionSwipe.findMany({
      where: { fromUserId, undoneAt: null },
      select: { toUserId: true },
    });
    return new Set(rows.map((row) => row.toUserId));
  }

  /**
   * Суточная квота суперлайков. В бете щедрая, см. union-limits.ts.
   * Откатанные суперлайки тоже считаются: иначе откат возвращал бы квоту,
   * и связка «суперлайк → откат» давала бы бесконечные суперлайки.
   */
  private async requireSuperlikeQuota(fromUserId: string): Promise<void> {
    const used = await this.prisma.unionSwipe.count({
      where: {
        fromUserId,
        decision: 'superlike',
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
      // Служебная заявка: без `silent` мне пришёл бы пуш «X прислал заявку»,
      // хотя на самом деле мэтч уже состоялся.
      await this.connections.create(
        otherUserId,
        { toUserId: userId },
        { silent: true },
      );
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
