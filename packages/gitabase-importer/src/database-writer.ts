import { createHash } from "node:crypto";
import { Prisma, PrismaClient, type VedabaseImportStatus } from "@prisma/client";
import type { VedabaseBookManifest, VedabaseChapter, VedabaseSearchDocument } from "@vedamatch/shared";

export interface StagedVersion { id: string; status: VedabaseImportStatus }
export interface ChapterWrite { chapter: VedabaseChapter; bytes: number; sha256: string }

export class DatabaseBookWriter {
  constructor(private readonly prisma: PrismaClient) {}

  async stage(manifest: VedabaseBookManifest, resume = false): Promise<StagedVersion> {
    const book = await this.prisma.vedabaseBook.upsert({
      where: { slug: manifest.slug },
      create: { slug: manifest.slug, title: manifest.title, author: manifest.author, language: manifest.language, sourceUrl: manifest.sourceUrl, attribution: manifest.attribution },
      update: { title: manifest.title, author: manifest.author, sourceUrl: manifest.sourceUrl, attribution: manifest.attribution },
    });
    const existing = await this.prisma.vedabaseBookVersion.findUnique({ where: { bookId_contentVersion: { bookId: book.id, contentVersion: manifest.contentVersion } } });
    if (existing) {
      if (existing.status === "active") throw new Error("Active Vedabase versions are immutable");
      if (!resume) throw new Error("Vedabase version already exists; use --resume");
      return this.prisma.vedabaseBookVersion.update({ where: { id: existing.id }, data: { status: "staging", errorMessage: null } });
    }
    const searchFile = manifest.files.find((file) => file.path === "search-index.json");
    if (!searchFile) throw new Error("Search index metadata is required");
    return this.prisma.vedabaseBookVersion.create({ data: {
      bookId: book.id, contentVersion: manifest.contentVersion, formatVersion: manifest.formatVersion,
      permissionRef: manifest.permissionRef, attribution: manifest.attribution, importedAt: new Date(manifest.importedAt),
      sizeBytes: BigInt(manifest.sizeBytes), packageChecksum: manifest.packageChecksum,
      chapterCount: manifest.chapters.length, searchableUnitCount: 0,
      searchIndexBytes: searchFile.bytes, searchIndexSha256: searchFile.sha256,
    } });
  }

  async writeChapterBatch(versionId: string, chapters: readonly ChapterWrite[]): Promise<void> {
    for (let offset = 0; offset < chapters.length; offset += 100) {
      const batch = chapters.slice(offset, offset + 100);
      await this.prisma.$transaction(batch.map(({ chapter, bytes, sha256 }) => this.prisma.vedabaseChapter.upsert({
        where: { versionId_slug: { versionId, slug: chapter.slug } },
        create: { versionId, slug: chapter.slug, title: chapter.title, order: chapter.order, payload: chapter as unknown as Prisma.InputJsonObject, bytes, sha256 },
        update: {},
      })));
      const persisted = await this.prisma.vedabaseChapter.findMany({
        where: { versionId, slug: { in: batch.map(({ chapter }) => chapter.slug) } },
      });
      await this.prisma.$transaction(persisted.map((chapter) => {
        const body = Buffer.from(`${JSON.stringify(chapter.payload, null, 2)}\n`, "utf8");
        return this.prisma.vedabaseChapter.update({
          where: { id: chapter.id },
          data: {
            bytes: body.byteLength,
            sha256: createHash("sha256").update(body).digest("hex"),
          },
        });
      }));
    }
  }

  async writeSearchBatch(versionId: string, documents: readonly VedabaseSearchDocument[]): Promise<void> {
    const existing = await this.prisma.vedabaseSearchUnit.count({ where: { versionId } });
    if (existing > 0) return;
    for (let offset = 0; offset < documents.length; offset += 100) {
      const batch = documents.slice(offset, offset + 100);
      await this.prisma.vedabaseSearchUnit.createMany({ data: batch.map((document) => ({ versionId, chapterSlug: document.chapterSlug, locator: document.locator as unknown as Prisma.InputJsonObject, title: document.title, text: document.text })) });
    }
    await this.prisma.vedabaseBookVersion.update({ where: { id: versionId }, data: { searchableUnitCount: documents.length } });
  }

  async validate(versionId: string): Promise<void> {
    const version = await this.prisma.vedabaseBookVersion.findUnique({ where: { id: versionId }, include: { book: true, chapters: true, searchUnits: true } });
    if (!version || !["staging", "failed"].includes(version.status)) throw new Error("Vedabase version cannot be validated");
    if (new URL(version.book.sourceUrl).origin !== "https://vedabase.ru" || !version.permissionRef.trim() || !version.attribution.trim()) throw new Error("Invalid Vedabase source metadata");
    if (version.chapters.length !== version.chapterCount || version.searchUnits.length !== version.searchableUnitCount) throw new Error("Vedabase stored counts do not match");
    const slugs = new Set(version.chapters.map((chapter) => chapter.slug));
    const orders = new Set(version.chapters.map((chapter) => chapter.order));
    if (slugs.size !== version.chapters.length || orders.size !== version.chapters.length) throw new Error("Duplicate Vedabase chapter metadata");
    for (const chapter of version.chapters) {
      const body = Buffer.from(`${JSON.stringify(chapter.payload, null, 2)}\n`, "utf8");
      if (body.byteLength !== chapter.bytes || createHash("sha256").update(body).digest("hex") !== chapter.sha256) throw new Error(`Invalid chapter checksum: ${chapter.slug}`);
    }
    await this.prisma.vedabaseBookVersion.update({ where: { id: versionId }, data: { status: "validated", errorMessage: null } });
  }

  async activate(versionId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const version = await tx.vedabaseBookVersion.findUnique({ where: { id: versionId } });
      if (!version || version.status !== "validated") throw new Error("Vedabase version is not validated");
      await tx.vedabaseBookVersion.updateMany({ where: { bookId: version.bookId, status: "active" }, data: { status: "validated" } });
      await tx.vedabaseBookVersion.update({ where: { id: version.id }, data: { status: "active" } });
      await tx.vedabaseBook.update({ where: { id: version.bookId }, data: { activeVersionId: version.id } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async fail(versionId: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    await this.prisma.vedabaseBookVersion.update({ where: { id: versionId }, data: { status: "failed", errorMessage: message.slice(0, 2000) } });
  }
}
