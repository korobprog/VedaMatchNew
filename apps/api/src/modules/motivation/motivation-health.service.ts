import { Injectable } from '@nestjs/common';
import { MotivationReviewStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  MotivationAdminHealth,
  MotivationQueueCounts,
} from '@vedamatch/shared';
import { stuckSince } from './motivation-worker-health';
import { MotivationWorkerService } from './motivation-worker.service';

/**
 * Состояние генерации для админки Motivation: очередь из базы плюс живое
 * состояние воркера. Отдельный сервис, а не метод воркера: воркеру не нужен
 * доступ к счётчикам, а счётчикам — к Redis.
 */
@Injectable()
export class MotivationHealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly worker: MotivationWorkerService,
  ) {}

  async health(now = new Date()): Promise<MotivationAdminHealth> {
    return {
      worker: this.worker.workerHealth(now),
      queue: await this.queueCounts(now),
    };
  }

  private async queueCounts(now: Date): Promise<MotivationQueueCounts> {
    const expiredAt = stuckSince(now);
    const [queued, inProgress, stuck, failed, awaitingReview] =
      await Promise.all([
        this.prisma.motivationPost.count({
          where: {
            reviewStatus: MotivationReviewStatus.image_queued,
            status: 'draft',
          },
        }),
        this.prisma.motivationPost.count({ where: { status: 'generating' } }),
        this.prisma.motivationPost.count({
          where: { status: 'generating', updatedAt: { lt: expiredAt } },
        }),
        this.prisma.motivationPost.count({ where: { status: 'failed' } }),
        this.prisma.motivationPost.count({
          where: {
            reviewStatus: {
              in: [
                MotivationReviewStatus.text_review,
                MotivationReviewStatus.image_review,
              ],
            },
          },
        }),
      ]);

    return { queued, inProgress, stuck, failed, awaitingReview };
  }
}
