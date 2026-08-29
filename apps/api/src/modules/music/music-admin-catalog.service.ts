import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateMusicAlbumRequest,
  CreateMusicArtistRequest,
  CreateMusicCategoryRequest,
  CreateMusicPlaylistRequest,
  MusicCoverScope,
  UpdateMusicAlbumRequest,
  UpdateMusicArtistRequest,
  UpdateMusicCategoryRequest,
  UpdateMusicPlaylistRequest,
  UpdateMusicTrackRequest,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { MusicCoversService } from './music-covers.service';
import { buildMusicSlug, withMusicSlugSuffix } from './music-slug';
import { nextPosition } from './playlist-order';

const MAX_NAME_LENGTH = 160;
const MAX_BIO_LENGTH = 2000;
const MAX_LYRICS_LENGTH = 20_000;

/** Разумные границы года записи: раньше плёнки не было, вперёд — опечатка. */
const MIN_YEAR = 1900;
const MAX_YEAR = 2200;

/**
 * Справочники каталога. Заводит их только администрация: на исполнителях и
 * категориях висят фильтры выдачи, и пользовательский дрейф таксономии их
 * ломает. Загрузка записей людьми — этап 7, и она идёт через очередь
 * модерации, а не через эти маршруты.
 */
@Injectable()
export class MusicAdminCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly covers: MusicCoversService,
  ) {}

  private assertAdmin(viewerIsAdmin: boolean): void {
    if (!viewerIsAdmin) {
      throw new ForbiddenException('Доступ только для администратора сервиса');
    }
  }

  /**
   * Часть `data` с обложкой — или пустая, когда о ней не говорили.
   *
   * Владельца не сверяем: сюда доходит только администратор, а он и так
   * вправе снять или опубликовать любую запись. Сверять там ещё и того, кто
   * залил картинку, значило бы запретить второму администратору доделать
   * начатое первым.
   */
  private coverPatch(
    next: string | null | undefined,
    current: string | null,
    scope: MusicCoverScope,
  ): { coverKey?: string | null } {
    const value = this.covers.resolveKey({ next, current, scope });
    return value === undefined ? {} : { coverKey: value };
  }

  private text(
    value: string | null | undefined,
    field: string,
    max: number,
    required: boolean,
  ): string | null {
    if (value === undefined) return null;
    if (value === null) {
      if (required) throw new BadRequestException(`${field}: пустое значение`);
      return null;
    }
    const trimmed = value.trim();
    if (required && trimmed === '') {
      throw new BadRequestException(`${field}: пустое значение`);
    }
    if (trimmed.length > max) {
      throw new BadRequestException(`${field}: длиннее ${max} знаков`);
    }
    return trimmed === '' ? null : trimmed;
  }

  /**
   * Свободный слаг. Подбираем в цикле, а не одним запросом с суффиксом:
   * занятыми могут оказаться и `-2`, и `-3`, если одноимённых исполнителей
   * трое. Потолок попыток нужен, чтобы гонка не превратилась в вечный цикл.
   */
  private async freeSlug(
    base: string,
    taken: (slug: string) => Promise<boolean>,
  ): Promise<string> {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const candidate = withMusicSlugSuffix(base, attempt);
      if (!(await taken(candidate))) return candidate;
    }
    throw new BadRequestException('Не удалось подобрать адрес, измените имя');
  }

  // ---------- Исполнители ----------

  async createArtist(viewerIsAdmin: boolean, body: CreateMusicArtistRequest) {
    this.assertAdmin(viewerIsAdmin);
    const name = this.text(body.name, 'Имя', MAX_NAME_LENGTH, true)!;

    const slug = await this.freeSlug(buildMusicSlug(name), async (candidate) =>
      Boolean(
        await this.prisma.musicArtist.findUnique({
          where: { slug: candidate },
          select: { id: true },
        }),
      ),
    );

    return this.prisma.musicArtist.create({
      data: {
        slug,
        name,
        kind: body.kind ?? 'unknown',
        bio: this.text(body.bio, 'Описание', MAX_BIO_LENGTH, false),
        isVerified: body.isVerified ?? false,
        ...this.coverPatch(body.coverKey, null, 'artist'),
      },
    });
  }

  async updateArtist(
    viewerIsAdmin: boolean,
    id: string,
    body: UpdateMusicArtistRequest,
  ) {
    this.assertAdmin(viewerIsAdmin);
    const existing = await this.prisma.musicArtist.findUnique({
      where: { id },
      select: { id: true, coverKey: true },
    });
    if (!existing) throw new NotFoundException('Исполнитель не найден');

    return this.prisma.musicArtist.update({
      where: { id },
      data: {
        ...this.coverPatch(body.coverKey, existing.coverKey, 'artist'),
        // Слаг не переписываем вслед за именем: по нему уже ушли ссылки.
        ...(body.name === undefined
          ? {}
          : { name: this.text(body.name, 'Имя', MAX_NAME_LENGTH, true)! }),
        ...(body.kind === undefined ? {} : { kind: body.kind }),
        ...(body.bio === undefined
          ? {}
          : { bio: this.text(body.bio, 'Описание', MAX_BIO_LENGTH, false) }),
        ...(body.isVerified === undefined
          ? {}
          : { isVerified: body.isVerified }),
      },
    });
  }

  // ---------- Альбомы ----------

  async createAlbum(viewerIsAdmin: boolean, body: CreateMusicAlbumRequest) {
    this.assertAdmin(viewerIsAdmin);
    const title = this.text(body.title, 'Название', MAX_NAME_LENGTH, true)!;
    await this.assertArtistExists(body.artistId);

    const slug = await this.freeSlug(buildMusicSlug(title), async (candidate) =>
      Boolean(
        await this.prisma.musicAlbum.findUnique({
          where: { slug: candidate },
          select: { id: true },
        }),
      ),
    );

    return this.prisma.musicAlbum.create({
      data: {
        slug,
        title,
        artistId: body.artistId ?? null,
        kind: body.kind ?? 'album',
        year: this.year(body.year),
        ...this.coverPatch(body.coverKey, null, 'album'),
      },
    });
  }

  async updateAlbum(
    viewerIsAdmin: boolean,
    id: string,
    body: UpdateMusicAlbumRequest,
  ) {
    this.assertAdmin(viewerIsAdmin);
    const existing = await this.prisma.musicAlbum.findUnique({
      where: { id },
      select: { id: true, coverKey: true },
    });
    if (!existing) throw new NotFoundException('Альбом не найден');
    if (body.artistId !== undefined)
      await this.assertArtistExists(body.artistId);

    return this.prisma.musicAlbum.update({
      where: { id },
      data: {
        ...this.coverPatch(body.coverKey, existing.coverKey, 'album'),
        ...(body.title === undefined
          ? {}
          : {
              title: this.text(body.title, 'Название', MAX_NAME_LENGTH, true)!,
            }),
        ...(body.artistId === undefined ? {} : { artistId: body.artistId }),
        ...(body.kind === undefined ? {} : { kind: body.kind }),
        ...(body.year === undefined ? {} : { year: this.year(body.year) }),
      },
    });
  }

  private year(value: number | null | undefined): number | null {
    if (value === undefined || value === null) return null;
    if (!Number.isInteger(value) || value < MIN_YEAR || value > MAX_YEAR) {
      throw new BadRequestException(`Год: ожидается ${MIN_YEAR}–${MAX_YEAR}`);
    }
    return value;
  }

  private async assertArtistExists(artistId: string | null | undefined) {
    if (!artistId) return;
    const artist = await this.prisma.musicArtist.findUnique({
      where: { id: artistId },
      select: { id: true },
    });
    if (!artist) throw new BadRequestException('Исполнитель не найден');
  }

  // ---------- Категории ----------

  async createCategory(
    viewerIsAdmin: boolean,
    body: CreateMusicCategoryRequest,
  ) {
    this.assertAdmin(viewerIsAdmin);
    const title = this.text(body.title, 'Название', MAX_NAME_LENGTH, true)!;

    const slug = await this.freeSlug(buildMusicSlug(title), async (candidate) =>
      Boolean(
        await this.prisma.musicCategory.findUnique({
          where: { slug: candidate },
          select: { id: true },
        }),
      ),
    );

    return this.prisma.musicCategory.create({
      data: {
        slug,
        title,
        titleEn: this.text(
          body.titleEn,
          'Название на английском',
          MAX_NAME_LENGTH,
          false,
        ),
        position: body.position ?? 0,
      },
    });
  }

  async updateCategory(
    viewerIsAdmin: boolean,
    id: string,
    body: UpdateMusicCategoryRequest,
  ) {
    this.assertAdmin(viewerIsAdmin);
    const existing = await this.prisma.musicCategory.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Категория не найдена');

    return this.prisma.musicCategory.update({
      where: { id },
      data: {
        ...(body.title === undefined
          ? {}
          : {
              title: this.text(body.title, 'Название', MAX_NAME_LENGTH, true)!,
            }),
        ...(body.titleEn === undefined
          ? {}
          : {
              titleEn: this.text(
                body.titleEn,
                'Название на английском',
                MAX_NAME_LENGTH,
                false,
              ),
            }),
        ...(body.position === undefined ? {} : { position: body.position }),
      },
    });
  }

  /**
   * Удаление категории. Записи не трогаем — уходит только связь: категория
   * это ярлык, а не владелец записи, и «удалить киртан вместе с разделом»
   * было бы катастрофой в один клик.
   */
  async deleteCategory(viewerIsAdmin: boolean, id: string) {
    this.assertAdmin(viewerIsAdmin);
    const existing = await this.prisma.musicCategory.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Категория не найдена');

    await this.prisma.musicCategory.delete({ where: { id } });
    return { ok: true };
  }

  /**
   * Удаление исполнителя — только когда за ним ничего не числится.
   *
   * Каскада здесь нет намеренно: FK у альбома и записи `SetNull`, то есть
   * удаление живого исполнителя не унесло бы записи, а молча обезличило их —
   * полсотни киртанов вдруг «без исполнителя», и восстановить связь нечем.
   * Пусть редакция сперва перевесит записи, а потом удаляет справочник.
   */
  async deleteArtist(viewerIsAdmin: boolean, id: string) {
    this.assertAdmin(viewerIsAdmin);
    const existing = await this.prisma.musicArtist.findUnique({
      where: { id },
      select: {
        id: true,
        _count: { select: { tracks: true, albums: true } },
      },
    });
    if (!existing) throw new NotFoundException('Исполнитель не найден');

    const { tracks, albums } = existing._count;
    if (tracks > 0 || albums > 0) {
      throw new ConflictException(
        `Сначала перевесьте на другого исполнителя: записей — ${tracks}, альбомов — ${albums}`,
      );
    }

    await this.prisma.musicArtist.delete({ where: { id } });
    return { ok: true };
  }

  /** Удаление альбома — по той же причине только у пустого. */
  async deleteAlbum(viewerIsAdmin: boolean, id: string) {
    this.assertAdmin(viewerIsAdmin);
    const existing = await this.prisma.musicAlbum.findUnique({
      where: { id },
      select: { id: true, _count: { select: { tracks: true } } },
    });
    if (!existing) throw new NotFoundException('Альбом не найден');

    if (existing._count.tracks > 0) {
      throw new ConflictException(
        `Сначала перевесьте записи на другой альбом: их ${existing._count.tracks}`,
      );
    }

    await this.prisma.musicAlbum.delete({ where: { id } });
    return { ok: true };
  }

  // ---------- Подборки портала ----------

  /**
   * Подборки редакции. Живут в тех же таблицах, что личные плейлисты, но
   * заводятся и правятся только отсюда: витрина показывает их всем, и
   * пользовательский плейлист, случайно ставший общим, — это не опечатка, а
   * чужая подборка на главной странице сервиса.
   *
   * Владельцем записывается заведший её администратор. Связь `SetNull`, так
   * что его уход подборку не унесёт.
   */
  async listSystemPlaylists(viewerIsAdmin: boolean) {
    this.assertAdmin(viewerIsAdmin);
    return this.prisma.musicPlaylist.findMany({
      where: { isSystem: true },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        description: true,
        coverKey: true,
        trackCount: true,
        updatedAt: true,
      },
    });
  }

  async createSystemPlaylist(
    viewerIsAdmin: boolean,
    adminId: string,
    body: CreateMusicPlaylistRequest,
  ) {
    this.assertAdmin(viewerIsAdmin);
    const title = this.text(body.title, 'Название', MAX_NAME_LENGTH, true)!;

    return this.prisma.musicPlaylist.create({
      data: {
        ownerId: adminId,
        title,
        description: this.text(body.description, 'Описание', 500, false),
        // Подборка портала на то и портальная: видна всем и без отдельного
        // переключателя видимости.
        visibility: 'public',
        isSystem: true,
        ...this.coverPatch(body.coverKey, null, 'playlist'),
      },
    });
  }

  async updateSystemPlaylist(
    viewerIsAdmin: boolean,
    id: string,
    body: UpdateMusicPlaylistRequest,
  ) {
    this.assertAdmin(viewerIsAdmin);
    const existing = await this.systemPlaylist(id);

    return this.prisma.musicPlaylist.update({
      where: { id },
      data: {
        ...this.coverPatch(body.coverKey, existing.coverKey, 'playlist'),
        ...(body.title === undefined
          ? {}
          : {
              title: this.text(body.title, 'Название', MAX_NAME_LENGTH, true)!,
            }),
        ...(body.description === undefined
          ? {}
          : {
              description: this.text(body.description, 'Описание', 500, false),
            }),
      },
    });
  }

  async deleteSystemPlaylist(viewerIsAdmin: boolean, id: string) {
    this.assertAdmin(viewerIsAdmin);
    await this.systemPlaylist(id);
    // Записи уходят каскадом: подборка — это порядок ссылок, а не владелец
    // записей, и «удалить киртан вместе с подборкой» было бы катастрофой
    // в один клик. Тот же счёт, что у категорий.
    await this.prisma.musicPlaylist.delete({ where: { id } });
    return { ok: true };
  }

  /** Добавление идемпотентно: кнопку нажимают дважды. */
  async addSystemTrack(viewerIsAdmin: boolean, id: string, trackId: string) {
    this.assertAdmin(viewerIsAdmin);
    await this.systemPlaylist(id);

    const track = await this.prisma.musicTrack.findUnique({
      where: { id: trackId },
      select: { id: true, status: true },
    });
    // В общую подборку кладём только опубликованное: иначе человек с витрины
    // упирается в запись, которую ему слушать нельзя.
    if (!track || track.status !== 'published') {
      throw new BadRequestException('Запись не опубликована');
    }

    const existing = await this.prisma.musicPlaylistItem.findUnique({
      where: { playlistId_trackId: { playlistId: id, trackId } },
      select: { id: true },
    });
    if (existing) return { ok: true };

    const last = await this.prisma.musicPlaylistItem.findFirst({
      where: { playlistId: id },
      orderBy: { position: 'desc' },
      select: { position: true },
    });

    await this.prisma.$transaction([
      this.prisma.musicPlaylistItem.create({
        data: {
          playlistId: id,
          trackId,
          position: nextPosition(last?.position ?? null),
        },
      }),
      this.prisma.musicPlaylist.update({
        where: { id },
        data: { trackCount: { increment: 1 } },
      }),
    ]);

    return { ok: true };
  }

  async removeSystemTrack(viewerIsAdmin: boolean, id: string, trackId: string) {
    this.assertAdmin(viewerIsAdmin);
    await this.systemPlaylist(id);

    const { count } = await this.prisma.musicPlaylistItem.deleteMany({
      where: { playlistId: id, trackId },
    });
    if (count > 0) {
      await this.prisma.musicPlaylist.update({
        where: { id },
        data: { trackCount: { decrement: count } },
      });
    }

    return { ok: true };
  }

  /** Существует и именно подборка: личный плейлист отсюда не правится. */
  private async systemPlaylist(id: string) {
    const row = await this.prisma.musicPlaylist.findUnique({
      where: { id },
      select: { id: true, isSystem: true, coverKey: true },
    });
    if (!row) throw new NotFoundException('Подборка не найдена');
    if (!row.isSystem) {
      throw new ForbiddenException('Это личный плейлист, а не подборка');
    }
    return row;
  }

  // ---------- Карточка записи ----------

  /**
   * Правка метаданных записи. Файла здесь нет и быть не может: он приезжает
   * загрузкой, и подменить его правкой карточки нельзя — иначе по знакомой
   * ссылке однажды заиграет другое.
   */
  async updateTrack(
    viewerIsAdmin: boolean,
    id: string,
    body: UpdateMusicTrackRequest,
  ) {
    this.assertAdmin(viewerIsAdmin);
    const existing = await this.prisma.musicTrack.findUnique({
      where: { id },
      select: { id: true, status: true, publishedAt: true, coverKey: true },
    });
    if (!existing) throw new NotFoundException('Запись не найдена');

    if (body.artistId !== undefined)
      await this.assertArtistExists(body.artistId);
    if (body.albumId !== undefined && body.albumId !== null) {
      const album = await this.prisma.musicAlbum.findUnique({
        where: { id: body.albumId },
        select: { id: true },
      });
      if (!album) throw new BadRequestException('Альбом не найден');
    }

    // Дата публикации проставляется один раз, при первом переходе в
    // `published`: иначе повторное снятие и возврат записи поднимали бы её
    // в «Новом» как свежую.
    const becomesPublished =
      body.status === 'published' && existing.publishedAt === null;

    return this.prisma.$transaction(async (tx) => {
      if (body.categoryIds !== undefined) {
        await this.replaceCategories(tx, id, body.categoryIds);
      }

      return tx.musicTrack.update({
        where: { id },
        data: {
          // Снятая обложка записи возвращает её к обложке альбома, а та — к
          // обложке исполнителя: цепочку строит `resolveTrackCoverKey`.
          ...this.coverPatch(body.coverKey, existing.coverKey, 'track'),
          ...(body.title === undefined
            ? {}
            : {
                title: this.text(
                  body.title,
                  'Название',
                  MAX_NAME_LENGTH,
                  true,
                )!,
              }),
          ...(body.artistId === undefined ? {} : { artistId: body.artistId }),
          ...(body.albumId === undefined ? {} : { albumId: body.albumId }),
          ...(body.language === undefined
            ? {}
            : { language: this.text(body.language, 'Язык', 16, false) }),
          ...(body.isLiveRecording === undefined
            ? {}
            : { isLiveRecording: body.isLiveRecording }),
          ...(body.status === undefined ? {} : { status: body.status }),
          ...(becomesPublished ? { publishedAt: new Date() } : {}),
          ...(body.lyrics === undefined
            ? {}
            : {
                lyrics: this.text(
                  body.lyrics,
                  'Текст',
                  MAX_LYRICS_LENGTH,
                  false,
                ),
              }),
          ...(body.transliteration === undefined
            ? {}
            : {
                transliteration: this.text(
                  body.transliteration,
                  'Транслитерация',
                  MAX_LYRICS_LENGTH,
                  false,
                ),
              }),
          ...(body.translation === undefined
            ? {}
            : {
                translation: this.text(
                  body.translation,
                  'Перевод',
                  MAX_LYRICS_LENGTH,
                  false,
                ),
              }),
        },
        include: {
          artist: true,
          album: { include: { artist: true } },
          categories: { include: { category: true } },
        },
      });
    });
  }

  private async replaceCategories(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    trackId: string,
    categoryIds: string[],
  ) {
    const unique = [...new Set(categoryIds)];
    if (unique.length > 0) {
      const found = await tx.musicCategory.findMany({
        where: { id: { in: unique } },
        select: { id: true },
      });
      if (found.length !== unique.length) {
        throw new BadRequestException('Категория не найдена');
      }
    }

    await tx.musicTrackCategory.deleteMany({ where: { trackId } });
    if (unique.length > 0) {
      await tx.musicTrackCategory.createMany({
        data: unique.map((categoryId) => ({ trackId, categoryId })),
      });
    }
  }
}
