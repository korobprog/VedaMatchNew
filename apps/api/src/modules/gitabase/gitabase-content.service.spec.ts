import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  GitabaseBookManifest,
  GitabaseLibraryManifest,
} from '@vedamatch/shared';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { GitabaseContentService } from './gitabase-content.service';

const contentVersion = '2026-07-10';
const chapterBody = '{}';

function bookManifest(
  overrides: Partial<GitabaseBookManifest> = {},
): GitabaseBookManifest {
  return {
    formatVersion: 1,
    slug: 'test-book',
    title: 'Test Book',
    author: null,
    language: 'ru',
    contentVersion,
    packageChecksum: 'b'.repeat(64),
    sizeBytes: Buffer.byteLength(chapterBody),
    coverPath: null,
    sourceUrl: 'https://vedabase.ru/test-book',
    sourceOrigin: 'https://vedabase.ru',
    importedAt: '2026-07-10T00:00:00.000Z',
    permissionRef: 'permission-1',
    attribution: 'Vedabase.ru',
    chapters: [
      {
        slug: 'chapter-1',
        title: 'Chapter 1',
        order: 1,
        file: 'chapters/chapter-1.json',
      },
    ],
    files: [
      {
        path: 'chapters/chapter-1.json',
        bytes: Buffer.byteLength(chapterBody),
        sha256: 'a'.repeat(64),
        contentType: 'application/json',
      },
    ],
    ...overrides,
  };
}

function libraryManifest(book = bookManifest()): GitabaseLibraryManifest {
  return {
    formatVersion: 1,
    generatedAt: '2026-07-10T00:00:00.000Z',
    books: [book],
  };
}

describe('GitabaseContentService', () => {
  let contentDir: string;
  let service: GitabaseContentService;

  beforeEach(async () => {
    contentDir = await mkdtemp(path.join(tmpdir(), 'gitabase-content-'));
    service = new GitabaseContentService(
      new ConfigService({ GITABASE_CONTENT_DIR: contentDir }),
    );
  });

  afterEach(async () => {
    await rm(contentDir, { recursive: true, force: true });
  });

  async function writeLibrary(manifest = libraryManifest()) {
    await writeFile(
      path.join(contentDir, 'library-manifest.json'),
      JSON.stringify(manifest),
    );
  }

  async function writeBook(manifest = bookManifest()) {
    const bookDir = path.join(
      contentDir,
      'books',
      manifest.slug,
      manifest.contentVersion,
    );
    await mkdir(path.join(bookDir, 'chapters'), { recursive: true });
    await writeFile(
      path.join(bookDir, 'manifest.json'),
      JSON.stringify(manifest),
    );
    await writeFile(
      path.join(bookDir, 'chapters', 'chapter-1.json'),
      chapterBody,
    );
  }

  it('reads valid library and book manifests', async () => {
    const manifest = bookManifest();
    await writeLibrary(libraryManifest(manifest));
    await writeBook(manifest);

    await expect(service.getLibraryManifest()).resolves.toEqual(
      libraryManifest(manifest),
    );
    await expect(service.getBookManifest('test-book')).resolves.toEqual(
      manifest,
    );
  });

  it('returns 404 when the library manifest is missing', async () => {
    await expect(service.getLibraryManifest()).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns 404 when a declared book manifest is missing', async () => {
    await writeLibrary();

    await expect(service.getBookManifest('test-book')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns 500 for invalid checksum metadata', async () => {
    const validManifest = bookManifest();
    await writeLibrary(libraryManifest(validManifest));
    await writeBook(
      bookManifest({
        files: [
          {
            ...validManifest.files[0],
            sha256: 'not-a-sha256',
          },
        ],
      }),
    );

    await expect(service.getBookManifest('test-book')).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });

  it('returns 404 for an unknown book', async () => {
    await writeLibrary();

    await expect(
      service.getBookManifest('unknown-book'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each(['../schema.prisma', 'chapters/../../schema.prisma'])(
    'rejects traversal path %s',
    async (requestPath) => {
      const manifest = bookManifest();
      await writeLibrary(libraryManifest(manifest));
      await writeBook(manifest);

      await expect(
        service.resolveContentFile('test-book', contentVersion, requestPath),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it('rejects a declared file whose real path escapes the content directory', async () => {
    const outsideDir = await mkdtemp(path.join(tmpdir(), 'gitabase-outside-'));
    try {
      const manifest = bookManifest({
        files: [
          {
            path: 'linked/outside.json',
            bytes: Buffer.byteLength(chapterBody),
            sha256: 'c'.repeat(64),
            contentType: 'application/json',
          },
        ],
      });
      await writeLibrary(libraryManifest(manifest));
      await writeBook(manifest);
      await writeFile(path.join(outsideDir, 'outside.json'), chapterBody);
      await symlink(
        outsideDir,
        path.join(contentDir, 'books', 'test-book', contentVersion, 'linked'),
        'junction',
      );

      await expect(
        service.resolveContentFile(
          'test-book',
          contentVersion,
          'linked/outside.json',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    } finally {
      await rm(outsideDir, { recursive: true, force: true });
    }
  });

  it('resolves only manifest-declared files with immutable metadata', async () => {
    const manifest = bookManifest();
    await writeLibrary(libraryManifest(manifest));
    await writeBook(manifest);

    await expect(
      service.resolveContentFile(
        'test-book',
        contentVersion,
        'chapters/chapter-1.json',
      ),
    ).resolves.toEqual({
      absolutePath: path.join(
        contentDir,
        'books',
        'test-book',
        contentVersion,
        'chapters',
        'chapter-1.json',
      ),
      etag: `"${'a'.repeat(64)}"`,
      bytes: Buffer.byteLength(chapterBody),
      contentType: 'application/json',
    });

    await expect(
      service.resolveContentFile(
        'test-book',
        contentVersion,
        'chapters/not-declared.json',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
