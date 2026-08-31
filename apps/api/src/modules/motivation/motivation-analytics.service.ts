import { ForbiddenException, Injectable } from '@nestjs/common';
import type {
  AccessTokenPayload,
  MotivationAnalyticsDto,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { isAdmin } from './is-admin';
import { startOfUtcDay } from './reel-stages';

/**
 * Аналитика сервиса для админки: что смотрят, что создают участники и во что
 * это обходится. Считается по живым таблицам — отдельной агрегации пока нет:
 * при нынешних объёмах запрос дешевле, чем ещё одна сущность, которую надо
 * поддерживать в согласии с фактами.
 */
@Injectable()
export class MotivationAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async read(
    user: AccessTokenPayload,
    days = 7,
  ): Promise<MotivationAnalyticsDto> {
    if (!isAdmin(user)) throw new ForbiddenException();
    const window = Math.max(1, Math.min(90, days));
    const since = new Date(
      startOfUtcDay(new Date()).getTime() - (window - 1) * 24 * 60 * 60 * 1000,
    );

    const [
      views,
      likes,
      favorites,
      publishedTotal,
      userReels,
      userPublished,
      userRejected,
      editorialCost,
      userCost,
      topPosts,
    ] = await Promise.all([
      this.prisma.motivationView.count({ where: { viewedAt: { gte: since } } }),
      this.prisma.motivationLike.count({
        where: { createdAt: { gte: since } },
      }),
      this.prisma.motivationFavorite.count({
        where: { createdAt: { gte: since } },
      }),
      this.prisma.motivationPost.count({
        where: { status: 'published', publishedAt: { gte: since } },
      }),
      this.prisma.motivationPost.count({
        where: { origin: 'user', createdAt: { gte: since } },
      }),
      this.prisma.motivationPost.count({
        where: {
          origin: 'user',
          status: 'published',
          publishedAt: { gte: since },
        },
      }),
      this.prisma.motivationPost.count({
        where: {
          origin: 'user',
          reviewStatus: 'rejected',
          createdAt: { gte: since },
        },
      }),
      this.sumCost('editorial', since),
      this.sumCost('user', since),
      this.prisma.motivationPost.findMany({
        where: { status: 'published' },
        orderBy: [{ likeCount: 'desc' }, { publishedAt: 'desc' }],
        take: 5,
        select: {
          id: true,
          slug: true,
          likeCount: true,
          origin: true,
          translations: {
            where: { language: 'ru' },
            take: 1,
            select: { title: true },
          },
        },
      }),
    ]);

    return {
      days: window,
      views,
      likes,
      favorites,
      publishedTotal,
      userReels,
      userPublished,
      userRejected,
      editorialCostUsd: editorialCost,
      userCostUsd: userCost,
      top: topPosts.map((post) => ({
        id: post.id,
        slug: post.slug,
        title: post.translations[0]?.title ?? post.slug,
        likeCount: post.likeCount,
        origin: post.origin,
      })),
    };
  }

  /** Расход по происхождению постов: редакция и участники считаются отдельно. */
  private async sumCost(
    origin: 'editorial' | 'user',
    since: Date,
  ): Promise<number> {
    const totals = await this.prisma.motivationPost.aggregate({
      where: { origin, createdAt: { gte: since } },
      _sum: { estimatedCostUsd: true, videoCostUsd: true },
    });
    return (
      Number(totals._sum.estimatedCostUsd ?? 0) +
      Number(totals._sum.videoCostUsd ?? 0)
    );
  }
}
