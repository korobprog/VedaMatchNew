import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MotivationAudienceTrack, MotivationPostStatus, MotivationProfileType, SpiritualStage } from '@prisma/client';
import type { MotivationAdminCandidateDto, MotivationAdminUpdate, MotivationAuthorWatchDto, MotivationAuthorWatchInput, MotivationLanguage, MotivationPostDto, MotivationPreferenceUpdate, MotivationSourceWatchDto, MotivationSourceWatchInput, MotivationVisualStyle, Role } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { decodeMotivationCursor, encodeMotivationCursor, weightedPage } from './motivation-feed';
import { MotivationAuthorSearchService } from './motivation-author-search.service';
import { MotivationGenerationService } from './motivation-generation.service';
import { MotivationSourceFetchService } from './motivation-source-fetch.service';
import { QuoteDiscoveryService } from './quote-discovery.service';
import { assertSafeFetchUrl } from './quote-source-policy';
import { MotivationModerationService } from './motivation-moderation.service';

const stageProfiles: Record<SpiritualStage, MotivationProfileType> = { seeker: 'user', practitioner: 'in_goodness', yogi: 'yogi', devotee: 'devotee' };
const languages = new Set<MotivationLanguage>(['ru', 'en', 'hi']);

@Injectable()
export class MotivationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly generation: MotivationGenerationService,
    private readonly discovery: QuoteDiscoveryService,
    private readonly moderation: MotivationModerationService,
    private readonly authorSearch: MotivationAuthorSearchService,
    private readonly sourceFetch: MotivationSourceFetchService,
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
    const profileType = stageProfiles[user.spiritualStage];
    const where = { OR: [{ profileType }, { quote: { profiles: { some: { profileType } } } }], status: MotivationPostStatus.published, ...(query.category ? { category: query.category } : {}), ...(query.favorites ? { favorites: { some: { userId } } } : {}) };
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
  regenerate(role: Role, actorId: string, id: string) { return this.moderation.regenerateImage(role, actorId, id); }
  approveText(role: Role, actorId: string, id: string, visualStyle?: MotivationVisualStyle) { return this.moderation.approveText(role, actorId, id, visualStyle); }
  approveImage(role: Role, actorId: string, id: string) { return this.moderation.approveImage(role, actorId, id); }
  rejectModeration(role: Role, actorId: string, id: string, reason: string) { return this.moderation.reject(role, actorId, id, reason); }
  regenerateModerationImage(role: Role, actorId: string, id: string, visualStyle?: MotivationVisualStyle) { return this.moderation.regenerateImage(role, actorId, id, visualStyle); }
  async generateDaily(date: Date) {
    return this.discovery.discoverDaily(date, 8);
  }
  async enqueueDaily(role: Role, rawDate?: string) { this.admin(role); const date = rawDate ? new Date(`${rawDate}T00:00:00.000Z`) : new Date(new Date().toISOString().slice(0, 10)); if (Number.isNaN(date.getTime())) throw new BadRequestException('Invalid date'); return this.generateDaily(date); }
  async listAuthorWatches(role: Role): Promise<MotivationAuthorWatchDto[]> {
    this.admin(role);
    const watches = await this.prisma.motivationAuthorWatch.findMany({ orderBy: { createdAt: 'desc' } });
    return watches.map((watch) => this.authorWatchDto(watch));
  }
  async addAuthorWatch(role: Role, actorId: string, input: MotivationAuthorWatchInput): Promise<MotivationAuthorWatchDto> {
    this.admin(role);
    const name = input.name?.trim();
    if (!name) throw new BadRequestException('Author name is required');
    const watch = await this.prisma.motivationAuthorWatch.create({
      data: { name, language: input.language?.trim() || null, createdById: actorId },
    });
    return this.authorWatchDto(watch);
  }
  async deleteAuthorWatch(role: Role, id: string): Promise<void> {
    this.admin(role);
    await this.prisma.motivationAuthorWatch.delete({ where: { id } }).catch(() => { throw new NotFoundException('Author watch not found'); });
  }
  async searchAuthorWatch(role: Role, id: string) {
    this.admin(role);
    const foundCount = await this.authorSearch.searchByWatchId(id);
    return { foundCount };
  }

  async listSourceWatches(role: Role): Promise<MotivationSourceWatchDto[]> {
    this.admin(role);
    const watches = await this.prisma.motivationSourceWatch.findMany({ orderBy: { createdAt: 'desc' } });
    return watches.map((watch) => this.sourceWatchDto(watch));
  }
  async addSourceWatch(role: Role, actorId: string, input: MotivationSourceWatchInput): Promise<MotivationSourceWatchDto> {
    this.admin(role);
    const url = input.url?.trim();
    if (!url) throw new BadRequestException('Source URL is required');
    try {
      assertSafeFetchUrl(url);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Invalid source URL');
    }
    const watch = await this.prisma.motivationSourceWatch.create({
      data: { url, label: input.label?.trim() || null, createdById: actorId },
    });
    return this.sourceWatchDto(watch);
  }
  async deleteSourceWatch(role: Role, id: string): Promise<void> {
    this.admin(role);
    await this.prisma.motivationSourceWatch.delete({ where: { id } }).catch(() => { throw new NotFoundException('Source watch not found'); });
  }
  async searchSourceWatch(role: Role, id: string) {
    this.admin(role);
    const foundCount = await this.sourceFetch.fetchByWatchId(id);
    return { foundCount };
  }

  private authorWatchDto(watch: { id: string; name: string; language: string | null; enabled: boolean; createdAt: Date; lastSearchedAt: Date | null; lastResultCount: number }): MotivationAuthorWatchDto {
    return { id: watch.id, name: watch.name, language: watch.language, enabled: watch.enabled, createdAt: watch.createdAt.toISOString(), lastSearchedAt: watch.lastSearchedAt?.toISOString() ?? null, lastResultCount: watch.lastResultCount };
  }
  private sourceWatchDto(watch: { id: string; url: string; label: string | null; enabled: boolean; createdAt: Date; lastFetchedAt: Date | null; lastResultCount: number }): MotivationSourceWatchDto {
    return { id: watch.id, url: watch.url, label: watch.label, enabled: watch.enabled, createdAt: watch.createdAt.toISOString(), lastFetchedAt: watch.lastFetchedAt?.toISOString() ?? null, lastResultCount: watch.lastResultCount };
  }
  private admin(role: Role) { if (role !== 'admin' && role !== 'service-admin') throw new ForbiddenException(); }
  private async ensurePublished(id: string) { if (!(await this.prisma.motivationPost.findFirst({ where: { id, status: 'published' }, select: { id: true } }))) throw new NotFoundException(); }
  private dto(post: any): MotivationPostDto { const t = post.translations[0]; return { id: post.id, slug: post.slug, contentDate: post.contentDate.toISOString().slice(0,10), profileType: post.profileType, audienceTrack: post.audienceTrack, category: post.category, imageUrl: post.imageUrl ?? '', storyImageUrl: post.storyImageUrl ?? '', title: t?.title ?? '', text: t?.text ?? '', storyText: t?.storyText ?? '', attributionKind: post.attributionKind, attributionSpeaker: post.attributionSpeaker, attributionWork: post.attributionWork, attributionLocator: post.attributionLocator, attributionSourceUrl: post.attributionSourceUrl, sourceVerified: post.sourceVerified, publishedAt: post.publishedAt?.toISOString() ?? '', isFavorite: post.favorites.length > 0, isViewed: post.views.length > 0 }; }
}
