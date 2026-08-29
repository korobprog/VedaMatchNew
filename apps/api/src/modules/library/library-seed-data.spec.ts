/* eslint-disable @typescript-eslint/no-require-imports */
const { libraryRoots } =
  require('../../../prisma/library-roots-data.js') as {
    libraryRoots: Array<{
      slug: string;
      titleRu: string;
      titleEn: string;
      position: number;
    }>;
  };

describe('library seed roots', () => {
  it('defines eight starter roots', () => {
    expect(libraryRoots).toHaveLength(8);
  });

  it('keeps slugs unique and positions sequential', () => {
    const slugs = libraryRoots.map((root) => root.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(libraryRoots.map((root) => root.position)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
  });

  it('provides both russian and english titles', () => {
    for (const root of libraryRoots) {
      expect(root.titleRu.length).toBeGreaterThan(0);
      expect(root.titleEn.length).toBeGreaterThan(0);
    }
  });
});
