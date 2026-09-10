import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import type {
  MusicArtistFromTagsGroup,
  MusicArtistsFromTagsResult,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  artistNameKey,
  groupTracksByArtist,
  normalizeArtistName,
  type TaggedTrack,
} from './artist-from-tag';
import { normalizeAudioMetadata } from './music-metadata-parse';
import { MusicMetadataReader } from './music-metadata-reader';
import { MusicStorageService } from './music-storage.service';
import { buildMusicSlug, withMusicSlugSuffix } from './music-slug';

/**
 * Сколько записей разбираем за прогон. Каждая — обращение к хранилищу за
 * началом объекта, поэтому прогон ограничен: редакция нажимает кнопку
 * повторно и видит, сколько осталось, вместо запроса, который висит десять
 * минут и обрывается по таймауту.
 */
const SCAN_LIMIT = 400;

/**
 * Исполнители по коллекции.
 *
 * Каталог наполнялся партиями, а исполнителя у партии редакция не выбирала:
 * поле необязательное, и записи легли с пустым `artistId`. Наружу это видно
 * как «Исполнитель не указан» у каждой записи, пустой справочник и скрытая
 * секция «Исполнители» на витрине — при том, что имя в самих файлах есть.
 *
 * Разбор ходит по записям без исполнителя, читает начало объекта ради тега и
 * заводит недостающих. Отдельным действием редакции, а не тихой автоматикой
 * на чтении: справочник каталога — это утверждение о людях, и появляться в
 * нём записи должны по нажатию, с предварительным показом того, что
 * получится (`dryRun`).
 *
 * Заведённый так исполнитель не получает отметки редакции (`isVerified`):
 * тег остаётся подсказкой, «тем самым» человека называет человек.
 */
@Injectable()
export class MusicArtistTagsService {
  private readonly logger = new Logger(MusicArtistTagsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: MusicStorageService,
    private readonly metadata: MusicMetadataReader,
  ) {}

  async scan(
    viewerIsAdmin: boolean,
    options: { dryRun: boolean },
  ): Promise<MusicArtistsFromTagsResult> {
    if (!viewerIsAdmin) throw new ForbiddenException('Нужны права редакции');

    const tracks = await this.prisma.musicTrack.findMany({
      where: { artistId: null },
      select: { id: true, storageKey: true, mime: true, sizeBytes: true },
      // Старые записи первыми: их слушают, и именно из-за них справочник
      // пуст.
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: SCAN_LIMIT,
    });

    const rows: TaggedTrack[] = [];
    for (const track of tracks) {
      rows.push({
        trackId: track.id,
        artistTag: await this.readArtistTag(track),
      });
    }

    const groups = groupTracksByArtist(rows);
    const withTag = groups.reduce(
      (sum, group) => sum + group.trackIds.length,
      0,
    );

    // Справочник маленький, и сравнивать имена нужно по тем же правилам, что
    // и теги между собой: «ё», регистр, двойные пробелы. Запрос «найди
    // похожее» этого не умеет, а несколько сотен строк в память помещаются.
    const existing = await this.prisma.musicArtist.findMany({
      select: { id: true, name: true },
    });
    const byKey = new Map(
      existing.map((artist) => [
        artistNameKey(normalizeArtistName(artist.name) ?? artist.name),
        artist.id,
      ]),
    );

    let artistsCreated = 0;
    let artistsMatched = 0;
    let tracksLinked = 0;
    const summary: MusicArtistFromTagsGroup[] = [];

    for (const group of groups) {
      const existedId = byKey.get(group.key) ?? null;
      if (existedId) artistsMatched += 1;
      else artistsCreated += 1;

      summary.push({
        name: group.name,
        trackCount: group.trackIds.length,
        existed: existedId !== null,
      });

      if (options.dryRun) continue;

      const artistId = existedId ?? (await this.createArtist(group.name));
      byKey.set(group.key, artistId);

      // `artistId: null` в условии — не лишнее: пока шёл разбор, редакция
      // могла проставить исполнителя руками, и её выбор сильнее тега.
      const updated = await this.prisma.musicTrack.updateMany({
        where: { id: { in: group.trackIds }, artistId: null },
        data: { artistId },
      });
      tracksLinked += updated.count;
    }

    const remaining = await this.prisma.musicTrack.count({
      where: { artistId: null },
    });

    return {
      scanned: tracks.length,
      withTag,
      artistsCreated,
      artistsMatched,
      tracksLinked,
      remaining,
      groups: summary,
      dryRun: options.dryRun,
    };
  }

  /**
   * Исполнитель по одному тегу — для заливки. Возвращает того, кто уже есть в
   * справочнике, иначе заводит нового; `null` — в теге не имя, и запись
   * останется без исполнителя, как раньше.
   *
   * Отдельно от `scan`: там справочник берётся разом на всю пачку, здесь
   * запись одна, и лишний список исполнителей в памяти ни к чему.
   */
  async resolveFromTag(raw: string | null | undefined): Promise<string | null> {
    const name = normalizeArtistName(raw);
    if (!name) return null;

    const existing = await this.prisma.musicArtist.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existing) return existing.id;

    return this.createArtist(name);
  }

  /** Имя из тега или `null`: нечитаемый файл разбор не роняет. */
  private async readArtistTag(track: {
    storageKey: string;
    mime: string;
    sizeBytes: number;
  }): Promise<string | null> {
    try {
      const prefix = await this.storage.readPrefix(track.storageKey);
      if (!prefix) return null;
      const raw = await this.metadata.read(prefix, track.mime, track.sizeBytes);
      return normalizeAudioMetadata(raw).artist;
    } catch (error) {
      this.logger.warn(
        `Тег не прочитан у ${track.storageKey}: ${String(error)}`,
      );
      return null;
    }
  }

  private async createArtist(name: string): Promise<string> {
    const base = buildMusicSlug(name);
    let slug = base;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      slug = withMusicSlugSuffix(base, attempt);
      const taken = await this.prisma.musicArtist.findUnique({
        where: { slug },
        select: { id: true },
      });
      if (!taken) break;
    }

    const artist = await this.prisma.musicArtist.create({
      // `isVerified` остаётся ложью намеренно: отметку «это тот самый
      // человек» ставит редакция, а не тег из чужого архива.
      data: { slug, name, kind: 'unknown' },
      select: { id: true },
    });
    return artist.id;
  }
}
