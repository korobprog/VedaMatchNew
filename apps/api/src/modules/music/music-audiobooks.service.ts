import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  CreateMusicAudiobookRequest,
  MusicAdminAudiobookChapterDto,
  MusicAdminAudiobooksDto,
  MusicAudiobookCardDto,
  MusicAudiobookPageDto,
  MusicAudiobooksDto,
  MusicTrackStatus,
  SetMusicAudiobookChaptersRequest,
  UpdateMusicAudiobookRequest,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  MAX_AUDIOBOOK_CHAPTERS,
  findChapterConflict,
  normalizeChapterIds,
} from './music-audiobook-chapters';
import { resolveAudiobookResume } from './music-audiobook-resume';
import { musicCoverBaseUrl } from './music-cover-file';
import { MusicCoversService } from './music-covers.service';
import { buildMusicSlug, withMusicSlugSuffix } from './music-slug';
import { buildCoverUrl, toMusicTrackDto } from './music-track-dto';

const MAX_TITLE_LENGTH = 160;
const MAX_AUTHOR_LENGTH = 160;
const MAX_DESCRIPTION_LENGTH = 2000;
/** Сколько записей показывает подбор глав в редакторе за один запрос. */
const CANDIDATES_LIMIT = 40;
/** Потолок списка «не в книге»: дальше редакция ищет поиском. */
const UNASSIGNED_LIMIT = 200;

/**
 * Карточка записи для главы. Та же, что у каталога (`TRACK_CARD_INCLUDE` в
 * `music-catalog.service.ts`) — плеер и строка списка собираются из
 * `MusicTrackDto` одинаково, где бы запись ни показывалась.
 */
const CHAPTER_TRACK_INCLUDE = {
  artist: true,
  album: { include: { artist: true } },
  categories: { include: { category: true } },
} as const;

/** Что нужно карточке книги: чтец и длительности опубликованных глав. */
const CARD_INCLUDE = {
  reader: { select: { id: true, slug: true, name: true, coverKey: true } },
  chapters: {
    where: { track: { status: 'published' as const } },
    select: { track: { select: { durationSeconds: true } } },
  },
} as const;

/** Глава в редакторе: без обложек и категорий, зато со статусом. */
const ADMIN_CHAPTER_TRACK_SELECT = {
  id: true,
  title: true,
  status: true,
  durationSeconds: true,
  artist: { select: { name: true } },
} as const;

interface CardRow {
  id: string;
  slug: string;
  title: string;
  author: string | null;
  coverKey: string | null;
  reader: {
    id: string;
    slug: string;
    name: string;
    coverKey: string | null;
  } | null;
  chapters: { track: { durationSeconds: number } }[];
}

interface AdminChapterTrackRow {
  id: string;
  title: string;
  status: MusicTrackStatus;
  durationSeconds: number;
  artist: { name: string } | null;
}

/**
 * Аудиокниги (VED-237 → VED-297): раздел за кнопкой «Аудиокниги» и
 * редактор книг в админке Музыки.
 *
 * Книга — самостоятельная единица: название, обложка, автор текста, чтец и
 * главы по порядку. Глава — обычная запись каталога, поэтому плеер, очередь,
 * «Скачать», офлайн и тексты работают у главы без единой строчки здесь, а
 * место, где человек остановился, берётся из позиций плеера
 * (`MusicPlayState`).
 */
