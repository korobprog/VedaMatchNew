import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  GitabaseBookManifest,
  GitabaseLibraryManifest,
  GitabasePackageFile,
} from '@vedamatch/shared';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

export interface ResolvedContentFile {
  absolutePath: string;
  etag: string;
  bytes: number;
  contentType: string;
}

const sha256Pattern = /^[a-f0-9]{64}$/;
const defaultContentDir = '/var/lib/vedamatch/gitabase';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isSafeRelativePath(value: unknown): value is string {
  if (
    !isNonEmptyString(value) ||
    value.includes('\\') ||
    value.includes('\0')
  ) {
    return false;
  }

  if (path.posix.isAbsolute(value)) return false;
  return value
    .split('/')
    .every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

function isSafeSegment(value: unknown): value is string {
  return (
    isNonEmptyString(value) &&
    !value.includes('/') &&
    !value.includes('\\') &&
    value !== '.' &&
    value !== '..' &&
    !value.includes('\0')
  );
}

@Injectable()
export class GitabaseContentService {
  private readonly contentDir: string;

  constructor(config: ConfigService) {
    const configuredDir =
      config.get<string>('GITABASE_CONTENT_DIR')?.trim() || defaultContentDir;
    this.contentDir = path.resolve(configuredDir);
  }

  async getLibraryManifest(): Promise<GitabaseLibraryManifest> {
    const manifestPath = path.join(this.contentDir, 'library-manifest.json');
    const value = await this.readJson(manifestPath, 'Library manifest');
    return this.parseLibraryManifest(value, manifestPath);
  }

  async getBookManifest(bookSlug: string): Promise<GitabaseBookManifest> {
    const library = await this.getLibraryManifest();
    const libraryBook = library.books.find((book) => book.slug === bookSlug);
    if (!libraryBook) throw new NotFoundException('Gitabase book not found');

    return this.readBookManifest(libraryBook);
  }

  async resolveContentFile(
    bookSlug: string,
    version: string,
    requestPath: string | string[],
  ): Promise<ResolvedContentFile> {
    const relativePath = this.normalizeRequestPath(requestPath);
    if (!isSafeSegment(version)) {
      throw new BadRequestException('Invalid Gitabase content version');
    }

    const library = await this.getLibraryManifest();
    const libraryBook = library.books.find((book) => book.slug === bookSlug);
    if (!libraryBook || libraryBook.contentVersion !== version) {
      throw new NotFoundException('Gitabase book version not found');
    }

    const manifest = await this.readBookManifest(libraryBook);
    const declaredFile = manifest.files.find(
      (file) => file.path === relativePath,
    );
    if (!declaredFile) {
      throw new NotFoundException('Gitabase content file not found');
    }

    const packageDir = this.resolveInside(
      this.contentDir,
      'books',
      manifest.slug,
      manifest.contentVersion,
    );
    const absolutePath = this.resolveInside(
      packageDir,
      ...relativePath.split('/'),
    );
    const safeRealPath = await this.resolveRealContentPath(absolutePath);
    const fileStat = await this.getFileStat(safeRealPath);
    if (!fileStat.isFile() || fileStat.size !== declaredFile.bytes) {
      throw new InternalServerErrorException(
        'Gitabase content file does not match manifest metadata',
      );
    }

    return {
      absolutePath: safeRealPath,
      etag: `"${declaredFile.sha256}"`,
      bytes: declaredFile.bytes,
      contentType: declaredFile.contentType,
    };
  }

  private async readBookManifest(
    libraryBook: GitabaseBookManifest,
  ): Promise<GitabaseBookManifest> {
    const manifestPath = this.resolveInside(
      this.contentDir,
      'books',
      libraryBook.slug,
      libraryBook.contentVersion,
      'manifest.json',
    );
    const value = await this.readJson(manifestPath, 'Book manifest');
    const manifest = this.parseBookManifest(value, manifestPath);

    if (
      manifest.slug !== libraryBook.slug ||
      manifest.contentVersion !== libraryBook.contentVersion ||
      manifest.packageChecksum !== libraryBook.packageChecksum
    ) {
      throw new InternalServerErrorException(
        'Book manifest does not match library metadata',
      );
    }

    return manifest;
  }

  private async readJson(filePath: string, label: string): Promise<unknown> {
    try {
      return JSON.parse(await readFile(filePath, 'utf8')) as unknown;
    } catch (error) {
      if (this.isMissingFileError(error)) {
        throw new NotFoundException(`${label} not found`);
      }
      throw new InternalServerErrorException(`${label} is invalid`);
    }
  }

  private parseLibraryManifest(
    value: unknown,
    source: string,
  ): GitabaseLibraryManifest {
    if (
      !isRecord(value) ||
      value.formatVersion !== 1 ||
      !isNonEmptyString(value.generatedAt) ||
      !Array.isArray(value.books)
    ) {
      throw new InternalServerErrorException(
        `Library manifest has invalid metadata: ${source}`,
      );
    }

    const books = value.books.map((book) =>
      this.parseBookManifest(book, source),
    );
    if (new Set(books.map((book) => book.slug)).size !== books.length) {
      throw new InternalServerErrorException(
        `Library manifest contains duplicate books: ${source}`,
      );
    }

    return { formatVersion: 1, generatedAt: value.generatedAt, books };
  }

  private parseBookManifest(
    value: unknown,
    source: string,
  ): GitabaseBookManifest {
    if (
      !isRecord(value) ||
      value.formatVersion !== 1 ||
      !isSafeSegment(value.slug) ||
      !isNonEmptyString(value.title) ||
      !(value.author === null || typeof value.author === 'string') ||
      value.language !== 'ru' ||
      !isSafeSegment(value.contentVersion) ||
      !isNonEmptyString(value.packageChecksum) ||
      !sha256Pattern.test(value.packageChecksum) ||
      !Number.isSafeInteger(value.sizeBytes) ||
      (value.sizeBytes as number) < 0 ||
      !(value.coverPath === null || isSafeRelativePath(value.coverPath)) ||
      !isNonEmptyString(value.sourceUrl) ||
      value.sourceOrigin !== 'https://vedabase.ru' ||
      !isNonEmptyString(value.importedAt) ||
      !isNonEmptyString(value.permissionRef) ||
      !isNonEmptyString(value.attribution) ||
      !Array.isArray(value.chapters) ||
      !Array.isArray(value.files)
    ) {
      throw new InternalServerErrorException(
        `Book manifest has invalid metadata: ${source}`,
      );
    }

    const chaptersValid = value.chapters.every(
      (chapter) =>
        isRecord(chapter) &&
        isSafeSegment(chapter.slug) &&
        isNonEmptyString(chapter.title) &&
        Number.isSafeInteger(chapter.order) &&
        isSafeRelativePath(chapter.file),
    );
    const filesValid = value.files.every((file) => this.isPackageFile(file));
    if (!chaptersValid || !filesValid) {
      throw new InternalServerErrorException(
        `Book manifest has invalid file metadata: ${source}`,
      );
    }

    const files = value.files as GitabasePackageFile[];
    if (new Set(files.map((file) => file.path)).size !== files.length) {
      throw new InternalServerErrorException(
        `Book manifest contains duplicate files: ${source}`,
      );
    }

    return value as unknown as GitabaseBookManifest;
  }

  private isPackageFile(value: unknown): value is GitabasePackageFile {
    return (
      isRecord(value) &&
      isSafeRelativePath(value.path) &&
      Number.isSafeInteger(value.bytes) &&
      (value.bytes as number) >= 0 &&
      isNonEmptyString(value.sha256) &&
      sha256Pattern.test(value.sha256) &&
      isNonEmptyString(value.contentType)
    );
  }

  private normalizeRequestPath(requestPath: string | string[]): string {
    const value = Array.isArray(requestPath)
      ? requestPath.join('/')
      : requestPath;
    if (!isSafeRelativePath(value)) {
      throw new BadRequestException('Invalid Gitabase content path');
    }
    return value;
  }

  private resolveInside(root: string, ...segments: string[]): string {
    const resolved = path.resolve(root, ...segments);
    if (!this.isInside(root, resolved)) {
      throw new BadRequestException('Gitabase path escapes content directory');
    }
    return resolved;
  }

  private async resolveRealContentPath(filePath: string): Promise<string> {
    try {
      const [realRoot, realFile] = await Promise.all([
        realpath(this.contentDir),
        realpath(filePath),
      ]);
      if (!this.isInside(realRoot, realFile)) {
        throw new BadRequestException(
          'Gitabase path escapes content directory',
        );
      }
      return realFile;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      if (this.isMissingFileError(error)) {
        throw new NotFoundException('Gitabase content file not found');
      }
      throw new InternalServerErrorException(
        'Unable to resolve Gitabase content file',
      );
    }
  }

  private async getFileStat(filePath: string) {
    try {
      return await stat(filePath);
    } catch (error) {
      if (this.isMissingFileError(error)) {
        throw new NotFoundException('Gitabase content file not found');
      }
      throw new InternalServerErrorException(
        'Unable to read Gitabase content file',
      );
    }
  }

  private isInside(root: string, candidate: string): boolean {
    const relative = path.relative(root, candidate);
    return (
      relative !== '' &&
      relative !== '..' &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative)
    );
  }

  private isMissingFileError(error: unknown): boolean {
    return isRecord(error) && error.code === 'ENOENT';
  }
}
