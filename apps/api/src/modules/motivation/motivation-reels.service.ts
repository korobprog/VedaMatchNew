import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  MotivationAudienceTrack,
  MotivationProfileType,
  MotivationVisualStyle,
  SpiritualStage,
} from '@prisma/client';
import { MOTIVATION_VOICE_LABELS } from '@vedamatch/shared';
import type {
  MotivationLanguage,
  MotivationPostDto,
  MotivationReelAppealInput,
  MotivationReelCreateInput,
  MotivationReelCreateResult,
  MotivationReelDto,
  MotivationReelBookDto,
  MotivationReelQuotaDto,
  MotivationReelSourceHit,
  MotivationReelTrackDto,
  MotivationVoiceOptionDto,
  MotivationReelVideoOptions,
  MotivationReelSource,
  Role,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildModerationPrompt,
  parseAiVerdict,
  reasonForUser,
  resolveDecision,
  type AiVerdict,
} from './ai-verdict';
import { MotivationCategoriesService } from './motivation-categories.service';
import { MotivationGenerationService } from './motivation-generation.service';
import { MotivationModerationService } from './motivation-moderation.service';
import { MotivationSettingsService } from './motivation-settings.service';
import { FalAudioService, voiceSampleKey } from './fal-audio.service';
import { QuoteVerificationService } from './quote-verification.service';
import { quoteFingerprint } from './quote-normalizer';
import { canAppeal, reelStageOf, startOfUtcDay } from './reel-stages';
import { sortByLocator, toSourceHits } from './reel-source-search';
import { parseReelVideoOptions } from './reel-video-options';
import {
  coverCrop,
  MIN_REEL_IMAGE_SIDE,
  reelImageKey,
  reelImageMessage,
  REEL_IMAGE_HEIGHT,
  REEL_IMAGE_WIDTH,
  validateReelImage,
  type UploadedReelImage,
} from './reel-image';
import sharp from 'sharp';
import { canAnimateReel } from './reel-animate';
import { fundingMessage } from './funding-error';

const LANGUAGES: readonly MotivationLanguage[] = ['ru', 'en', 'hi'];
const MAX_TEXT = 600;
const MIN_TEXT = 12;
const MAX_EXPLANATION = 800;
const MAX_AUTHOR = 80;
const MAX_APPEAL = 1000;
const allowedStyles = new Set<string>(Object.values(MotivationVisualStyle));
const allowedTracks = new Set<string>(Object.values(MotivationAudienceTrack));

const stageProfiles: Record<SpiritualStage, MotivationProfileType> = {
  seeker: 'user',
  practitioner: 'in_goodness',
  yogi: 'yogi',
  devotee: 'devotee',
};

/** События наружу: подписчики (уведомления, админка) собирают формулировки сами. */
export const REEL_CREATED_EVENT = 'motivation.reel.created';
export const REEL_REVIEWED_EVENT = 'motivation.reel.reviewed';
export const REEL_APPEALED_EVENT = 'motivation.reel.appealed';
/**
 * События для колокольчика. Событие самодостаточно: подписчик не дочитывает
 * ничего из таблиц мотивации, ему хватает получателя, идентификатора и
 * причины.
 */
export const REEL_REJECTED_EVENT = 'motivation.reel.rejected';
export const REEL_PUBLISHED_EVENT = 'motivation.reel.published';

/**
 * «Свой рилс»: участник приносит цитату (свою или из книги), она проходит
 * ИИ-модерацию и уходит в общий конвейер генерации. Отдельного состояния нет —
 * рилс и есть `MotivationPost` с `origin = user`, а мастер читает его стадии.
 */
@Injectable()
export class MotivationReelsService {
  private readonly logger = new Logger(MotivationReelsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: MotivationSettingsService,
    private readonly moderation: MotivationModerationService,
    private readonly generation: MotivationGenerationService,
    private readonly verification: QuoteVerificationService,
    private readonly categories: MotivationCategoriesService,
    private readonly events: EventEmitter2,
    private readonly audio: FalAudioService,
  ) {}

