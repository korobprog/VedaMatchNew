import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  MotivationAudienceTrack,
  MotivationPostStatus,
  MotivationProfileType,
  MotivationVideoStatus,
  SpiritualStage,
} from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  MOTIVATION_VOICES,
  PORTAL_ACTIVITY_EVENTS,
  resolveDisplayName,
  type MotivationVoice,
  type PortalActivityEvent,
} from '@vedamatch/shared';
import type {
  MotivationAdminCandidateDto,
  MotivationAdminUpdate,
  MotivationAuthorWatchDto,
  MotivationAuthorWatchInput,
  MotivationFeedTier,
  MotivationLanguage,
  MotivationLikeResponse,
  MotivationManualQuoteInput,
  MotivationManualQuoteResult,
  MotivationPostDto,
  MotivationPreferenceUpdate,
  MotivationPromptUpdate,
  MotivationReportInput,
  MotivationReportResult,
  MotivationSourceWatchDto,
  MotivationSourceWatchInput,
  MotivationVisualStyle,
  Role,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  decodeMotivationCursor,
  encodeMotivationCursor,
  feedPage,
} from './motivation-feed';
import { rankFeed } from './feed-ranking';
import { adminAiVerdictOf, adminAppealOf } from './moderation-audit';
import { MotivationSettingsService } from './motivation-settings.service';

/** Причины жалоб: список закрытый, свободный текст — только в комментарии. */
const REPORT_REASONS = new Set(['spam', 'offensive', 'wrong_source', 'other']);
import { MotivationAuthorSearchService } from './motivation-author-search.service';
import {
  FalAudioService,
  VOICE_PREVIEW_LINE,
  voiceSampleKey,
} from './fal-audio.service';
import {
  buildPromptDraftRequest,
  cleanDraftedPrompt,
  type PromptKind,
} from './prompt-drafts';
import { MotivationCategoriesService } from './motivation-categories.service';
import { MotivationCopyService } from './motivation-copy.service';
import { MotivationGenerationService } from './motivation-generation.service';
import { MotivationSourceFetchService } from './motivation-source-fetch.service';
import { QuoteDiscoveryService } from './quote-discovery.service';
import { assertSafeFetchUrl } from './quote-source-policy';
import { quoteFingerprint } from './quote-normalizer';
import { MotivationModerationService } from './motivation-moderation.service';

const stageProfiles: Record<SpiritualStage, MotivationProfileType> = {
  seeker: 'user',
  practitioner: 'in_goodness',
  yogi: 'yogi',
  devotee: 'devotee',
};
const languages = new Set<MotivationLanguage>(['ru', 'en', 'hi']);
const stageProfileValues: Record<MotivationProfileType, true> = {
  user: true,
  in_goodness: true,
  yogi: true,
  devotee: true,
};

