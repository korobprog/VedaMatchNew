import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MotivationAudienceTrack, MotivationPostStatus, MotivationProfileType, SpiritualStage } from '@prisma/client';
import type { MotivationAdminCandidateDto, MotivationAdminUpdate, MotivationLanguage, MotivationPostDto, MotivationPreferenceUpdate, Role } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { decodeMotivationCursor, encodeMotivationCursor, weightedPage } from './motivation-feed';
import { MotivationGenerationService } from './motivation-generation.service';
import { QuoteDiscoveryService } from './quote-discovery.service';

const stageProfiles: Record<SpiritualStage, MotivationProfileType> = { seeker: 'user', practitioner: 'in_goodness', yogi: 'yogi', devotee: 'devotee' };
const languages = new Set<MotivationLanguage>(['ru', 'en', 'hi']);

@Injectable()
export class MotivationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly generation: MotivationGenerationService,
    private readonly discovery: QuoteDiscoveryService,
  ) {}

  async preference(userId: string) { return (await this.prisma.motivationPreference.findUnique({ where: { userId } })) ?? { vaishnavaPercent: 50, language: 'ru' }; }
  async savePreference(userId: string, input: MotivationPreferenceUpdate) {
    if (!Number.isInteger(input.vaishnavaPercent) || input.vaishnavaPercent < 0 || input.vaishnavaPercent > 100 || (input.language && !languages.has(input.language))) throw new BadRequestException('Некорректные настройки');
    return this.prisma.motivationPreference.upsert({ where: { userId }, create: { userId, vaishnavaPercent: input.vaishnavaPercent, language: input.language ?? 'ru' }, update: { vaishnavaPercent: input.vaishnavaPercent, ...(input.language ? { language: input.language } : {}) } });
  }

  async feed(userId: string, query: { cursor?: string; limit?: number; category?: string; favorites?: boolean; archive?: boolean }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { spiritualStage: true } });
    if (!user?.spiritualStage) throw new BadRequestException('Сначала пройдите самоидентификацию');
    const preference = await this.preference(userId), language = languages.has(preference.language as MotivationLanguage) ? preference.language : 'ru';
    const cursor = decodeMotivationCursor(query.cursor), limit = Math.max(1, Math.min(50, query.limit ?? 20));
    const where = { profileType: stageProfiles[user.spiritualStage], status: MotivationPostStatus.published, ...(query.category ? { category: query.category } : {}), ...(query.favorites ? { favorites: { some: { userId } } } : {}) };
    const include = { translations: { where: { language } }, favorites: { where: { userId }, select: { userId: true } }, views: { where: { userId }, select: { userId: true } } } as const;
    const [universal, vaishnava] = await Promise.all([
      this.prisma.motivationPost.findMany({ where: { ...where, audienceTrack: MotivationAudienceTrack.universal }, include, orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }], take: 200 }),
      this.prisma.motivationPost.findMany({ where: { ...where, audienceTrack: MotivationAudienceTrack.vaishnava }, include, orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }], take: 200 }),
    ]);
    const page = weightedPage(universal, vaishnava, preference.vaishnavaPercent, cursor, limit);
    return { items: page.items.map((post) => this.dto(post)), nextCursor: page.items.length === limit ? encodeMotivationCursor(page.cursor) : null };
  }

  async publicPost(slug: string, language: MotivationLanguage = 'ru') {
    const post = await this.prisma.motivationPost.findFirst({ where: { slug, status: 'published' }, include: { translations: { where: { language: languages.has(language) ? language : 'ru' } }, favorites: false, views: false } });
    if (!post) throw new NotFoundException('Публикация не найдена');
    return this.dto({ ...post, favorites: [], views: [] });
  }
  async favorite(userId: string, postId: string, favorite: boolean) { await this.ensurePublished(postId); if (favorite) await this.prisma.motivationFavorite.upsert({ where: { userId_postId: { userId, postId } }, create: { userId, postId }, update: {} }); else await this.prisma.motivationFavorite.deleteMany({ where: { userId, postId } }); }
  async view(userId: string, postId: string) { await this.ensurePublished(postId); await this.prisma.motivationView.upsert({ where: { userId_postId: { userId, postId } }, create: { userId, postId }, update: { viewedAt: new Date() } }); }
  async adminList(role: Role): Promise<MotivationAdminCandidateDto[]> { this.admin(role); const posts = await this.prisma.motivationPost.findMany({ include: { translations: { where: { language: 'ru' } }, quote: { include: { translations: true, profiles: true } }, favorites: false, views: false }, orderBy: { createdAt: 'desc' } }); return posts.map((post) => ({ ...this.dto({ ...post, favorites: [], views: [] }), status: post.status, generationStage: post.generationStage, generationErrorCode: post.generationErrorCode, attemptCount: post.attemptCount, reviewStatus: post.reviewStatus, quote: post.quote ? { id: post.quote.id, originalText: post.quote.originalText, originalLanguage: post.quote.originalLanguage, author: post.quote.author, work: post.quote.work, locator: post.quote.locator, sourceType: post.quote.sourceType, sourceUrl: post.quote.sourceUrl, contextExcerpt: post.quote.contextExcerpt, verified: post.quote.verified, translations: post.quote.translations.map((translation) => ({ language: translation.language as MotivationLanguage, quoteText: translation.quoteText, translationKind: translation.translationKind, label: translation.label })) } : null, profileTypes: post.quote?.profiles.map((profile) => profile.profileType) ?? [post.profileType], visualStyle: post.visualStyle, imagePrompt: post.imagePrompt, textApprovedAt: post.textApprovedAt?.toISOString() ?? null, imageApprovedAt: post.imageApprovedAt?.toISOString() ?? null })); }
  async adminUpdate(role: Role, id: string, input: MotivationAdminUpdate) { this.admin(role); return this.prisma.motivationPost.update({ where: { id }, data: { ...(input.hidden !== undefined ? { status: input.hidden ? 'hidden' : 'published' } : {}), ...(input.category ? { category: input.category.trim() } : {}) } }); }
  async regenerate(role: Role, id: string) { this.admin(role); const post = await this.prisma.motivationPost.findUnique({ where: { id } }); if (!post) throw new NotFoundException(); return this.prisma.motivationPost.update({ where: { id }, data: { status: 'draft', generationStage: 'queued', generationErrorCode: null, attemptCount: 0 } }); }
  async generateDaily(date: Date) {
    return this.discovery.discoverDaily(date, 8);
  }
  async enqueueDaily(role: Role, rawDate?: string) { this.admin(role); const date = rawDate ? new Date(`${rawDate}T00:00:00.000Z`) : new Date(new Date().toISOString().slice(0, 10)); if (Number.isNaN(date.getTime())) throw new BadRequestException('Invalid date'); return this.generateDaily(date); }
  private admin(role: Role) { if (role !== 'admin' && role !== 'service-admin') throw new ForbiddenException(); }
  private async ensurePublished(id: string) { if (!(await this.prisma.motivationPost.findFirst({ where: { id, status: 'published' }, select: { id: true } }))) throw new NotFoundException(); }
  private dto(post: any): MotivationPostDto { const t = post.translations[0]; return { id: post.id, slug: post.slug, contentDate: post.contentDate.toISOString().slice(0,10), profileType: post.profileType, audienceTrack: post.audienceTrack, category: post.category, imageUrl: post.imageUrl ?? '', storyImageUrl: post.storyImageUrl ?? '', title: t?.title ?? '', text: t?.text ?? '', storyText: t?.storyText ?? '', attributionKind: post.attributionKind, attributionSpeaker: post.attributionSpeaker, attributionWork: post.attributionWork, attributionLocator: post.attributionLocator, attributionSourceUrl: post.attributionSourceUrl, sourceVerified: post.sourceVerified, publishedAt: post.publishedAt?.toISOString() ?? '', isFavorite: post.favorites.length > 0, isViewed: post.views.length > 0 }; }
}