  /** Персональные правила автора; у большинства их нет — тогда null. */
  private policyOf(userId: string) {
    return this.prisma.motivationAuthorPolicy.findUnique({
      where: { userId },
      select: { dailyLimit: true, trusted: true, blocked: true },
    });
  }

  async quota(userId: string, role: Role): Promise<MotivationReelQuotaDto> {
    const [settings, policy] = await Promise.all([
      this.settings.read(),
      this.policyOf(userId),
    ]);
    const unlimited = this.isAdmin(role);
    const used = unlimited ? 0 : await this.usedToday(userId);
    // Личный лимит старше общего; запрет автору выключает создание целиком.
    const limit = policy?.dailyLimit ?? settings.userDailyLimit;
    return {
      enabled: settings.userReelsEnabled && !policy?.blocked,
      unlimited,
      limit,
      used,
      remaining: unlimited
        ? Number.MAX_SAFE_INTEGER
        : Math.max(0, limit - used),
    };
  }

  async create(
    userId: string,
    role: Role,
    input: MotivationReelCreateInput,
  ): Promise<MotivationReelCreateResult> {
    const [settings, policy] = await Promise.all([
      this.settings.read(),
      this.policyOf(userId),
    ]);
    if (policy?.blocked)
      throw new ForbiddenException(
        'Создание рилсов для вашего аккаунта закрыто. Напишите в поддержку.',
      );
    if (!settings.userReelsEnabled && !this.isAdmin(role))
      throw new ForbiddenException('Создание своих рилсов сейчас выключено');
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { spiritualStage: true },
    });
    if (!user?.spiritualStage)
      throw new BadRequestException('Сначала пройдите самоидентификацию');
    // Лимит считается по календарному дню UTC и не учитывает отклонённые:
    // отказ модератора не должен сжигать единственную попытку.
    // Личный лимит автора старше общего из настроек сервиса.
    const dailyLimit = policy?.dailyLimit ?? settings.userDailyLimit;
    if (!this.isAdmin(role)) {
      const used = await this.usedToday(userId);
      if (used >= dailyLimit)
        throw new ForbiddenException(
          dailyLimit === 0
            ? 'Создание своих рилсов сейчас недоступно'
            : 'Лимит на сегодня исчерпан — следующий рилс можно создать завтра',
        );
    }

    const source = this.validateSource(input.source);
    const language = this.language(input.language);
    const audienceTrack = this.track(input.audienceTrack);
    const visualStyle = this.style(input.visualStyle);
    const explanation = this.explanation(input.explanation);

    const normalizedHash = quoteFingerprint(source.text);
    // Цитата из книги проверяется по тексту главы: не нашли — не «своя», а
    // ошибка, иначе проверенный источник можно было бы подделать.
    const verified =
      source.kind === 'vedabase'
        ? await this.verification
            .verifyVedabaseCandidate({
              originalText: source.text,
              bookSlug: source.bookSlug,
              chapterSlug: source.chapterSlug,
            })
            .catch(() => {
              throw new BadRequestException(
                'Фрагмент не найден в этой главе дословно. Выделите текст заново или сократите его.',
              );
            })
        : null;

    const profileType = stageProfiles[user.spiritualStage];
    const category = await this.categories.resolveSlug(undefined);
    const now = new Date();
    const contentDate = startOfUtcDay(now);
    const author: string | null =
      verified?.author ??
      (source.kind === 'own' ? (source.author ?? null) : null);
    const attribution = verified
      ? {
          attributionKind: 'exact_quote' as const,
          attributionSpeaker: verified.author,
          attributionWork: verified.work,
          attributionLocator: verified.locator,
          sourceVerified: true,
        }
      : {
          attributionKind: 'ai_reflection' as const,
          attributionSpeaker: author,
          attributionWork: null,
          attributionLocator: null,
          sourceVerified: false,
        };

    const post = await this.prisma.$transaction(async (transaction) => {
      // Одна цитата — одна запись: если такую уже приносили, пост вешаем на неё.
      const existingQuote = await transaction.motivationQuote.findUnique({
        where: { normalizedHash },
        select: { id: true },
      });
      const quoteId =
        existingQuote?.id ??
        (
          await transaction.motivationQuote.create({
            data: {
              originalText: source.text,
              normalizedHash,
              originalLanguage: verified?.originalLanguage ?? language,
              author: author ?? 'Участник VedaMatch',
              work: verified?.work ?? '',
              locator: verified?.locator ?? '',
              sourceType: verified ? 'vedamatch_library' : 'manual',
              sourceUrl: null,
              vedabaseBookSlug: verified?.vedabaseBookSlug ?? null,
              vedabaseChapterSlug: verified?.vedabaseChapterSlug ?? null,
              contextExcerpt: verified?.contextExcerpt ?? source.text,
              verified: Boolean(verified),
              verifiedAt: verified ? now : null,
              discoveryDate: null,
              translations: {
                create: [
                  {
                    language,
                    quoteText: source.text,
                    translationKind: verified ? 'official' : 'vedamatch',
                    label: null,
                  },
                ],
              },
              profiles: { create: [{ profileType }] },
            },
            select: { id: true },
          })
        ).id;
      const created = await transaction.motivationPost.create({
        data: {
          // Цитата может быть занята другим постом (unique quoteId): тогда
          // рилс живёт без ссылки на неё, атрибуция и так скопирована в пост.
          quoteId: existingQuote ? null : quoteId,
          contentDate,
          profileType,
          audienceTrack,
          slug: `reel-${userId.slice(0, 8)}-${now.getTime().toString(36)}`,
          category,
          status: 'draft',
          reviewStatus: 'text_review',
          generationStage: 'ai_review',
          promptVersion: 'user-reel-v1',
          origin: 'user',
          authorUserId: userId,
          visualStyle,
          storyCaption: true,
          ...attribution,
          translations: {
            create: LANGUAGES.map((lang) => ({
              language: lang,
              title: this.titleFor(verified, source),
              text: explanation
                ? `${source.text}\n\n${explanation}`
                : source.text,
              storyText: source.text,
            })),
          },
        },
        select: { id: true },
      });
      return created;
    });

    this.events.emit(REEL_CREATED_EVENT, { postId: post.id, userId });
    const reviewed = await this.review(post.id, {
      text: source.text,
      explanation,
      author: attribution.attributionSpeaker,
      work: attribution.attributionWork,
      locator: attribution.attributionLocator,
      sourceVerified: attribution.sourceVerified,
      audienceTrack,
      language,
      visualStyle,
      trusted: Boolean(policy?.trusted),
    });
    return { id: post.id, ...reviewed };
  }

  /**
   * Своя картинка вместо сгенерированной. Кадр обрезается под 9:16, пишется в
   * S3 и кладётся в пост; текст при этом уже одобрен или ещё ждёт проверки —
   * порядок шагов мастера не меняется.
   *
   * Загруженный кадр всегда идёт на ручную проверку, даже когда ИИ-модерация
   * работает автономно: vision-шлюза у нас нет, а доверять чужому файлу на
   * слово нельзя.
   */
  async uploadImage(
    userId: string,
    postId: string,
    file: UploadedReelImage | undefined,
  ): Promise<MotivationReelDto> {
    const problem = validateReelImage(file);
    if (problem) throw new BadRequestException(reelImageMessage(problem));
    const post = await this.prisma.motivationPost.findFirst({
      where: { id: postId, authorUserId: userId, origin: 'user' },
      select: { id: true, status: true, reviewStatus: true },
    });
    if (!post) throw new NotFoundException('Рилс не найден');
    if (post.status === 'published')
      throw new BadRequestException(
        'Рилс уже опубликован: картинку можно поменять только до публикации',
      );

    const image = sharp(file!.buffer, {
      failOn: 'error',
      limitInputPixels: true,
    }).rotate();
    const meta = await image.metadata();
    const width = meta.width ?? 0,
      height = meta.height ?? 0;
    if (
      Math.min(width, height) < MIN_REEL_IMAGE_SIDE ||
      width === 0 ||
      height === 0
    )
      throw new BadRequestException(reelImageMessage('image_too_small'));

    const crop = coverCrop(width, height);
    const prepared = await image
      .extract(crop)
      .resize(REEL_IMAGE_WIDTH, REEL_IMAGE_HEIGHT, { fit: 'cover' })
      .webp({ quality: 82 })
      .toBuffer();
    const url = await this.generation.uploadStory(
      reelImageKey(postId, Date.now()),
      prepared,
      'image/webp',
    );

    await this.prisma.motivationPost.update({
      where: { id: postId },
      data: {
        imageUrl: url,
        // Кадр для Stories пока тот же файл: он уже вертикальный.
        storyImageUrl: url,
        imageSource: 'uploaded',
        reviewStatus: 'image_review',
        status: 'draft',
        generationStage: 'image_review',
        generationErrorCode: null,
        imageApprovedAt: null,
      },
    });
    await this.prisma.motivationModerationAudit.create({
      data: {
        postId,
        actorId: userId,
        action: 'author_image',
        reason: null,
        metadata: {
          source: 'uploaded',
          width: crop.width,
          height: crop.height,
        },
      },
    });
    return this.get(userId, postId);
  }

  /**
   * Поиск фрагмента в книгах для шага «Взять из наших книг». Ходит в
   * Vedabase через тот же репозиторий, что и проверка цитат: свой эндпоинт
   * нужен, чтобы мастер обращался только к своему сервису и получал сразу
   * пригодные куски, а не сырую выдачу поиска.
   */
  async searchSources(query: string): Promise<MotivationReelSourceHit[]> {
    const trimmed = query?.trim();
    if (!trimmed || trimmed.length < 3) return [];
    const units = await this.verification.findCandidates(trimmed, 40);
    return toSourceHits(units);
  }

  /**
   * Книги с оглавлением. Поиск по словам подходит не всем: человек чаще
   * помнит, из какой книги и главы стих, чем его дословную формулировку.
   */
  async listBooks(): Promise<MotivationReelBookDto[]> {
    const library = await this.verification.listBooks();
    return library.books.map((book) => ({
      slug: book.slug,
      title: book.title,
      author: book.author,
      chapters: book.chapters
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((chapter) => ({ slug: chapter.slug, title: chapter.title })),
    }));
  }

  /** Фрагменты выбранной главы — те же куски, что вернул бы поиск. */
  async browseChapter(
    bookSlug: string,
    chapterSlug: string,
  ): Promise<MotivationReelSourceHit[]> {
    const units = await this.verification.chapterUnits(bookSlug, chapterSlug);
    return toSourceHits(sortByLocator(units), 60);
  }

  /**
   * Оживить свой рилс в видео. Отдельным действием после публикации, а не
   * шагом мастера: ролик стоит заметно дороже картинки, и человек должен
   * сначала увидеть кадр, за который платит проект.
   */
  /**
   * Голоса на выбор автору: набор задаёт админ, подписи — из общего словаря,
   * образцы берутся уже записанными. Генерировать образец здесь нельзя: синтез
   * платный, а список открывает каждый, кто нажал «оживить».
   */
  async voiceOptions(): Promise<MotivationVoiceOptionDto[]> {
    const settings = await this.settings.read();
    const model = await this.audio.modelId();
    return Promise.all(
      settings.userVoices.map(async (voice) => ({
        value: voice,
        label: MOTIVATION_VOICE_LABELS[voice] ?? voice,
        sampleUrl: await this.generation.findUploaded(
          voiceSampleKey(model, voice),
        ),
        isDefault: settings.userVoiceDefault === voice,
      })),
    );
  }

  /** Музыка на выбор автору: только принятые редакцией треки. */
  async musicTracks(): Promise<MotivationReelTrackDto[]> {
    const tracks = await this.prisma.motivationTrack.findMany({
      where: { status: 'approved' },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { id: true, title: true, seconds: true, url: true },
    });
    return tracks;
  }

  async animate(
    userId: string,
    role: Role,
    postId: string,
    options?: MotivationReelVideoOptions,
  ): Promise<MotivationReelDto> {
    const settings = await this.settings.read();
    if (!settings.userVideoEnabled && !this.isAdmin(role))
      throw new ForbiddenException(
        'Видео из картинки сейчас выключено — рилс останется с кадром',
      );
    const post = await this.prisma.motivationPost.findFirst({
      where: { id: postId, authorUserId: userId, origin: 'user' },
      select: { id: true, imageUrl: true, videoStatus: true, status: true },
    });
    if (!post) throw new NotFoundException('Рилс не найден');
    if (!post.imageUrl)
      throw new BadRequestException('Сначала должна появиться картинка');
    if (post.status !== 'published')
      throw new BadRequestException('Оживить можно опубликованный рилс');
    if (post.videoStatus === 'queued' || post.videoStatus === 'running')
      throw new BadRequestException('Ролик уже готовится');
    if (post.videoStatus === 'ready')
      throw new BadRequestException('Ролик уже готов');
    const choice = parseReelVideoOptions(options);
    // Трек проверяем по справочнику: чужой идентификатор не должен доехать до
    // сборки, а «музыки нет» — законный выбор.
    if (choice.videoTrackId) {
      const track = await this.prisma.motivationTrack.findFirst({
        where: { id: choice.videoTrackId, status: 'approved' },
        select: { id: true },
      });
      if (!track)
        throw new BadRequestException('Этой музыки больше нет в библиотеке');
    }
    await this.prisma.motivationPost.update({
      where: { id: postId },
      data: {
        ...choice,
        videoStatus: 'queued',
        videoAttemptCount: 0,
        videoErrorCode: null,
        videoJobId: null,
        videoJobStatusUrl: null,
        videoJobResultUrl: null,
      },
    });
    await this.prisma.motivationModerationAudit.create({
      data: {
        postId,
        actorId: userId,
        action: 'author_animate',
        reason: null,
        metadata: { actor: 'author', ...choice },
      },
    });
    return this.get(userId, postId);
  }

  async list(userId: string, role?: Role): Promise<MotivationReelDto[]> {
    const posts = await this.prisma.motivationPost.findMany({
      where: { authorUserId: userId, origin: 'user' },
      include: this.include(userId),
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const videoAllowed = await this.videoAllowed(role);
    return posts.map((post) => this.reelDto(post, videoAllowed));
  }

  async get(userId: string, id: string, role?: Role): Promise<MotivationReelDto> {
    const post = await this.prisma.motivationPost.findFirst({
      where: { id, authorUserId: userId, origin: 'user' },
      include: this.include(userId),
    });
    if (!post) throw new NotFoundException('Рилс не найден');
    return this.reelDto(post, await this.videoAllowed(role));
  }

  /**
   * Разрешена ли видеогенерация этому человеку. Роль приходит не отовсюду:
   * внутренние вызовы возвращают DTO после действия, и там она не нужна —
   * достаточно общего выключателя.
   */
  private async videoAllowed(role?: Role): Promise<boolean> {
    if (role && this.isAdmin(role)) return true;
    return (await this.settings.read()).userVideoEnabled;
  }

  /**
   * Обращение к администратору после отказа. Одно на рилс: повторные письма
   * превращают очередь в переписку, для этого есть поддержка.
   */
  async appeal(
    userId: string,
    id: string,
    input: MotivationReelAppealInput,
  ): Promise<MotivationReelDto> {
    const message = input?.message?.trim();
    if (!message || message.length > MAX_APPEAL)
      throw new BadRequestException(
        `Напишите, с чем вы не согласны (до ${MAX_APPEAL} символов)`,
      );
    const reel = await this.get(userId, id);
    if (!reel.canAppeal)
      throw new BadRequestException(
        'Обжаловать можно только отказ, и один раз',
      );
    await this.prisma.motivationModerationAudit.create({
      data: {
        postId: id,
        actorId: userId,
        action: 'appeal',
        reason: message,
        metadata: { actor: 'author' },
      },
    });
    this.events.emit(REEL_APPEALED_EVENT, { postId: id, userId, message });
    return this.get(userId, id);
  }

  /**
   * ИИ-проверка текста сразу после создания. Режимы: выключено — к админу без
   * вызова; подсказывает — вердикт в аудит, решает человек; решает сам —
   * исполняет уверенные вердикты, сомнительные эскалирует. Любой сбой модели
   * — эскалация: рилс не теряется и не публикуется «по умолчанию».
   */
  private async review(
    postId: string,
    input: {
      text: string;
      explanation: string;
      author: string | null;
      work: string | null;
      locator: string | null;
      sourceVerified: boolean;
      audienceTrack: MotivationAudienceTrack;
      language: MotivationLanguage;
      visualStyle: MotivationVisualStyle | null;
      /** Доверенный автор: проверку пропускаем. */
      trusted: boolean;
    },
  ): Promise<{ stage: MotivationReelDto['stage']; reason: string | null }> {
    const settings = await this.settings.read();
    if (input.trusted) {
      // Доверенному автору проверка не нужна: админ ручается за него заранее.
      await this.moderation.aiApproveText(
        postId,
        input.visualStyle ?? undefined,
        { actor: 'trusted-author' },
      );
      return { stage: 'generating', reason: null };
    }
    if (settings.aiModerationMode === 'off') {
      await this.moderation.aiNote(postId, 'ai_escalate', null, {
        mode: 'off',
      });
      return { stage: 'admin_review', reason: null };
    }
    let verdict: AiVerdict | null = null;
    try {
      verdict = parseAiVerdict(
        await this.generation.moderationVerdict(
          buildModerationPrompt({
            ...input,
            editorialRules: settings.aiEditorialRules,
          }),
        ),
      );
    } catch (error) {
      this.logger.warn(`AI moderation failed for ${postId}: ${String(error)}`);
    }
    if (!verdict) {
      await this.moderation.aiNote(postId, 'ai_error', null, {
        mode: settings.aiModerationMode,
      });
      return { stage: 'admin_review', reason: null };
    }
    const decision = resolveDecision(verdict, {
      approve: settings.aiApproveThreshold,
      reject: settings.aiRejectThreshold,
    });
    const meta = {
      ...verdict,
      resolved: decision,
      mode: settings.aiModerationMode,
    };
    if (settings.aiModerationMode === 'assist') {
      await this.moderation.aiNote(
        postId,
        'ai_suggest',
        verdict.reason || null,
        meta,
      );
      this.events.emit(REEL_REVIEWED_EVENT, { postId, decision: 'escalate' });
      return { stage: 'admin_review', reason: null };
    }
    if (decision === 'approve') {
      await this.moderation.aiApproveText(
        postId,
        input.visualStyle ?? undefined,
        meta,
      );
      this.events.emit(REEL_REVIEWED_EVENT, { postId, decision });
      return { stage: 'generating', reason: null };
    }
    if (decision === 'reject') {
      const reason = reasonForUser(verdict);
      await this.moderation.aiReject(postId, reason, meta);
      this.events.emit(REEL_REVIEWED_EVENT, { postId, decision, reason });
      this.notifyRejected(postId, reason);
      return { stage: 'rejected', reason };
    }
    await this.moderation.aiNote(
      postId,
      'ai_escalate',
      verdict.reason || null,
      meta,
    );
    this.events.emit(REEL_REVIEWED_EVENT, { postId, decision });
    return { stage: 'admin_review', reason: null };
  }

  /**
   * Уведомление автору об отказе. Получателя читаем у поста: событие уходит
   * в колокольчик, а тот про мотивацию ничего не знает.
   */
  private notifyRejected(postId: string, reason: string): void {
    void this.prisma.motivationPost
      .findUnique({ where: { id: postId }, select: { authorUserId: true } })
      .then((post) => {
        if (post?.authorUserId)
          this.events.emit(REEL_REJECTED_EVENT, {
            name: REEL_REJECTED_EVENT,
            recipientId: post.authorUserId,
            reelId: postId,
            reason,
          });
      })
      .catch((error: unknown) =>
        this.logger.warn(`Reel rejection notice failed: ${String(error)}`),
      );
  }

  private async usedToday(userId: string): Promise<number> {
    return this.prisma.motivationPost.count({
      where: {
        authorUserId: userId,
        origin: 'user',
        createdAt: { gte: startOfUtcDay(new Date()) },
        reviewStatus: { not: 'rejected' },
      },
    });
  }

  private include(userId: string) {
    return {
      translations: true,
      favorites: { where: { userId }, select: { userId: true } },
      views: { where: { userId }, select: { viewedAt: true } },
      likes: { where: { userId }, select: { userId: true } },
      moderationAudits: {
        orderBy: { createdAt: 'desc' as const },
        select: { action: true, reason: true, createdAt: true },
      },
    };
  }

  private reelDto(
    post: {
    id: string;
    slug: string;
    contentDate: Date;
    profileType: MotivationProfileType;
    audienceTrack: MotivationAudienceTrack;
    category: string;
    status: string;
    reviewStatus: string;
    generationStage: string | null;
    imageUrl: string | null;
    storyImageUrl: string | null;
    videoUrl: string | null;
    videoStatus: string;
    videoVoice: boolean;
    videoTrackId: string | null;
    videoErrorCode: string | null;
    generationErrorCode: string | null;
    attributionKind: MotivationPostDto['attributionKind'];
    attributionSpeaker: string | null;
    attributionWork: string | null;
    attributionLocator: string | null;
    attributionSourceUrl: string | null;
    sourceVerified: boolean;
    publishedAt: Date | null;
    likeCount: number;
    createdAt: Date;
    translations: {
      language: string;
      title: string;
      text: string;
      storyText: string;
    }[];
    favorites: unknown[];
    views: unknown[];
    likes: unknown[];
    moderationAudits: {
      action: string;
      reason: string | null;
      createdAt: Date;
    }[];
    },
    /** Разрешена ли автору видеогенерация: выключатель живёт в админке. */
    videoAllowed = true,
  ): MotivationReelDto {
    const stage = reelStageOf(post);
    const rejection = post.moderationAudits.find(
      (audit) => audit.action === 'reject' || audit.action === 'ai_reject',
    );
    const hasAppeal = post.moderationAudits.some(
      (audit) => audit.action === 'appeal',
    );
    const translation =
      post.translations.find((item) => item.language === 'ru') ??
      post.translations[0];
    const videoState = post.videoStatus as MotivationReelDto['videoState'];
    return {
      id: post.id,
      stage,
      videoState,
      // Заказать ролик можно у опубликованного рилса с картинкой, пока его нет
      // и пока видеогенерация включена в админке.
      canAnimate: canAnimateReel({
        stage,
        hasImage: Boolean(post.imageUrl),
        videoState,
        videoEnabled: videoAllowed,
        isAdmin: false,
      }),
      reason: stage === 'rejected' ? (rejection?.reason ?? null) : null,
      // Деньги кончились — говорим об этом прямо: автор не поймёт «не
      // получилось, попробуйте ещё раз», когда повтор бесполезен.
      fundingNotice:
        fundingMessage(post.videoErrorCode) ??
        fundingMessage(post.generationErrorCode),
      canAppeal: canAppeal(stage, hasAppeal),
      sourceKind: post.sourceVerified ? 'vedabase' : 'own',
      createdAt: post.createdAt.toISOString(),
      post: {
        id: post.id,
        slug: post.slug,
        contentDate: post.contentDate.toISOString().slice(0, 10),
        profileType: post.profileType,
        audienceTrack: post.audienceTrack,
        category: post.category,
        // В кабинете автора справочник категорий не нужен: сам slug и есть
        // подпись, а лента подставит название из справочника.
        categoryTitle: post.category,
        imageUrl: post.imageUrl ?? '',
        storyImageUrl: post.storyImageUrl ?? '',
        videoUrl: post.videoStatus === 'ready' ? (post.videoUrl ?? '') : '',
        videoHasSound: Boolean(post.videoVoice || post.videoTrackId),
        title: translation?.title ?? '',
        text: translation?.text ?? '',
        storyText: translation?.storyText ?? '',
        attributionKind: post.attributionKind,
        attributionSpeaker: post.attributionSpeaker,
        attributionWork: post.attributionWork,
        attributionLocator: post.attributionLocator,
        attributionSourceUrl: post.attributionSourceUrl,
        sourceVerified: post.sourceVerified,
        publishedAt: post.publishedAt?.toISOString() ?? '',
        isFavorite: post.favorites.length > 0,
        isViewed: post.views.length > 0,
        likeCount: post.likeCount,
        isLiked: post.likes.length > 0,
        // Свой рилс — всегда пользовательский; имя автору в его же кабинете
        // не подписываем, слайд в ленте соберёт подпись сам.
        origin: 'user',
        author: null,
        isOwn: true,
      },
    };
  }

  private validateSource(
    source: MotivationReelSource | undefined,
  ): MotivationReelSource {
    if (!source || typeof source !== 'object')
      throw new BadRequestException('Нужна цитата');
    const text = typeof source.text === 'string' ? source.text.trim() : '';
    if (text.length < MIN_TEXT)
      throw new BadRequestException(
        `Текст слишком короткий — хотя бы ${MIN_TEXT} символов`,
      );
    if (text.length > MAX_TEXT)
      throw new BadRequestException(
        `Текст слишком длинный — до ${MAX_TEXT} символов, иначе не ляжет на кадр`,
      );
    if (source.kind === 'vedabase') {
      const bookSlug =
        typeof source.bookSlug === 'string' ? source.bookSlug.trim() : '';
      const chapterSlug =
        typeof source.chapterSlug === 'string' ? source.chapterSlug.trim() : '';
      if (!bookSlug || !chapterSlug)
        throw new BadRequestException('Не хватает книги или главы источника');
      return { kind: 'vedabase', text, bookSlug, chapterSlug };
    }
    if (source.kind === 'own') {
      const author =
        typeof source.author === 'string'
          ? source.author.trim().slice(0, MAX_AUTHOR)
          : '';
      return { kind: 'own', text, author: author || null };
    }
    throw new BadRequestException('Неизвестный источник цитаты');
  }

  private titleFor(
    verified: { work: string; locator: string } | null,
    source: MotivationReelSource,
  ): string {
    if (verified)
      return [verified.work, verified.locator].filter(Boolean).join(' ');
    if (source.kind === 'own' && source.author) return source.author;
    return 'Свой рилс';
  }

  private explanation(value: string | null | undefined): string {
    const text = typeof value === 'string' ? value.trim() : '';
    if (text.length > MAX_EXPLANATION)
      throw new BadRequestException(
        `Пояснение — до ${MAX_EXPLANATION} символов`,
      );
    return text;
  }

  private language(value: unknown): MotivationLanguage {
    if (
      typeof value !== 'string' ||
      !LANGUAGES.includes(value as MotivationLanguage)
    )
      throw new BadRequestException('Неподдерживаемый язык');
    return value as MotivationLanguage;
  }

  private track(value: unknown): MotivationAudienceTrack {
    if (typeof value !== 'string' || !allowedTracks.has(value))
      throw new BadRequestException('Неизвестный трек ленты');
    return value as MotivationAudienceTrack;
  }

  private style(value: unknown): MotivationVisualStyle | null {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string' || !allowedStyles.has(value))
      throw new BadRequestException('Неизвестный визуальный стиль');
    return value as MotivationVisualStyle;
  }

  private isAdmin(role: Role) {
    return role === 'admin' || role === 'service-admin';
  }
}