@Injectable()
export class MotivationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly generation: MotivationGenerationService,
    private readonly discovery: QuoteDiscoveryService,
    private readonly moderation: MotivationModerationService,
    private readonly authorSearch: MotivationAuthorSearchService,
    private readonly sourceFetch: MotivationSourceFetchService,
    private readonly copy: MotivationCopyService,
    private readonly categories: MotivationCategoriesService,
    private readonly audio: FalAudioService,
    // Необязательный: сервис создаётся в тестах позиционно, а порог жалоб
    // нужен ровно одному методу — без него берётся значение по умолчанию.
    @Optional() private readonly settingsService?: MotivationSettingsService,
    // Тоже необязательный и тоже последним: позиционная сборка сервиса в
    // тестах не должна ломаться из-за шины, которая нужна одному методу.
    @Optional() private readonly bus?: EventEmitter2,
  ) {}

  async preference(userId: string) {
    return (
      (await this.prisma.motivationPreference.findUnique({
        where: { userId },
      })) ?? {
        vaishnavaPercent: 50,
        language: 'ru',
        profileTypes: [],
        lastSeenAt: null,
      }
    );
  }
  async savePreference(userId: string, input: MotivationPreferenceUpdate) {
    // Доля вайшнавских публикаций больше не спрашивается и на ленту не влияет:
    // человек отмечает направления галочками, и два способа отбора рядом
    // противоречили друг другу — выбранное направление могло не показываться
    // из-за ползунка, о котором никто не помнил. Колонка осталась в базе с
    // прежними значениями, поэтому старый клиент ничего не ломает.
    const percent = Number.isInteger(input.vaishnavaPercent)
      ? (input.vaishnavaPercent as number)
      : undefined;
    if (
      (percent !== undefined && (percent < 0 || percent > 100)) ||
      (input.language && !languages.has(input.language))
    )
      throw new BadRequestException('Некорректные настройки');
    const profileTypes = this.parseProfileTypes(input.profileTypes);
    return this.prisma.motivationPreference.upsert({
      where: { userId },
      create: {
        userId,
        vaishnavaPercent: percent ?? 50,
        language: input.language ?? 'ru',
        profileTypes: profileTypes ?? [],
      },
      update: {
        ...(percent !== undefined ? { vaishnavaPercent: percent } : {}),
        ...(input.language ? { language: input.language } : {}),
        ...(profileTypes ? { profileTypes } : {}),
      },
    });
  }

  /**
   * Пустой список сохраняется как есть — это «как на самоидентификации».
   * Снять все галочки и остаться без ленты нельзя: такой выбор трактуется так
   * же, как отсутствие выбора.
   */
  private parseProfileTypes(
    value: MotivationProfileType[] | undefined,
  ): MotivationProfileType[] | undefined {
    if (value === undefined) return undefined;
    if (!Array.isArray(value))
      throw new BadRequestException('Некорректные настройки');
    const unique = [...new Set(value)];
    if (unique.some((profile) => !(profile in stageProfileValues)))
      throw new BadRequestException('Некорректные настройки');
    return unique;
  }

  async feed(
    userId: string,
    query: {
      cursor?: string;
      limit?: number;
      category?: string;
      favorites?: boolean;
      archive?: boolean;
      /**
       * Slug поста, с которого открывать ленту: переход «Открыть рилс» должен
       * показать созданное в самой ленте, а не на отдельной странице.
       */
      post?: string;
    },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { spiritualStage: true },
    });
    if (!user?.spiritualStage)
      throw new BadRequestException('Сначала пройдите самоидентификацию');
    const preference = await this.preference(userId),
      language = languages.has(preference.language as MotivationLanguage)
        ? preference.language
        : 'ru';
    const cursor = decodeMotivationCursor(query.cursor),
      limit = Math.max(1, Math.min(50, query.limit ?? 20));
    // Ярусы («свежее → непросмотренное → повтор») считаются только для
    // основной ленты: избранное и фильтр по категории остаются хронологией.
    const ranked = !query.favorites && !query.category;
    // Сессия листания: первая страница фиксирует момент и прошлый визит и
    // уносит их в курсор; дальше ленту считаем по ним, иначе просмотры,
    // сделанные при листании, сдвинули бы порядок между страницами.
    const since = cursor.since ? new Date(cursor.since) : new Date(),
      seenBefore =
        cursor.since !== undefined
          ? cursor.seenBefore
            ? new Date(cursor.seenBefore)
            : null
          : (preference.lastSeenAt ?? null);
    // Переход по прямой ссылке на один рилс — не сеанс листания, и отмечать
    // им визит нельзя: всё, что вышло с прошлого раза, потеряет ярус
    // «свежее», так и не показавшись. Больнее всего это било по автору —
    // мастер сам зовёт его «Открыть рилс» сразу после публикации, и этот
    // переход прятал от него его же публикацию.
    if (ranked && cursor.since === undefined && !query.post)
      await this.touchLastSeen(userId, since);
    const blockedAuthorIds = (
      await this.prisma.userBlock.findMany({
        where: { blockerId: userId },
        select: { blockedId: true },
      })
    ).map((block) => block.blockedId);
    // Явный выбор в настройках важнее самоидентификации; пустой список
    // означает, что выбора не делали.
    const profileTypes = preference.profileTypes?.length
      ? (preference.profileTypes as MotivationProfileType[])
      : [stageProfiles[user.spiritualStage]];
    const where = {
      OR: [
        { profileType: { in: profileTypes } },
        {
          quote: { profiles: { some: { profileType: { in: profileTypes } } } },
        },
        // Свой рилс автор видит всегда: он его создал, ему написали «рилс
        // опубликован», и настройки ленты не должны прятать от него его же
        // публикацию.
        { authorUserId: userId },
      ],
      status: MotivationPostStatus.published,
      // Рилсы заблокированных авторов не показываем: портальный `UserBlock` —
      // одна из четырёх моделей, читать которые сервисному модулю разрешено.
      // Оба исключения — одним `AND`: два ключа `NOT` в объекте затёрли бы
      // друг друга, и одно из правил молча перестало бы работать.
      AND: [
        ...(blockedAuthorIds.length > 0
          ? [{ NOT: { authorUserId: { in: blockedAuthorIds } } }]
          : []),
        // Рилс участника без проверенного источника в общую ленту не идёт:
        // он живёт во вкладке «Мои» и по прямой ссылке. Избранное —
        // исключение: туда пост мог попасть, пока правило было другим.
        ...(query.favorites
          ? []
          : [{ NOT: { origin: 'user' as const, sourceVerified: false } }]),
      ],
      // Опубликованное уже во время листания не втискивается в середину
      // сессии: оно придёт «свежим» при следующем открытии ленты.
      ...(ranked ? { publishedAt: { lte: since } } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.favorites ? { favorites: { some: { userId } } } : {}),
    };
    const include = {
      translations: { where: { language } },
      favorites: { where: { userId }, select: { userId: true } },
      views: { where: { userId }, select: { viewedAt: true } },
      likes: { where: { userId }, select: { userId: true } },
      // Имя автора наружу собирает resolveDisplayName, поэтому духовное имя
      // тянем рядом с мирским — иначе подпись слайда молча станет мирской.
      author: { select: { name: true, spiritualName: true } },
    } as const;
    // Один запрос на оба трека: доля вайшнавских публикаций из ленты убрана,
    // и делить выборку больше незачем — что показывать, решают отмеченные
    // направления.
    const posts = await this.prisma.motivationPost.findMany({
      where,
      include,
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take: 400,
    });
    // Названия категорий одним запросом: на посте лежит только slug, а в
    // ленте чип должен читаться словами.
    const categoryTitles = new Map(
      (
        await this.prisma.motivationCategory.findMany({
          select: { slug: true, title: true },
        })
      ).map((row) => [row.slug, row.title]),
    );
    const withTitle = <T extends { category: string }>(post: T) => ({
      ...post,
      categoryTitle: categoryTitles.get(post.category) ?? post.category,
    });
    const session = { userId, since, seenBefore };
    type Loaded = (typeof posts)[number];
    const order = (
      posts: Loaded[],
    ): { post: Loaded; tier?: MotivationFeedTier }[] =>
      ranked
        ? rankFeed(
            posts.map((post) => ({
              ...post,
              viewedAt: post.views[0]?.viewedAt ?? null,
            })),
            session,
          )
        : posts.map((post) => ({ post }));
    const page = feedPage(order(posts), cursor, limit);
    // Закреплённый пост берём тем же запросом, что и ленту: у публичного DTO
    // нет ни автора, ни отметок зрителя, и слайд выходил бы обеднённым.
    const pinned =
      query.post && !cursor.since
        ? await this.prisma.motivationPost.findFirst({
            where: { slug: query.post, status: MotivationPostStatus.published },
            include,
          })
        : null;
    const items = page.items.map(({ post, tier }) => ({
      ...this.dto(withTitle(post), userId),
      ...(tier ? { feedTier: tier } : {}),
    }));
    return {
      items: pinned
        ? [
            this.dto(withTitle(pinned), userId),
            ...items.filter((item) => item.id !== pinned.id),
          ]
        : items,
      nextCursor:
        page.items.length === limit
          ? encodeMotivationCursor({
              ...page.cursor,
              since: since.getTime(),
              seenBefore: seenBefore?.getTime() ?? null,
            })
          : null,
    };
  }

  /**
   * Отметка последнего визита. Пишется при первой странице основной ленты:
   * от неё при следующем открытии считается ярус «свежее».
   */
  private async touchLastSeen(userId: string, at: Date) {
    await this.prisma.motivationPreference.upsert({
      where: { userId },
      create: { userId, lastSeenAt: at },
      update: { lastSeenAt: at },
    });
  }

  async publicPost(slug: string, language: MotivationLanguage = 'ru') {
    const post = await this.prisma.motivationPost.findFirst({
      where: { slug, status: 'published' },
      include: {
        translations: {
          where: { language: languages.has(language) ? language : 'ru' },
        },
        favorites: false,
        views: false,
      },
    });
    if (!post) throw new NotFoundException('Публикация не найдена');
    return this.dto({ ...post, favorites: [], views: [] });
  }
  async favorite(userId: string, postId: string, favorite: boolean) {
    await this.ensurePublished(postId);
    if (favorite)
      await this.prisma.motivationFavorite.upsert({
        where: { userId_postId: { userId, postId } },
        create: { userId, postId },
        update: {},
      });
    else
      await this.prisma.motivationFavorite.deleteMany({
        where: { userId, postId },
      });
    // Осмысленным действием считается только добавление: снятие отметки
    // ничего не говорит о том, что человек ожил.
    if (favorite) this.announceActivity(userId);
  }

  /** Факт «человек добавил в избранное» для подписчиков портала. */
  private announceActivity(userId: string): void {
    const event: PortalActivityEvent = {
      name: PORTAL_ACTIVITY_EVENTS.motivation,
      userId,
      action: 'motivation.favorite-added',
      occurredAt: new Date().toISOString(),
    };
    this.bus?.emit(event.name, event);
  }
  /**
   * Жалоба на рилс участника. Одна на человека: повторное нажатие ничего не
   * меняет. Набрав порог из настроек, пост скрывается из ленты до решения
   * администратора — молчать до его прихода нельзя, а удалять по жалобам
   * нельзя тем более.
   */
  async report(
    userId: string,
    postId: string,
    input: MotivationReportInput,
  ): Promise<MotivationReportResult> {
    const reason = input?.reason;
    if (!REPORT_REASONS.has(reason))
      throw new BadRequestException('Выберите причину жалобы');
    const post = await this.prisma.motivationPost.findFirst({
      where: { id: postId, status: 'published' },
      select: { id: true, origin: true, authorUserId: true },
    });
    if (!post) throw new NotFoundException();
    if (post.origin !== 'user')
      throw new BadRequestException(
        'Это редакционная публикация — напишите в поддержку',
      );
    if (post.authorUserId === userId)
      throw new BadRequestException('Это ваш собственный рилс');
    await this.prisma.motivationReport.upsert({
      where: { postId_reporterId: { postId, reporterId: userId } },
      create: {
        postId,
        reporterId: userId,
        reason,
        comment: input.comment?.trim().slice(0, 500) || null,
      },
      update: {},
    });
    const count = await this.prisma.motivationReport.count({
      where: { postId },
    });
    const reportsToHide =
      (await this.settingsService?.read())?.reportsToHide ?? 3;
    let hidden = false;
    if (count >= reportsToHide) {
      const updated = await this.prisma.motivationPost.updateMany({
        where: { id: postId, status: 'published' },
        data: { status: 'hidden', generationStage: 'hidden' },
      });
      hidden = updated.count === 1;
      if (hidden)
        await this.prisma.motivationModerationAudit.create({
          data: {
            postId,
            actorId: null,
            action: 'auto_hidden',
            reason: `Жалоб: ${count}`,
            metadata: { actor: 'reports', count, threshold: reportsToHide },
          },
        });
    }
    return { count, hidden };
  }
  async view(userId: string, postId: string) {
    const post = await this.prisma.motivationPost.findFirst({
      where: { id: postId, status: 'published' },
      select: { authorUserId: true },
    });
    if (!post) throw new NotFoundException();
    // Свой рилс автор смотрит не как читатель. Отметка просмотра уводит пост
    // в ярус «повтор», то есть в самый хвост ленты — за все непросмотренные.
    // Автор публиковал ровно затем, чтобы пост в ленте появился, а один
    // взгляд на него убирал его оттуда. Заодно и счётчик просмотров у автора
    // перестаёт расти от него самого.
    if (post.authorUserId === userId) return;
    // Повторный просмотр отметку не сдвигает: она нужна как «когда впервые
    // видел» — по ней ярус «повтор» ставит давнее раньше недавнего, а порядок
    // ленты не прыгает оттого, что человек листает.
    await this.prisma.motivationView.upsert({
      where: { userId_postId: { userId, postId } },
      create: { userId, postId },
      update: {},
    });
  }
  /**
   * Лайк идемпотентен: повторный POST не удваивает счётчик, повторный DELETE
   * не уводит его в минус. Счётчик меняется в той же транзакции, что и
   * строка лайка, и только когда строка действительно появилась или исчезла.
   */
  async like(
    userId: string,
    postId: string,
    liked: boolean,
  ): Promise<MotivationLikeResponse> {
    await this.ensurePublished(postId);
    const likeCount = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.motivationLike.findUnique({
        where: { userId_postId: { userId, postId } },
        select: { userId: true },
      });
      if (liked && !existing) {
        await tx.motivationLike.create({ data: { userId, postId } });
        return (
          await tx.motivationPost.update({
            where: { id: postId },
            data: { likeCount: { increment: 1 } },
            select: { likeCount: true },
          })
        ).likeCount;
      }
      if (!liked && existing) {
        await tx.motivationLike.delete({
          where: { userId_postId: { userId, postId } },
        });
        return (
          await tx.motivationPost.update({
            where: { id: postId },
            data: { likeCount: { decrement: 1 } },
            select: { likeCount: true },
          })
        ).likeCount;
      }
      return (
        await tx.motivationPost.findUniqueOrThrow({
          where: { id: postId },
          select: { likeCount: true },
        })
      ).likeCount;
    });
    return { likeCount: Math.max(0, likeCount), isLiked: liked };
  }
  async adminList(role: Role): Promise<MotivationAdminCandidateDto[]> {
    this.admin(role);
    const posts = await this.prisma.motivationPost.findMany({
      include: {
        translations: { where: { language: 'ru' } },
        quote: { include: { translations: true, profiles: true } },
        favorites: false,
        views: false,
        author: { select: { name: true } },
        // Только записи ИИ и обращения: полный аудит карточке не нужен.
        moderationAudits: {
          where: {
            action: {
              in: [
                'ai_suggest',
                'ai_escalate',
                'ai_approve',
                'ai_reject',
                'ai_error',
                'ai_publish',
                'appeal',
              ],
            },
          },
          orderBy: { createdAt: 'desc' },
          select: {
            action: true,
            reason: true,
            metadata: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return posts.map((post) => ({
      ...this.dto({ ...post, favorites: [], views: [] }),
      status: post.status,
      generationStage: post.generationStage,
      generationErrorCode: post.generationErrorCode,
      attemptCount: post.attemptCount,
      reviewStatus: post.reviewStatus,
      origin: post.origin,
      authorName: post.author?.name ?? null,
      aiVerdict: adminAiVerdictOf(post.moderationAudits ?? []),
      appeal: adminAppealOf(post.moderationAudits ?? []),
      quote: post.quote
        ? {
            id: post.quote.id,
            originalText: post.quote.originalText,
            originalLanguage: post.quote.originalLanguage,
            author: post.quote.author,
            work: post.quote.work,
            locator: post.quote.locator,
            sourceType: post.quote.sourceType,
            sourceUrl: post.quote.sourceUrl,
            contextExcerpt: post.quote.contextExcerpt,
            verified: post.quote.verified,
            translations: post.quote.translations.map((translation) => ({
              language: translation.language as MotivationLanguage,
              quoteText: translation.quoteText,
              translationKind: translation.translationKind,
              label: translation.label,
            })),
          }
        : null,
      profileTypes: post.quote?.profiles.map(
        (profile) => profile.profileType,
      ) ?? [post.profileType],
      visualStyle: post.visualStyle,
      imagePrompt: post.imagePrompt,
      imagePromptEdited: Boolean(post.imagePromptEditedAt),
      textApprovedAt: post.textApprovedAt?.toISOString() ?? null,
      imageApprovedAt: post.imageApprovedAt?.toISOString() ?? null,
      videoStatus: post.videoStatus,
      videoVoice: post.videoVoice,
      videoVoiceName: post.videoVoiceName,
      // В админке ролик виден и до приёмки — иначе его нечем было бы принять.
      videoUrl: post.videoUrl ?? '',
      videoErrorCode: post.videoErrorCode,
      videoPrompt: post.videoPrompt,
    }));
  }
  async adminUpdate(role: Role, id: string, input: MotivationAdminUpdate) {
    this.admin(role);
    return this.prisma.motivationPost.update({
      where: { id },
      data: {
        ...(input.hidden !== undefined
          ? { status: input.hidden ? 'hidden' : 'published' }
          : {}),
        ...(input.category
          ? { category: await this.categories.resolveSlug(input.category) }
          : {}),
      },
    });
  }
  /**
   * Удаляет мотивацию вместе с её цитатой.
   *
   * Цитата уходит следом намеренно: `quoteId` у поста уникален, поэтому
   * осиротевшая цитата ничего бы не показывала, но её `normalizedHash` и дальше
   * блокировал бы повторное добавление того же текста — «удалил и не могу
   * добавить заново» было бы ловушкой. Переводы, избранное, просмотры и аудит
   * подхватываются каскадом.
   */
  async adminDelete(role: Role, id: string): Promise<void> {
    this.admin(role);
    const post = await this.prisma.motivationPost.findUnique({
      where: { id },
      select: { id: true, quoteId: true },
    });
    if (!post) throw new NotFoundException('Motivation post not found');
    await this.prisma.$transaction(async (transaction) => {
      await transaction.motivationPost.delete({ where: { id } });
      if (post.quoteId)
        await transaction.motivationQuote.delete({
          where: { id: post.quoteId },
        });
    });
  }
  regenerate(role: Role, actorId: string, id: string) {
    return this.moderation.regenerateImage(role, actorId, id);
  }
  approveText(
    role: Role,
    actorId: string,
    id: string,
    visualStyle?: MotivationVisualStyle,
  ) {
    return this.moderation.approveText(role, actorId, id, visualStyle);
  }
  /**
   * Ставит ролик в очередь. Отдельным действием, а не автоматом после
   * картинки: каждый ролик стоит денег, и решение о нём принимает человек.
   */
  async requestAnimation(role: Role, id: string) {
    this.admin(role);
    const post = await this.prisma.motivationPost.findUnique({
      where: { id },
      select: { imageUrl: true, videoStatus: true },
    });
    if (!post) throw new NotFoundException('Post not found');
    // Промпт иллюстрации больше не условие: ролику нужен кадр и своё описание
    // движения, а оно при пустом поле берётся из дефолта.
    if (!post.imageUrl) throw new ConflictException('Image is not ready yet');
    if (
      post.videoStatus === MotivationVideoStatus.queued ||
      post.videoStatus === MotivationVideoStatus.running
    )
      throw new ConflictException('Video is already being generated');

    // Счётчик попыток сбрасываем: это осознанный повторный заказ человеком, а
    // не автоматический ретрай после сбоя.
    await this.prisma.motivationPost.update({
      where: { id },
      data: {
        videoStatus: MotivationVideoStatus.queued,
        videoAttemptCount: 0,
        videoErrorCode: null,
        videoJobId: null,
        videoJobStatusUrl: null,
        videoJobResultUrl: null,
      },
    });
    return { videoStatus: 'queued' as const };
  }
  /**
   * Короткий образец голоса для выбора в админке.
   *
   * Без него голос выбирается вслепую из двадцати одного имени, а услышать его
   * можно только пересняв ролик — две минуты и двенадцать центов. Фраза
   * намеренно короткая и с теми именами, на которых синтез спотыкается: сорок
   * знаков стоят меньше половины цента.
   */
  async previewVoice(role: Role, voice?: string | null) {
    this.admin(role);
    const name = voice?.trim();
    if (name && !MOTIVATION_VOICES.includes(name as MotivationVoice))
      throw new BadRequestException('Unknown voice');
    // Фраза фиксированная, а голосов конечное число — значит каждый достаточно
    // синтезировать один раз за всё время. Ключ детерминированный, поэтому
    // проверка сводится к запросу готового файла.
    //
    // Модель входит в ключ обязательно: у v2 и v3 совпадают имена голосов, но
    // звучат они по-разному. Без неё после смены модели админ слушал бы старые
    // записи и выбирал голос по звучанию, которого в роликах уже нет.
    const key = voiceSampleKey(await this.audio.modelId(), name ?? 'default');
    const cached = await this.generation.findUploaded(key);
    if (cached) return { audio: cached, cached: true };

    const spoken = await this.audio.speak(VOICE_PREVIEW_LINE, name);
    const audio = await this.generation.uploadStory(
      key,
      spoken.audio,
      'audio/mpeg',
    );
    return { audio, cached: false };
  }

  /**
   * Настройка озвучки у поста: включение и выбор голоса.
   *
   * Голос проверяется по списку из `@vedamatch/shared`: опечатка ушла бы в
   * платный запрос к провайдеру и вернулась ошибкой уже после списания.
   */
  async setVideoVoice(
    role: Role,
    id: string,
    input: { enabled?: boolean; voice?: string | null },
  ) {
    this.admin(role);
    const voice = input.voice?.trim();
    if (voice && !MOTIVATION_VOICES.includes(voice as MotivationVoice))
      throw new BadRequestException('Unknown voice');

    const data: { videoVoice?: boolean; videoVoiceName?: string | null } = {};
    if (input.enabled !== undefined) data.videoVoice = input.enabled;
    if (input.voice !== undefined) data.videoVoiceName = voice || null;

    const updated = await this.prisma.motivationPost.updateMany({
      where: { id },
      data,
    });
    if (!updated.count) throw new NotFoundException('Post not found');
    return { ok: true };
  }

  /**
   * Черновик промпта картинки или движения, сочинённый нашим ИИ по контексту
   * поста.
   *
   * Шаблон собирает промпт всегда одинаково, а смысл цитаты у нас уже разобран
   * и источник проверен — из этого выходит постановка лучше, чем из шаблона.
   */
  async draftPostPrompt(
    role: Role,
    id: string,
    input: { kind: PromptKind; mood?: string },
  ): Promise<{ prompt: string }> {
    this.admin(role);
    const post = await this.prisma.motivationPost.findUnique({
      where: { id },
      include: {
        quote: true,
        translations: { where: { language: 'ru' }, take: 1 },
      },
    });
    if (!post) throw new NotFoundException('Пост не найден');

    const meaning =
      post.translations[0]?.text ?? post.quote?.originalText ?? post.category;
    const attribution = [
      post.quote?.author ?? post.attributionSpeaker,
      post.quote?.work ?? post.attributionWork,
      post.quote?.locator ?? post.attributionLocator,
    ]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(' · ');

    const raw = await this.generation.generatePlainText(
      buildPromptDraftRequest(input.kind, {
        meaning,
        attribution,
        context: post.quote?.contextExcerpt,
        mood: input.mood,
      }),
      2_000,
    );
    return { prompt: cleanDraftedPrompt(raw) };
  }

  /** Принимает ролик: до этого он виден только в админке. */
  async approveVideo(role: Role, id: string) {
    this.admin(role);
    const updated = await this.prisma.motivationPost.updateMany({
      where: { id, videoStatus: MotivationVideoStatus.review },
      data: { videoStatus: MotivationVideoStatus.ready },
    });
    if (!updated.count)
      throw new ConflictException('Video is not waiting for review');
    // Автор до этого момента видел «ждёт проверки администратора» и никак не
    // узнавал, что проверка прошла.
    const post = await this.prisma.motivationPost.findUnique({
      where: { id },
      select: { id: true, origin: true, authorUserId: true },
    });
    if (post) this.moderation.notifyVideoReady(post);
    return { videoStatus: 'ready' as const };
  }
  approveImage(role: Role, actorId: string, id: string) {
    return this.moderation.approveImage(role, actorId, id);
  }
  rejectModeration(role: Role, actorId: string, id: string, reason: string) {
    return this.moderation.reject(role, actorId, id, reason);
  }
  regenerateModerationImage(
    role: Role,
    actorId: string,
    id: string,
    visualStyle?: MotivationVisualStyle,
  ) {
    return this.moderation.regenerateImage(role, actorId, id, visualStyle);
  }
  savePrompts(
    role: Role,
    actorId: string,
    id: string,
    input: MotivationPromptUpdate,
  ) {
    return this.moderation.savePrompts(role, actorId, id, input);
  }
  async generateDaily(date: Date) {
    return this.discovery.discoverDaily(date, 8);
  }
  async enqueueDaily(role: Role, rawDate?: string) {
    this.admin(role);
    const date = rawDate
      ? new Date(`${rawDate}T00:00:00.000Z`)
      : new Date(new Date().toISOString().slice(0, 10));
    if (Number.isNaN(date.getTime()))
      throw new BadRequestException('Invalid date');
    return this.generateDaily(date);
  }
  async listAuthorWatches(role: Role): Promise<MotivationAuthorWatchDto[]> {
    this.admin(role);
    const watches = await this.prisma.motivationAuthorWatch.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return watches.map((watch) => this.authorWatchDto(watch));
  }
  async addAuthorWatch(
    role: Role,
    actorId: string,
    input: MotivationAuthorWatchInput,
  ): Promise<MotivationAuthorWatchDto> {
    this.admin(role);
    const name = input.name?.trim();
    if (!name) throw new BadRequestException('Author name is required');
    const watch = await this.prisma.motivationAuthorWatch.create({
      data: {
        name,
        language: input.language?.trim() || null,
        createdById: actorId,
      },
    });
    return this.authorWatchDto(watch);
  }
  async deleteAuthorWatch(role: Role, id: string): Promise<void> {
    this.admin(role);
    await this.prisma.motivationAuthorWatch
      .delete({ where: { id } })
      .catch(() => {
        throw new NotFoundException('Author watch not found');
      });
  }
  async searchAuthorWatch(role: Role, id: string) {
    this.admin(role);
    const foundCount = await this.authorSearch.searchByWatchId(id);
    return { foundCount };
  }

  async listSourceWatches(role: Role): Promise<MotivationSourceWatchDto[]> {
    this.admin(role);
    const watches = await this.prisma.motivationSourceWatch.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return watches.map((watch) => this.sourceWatchDto(watch));
  }
  async addSourceWatch(
    role: Role,
    actorId: string,
    input: MotivationSourceWatchInput,
  ): Promise<MotivationSourceWatchDto> {
    this.admin(role);
    const url = input.url?.trim();
    if (!url) throw new BadRequestException('Source URL is required');
    try {
      assertSafeFetchUrl(url);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid source URL',
      );
    }
    const watch = await this.prisma.motivationSourceWatch.create({
      data: { url, label: input.label?.trim() || null, createdById: actorId },
    });
    return this.sourceWatchDto(watch);
  }
  async addManualQuote(
    role: Role,
    input: MotivationManualQuoteInput,
  ): Promise<MotivationManualQuoteResult> {
    this.admin(role);
    const originalText = input.originalText?.trim();
    const originalLanguage = input.originalLanguage?.trim();
    const author = input.author?.trim();
    if (!originalText || !originalLanguage || !author) {
      throw new BadRequestException(
        'Quote text, language and author are required',
      );
    }
    // Произведение, глава/стих и контекст необязательны: колонки в БД
    // остаются NOT NULL, недостающее пишется пустой строкой.
    const work = input.work?.trim() ?? '';
    const locator = input.locator?.trim() ?? '';
    const contextExcerpt = input.contextExcerpt?.trim() ?? '';
    const category = await this.categories.resolveSlug(input.category);
    const normalizedHash = quoteFingerprint(originalText);
    const existing = await this.prisma.motivationQuote.findUnique({
      where: { normalizedHash },
    });
    if (existing)
      throw new BadRequestException('This quote has already been added');
    const quote = await this.prisma.motivationQuote.create({
      data: {
        originalText,
        normalizedHash,
        originalLanguage,
        author,
        work,
        locator,
        sourceType: 'manual',
        sourceUrl: input.sourceUrl?.trim() || null,
        vedabaseBookSlug: null,
        vedabaseChapterSlug: null,
        contextExcerpt,
        verified: true,
        verifiedAt: new Date(),
        discoveryDate: null,
      },
    });
    const post = await this.copy.prepareCandidate(quote.id, category);
    return { quoteId: quote.id, postId: post.id };
  }
  async deleteSourceWatch(role: Role, id: string): Promise<void> {
    this.admin(role);
    await this.prisma.motivationSourceWatch
      .delete({ where: { id } })
      .catch(() => {
        throw new NotFoundException('Source watch not found');
      });
  }
  async searchSourceWatch(role: Role, id: string) {
    this.admin(role);
    const foundCount = await this.sourceFetch.fetchByWatchId(id);
    return { foundCount };
  }

  private authorWatchDto(watch: {
    id: string;
    name: string;
    language: string | null;
    enabled: boolean;
    createdAt: Date;
    lastSearchedAt: Date | null;
    lastResultCount: number;
  }): MotivationAuthorWatchDto {
    return {
      id: watch.id,
      name: watch.name,
      language: watch.language,
      enabled: watch.enabled,
      createdAt: watch.createdAt.toISOString(),
      lastSearchedAt: watch.lastSearchedAt?.toISOString() ?? null,
      lastResultCount: watch.lastResultCount,
    };
  }
  private sourceWatchDto(watch: {
    id: string;
    url: string;
    label: string | null;
    enabled: boolean;
    createdAt: Date;
    lastFetchedAt: Date | null;
    lastResultCount: number;
  }): MotivationSourceWatchDto {
    return {
      id: watch.id,
      url: watch.url,
      label: watch.label,
      enabled: watch.enabled,
      createdAt: watch.createdAt.toISOString(),
      lastFetchedAt: watch.lastFetchedAt?.toISOString() ?? null,
      lastResultCount: watch.lastResultCount,
    };
  }
  private admin(role: Role) {
    if (role !== 'admin' && role !== 'service-admin')
      throw new ForbiddenException();
  }
  private async ensurePublished(id: string) {
    if (
      !(await this.prisma.motivationPost.findFirst({
        where: { id, status: 'published' },
        select: { id: true },
      }))
    )
      throw new NotFoundException();
  }
  private dto(post: any, viewerId?: string): MotivationPostDto {
    const t = post.translations[0];
    return {
      id: post.id,
      slug: post.slug,
      contentDate: post.contentDate.toISOString().slice(0, 10),
      profileType: post.profileType,
      audienceTrack: post.audienceTrack,
      category: post.category,
      // Slug наружу не показываем: человеку нужно название из справочника.
      categoryTitle: post.categoryTitle ?? post.category,
      imageUrl: post.imageUrl ?? '',
      storyImageUrl: post.storyImageUrl ?? '',
      // Наружу — только принятое видео: в review оно ещё не просмотрено.
      videoUrl:
        post.videoStatus === MotivationVideoStatus.ready
          ? (post.videoUrl ?? '')
          : '',
      // Звук в ролике есть, только если его туда положили: озвучка цитаты или
      // выбранный трек. Сама видеомодель звук не пишет — мы просим немой кадр.
      videoHasSound: Boolean(post.videoVoice || post.videoTrackId),
      title: t?.title ?? '',
      text: t?.text ?? '',
      storyText: t?.storyText ?? '',
      attributionKind: post.attributionKind,
      attributionSpeaker: post.attributionSpeaker,
      attributionWork: post.attributionWork,
      attributionLocator: post.attributionLocator,
      attributionSourceUrl: post.attributionSourceUrl,
      sourceVerified: post.sourceVerified,
      publishedAt: post.publishedAt?.toISOString() ?? '',
      isFavorite: post.favorites.length > 0,
      isViewed: post.views.length > 0,
      likeCount: post.likeCount ?? 0,
      isLiked: (post.likes?.length ?? 0) > 0,
      origin: post.origin ?? 'editorial',
      isOwn: Boolean(viewerId && post.authorUserId === viewerId),
      author: post.author
        ? {
            name: resolveDisplayName(
              post.author as { name: string; spiritualName: string | null },
            ),
          }
        : null,
    };
  }
}
