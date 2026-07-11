import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { VedabaseContentRepository } from './vedabase-content.repository';

@Injectable()
export class VedabaseContentService {
  constructor(private readonly repository: VedabaseContentRepository) {}
  getLibrary() { return this.repository.listActiveBooks(); }
  async getBook(slug: string) { return this.notFound(() => this.repository.getActiveBook(slug)); }
  async getChapter(bookSlug: string, chapterSlug: string) { return this.notFound(() => this.repository.getActiveChapterRecord(bookSlug, chapterSlug)); }
  async getSearchIndex(slug: string) { return this.notFound(() => this.repository.getOfflineSearchIndex(slug)); }
  search(query: string, limit?: string) {
    const normalized = query?.trim();
    if (!normalized) throw new BadRequestException('Search query is required');
    const parsed = limit === undefined ? 20 : Number(limit);
    if (!Number.isInteger(parsed) || parsed < 1) throw new BadRequestException('Invalid search limit');
    return this.repository.search(normalized, Math.min(parsed, 100));
  }
  private async notFound<T>(operation: () => Promise<T>): Promise<T> {
    try { return await operation(); } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) throw new NotFoundException(error.message);
      throw error;
    }
  }
}
