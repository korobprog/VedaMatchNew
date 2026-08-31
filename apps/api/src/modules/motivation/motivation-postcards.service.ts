import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AccessTokenPayload,
  MotivationEventDto,
  MotivationEventInput,
  MotivationPostcardResult,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { isAdmin } from './is-admin';
import { MotivationGenerationService } from './motivation-generation.service';
import { composeStoryImage } from './story-image';
import {
  attributionLine,
  upcomingEvent,
  type EventRow,
} from './postcard-events';

const MAX_TITLE = 80;
const MAX_GREETING = 120;
const MAX_LEAD_DAYS = 60;

/**
 * Открытки: тот же кадр поста с поздравлением сверху, плюс справочник
 * праздников, из которого мастер и лента узнают, что открытку сейчас есть
 * смысл предложить.
 *
 * Открытка собирается по кнопке, а не заранее: она нужна не каждому посту, а
 * лишний файл в S3 стоит денег и живёт вечно.
 */
@Injectable()
export class MotivationPostcardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly generation: MotivationGenerationService,
  ) {}

  /** Ближайшее событие, ради которого стоит предложить открытку. */
  async current(now = new Date()): Promise<MotivationEventDto | null> {
    const rows = await this.prisma.motivationEvent.findMany({
      where: { enabled: true, date: { gte: this.daysAgo(now, 1) } },
      orderBy: { date: 'asc' },
      take: 20,
    });
    const found = upcomingEvent(
      rows.map((row) => this.toRow(row)),
      now,
    );
    return found ? this.dto(found) : null;
  }

  async list(user: AccessTokenPayload): Promise<MotivationEventDto[]> {
    this.assertAdmin(user);
    const rows = await this.prisma.motivationEvent.findMany({
      orderBy: { date: 'asc' },
      take: 200,
    });
    return rows.map((row) => this.dto(this.toRow(row)));
  }

  async create(
    user: AccessTokenPayload,
    input: MotivationEventInput,
  ): Promise<MotivationEventDto> {
    this.assertAdmin(user);
    const date = this.parseDate(input.date);
    const title = input.title?.trim().slice(0, MAX_TITLE);
    if (!title) throw new BadRequestException('Нужно название события');
    const row = await this.prisma.motivationEvent.upsert({
      where: { date_title: { date, title } },
      create: {
        date,
        title,
        greeting: input.greeting?.trim().slice(0, MAX_GREETING) || null,
        leadDays: this.parseLeadDays(input.leadDays),
        enabled: input.enabled ?? true,
      },
      update: {
        greeting: input.greeting?.trim().slice(0, MAX_GREETING) || null,
        leadDays: this.parseLeadDays(input.leadDays),
        enabled: input.enabled ?? true,
      },
    });
    return this.dto(this.toRow(row));
  }

  async remove(user: AccessTokenPayload, id: string): Promise<void> {
    this.assertAdmin(user);
    await this.prisma.motivationEvent.delete({ where: { id } }).catch(() => {
      throw new NotFoundException('Событие не найдено');
    });
  }

  /**
   * Собрать открытку из опубликованного поста. Автор может сделать открытку из
   * своего рилса, админ — из любого поста: чужие посты открыткой не станут,
   * иначе чужая картинка ушла бы гулять с чужим поздравлением.
   */
  async build(
    userId: string,
    user: AccessTokenPayload,
    postId: string,
    greetingInput?: string | null,
  ): Promise<MotivationPostcardResult> {
    const post = await this.prisma.motivationPost.findUnique({
      where: { id: postId },
      select: {
        id: true,
        imageUrl: true,
        status: true,
        authorUserId: true,
        origin: true,
        attributionSpeaker: true,
        attributionWork: true,
        attributionLocator: true,
        translations: { where: { language: 'ru' }, take: 1 },
      },
    });
    if (!post) throw new NotFoundException('Пост не найден');
    const mine = post.authorUserId === userId;
    if (!mine && !isAdmin(user))
      throw new ForbiddenException(
        'Открытку можно собрать только из своего рилса',
      );
    if (post.status !== 'published')
      throw new BadRequestException(
        'Открытка собирается из опубликованного поста',
      );
    if (!post.imageUrl)
      throw new BadRequestException('У поста ещё нет картинки');

    const event = await this.current();
    const greeting =
      greetingInput?.trim().slice(0, MAX_GREETING) ||
      event?.greeting ||
      event?.title ||
      null;
    if (!greeting)
      throw new BadRequestException(
        'Нет повода для открытки: попросите администратора завести событие',
      );

    const background = await this.fetchImage(post.imageUrl);
    const image = await composeStoryImage(background, {
      text: post.translations[0]?.storyText || post.translations[0]?.text || '',
      attribution: attributionLine(post),
      greeting,
    });
    const url = await this.generation.uploadStory(
      `motivation/postcards/${postId}/v${Date.now()}.png`,
      image,
    );
    await this.prisma.motivationPost.update({
      where: { id: postId },
      data: { postcardImageUrl: url, postcardEventTitle: greeting },
    });
    return { url, greeting };
  }

  /** Картинка поста лежит в нашем же S3 и отдаётся публично. */
  private async fetchImage(url: string): Promise<Buffer> {
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok)
      throw new BadRequestException('Не удалось прочитать картинку поста');
    return Buffer.from(await response.arrayBuffer());
  }

  private toRow(row: {
    id: string;
    date: Date;
    title: string;
    greeting: string | null;
    leadDays: number;
    enabled: boolean;
  }): EventRow {
    return row;
  }

  private dto(row: EventRow): MotivationEventDto {
    return {
      id: row.id,
      date: row.date.toISOString().slice(0, 10),
      title: row.title,
      greeting: row.greeting,
      leadDays: row.leadDays,
      enabled: row.enabled,
    };
  }

  private daysAgo(now: Date, days: number): Date {
    return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  }

  private parseDate(value: string | undefined): Date {
    const raw = value?.trim();
    const date = raw ? new Date(`${raw}T00:00:00.000Z`) : new Date(NaN);
    if (Number.isNaN(date.getTime()))
      throw new BadRequestException('Некорректная дата события');
    return date;
  }

  private parseLeadDays(value: number | undefined): number {
    if (value === undefined) return 3;
    if (!Number.isInteger(value) || value < 0 || value > MAX_LEAD_DAYS)
      throw new BadRequestException(
        `Показывать заранее можно от 0 до ${MAX_LEAD_DAYS} дней`,
      );
    return value;
  }

  private assertAdmin(user: AccessTokenPayload) {
    if (!isAdmin(user)) throw new ForbiddenException();
  }
}
