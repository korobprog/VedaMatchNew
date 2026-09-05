import {
  LibraryCategoryStatus,
  LibraryEnrichmentStatus,
  LibraryEntryStatus,
  LibraryEntryType,
} from '@prisma/client';

describe('Library Prisma schema', () => {
  it('exposes entry types required by the catalog', () => {
    expect(Object.values(LibraryEntryType)).toEqual(
      expect.arrayContaining([
        'website',
        'article',
        'video',
        'audio',
        'book',
        'course',
        'app',
        'telegram_channel',
        'vk_group',
        'community',
        'other',
      ]),
    );
  });

  it('exposes moderation and enrichment statuses', () => {
    expect(Object.values(LibraryEntryStatus)).toEqual([
      'published',
      'hidden_by_reports',
      'removed_by_admin',
    ]);
    expect(Object.values(LibraryEnrichmentStatus)).toEqual([
      'pending',
      'queued',
      'ready',
      'failed',
      // Материал без адреса: обогащать нечего, но и «в очереди» он не висит.
      'not_applicable',
    ]);
    expect(Object.values(LibraryCategoryStatus)).toEqual([
      'active',
      'hidden_by_reports',
      'merged',
      'removed',
    ]);
  });
});
