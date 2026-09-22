import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  LineageId,
  LineagePreference,
  MusicAlbumPageDto,
  MusicArtistPageDto,
  MusicAudiobooksDto,
  MusicCatalogDto,
  MusicCategoryDto,
  MusicPlaylistCardDto,
  MusicTrackDetailDto,
  MusicTrackListDto,
} from '@vedamatch/shared';
import { resolveContentLineage, toLineagePreference } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import type { NormalizedMusicTrackQuery } from './music-catalog-query';
import {
  audiobookArtistCondition,
  audiobookScopeCondition,
} from './music-audiobook-scope';
import { countTracksByCategory } from './music-category-counts';
import {
  buildCoverUrl,
  toMusicAlbumDto,
  toMusicArtistDto,
  toMusicCategoryDto,
  toMusicTrackDetailDto,
  toMusicTrackDto,
} from './music-track-dto';
import { musicCoverBaseUrl } from './music-cover-file';

/** Сколько записей и исполнителей показывает витрина. Ровно как в мокапах. */
const SHOWCASE_FRESH = 10;
/**
 * Исполнителей витрина показывает всех — рядами по четыре (VED-224). Прежний
 * предел в восемь молча прятал девятого. Потолок — только страховка от
 * запроса без границы: справочник редакционный и столько не наберёт.
 */
const SHOWCASE_ARTISTS = 100;
const SHOWCASE_PLAYLISTS = 4;
/**
 * Сколько записей отдаёт раздел «Аудиокниги» (VED-237). Больше витрины:
 * глава книги без соседних глав бесполезна, а листать раздел «показать
 * ещё» пока незачем — счёт книг идёт на единицы. Упрётся — здесь и
 * появится курсор, как у каталога.
 */
const AUDIOBOOK_TRACKS = 200;

/**
 * `include` карточки каталога. Одной константой, чтобы выдача витрины,
 * поиска, страницы исполнителя и страницы альбома не разъезжалась в полях:
 * сборка DTO у них общая, и молчаливо недостающее поле там всплывёт как
 * `undefined`, а не как ошибка типов.
 */
const TRACK_CARD_INCLUDE = {
  artist: true,
  album: { include: { artist: true } },
  categories: { include: { category: true } },
} as const;

/**
 * Условие по линии как элемент массива `AND` — то же самое, что кладёт в
 * `where` `lineageCondition()`, но без обёртки `{ AND: [...] }`. Отдельная
 * функция, а не чтение `.AND` у `lineageCondition()`: тип последней —
 * объединение `{} | { AND: [...] }`, и `'AND' in lineageFilter` для TS не
 * сужает его настолько, чтобы спред `...lineageFilter.AND` прошёл проверку
 * типов. Массив вместо объекта ещё и переиспользуется в `listTracks`, где
 * условие линии кладётся в общий `AND` вместе с фильтром по категориям
 * (VED-165) — двумя разными ключами `categories` в одном объекте их не
 * сложить, второй спред молча стёр бы первый.
 */
function lineageAndConditions(lineage: LineageId | null) {
  return lineage ? [{ OR: [{ lineage }, { lineage: null }] }] : [];
}

/**
 * Условие по линии: своя плюс записи «для всех» (`null`). Завёрнуто в
 * `AND`, а не положено в `where` как `OR`: `OR` в поиске уже занят словом
 * (название или исполнитель), и второй `OR` молча перетёр бы первый. Пустой
 * объект, когда фильтра нет.
 */
export function lineageCondition(lineage: LineageId | null) {
  const and = lineageAndConditions(lineage);
  return and.length ? { AND: and } : {};
}