@Injectable()
export class MusicAudiobooksService {
  private readonly publicBaseUrl: string | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly covers: MusicCoversService,
    config: ConfigService,
  ) {
    this.publicBaseUrl = musicCoverBaseUrl(
      config.get<string>('API_PUBLIC_URL'),
    );
  }

  // ---------- Раздел ----------

  /**
   * Книги раздела по названию. Черновик и книга без единой опубликованной
   * главы не показываются: плитка, за которой нечего слушать, — обещание,
   * которого нет (та же причина, по которой витрина прячет исполнителей без
   * записей).
   */
  async list(): Promise<MusicAudiobooksDto> {
    const rows = await this.prisma.musicAudiobook.findMany({
      where: {
        isPublished: true,
        chapters: { some: { track: { status: 'published' } } },
      },
      include: CARD_INCLUDE,
      orderBy: [{ title: 'asc' }, { id: 'asc' }],
    });
    return { books: rows.map((row) => this.toCard(row)) };
  }

  /**
   * Страница книги: главы по порядку и место, где человек остановился.
   *
   * Черновик открывается только редакции — ей нужно посмотреть книгу до
   * публикации. Остальным — 404, а не 403: существование черновика тоже
   * сведения о нём.
   */
  async page(
    slug: string,
    viewerId: string | null,
    viewerIsAdmin: boolean,
  ): Promise<MusicAudiobookPageDto> {
    const book = await this.prisma.musicAudiobook.findUnique({
      where: { slug },
      include: CARD_INCLUDE,
    });
    if (!book) throw new NotFoundException('Книга не найдена');

    const visible =
      viewerIsAdmin || (book.isPublished && book.chapters.length > 0);
    if (!visible) throw new NotFoundException('Книга не найдена');

    const chapters = await this.prisma.musicAudiobookChapter.findMany({
      where: { audiobookId: book.id, track: { status: 'published' } },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      include: { track: { include: CHAPTER_TRACK_INCLUDE } },
    });

    const states =
      viewerId && chapters.length > 0
        ? await this.prisma.musicPlayState.findMany({
            where: {
              userId: viewerId,
              trackId: { in: chapters.map((row) => row.trackId) },
            },
            select: { trackId: true, positionSeconds: true, updatedAt: true },
          })
        : [];

    return {
      book: { ...this.toCard(book), description: book.description },
      chapters: chapters.map((row) =>
        toMusicTrackDto(row.track, this.publicBaseUrl),
      ),
      resume: resolveAudiobookResume(
        chapters.map((row) => ({
          trackId: row.trackId,
          durationSeconds: row.track.durationSeconds,
        })),
        states,
      ),
    };
  }

  /** Книги в чтении исполнителя — для его страницы. */
  async byReader(readerId: string): Promise<MusicAudiobookCardDto[]> {
    const rows = await this.prisma.musicAudiobook.findMany({
      where: {
        readerId,
        isPublished: true,
        chapters: { some: { track: { status: 'published' } } },
      },
      include: CARD_INCLUDE,
      orderBy: [{ title: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => this.toCard(row));
  }

  private toCard(row: CardRow): MusicAudiobookCardDto {
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      author: row.author,
      reader: row.reader
        ? { id: row.reader.id, slug: row.reader.slug, name: row.reader.name }
        : null,
      coverUrl: buildCoverUrl(
        this.publicBaseUrl,
        row.coverKey ?? row.reader?.coverKey ?? null,
      ),
      chapterCount: row.chapters.length,
      totalSeconds: row.chapters.reduce(
        (sum, chapter) => sum + chapter.track.durationSeconds,
        0,
      ),
    };
  }

  // ---------- Редактор ----------

  private assertAdmin(viewerIsAdmin: boolean): void {
    if (!viewerIsAdmin) {
      throw new ForbiddenException('Доступ только для администратора сервиса');
    }
  }

  private text(
    value: string | null | undefined,
    field: string,
    max: number,
    required: boolean,
  ): string | null {
    if (value === undefined || value === null) {
      if (required) throw new BadRequestException(`${field}: пустое значение`);
      return null;
    }
    if (typeof value !== 'string') {
      throw new BadRequestException(`${field}: ожидается строка`);
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

  private async assertReader(readerId: string | null | undefined) {
    if (readerId === null || readerId === undefined) return;
    const reader = await this.prisma.musicArtist.findUnique({
      where: { id: readerId },
      select: { id: true },
    });
    if (!reader) throw new BadRequestException('Чтец не найден');
  }

  /**
   * Свободный слаг. Тот же приём, что у справочников в
   * `music-admin-catalog.service.ts` (там он приватный — дублируем, а не
   * тянем чужой класс ради одного цикла).
   */
  private async freeSlug(title: string): Promise<string> {
    const base = buildMusicSlug(title);
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const candidate = withMusicSlugSuffix(base, attempt);
      const taken = await this.prisma.musicAudiobook.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      if (!taken) return candidate;
    }
    throw new BadRequestException(
      'Не удалось подобрать адрес, измените название',
    );
  }

  async adminList(viewerIsAdmin: boolean): Promise<MusicAdminAudiobooksDto> {
    this.assertAdmin(viewerIsAdmin);
    const [books, unassigned] = await Promise.all([
      this.prisma.musicAudiobook.findMany({
        include: {
          reader: { select: { name: true } },
          chapters: {
            orderBy: [{ position: 'asc' }, { id: 'asc' }],
            select: { track: { select: ADMIN_CHAPTER_TRACK_SELECT } },
          },
        },
        orderBy: [{ title: 'asc' }, { id: 'asc' }],
      }),
      // Записи чтецов, не разложенные по книгам. В Медиатеке их нет (чтец
      // отмечен), в разделе тоже (не глава), — без этого списка они
      // пропадали бы из виду совсем.
      this.prisma.musicTrack.findMany({
        where: {
          artist: { isAudiobook: true },
          audiobookChapter: { is: null },
        },
        select: ADMIN_CHAPTER_TRACK_SELECT,
        orderBy: [{ title: 'asc' }, { id: 'asc' }],
        take: UNASSIGNED_LIMIT,
      }),
    ]);

    return {
      books: books.map((row) => ({
        id: row.id,
        slug: row.slug,
        title: row.title,
        author: row.author,
        description: row.description,
        readerId: row.readerId,
        readerName: row.reader?.name ?? null,
        coverKey: row.coverKey,
        coverUrl: buildCoverUrl(this.publicBaseUrl, row.coverKey),
        isPublished: row.isPublished,
        chapters: row.chapters.map((chapter) =>
          this.toAdminChapter(chapter.track),
        ),
      })),
      unassigned: unassigned.map((row) => this.toAdminChapter(row)),
    };
  }

  private toAdminChapter(
    row: AdminChapterTrackRow,
  ): MusicAdminAudiobookChapterDto {
    return {
      trackId: row.id,
      title: row.title,
      status: row.status,
      durationSeconds: row.durationSeconds,
      artistName: row.artist?.name ?? null,
    };
  }

  /**
   * Подбор глав: записи, которые ещё не главы ни одной книги. Со словом —
   * поиск по названию и исполнителю по всему каталогу; без слова — записи
   * чтеца книги, с них редакция и начинает.
   */
  async candidates(
    viewerIsAdmin: boolean,
    q: string | null,
    readerId: string | null,
  ): Promise<MusicAdminAudiobookChapterDto[]> {
    this.assertAdmin(viewerIsAdmin);
    const word = q?.trim().slice(0, 100) || null;
    if (!word && !readerId) return [];

    const rows = await this.prisma.musicTrack.findMany({
      where: {
        audiobookChapter: { is: null },
        ...(word
          ? {
              OR: [
                { title: { contains: word, mode: 'insensitive' as const } },
                {
                  artist: {
                    name: { contains: word, mode: 'insensitive' as const },
                  },
                },
              ],
            }
          : { artistId: readerId }),
      },
      select: ADMIN_CHAPTER_TRACK_SELECT,
      orderBy: [{ title: 'asc' }, { id: 'asc' }],
      take: CANDIDATES_LIMIT,
    });
    return rows.map((row) => this.toAdminChapter(row));
  }

  async create(viewerIsAdmin: boolean, body: CreateMusicAudiobookRequest) {
    this.assertAdmin(viewerIsAdmin);
    const title = this.text(body.title, 'Название', MAX_TITLE_LENGTH, true)!;
    await this.assertReader(body.readerId);
    const coverKey = this.covers.resolveKey({
      next: body.coverKey,
      current: null,
      scope: 'audiobook',
    });

    const created = await this.prisma.musicAudiobook.create({
      data: {
        slug: await this.freeSlug(title),
        title,
        author: this.text(body.author, 'Автор', MAX_AUTHOR_LENGTH, false),
        description: this.text(
          body.description,
          'Описание',
          MAX_DESCRIPTION_LENGTH,
          false,
        ),
        readerId: body.readerId ?? null,
        coverKey: coverKey ?? null,
        isPublished: body.isPublished === true,
      },
      select: { id: true, slug: true },
    });
    return created;
  }

  async update(
    viewerIsAdmin: boolean,
    id: string,
    body: UpdateMusicAudiobookRequest,
  ) {
    this.assertAdmin(viewerIsAdmin);
    const existing = await this.book(id);
    if (body.readerId !== undefined) await this.assertReader(body.readerId);
    const coverKey = this.covers.resolveKey({
      next: body.coverKey,
      current: existing.coverKey,
      scope: 'audiobook',
    });

    // Слаг не меняется вслед за названием: ссылку на книгу могли уже
    // переслать, и правка опечатки не должна её ломать.
    return this.prisma.musicAudiobook.update({
      where: { id },
      data: {
        ...(body.title === undefined
          ? {}
          : {
              title: this.text(body.title, 'Название', MAX_TITLE_LENGTH, true)!,
            }),
        ...(body.author === undefined
          ? {}
          : {
              author: this.text(body.author, 'Автор', MAX_AUTHOR_LENGTH, false),
            }),
        ...(body.description === undefined
          ? {}
          : {
              description: this.text(
                body.description,
                'Описание',
                MAX_DESCRIPTION_LENGTH,
                false,
              ),
            }),
        ...(body.readerId === undefined ? {} : { readerId: body.readerId }),
        ...(coverKey === undefined ? {} : { coverKey }),
        ...(typeof body.isPublished === 'boolean'
          ? { isPublished: body.isPublished }
          : {}),
      },
      select: { id: true, slug: true },
    });
  }

  /**
   * Удаление книги. Записи остаются в каталоге — книга только порядок
   * ссылок на них, как подборка: «удалить главы вместе с книгой» было бы
   * потерей файлов в один клик. Записи чтеца после этого снова видны
   * редакции в списке «не в книге».
   */
  async remove(viewerIsAdmin: boolean, id: string) {
    this.assertAdmin(viewerIsAdmin);
    await this.book(id);
    await this.prisma.musicAudiobook.delete({ where: { id } });
    return { ok: true };
  }

  /**
   * Состав книги целиком, по порядку. Одним действием и в одной транзакции:
   * порядок в базе всегда плотный, с единицы, и прерванная перестановка не
   * оставляет двух глав на одном месте.
   */
  async setChapters(
    viewerIsAdmin: boolean,
    id: string,
    body: SetMusicAudiobookChaptersRequest,
  ) {
    this.assertAdmin(viewerIsAdmin);
    await this.book(id);

    const ids = normalizeChapterIds(body?.trackIds);
    if (!ids) throw new BadRequestException('Ожидается список записей');
    if (ids.length > MAX_AUDIOBOOK_CHAPTERS) {
      throw new BadRequestException(
        `В книге не больше ${MAX_AUDIOBOOK_CHAPTERS} глав`,
      );
    }

    const [found, owners] = await Promise.all([
      this.prisma.musicTrack.count({ where: { id: { in: ids } } }),
      this.prisma.musicAudiobookChapter.findMany({
        where: { trackId: { in: ids } },
        select: {
          trackId: true,
          audiobookId: true,
          audiobook: { select: { title: true } },
        },
      }),
    ]);
    if (found !== ids.length) {
      throw new BadRequestException(
        'Часть записей не найдена — обновите страницу',
      );
    }

    const conflict = findChapterConflict(
      ids,
      id,
      owners.map((row) => ({
        trackId: row.trackId,
        audiobookId: row.audiobookId,
        audiobookTitle: row.audiobook.title,
      })),
    );
    if (conflict) {
      throw new BadRequestException(
        `Запись уже глава книги «${conflict.audiobookTitle}» — сначала уберите её оттуда`,
      );
    }

    await this.prisma.$transaction([
      this.prisma.musicAudiobookChapter.deleteMany({
        where: { audiobookId: id },
      }),
      this.prisma.musicAudiobookChapter.createMany({
        data: ids.map((trackId, at) => ({
          audiobookId: id,
          trackId,
          position: at + 1,
        })),
      }),
      // `updatedAt` книги — «когда её последний раз собирали».
      this.prisma.musicAudiobook.update({
        where: { id },
        data: { updatedAt: new Date() },
      }),
    ]);

    return { ok: true, chapterCount: ids.length };
  }

  private async book(id: string) {
    const row = await this.prisma.musicAudiobook.findUnique({
      where: { id },
      select: { id: true, coverKey: true, readerId: true },
    });
    if (!row) throw new NotFoundException('Книга не найдена');
    return row;
  }
}
