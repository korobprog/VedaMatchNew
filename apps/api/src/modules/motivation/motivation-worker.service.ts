import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { MotivationGenerationService } from './motivation-generation.service';
import { QuoteDiscoveryService } from './quote-discovery.service';

@Injectable()
export class MotivationWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MotivationWorkerService.name);
  private readonly redis: Redis | null;
  private timer?: NodeJS.Timeout;
  private running = false;
  private lastDiscoveryDate?: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly generation: MotivationGenerationService,
    private readonly config: ConfigService,
    @Optional() private readonly discovery?: QuoteDiscoveryService,
  ) {
    const host = config.get<string>('REDIS_HOST');
    this.redis = host ? new Redis({ host, port: Number(config.get('REDIS_PORT') || 6379), db: Number(config.get('REDIS_DB') || 0), password: config.get<string>('REDIS_PASSWORD') || undefined, lazyConnect: true, maxRetriesPerRequest: 1 }) : null;
  }

  async onModuleInit() {
    if (this.redis) await this.redis.connect().catch((error) => this.logger.warn(`Redis unavailable: ${String(error)}`));
    await this.retryTodaysFailedJobs();
    this.timer = setInterval(() => void this.tick(), 30_000);
    this.timer.unref();
    void this.tick();
  }

  async onModuleDestroy() { if (this.timer) clearInterval(this.timer); if (this.redis?.status === 'ready') await this.redis.quit(); }

  private async retryTodaysFailedJobs() {
    const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
    await this.prisma.motivationPost.updateMany({
      where: { contentDate: today, OR: [{ status: { not: 'published' } }, { promptVersion: { not: 'motivation-v2-public' } }] },
      data: { status: 'draft', generationStage: 'queued', generationErrorCode: null, attemptCount: 0 },
    });
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    const lockKey = 'motivation:worker:lease';
    const token = crypto.randomUUID();
    if (this.redis?.status === 'ready') {
      const acquired = await this.redis.set(lockKey, token, 'PX', 300_000, 'NX').catch(() => null);
      if (!acquired) { this.running = false; return; }
    }
    try {
      await this.recoverExpiredJobs();
      await this.ensureDailyDiscovery();
      const post = await this.prisma.motivationPost.findFirst({ where: { status: 'draft', generationStage: 'queued', attemptCount: { lt: 3 } }, orderBy: { createdAt: 'asc' } });
      if (!post) return;
      const claimed = await this.prisma.motivationPost.updateMany({ where: { id: post.id, status: 'draft', generationStage: 'queued' }, data: { status: 'generating', generationStage: 'copy', attemptCount: { increment: 1 } } });
      if (!claimed.count) return;
      await this.process(post.id);
    } finally {
      if (this.redis?.status === 'ready') await this.redis.eval("if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end", 1, lockKey, token).catch(() => undefined);
      this.running = false;
    }
  }

  private async recoverExpiredJobs() {
    const expiredAt = new Date(Date.now() - 5 * 60_000);
    await this.prisma.motivationPost.updateMany({
      where: { status: 'generating', updatedAt: { lt: expiredAt }, attemptCount: { lt: 3 } },
      data: { status: 'draft', generationStage: 'queued', generationErrorCode: 'lease_expired' },
    });
  }

  private async ensureDailyDiscovery() {
    if (!this.discovery) return;
    const dateKey = new Date().toISOString().slice(0, 10);
    const idempotencyKey = `motivation:discovery:${dateKey}`;
    if (this.lastDiscoveryDate === dateKey) return;
    if (this.redis?.status === 'ready' && await this.redis.get(idempotencyKey).catch(() => null)) return;

    const count = Number(this.config.get('MOTIVATION_DAILY_CANDIDATE_COUNT') || 8);
    const today = new Date(`${dateKey}T00:00:00.000Z`);
    await this.discovery.discoverDaily(today, count);
    if (this.redis?.status === 'ready') {
      await this.redis.set(idempotencyKey, 'done', 'EX', 8 * 24 * 60 * 60).catch((error) => {
        this.logger.warn(`Unable to store Motivation discovery idempotency key: ${String(error)}`);
      });
    }
    this.lastDiscoveryDate = dateKey;
  }

  private async process(id: string) {
    const post = await this.prisma.motivationPost.findUnique({ where: { id } });
    if (!post) return;
    try {
      this.logger.log(`Generating Motivation post ${post.slug}`);
      const translations = await this.generation.generateCopy(post);
      await this.prisma.motivationPost.update({ where: { id }, data: { generationStage: 'image' } });
      const image = await this.generation.generateImage(`${translations[0].title}. ${translations[0].text}`);
      const version = Date.now();
      const baseKey = `motivation/${post.contentDate.toISOString().slice(0, 10)}/${post.profileType}/${post.audienceTrack}/v${version}`;
      const imageUrl = await this.generation.uploadStory(`${baseKey}.png`, image);
      await this.prisma.$transaction([
        ...translations.map((translation) => this.prisma.motivationPostTranslation.upsert({ where: { postId_language: { postId: id, language: translation.language } }, create: { postId: id, ...translation }, update: translation })),
        this.prisma.motivationPost.update({ where: { id }, data: { status: 'published', generationStage: 'published', generationErrorCode: null, imageUrl, storyImageUrl: imageUrl, attributionKind: 'ai_reflection', sourceVerified: false, modelVersion: 'responses:image_generation', promptVersion: 'motivation-v2-public', publishedAt: new Date() } }),
      ]);
    } catch (error) {
      const current = await this.prisma.motivationPost.findUnique({ where: { id }, select: { attemptCount: true } });
      await this.prisma.motivationPost.update({ where: { id }, data: { status: current && current.attemptCount < 3 ? 'draft' : 'failed', generationStage: current && current.attemptCount < 3 ? 'queued' : 'failed', generationErrorCode: error instanceof Error ? error.message.slice(0, 200) : 'generation_failed' } });
      this.logger.error(`Motivation generation failed for ${id}`, error instanceof Error ? error.stack : undefined);
    }
  }
}
