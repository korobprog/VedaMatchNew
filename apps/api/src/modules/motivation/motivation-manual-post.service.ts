import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { MotivationAudienceTrack, MotivationProfileType } from '@prisma/client';
import type {
  MotivationLanguage,
  MotivationManualCopy,
  MotivationManualPostInput,
  MotivationManualPostResult,
  Role,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { MotivationCategoriesService } from './motivation-categories.service';
import { MotivationModerationService } from './motivation-moderation.service';
import { quoteFingerprint } from './quote-normalizer';

const LANGUAGES: readonly MotivationLanguage[] = ['ru', 'en', 'hi'];
const allowedProfiles = new Set<string>(Object.values(MotivationProfileType));
const allowedTracks = new Set<string>(Object.values(MotivationAudienceTrack));

@Injectable()
export class MotivationManualPostService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categories: MotivationCategoriesService,
    private readonly moderation: MotivationModerationService,
  ) {}

  /**
   * Создаёт мотивацию, у которой весь текст написан руками, и сразу отправляет
   * её на генерацию изображения.
   *
   * Пост заводится в `text_review` и тут же проходит через обычный
   * `approveText`: так он получает промпт изображения, запись в аудите и
   * попадает к воркеру ровно тем же путём, что и сгенерированный. Оставлять его
   * ждать проверки текста незачем — админ этот текст только что и написал.
   */
  async create(
    role: Role,
    actorId: string,
    input: MotivationManualPostInput,
  ): Promise<MotivationManualPostResult> {
    this.admin(role);

    const originalText = input.originalText?.trim();
    const originalLanguage = this.language(input.originalLanguage);
    const author = input.author?.trim();
    if (!originalText || !author)
      throw new BadRequestException('Quote text and author are required');

    const copy = this.copy(input.copy, 'copy');
    // Пояснение необязательно: иногда цитата говорит сама за себя.
    if (!copy.title) throw new BadRequestException('Title is required');

    const profileTypes = this.profileTypes(input.profileTypes);
    const audienceTrack = this.audienceTrack(input.audienceTrack);
    const contentDate = this.contentDate(input.contentDate);
    const category = await this.categories.resolveSlug(input.category);

    const work = input.work?.trim() ?? '';
    const locator = input.locator?.trim() ?? '';
    const contextExcerpt = input.contextExcerpt?.trim() ?? '';
    const sourceUrl = input.sourceUrl?.trim() || null;

    const normalizedHash = quoteFingerprint(originalText);
    if (
      await this.prisma.motivationQuote.findUnique({
        where: { normalizedHash },
        select: { id: true },
      })
    )
      throw new BadRequestException('This quote has already been added');

    const byLanguage = this.perLanguageCopy(copy, input.translations);

    const created = await this.prisma.$transaction(async (transaction) => {
      const quote = await transaction.motivationQuote.create({
        data: {
          originalText,
          normalizedHash,
          originalLanguage,
          author,
          work,
          locator,
          sourceType: 'manual',
          sourceUrl,
          vedabaseBookSlug: null,
          vedabaseChapterSlug: null,
          contextExcerpt,
          verified: true,
          verifiedAt: new Date(),
          discoveryDate: null,
          // Перевод цитаты заводим только на языке оригинала: выдавать русский
          // текст за английский перевод нельзя, а придумывать его здесь некому.
          translations: {
            create: [
              {
                language: originalLanguage,
                quoteText: originalText,
                translationKind: 'official',
                label: null,
              },
            ],
          },
          profiles: {
            create: profileTypes.map((profileType) => ({ profileType })),
          },
        },
      });

      const post = await transaction.motivationPost.create({
        data: {
          quoteId: quote.id,
          contentDate,
          profileType: profileTypes[0],
          audienceTrack,
          slug: `quote-${quote.id}`,
          category,
          status: 'draft',
          reviewStatus: 'text_review',
          sourceVerified: true,
          attributionKind: 'exact_quote',
          attributionSpeaker: author,
          attributionWork: work || null,
          attributionLocator: locator || null,
          attributionSourceUrl: sourceUrl,
          storyCaption: input.storyCaption !== false,
          generationStage: 'text',
          promptVersion: 'manual-v1',
          imageUrl: null,
          storyImageUrl: null,
          imagePrompt: null,
          translations: {
            create: LANGUAGES.map((language) => {
              const localized = byLanguage[language];
              return {
                language,
                title: localized.title,
                // Та же склейка, что и в сгенерированных постах: цитата, пустая
                // строка, пояснение — на неё опирается разбор в интерфейсе. Без
                // пояснения склеивать нечего, иначе останется висячий разделитель
                // и карточка покажет пустой блок «Пояснение».
                text: localized.explanation
                  ? `${originalText}\n\n${localized.explanation}`
                  : originalText,
                storyText:
                  localized.storyText || localized.explanation || originalText,
              };
            }),
          },
        },
      });

      return { quoteId: quote.id, postId: post.id };
    });

    const approved = await this.moderation.approveText(
      role,
      actorId,
      created.postId,
      input.visualStyle,
    );

    return { ...created, reviewStatus: approved.reviewStatus };
  }

  /**
   * Текст на каждый из трёх языков. Незаполненный язык берёт текст основного:
   * `dto()` при отсутствующем переводе отдаёт пустые строки, и читатель с
   * другим языком интерфейса увидел бы пустую карточку.
   *
   * Признак заполненности — заголовок: пояснение необязательно и у основного
   * текста.
   */
  private perLanguageCopy(
    primary: MotivationManualCopy,
    translations: MotivationManualPostInput['translations'],
  ): Record<MotivationLanguage, MotivationManualCopy> {
    const result = {} as Record<MotivationLanguage, MotivationManualCopy>;
    for (const language of LANGUAGES) {
      const provided = translations?.[language]
        ? this.copy(translations[language], language)
        : undefined;
      result[language] = provided?.title ? provided : primary;
    }
    return result;
  }

  private copy(
    value: MotivationManualCopy | undefined,
    field: string,
  ): MotivationManualCopy {
    if (!value || typeof value !== 'object')
      throw new BadRequestException(`Missing ${field}`);
    return {
      title: value.title?.trim() ?? '',
      explanation: value.explanation?.trim() ?? '',
      storyText: value.storyText?.trim() ?? '',
    };
  }

  private language(value: string | undefined): MotivationLanguage {
    const trimmed = value?.trim() as MotivationLanguage | undefined;
    if (!trimmed || !LANGUAGES.includes(trimmed))
      throw new BadRequestException('Unsupported original language');
    return trimmed;
  }

  private profileTypes(value: unknown): MotivationProfileType[] {
    if (!Array.isArray(value) || value.length === 0)
      throw new BadRequestException('Pick at least one audience');
    const unique = [...new Set(value)];
    if (unique.some((profile) => !allowedProfiles.has(profile as string)))
      throw new BadRequestException('Unknown audience');
    return unique as MotivationProfileType[];
  }

  private audienceTrack(value: unknown): MotivationAudienceTrack {
    if (typeof value !== 'string' || !allowedTracks.has(value))
      throw new BadRequestException('Unknown audience track');
    return value as MotivationAudienceTrack;
  }

  private contentDate(value: string | undefined): Date {
    const raw = value?.trim() || new Date().toISOString().slice(0, 10);
    const date = new Date(`${raw}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()))
      throw new BadRequestException('Invalid content date');
    return date;
  }

  private admin(role: Role) {
    if (role !== 'admin' && role !== 'service-admin')
      throw new ForbiddenException();
  }
}
