import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import type { Role } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { MotivationGenerationService } from './motivation-generation.service';
import { composeStoryImage } from './story-image';

export interface StoryRebuildResult {
  /** Сколько постов получили новый кадр. */
  rebuilt: number;
  /** Сколько пропущено: подпись выключена или нечего писать. */
  skipped: number;
  failed: number;
  /** Осталось ли ещё что пересобирать — чтобы дожать следующим вызовом. */
  remaining: number;
}

@Injectable()
export class MotivationStoryRebuildService {
  private readonly logger = new Logger(MotivationStoryRebuildService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly generation: MotivationGenerationService,
  ) {}

  /**
   * Пересобирает кадры Stories у постов, созданных до появления подписи: у них
   * `storyImageUrl` — байт в байт копия картинки.
   *
   * Нейросеть не трогается: фон скачивается из S3, текст накладывается заново.
   * Работает пачками, чтобы не держать соединение часами.
   */
  async rebuild(role: Role, limit = 20): Promise<StoryRebuildResult> {
    this.admin(role);
    const batch = Math.max(1, Math.min(100, limit));
    const where = {
      storyCaption: true,
      imageUrl: { not: null },
      // Prisma не умеет сравнивать две колонки в where, поэтому равенство
      // проверяем уже на выбранных записях.
    } as const;

    const posts = await this.prisma.motivationPost.findMany({
      where,
      select: {
        id: true,
        imageUrl: true,
        storyImageUrl: true,
        contentDate: true,
        attributionSpeaker: true,
        attributionWork: true,
        attributionLocator: true,
        translations: { where: { language: 'ru' }, take: 1 },
        quote: {
          select: {
            originalText: true,
            author: true,
            work: true,
            locator: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const stale = posts.filter(
      (post) => post.storyImageUrl === null || post.storyImageUrl === post.imageUrl,
    );

    let rebuilt = 0;
    let skipped = 0;
    let failed = 0;

    for (const post of stale.slice(0, batch)) {
      const text =
        post.translations[0]?.storyText?.trim() ||
        post.quote?.originalText?.trim();
      if (!text || !post.imageUrl) {
        skipped += 1;
        continue;
      }
      const attribution = [
        post.quote?.author ?? post.attributionSpeaker,
        post.quote?.work ?? post.attributionWork,
        post.quote?.locator ?? post.attributionLocator,
      ]
        .map((part) => part?.trim())
        .filter(Boolean)
        .join(' · ');

      try {
        const response = await fetch(post.imageUrl);
        if (!response.ok)
          throw new Error(`image fetch failed: ${response.status}`);
        const background = Buffer.from(await response.arrayBuffer());
        const story = await composeStoryImage(background, { text, attribution });
        const key = `motivation/${post.contentDate.toISOString().slice(0, 10)}/${post.id}/v${Date.now()}-story.png`;
        const storyImageUrl = await this.generation.uploadStory(key, story);
        await this.prisma.motivationPost.update({
          where: { id: post.id },
          data: { storyImageUrl },
        });
        rebuilt += 1;
      } catch (error) {
        failed += 1;
        this.logger.error(
          `Unable to rebuild story for ${post.id}: ${String(error)}`,
        );
      }
    }

    return {
      rebuilt,
      skipped,
      failed,
      remaining: Math.max(0, stale.length - batch),
    };
  }

  private admin(role: Role) {
    if (role !== 'admin' && role !== 'service-admin')
      throw new ForbiddenException();
  }
}
