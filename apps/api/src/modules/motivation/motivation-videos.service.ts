import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AccessTokenPayload,
  MotivationVideoCategoryDto,
  MotivationVideoDto,
  MotivationVideoPage,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { feedCategories, feedCategoryWhere } from './feed-categories';
import { isAdmin } from './is-admin';
import { MotivationCategoriesService } from './motivation-categories.service';
import { MotivationGenerationService } from './motivation-generation.service';
import {
  decodeVideoCursor,
  videoCategoryMenu,
  videoCursorWhere,
  videoPage,
  videoPageSize,
} from './video-feed';
import {
  checkVideo,
  normalizeVideoInput,
  videoContentType,
  videoKey,
  videoMessage,
  type UploadedVideo,
} from './video-upload';

type VideoRow = {
  id: string;
  url: string;
  title: string;
  category: string;
  durationSeconds: number;
  createdAt: Date;
};

const VIDEO_SELECT = {
  id: true,
  url: true,
  title: true,
  category: true,
  durationSeconds: true,
  createdAt: true,
} as const;

/**
 * Короткие видео Вдохновения (VED-246) — отдельная лента «Видео».
 *
 * Загружает редакция, как готовые картинки (`MotivationPicturesService.create`):
 * ролик публикуется сразу, без очереди и проверки. Файл хранится как пришёл —
 * серверного перекодирования нет, поэтому тип, размер и длительность
 * проверяются на входе (`video-upload.ts`), а кладётся он тем же
 * `uploadStory`, что кадры и фоновая музыка: второй загрузчик в модуле
 * разошёлся бы с первым по настройкам хранилища.
 */
@Injectable()
export class MotivationVideosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categories: MotivationCategoriesService,
    private readonly generation: MotivationGenerationService,
  ) {}

  /** Лента: от новых к старым, одна или несколько папок через запятую. */
  async list(query: {
    cursor?: string;
    limit?: string;
    category?: string;
  }): Promise<MotivationVideoPage> {
    const limit = videoPageSize(query.limit);
    const after = videoCursorWhere(decodeVideoCursor(query.cursor));
    const inCategory = feedCategoryWhere(feedCategories(query.category)) ?? {};
    const [rows, total] = await Promise.all([
      this.prisma.motivationVideo.findMany({
        where: { ...inCategory, ...(after ?? {}) },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        select: VIDEO_SELECT,
      }),
      // Сколько роликов в ленте (VED-640) — только к первой странице:
      // дальше лента считает остаток сама.
      after ? null : this.prisma.motivationVideo.count({ where: inCategory }),
    ]);
    const page = videoPage(rows, limit);
    return {
      items: await this.toDtos(page.items),
      nextCursor: page.nextCursor,
      ...(total === null ? {} : { total }),
    };
  }

  /** Меню категорий ленты — только папки с роликами и их родители. */
  async categoryMenu(): Promise<MotivationVideoCategoryDto[]> {
    const [tree, counts] = await Promise.all([
      this.categories.publicTree(),
      this.prisma.motivationVideo.groupBy({
        by: ['category'],
        _count: { _all: true },
      }),
    ]);
    return videoCategoryMenu(
      tree,
      new Map(counts.map((row) => [row.category, row._count._all])),
    );
  }

  /** Поля формы: `file`, `category`, необязательные `title` и `durationSeconds`. */
  async create(
    user: AccessTokenPayload,
    file: UploadedVideo | undefined,
    body: unknown,
  ): Promise<MotivationVideoDto> {
    this.requireAdmin(user);
    const claimed =
      body && typeof body === 'object'
        ? (body as Record<string, unknown>).durationSeconds
        : undefined;
    const check = checkVideo(file, claimed);
    if (!check.ok) throw new BadRequestException(videoMessage(check.problem));
    const input = normalizeVideoInput(body);
    // Неизвестный слаг — ошибка, а не молчаливая папка по умолчанию, как у
    // картинок: ролик, который несли в «Шастры», не должен осесть в другом месте.
    const category = await this.categories.resolveSlug(input.category);

    const id = randomUUID();
    const url = await this.generation.uploadStory(
      videoKey(id, check.container, Date.now()),
      file!.buffer,
      videoContentType(check.container),
    );
    const row = await this.prisma.motivationVideo.create({
      data: {
        id,
        category,
        title: input.title,
        url,
        contentType: videoContentType(check.container),
        sizeBytes: file!.size,
        durationSeconds: check.durationSeconds,
        uploadedById: user.sub,
      },
      select: VIDEO_SELECT,
    });
    const [dto] = await this.toDtos([row]);
    return dto;
  }

  async remove(user: AccessTokenPayload, id: string): Promise<{ ok: true }> {
    this.requireAdmin(user);
    const row = await this.prisma.motivationVideo.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!row) throw new NotFoundException('Видео не найдено');
    // Файл в хранилище остаётся, как у фоновой музыки: ролик мог играть у
    // кого-то в эту секунду, а место дешевле оборванного просмотра.
    await this.prisma.motivationVideo.delete({ where: { id } });
    return { ok: true };
  }

  private async toDtos(rows: VideoRow[]): Promise<MotivationVideoDto[]> {
    const slugs = [...new Set(rows.map((row) => row.category))];
    const titles = slugs.length
      ? await this.prisma.motivationCategory.findMany({
          where: { slug: { in: slugs } },
          select: { slug: true, title: true },
        })
      : [];
    const titleOf = new Map(titles.map((row) => [row.slug, row.title]));
    return rows.map((row) => ({
      id: row.id,
      url: row.url,
      title: row.title,
      category: row.category,
      categoryTitle: titleOf.get(row.category) ?? '',
      durationSeconds: row.durationSeconds,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  private requireAdmin(user: AccessTokenPayload) {
    if (!isAdmin(user)) throw new ForbiddenException('Только администратор');
  }
}
