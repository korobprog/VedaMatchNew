import { Injectable } from '@nestjs/common';
import { Prisma, type VedabaseBookVersion } from '@prisma/client';
import type {
  VedabaseBookManifest,
  VedabaseChapter,
  VedabaseLibraryManifest,
  VedabaseSearchDocument,
  VedabaseSearchResult,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';

type ActiveBook = Prisma.VedabaseBookGetPayload<{
  include: { activeVersion: { include: { chapters: true } } };
}>;

@Injectable()
export class VedabaseContentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listActiveBooks(): Promise<VedabaseLibraryManifest> {
    const books = await this.prisma.vedabaseBook.findMany({
      where: { activeVersionId: { not: null } },
      include: { activeVersion: { include: { chapters: true } } },
      orderBy: { slug: 'asc' },
    });
    return {
      formatVersion: 1,
      generatedAt: new Date().toISOString(),
      books: books.flatMap((book) => book.activeVersion ? [this.toManifest(book as ActiveBook)] : []),
    };
  }

  async getActiveBook(bookSlug: string): Promise<VedabaseBookManifest> {
    const book = await this.findActiveBook(bookSlug);
    return this.toManifest(book);
  }

  async getActiveChapter(bookSlug: string, chapterSlug: string): Promise<VedabaseChapter> {
    return (await this.getActiveChapterRecord(bookSlug, chapterSlug)).chapter;
  }

  async getActiveChapterRecord(bookSlug: string, chapterSlug: string): Promise<{ chapter: VedabaseChapter; sha256: string }> {
    const row = await this.prisma.vedabaseChapter.findFirst({
      where: { slug: chapterSlug, version: { book: { slug: bookSlug, activeVersionId: { not: null } }, activeFor: { slug: bookSlug } } },
    });
    if (!row) throw new Error('Vedabase chapter not found');
    return { chapter: row.payload as unknown as VedabaseChapter, sha256: row.sha256 };
  }

  async getOfflineSearchIndex(bookSlug: string): Promise<VedabaseSearchDocument[]> {
    const book = await this.findActiveBook(bookSlug);
    const rows = await this.prisma.vedabaseSearchUnit.findMany({
      where: { versionId: book.activeVersion!.id },
      orderBy: [{ chapterSlug: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => ({
      locator: row.locator as unknown as VedabaseSearchDocument['locator'],
      chapterSlug: row.chapterSlug,
      title: row.title,
      text: row.text,
    }));
  }

  async search(query: string, limit: number): Promise<VedabaseSearchResult[]> {
    return this.prisma.$queryRaw<VedabaseSearchResult[]>(Prisma.sql`
      SELECT b.slug AS "bookSlug", u."chapterSlug", u.locator, u.title, u.text,
        ts_rank(to_tsvector('russian', u.text), plainto_tsquery('russian', ${query}))::float AS rank
      FROM "VedabaseSearchUnit" u
      JOIN "VedabaseBookVersion" v ON v.id = u."versionId"
      JOIN "VedabaseBook" b ON b."activeVersionId" = v.id
      WHERE to_tsvector('russian', u.text) @@ plainto_tsquery('russian', ${query})
      ORDER BY rank DESC, b.slug, u."chapterSlug"
      LIMIT ${limit}
    `);
  }

  async activateVersion(versionId: string): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const version = await transaction.vedabaseBookVersion.findUnique({ where: { id: versionId } });
      if (!version || version.status !== 'validated') throw new Error('Vedabase version is not validated');
      const book = await transaction.vedabaseBook.findUnique({ where: { id: version.bookId } });
      if (!book) throw new Error('Vedabase book not found');
      await transaction.vedabaseBookVersion.updateMany({ where: { bookId: book.id, status: 'active' }, data: { status: 'validated' } });
      await transaction.vedabaseBookVersion.update({ where: { id: version.id }, data: { status: 'active' } });
      await transaction.vedabaseBook.update({ where: { id: book.id }, data: { activeVersionId: version.id } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private async findActiveBook(slug: string): Promise<ActiveBook> {
    const book = await this.prisma.vedabaseBook.findFirst({
      where: { slug, activeVersionId: { not: null } },
      include: { activeVersion: { include: { chapters: true } } },
    });
    if (!book?.activeVersion || book.activeVersion.bookId !== book.id) throw new Error('Vedabase book not found');
    return book as ActiveBook;
  }

  private toManifest(book: ActiveBook): VedabaseBookManifest {
    const version = book.activeVersion!;
    const size = Number(version.sizeBytes);
    if (!Number.isSafeInteger(size)) throw new Error('Vedabase book size exceeds JSON safe integer');
    const chapters = [...version.chapters].sort((a, b) => a.order - b.order);
    return {
      formatVersion: 1, slug: book.slug, title: book.title, author: book.author,
      language: 'ru', contentVersion: version.contentVersion,
      packageChecksum: version.packageChecksum, sizeBytes: size, coverPath: book.cover ? 'cover' : null,
      sourceUrl: book.sourceUrl, sourceOrigin: 'https://vedabase.ru', importedAt: version.importedAt.toISOString(),
      permissionRef: version.permissionRef, attribution: version.attribution,
      chapters: chapters.map((chapter) => ({ slug: chapter.slug, title: chapter.title, order: chapter.order, file: `chapters/${chapter.slug}.json` })),
      files: [
        ...chapters.map((chapter) => ({ path: `chapters/${chapter.slug}.json`, bytes: chapter.bytes, sha256: chapter.sha256, contentType: 'application/json; charset=utf-8' })),
        { path: 'search-index.json', bytes: version.searchIndexBytes, sha256: version.searchIndexSha256, contentType: 'application/json; charset=utf-8' },
      ],
    };
  }
}