@Injectable()
export class MusicCatalogService {
  private readonly publicBaseUrl: string | undefined;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    // Обложки лежат открыто и раздаются напрямую; аудио — нет, оно уйдёт
    // подписанной ссылкой на этапе 2.
    this.publicBaseUrl = musicCoverBaseUrl(
      config.get<string>('API_PUBLIC_URL'),
    );
  }

  /**
   * Витрина одним запросом. Секции собираются параллельно: они не зависят
   * друг от друга, а последовательные `await` превратили бы открытие
   * страницы в сумму четырёх задержек базы.
   */
  async showcase(
    viewerId: string | null = null,
    /**
     * Выбранная корневая вкладка (VED-165). Нужна только счётчикам стилей:
     * под «Традиционным» чип стиля обязан обещать ровно то, что откроется по
     * нажатию, а не число по всему каталогу.
     */
    rootSlug: string | null = null,
  ): Promise<MusicCatalogDto> {
    const lineage = await this.viewerLineage(viewerId, null);
    // Аудиокниги живут отдельным разделом (VED-237) и в витрину не идут ни
    // записями, ни карточками чтецов, ни числом над заголовком.
    const notAudiobook = audiobookScopeCondition('catalog');

    const [categories, fresh, artists, systemPlaylists, totalTracks] =
      await Promise.all([
        this.listCategories(rootSlug),
        this.prisma.musicTrack.findMany({
          where: {
            status: 'published',
            AND: [...lineageAndConditions(lineage), notAudiobook],
          },
          include: TRACK_CARD_INCLUDE,
          orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
          take: SHOWCASE_FRESH,
        }),
        this.listShowcaseArtists(),
        this.listSystemPlaylists(),
        // Тот же фильтр, что у «нового»: число отвечает на «сколько я
        // реально вижу», а не «сколько есть в базе вообще».
        this.prisma.musicTrack.count({
          where: {
            status: 'published',
            AND: [...lineageAndConditions(lineage), notAudiobook],
          },
        }),
      ]);

    return {
      categories,
      fresh: fresh.map((row) => toMusicTrackDto(row, this.publicBaseUrl)),
      artists,
      systemPlaylists,
      totalTracks,
    };
  }

  async listCategories(
    rootSlug: string | null = null,
  ): Promise<MusicCategoryDto[]> {
    const categories = await this.prisma.musicCategory.findMany({
      orderBy: [{ position: 'asc' }, { title: 'asc' }],
    });

    // Стиль считается прямой связью записи, корневая (VED-165-2) — через
    // исполнителя: см. `music-category-counts.ts`.
    const byCategory = await countTracksByCategory(this.prisma, true, rootSlug);

    return categories.map((row) =>
      toMusicCategoryDto(row, byCategory.get(row.id) ?? 0),
    );
  }

  private async listShowcaseArtists(
    scope: 'catalog' | 'audiobooks' = 'catalog',
  ) {
    // Исполнители без единой опубликованной записи в витрине не нужны:
    // кружок, ведущий на пустую страницу, — обещание, которого нет.
    const artists = await this.prisma.musicArtist.findMany({
      where: {
        ...audiobookArtistCondition(scope),
        tracks: { some: { status: 'published' } },
      },
      include: {
        _count: { select: { tracks: { where: { status: 'published' } } } },
      },
      orderBy: [{ isVerified: 'desc' }, { name: 'asc' }],
      take: SHOWCASE_ARTISTS,
    });

    return artists.map((row) =>
      toMusicArtistDto(row, row._count.tracks, this.publicBaseUrl),
    );
  }

  /**
   * Подборки редакции. До этапа 4, где появляется работа с плейлистами,
   * список пуст — и это правильный пустой список, а не заглушка: секция
   * витрины существует, наполнять её будет админка.
   */
  private async listSystemPlaylists(): Promise<MusicPlaylistCardDto[]> {
    const playlists = await this.prisma.musicPlaylist.findMany({
      // Пустая подборка в витрине — обещание, за которым ничего нет: та же
      // причина, по которой отсюда убраны исполнители без записей.
      where: { isSystem: true, visibility: 'public', trackCount: { gt: 0 } },
      include: {
        items: { select: { track: { select: { durationSeconds: true } } } },
      },
      orderBy: { updatedAt: 'desc' },
      take: SHOWCASE_PLAYLISTS,
    });

    return playlists.map((row) => ({
      id: row.id,
      title: row.title,
      coverUrl: buildCoverUrl(this.publicBaseUrl, row.coverKey),
      trackCount: row.trackCount,
      totalSeconds: row.items.reduce(
        (sum, item) => sum + item.track.durationSeconds,
        0,
      ),
    }));
  }

  /**
   * Поиск и фильтры. Курсор — id последней отданной записи, а не смещение:
   * при `OFFSET` свежая публикация сдвигает страницу и человек второй раз
   * видит одно и то же.
   */
  async listTracks(
    query: NormalizedMusicTrackQuery,
    viewerId: string | null = null,
    /**
     * Срез каталога (VED-237). По умолчанию — обычная Медиатека: аудиокниги
     * не показываются ни в выдаче фильтров, ни в поиске, их «отображение
     * находится внутри кнопки». Раздел зовёт тот же метод со своим срезом.
     */
    scope: 'catalog' | 'audiobooks' = 'catalog',
  ): Promise<MusicTrackListDto> {
    const lineage = await this.viewerLineage(viewerId, query.lineage);

    // Корневая категория (VED-165-2) переехала на исполнителя: фильтр по ней
    // — условие на связь `artist.rootCategory`, а не на `categories`, как у
    // стиля. У записи без исполнителя `artist` пуст, и Prisma-фильтр по
    // вложенной связи для пустого `artist` не совпадёт ни с чем — запись без
    // исполнителя корректно выпадает из любой вкладки «Традиционное»/
    // «Современное».
    //
    // Оба измерения (и условие линии — по той же причине) складываются в
    // общий массив `AND`, а не два прямых ключа в одном объекте `where`:
    // `artist` уже встречается отдельным ключом верхнего уровня у фильтра по
    // слагу исполнителя (`query.artist` ниже), и класть туда же ещё одно
    // условие вторым спредом значило бы молча стереть первое.
    const andConditions = [
      ...lineageAndConditions(lineage),
      audiobookScopeCondition(scope),
      ...(query.root
        ? [{ artist: { rootCategory: { slug: query.root } } }]
        : []),
      ...(query.category
        ? [{ categories: { some: { category: { slug: query.category } } } }]
        : []),
    ];

    const rows = await this.prisma.musicTrack.findMany({
      where: {
        status: 'published',
        ...(andConditions.length ? { AND: andConditions } : {}),
        ...(query.q
          ? {
              OR: [
                { title: { contains: query.q, mode: 'insensitive' as const } },
                {
                  artist: {
                    name: { contains: query.q, mode: 'insensitive' as const },
                  },
                },
              ],
            }
          : {}),
        ...(query.artist ? { artist: { slug: query.artist } } : {}),
        ...(query.language ? { language: query.language } : {}),
        ...(query.live === null ? {} : { isLiveRecording: query.live }),
      },
      include: TRACK_CARD_INCLUDE,
      orderBy: this.orderFor(query.sort),
      // Берём на одну больше запрошенного: наличие «лишней» и есть ответ на
      // вопрос, показывать ли кнопку «ещё».
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;

    return {
      items: items.map((row) => toMusicTrackDto(row, this.publicBaseUrl)),
      nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null,
    };
  }

  /**
   * Какую линию слышит человек. Явный параметр запроса сильнее настройки
   * Музыки; нет ни того, ни другого — весь каталог.
   *
   * Линию из портального профиля Музыка не наследует (VED-82). Киртаны и
   * бхаджаны общие для всех линий: наследованный фильтр только прятал
   * записи, а строка «Показываем линию…» над каталогом возвращалась при
   * каждом заходе, сколько её ни снимай. Кто хочет слушать одну линию,
   * выбирает её в настройках Музыки — и это его собственный выбор, о
   * котором строка над каталогом ему и напоминает.
   */
  private async viewerLineage(
    viewerId: string | null,
    explicit: LineagePreference,
  ): Promise<LineageId | null> {
    if (explicit) return resolveContentLineage(null, explicit);
    if (!viewerId) return null;
    const settings = await this.prisma.musicSettings.findUnique({
      where: { userId: viewerId },
      select: { lineage: true },
    });
    return resolveContentLineage(null, toLineagePreference(settings?.lineage));
  }

  /**
   * Порядок выдачи. Вторым ключом всегда `id`: без него у записей с равным
   * значением порядок между страницами не определён, и курсорная страница
   * начинает терять и повторять строки.
   */
  private orderFor(sort: NormalizedMusicTrackQuery['sort']) {
    switch (sort) {
      case 'popular':
        return [{ playCount: 'desc' as const }, { id: 'desc' as const }];
      case 'title':
        return [{ title: 'asc' as const }, { id: 'desc' as const }];
      // Порядка «по длительности» больше нет (VED-165) — убран вместе с
      // одноимённым фильтром: сортировать по колонке, часть значений которой
      // проставлена оценкой при загрузке, значит врать в списке.
      case 'fresh':
      default:
        return [{ publishedAt: 'desc' as const }, { id: 'desc' as const }];
    }
  }

  /**
   * Карточка записи. Неопубликованную видит только тот, кто её загрузил, и
   * админ сервиса: до разбора модератором запись слышит один автор.
   */
  async getTrack(
    id: string,
    viewerId: string | null,
    viewerIsAdmin: boolean,
  ): Promise<MusicTrackDetailDto> {
    const track = await this.prisma.musicTrack.findUnique({
      where: { id },
      include: TRACK_CARD_INCLUDE,
    });

    if (!track) throw new NotFoundException('Запись не найдена');

    const visible =
      track.status === 'published' ||
      viewerIsAdmin ||
      (viewerId !== null && track.uploadedById === viewerId);

    // 404, а не 403: существование чужого черновика — тоже сведения о нём.
    if (!visible) throw new NotFoundException('Запись не найдена');

    return toMusicTrackDetailDto(track, this.publicBaseUrl);
  }

  /**
   * Раздел «Аудиокниги» (VED-237) — та же витрина, только своим срезом:
   * карточки чтецов и записи списком. Порядок записей общий для Музыки —
   * по алфавиту (VED-273): главы книги ищут по названию, а не по дате
   * заливки.
   *
   * Линия зрителя действует и здесь: книга с линией показывается тем же
   * правилом, что и запись каталога, — иначе раздел стал бы единственным
   * местом портала, где настройка линии молча не работает.
   */
  async audiobooks(
    viewerId: string | null = null,
  ): Promise<MusicAudiobooksDto> {
    const lineage = await this.viewerLineage(viewerId, null);
    const where = {
      status: 'published' as const,
      AND: [
        ...lineageAndConditions(lineage),
        audiobookScopeCondition('audiobooks'),
      ],
    };

    const [artists, tracks, totalTracks] = await Promise.all([
      this.listShowcaseArtists('audiobooks'),
      this.prisma.musicTrack.findMany({
        where,
        include: TRACK_CARD_INCLUDE,
        orderBy: [{ title: 'asc' }, { id: 'desc' }],
        take: AUDIOBOOK_TRACKS,
      }),
      this.prisma.musicTrack.count({ where }),
    ]);

    return {
      artists,
      tracks: tracks.map((row) => toMusicTrackDto(row, this.publicBaseUrl)),
      totalTracks,
    };
  }

  async getArtist(slug: string): Promise<MusicArtistPageDto> {
    const artist = await this.prisma.musicArtist.findUnique({
      where: { slug },
      include: {
        _count: { select: { tracks: { where: { status: 'published' } } } },
      },
    });

    if (!artist) throw new NotFoundException('Исполнитель не найден');

    const [albums, tracks] = await Promise.all([
      this.prisma.musicAlbum.findMany({
        // Альбом без единой опубликованной записи не показываем по той же
        // причине, что и исполнителя без записей в витрине: карточка ведёт
        // на пустую страницу, то есть врёт о содержимом.
        where: {
          artistId: artist.id,
          tracks: { some: { status: 'published' } },
        },
        include: {
          artist: true,
          _count: { select: { tracks: { where: { status: 'published' } } } },
        },
        orderBy: [{ year: 'desc' }, { title: 'asc' }],
      }),
      this.prisma.musicTrack.findMany({
        where: { artistId: artist.id, status: 'published' },
        include: TRACK_CARD_INCLUDE,
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      }),
    ]);

    return {
      artist: toMusicArtistDto(
        artist,
        artist._count.tracks,
        this.publicBaseUrl,
      ),
      albums: albums.map((row) =>
        toMusicAlbumDto(row, row._count.tracks, this.publicBaseUrl),
      ),
      tracks: tracks.map((row) => toMusicTrackDto(row, this.publicBaseUrl)),
    };
  }

  async getAlbum(slug: string): Promise<MusicAlbumPageDto> {
    const album = await this.prisma.musicAlbum.findUnique({
      where: { slug },
      include: {
        artist: true,
        _count: { select: { tracks: { where: { status: 'published' } } } },
      },
    });

    if (!album) throw new NotFoundException('Альбом не найден');

    const tracks = await this.prisma.musicTrack.findMany({
      where: { albumId: album.id, status: 'published' },
      include: TRACK_CARD_INCLUDE,
      // Программа слушается в порядке записи, а не свежести.
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    return {
      album: toMusicAlbumDto(album, album._count.tracks, this.publicBaseUrl),
      tracks: tracks.map((row) => toMusicTrackDto(row, this.publicBaseUrl)),
    };
  }
}
