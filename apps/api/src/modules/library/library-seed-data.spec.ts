/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
const {
  librarySections,
} = require('../../../prisma/library-sections-data.js') as {
  librarySections: Array<{
    slug: string;
    titleRu: string;
    titleEn: string;
    position: number;
  }>;
};

describe('library seed sections', () => {
  it('defines eight starter sections', () => {
    expect(librarySections).toHaveLength(8);
  });

  it('keeps slugs unique and positions sequential', () => {
    const slugs = librarySections.map((section) => section.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(librarySections.map((section) => section.position)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
  });

  it('provides both russian and english titles', () => {
    for (const section of librarySections) {
      expect(section.titleRu.length).toBeGreaterThan(0);
      expect(section.titleEn.length).toBeGreaterThan(0);
    }
  });
});
