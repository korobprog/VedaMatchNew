/* eslint-disable @typescript-eslint/no-require-imports */
const { marketSections } = require('../../../prisma/market-sections-data.js') as {
  marketSections: Array<{
    slug: string;
    titleRu: string;
    titleEn: string;
    iconKey: string;
    position: number;
  }>;
};

const { marketCategories } =
  require('../../../prisma/market-categories-data.js') as {
    marketCategories: Array<{
      sectionSlug: string;
      slug: string;
      titleRu: string;
      titleEn: string;
      position: number;
      prohibited?: boolean;
    }>;
  };

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

describe('market seed sections', () => {
  it('keeps slugs unique', () => {
    const slugs = marketSections.map((section) => section.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('numbers positions sequentially from one', () => {
    expect(marketSections.map((section) => section.position)).toEqual(
      marketSections.map((_, index) => index + 1),
    );
  });

  it('provides both russian and english titles', () => {
    for (const section of marketSections) {
      expect(section.titleRu.length).toBeGreaterThan(0);
      expect(section.titleEn.length).toBeGreaterThan(0);
    }
  });

  it('uses url-safe slugs', () => {
    for (const section of marketSections) {
      expect(section.slug).toMatch(SLUG_PATTERN);
    }
  });
});

describe('market seed categories', () => {
  const sectionSlugs = new Set(marketSections.map((section) => section.slug));

  it('references only existing sections', () => {
    for (const category of marketCategories) {
      expect(sectionSlugs.has(category.sectionSlug)).toBe(true);
    }
  });

  it('keeps slugs unique within a section', () => {
    const seen = new Set<string>();
    for (const category of marketCategories) {
      const key = `${category.sectionSlug}/${category.slug}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('numbers positions sequentially within each section', () => {
    const bySection = new Map<string, number[]>();
    for (const category of marketCategories) {
      const positions = bySection.get(category.sectionSlug) ?? [];
      positions.push(category.position);
      bySection.set(category.sectionSlug, positions);
    }
    for (const [sectionSlug, positions] of bySection) {
      expect({ sectionSlug, positions }).toEqual({
        sectionSlug,
        positions: positions.map((_, index) => index + 1),
      });
    }
  });

  it('gives every section at least one category', () => {
    for (const sectionSlug of sectionSlugs) {
      const owned = marketCategories.filter(
        (category) => category.sectionSlug === sectionSlug,
      );
      expect({ sectionSlug, count: owned.length }).toEqual({
        sectionSlug,
        count: owned.length,
      });
      expect(owned.length).toBeGreaterThan(0);
    }
  });

  it('provides both russian and english titles', () => {
    for (const category of marketCategories) {
      expect(category.titleRu.length).toBeGreaterThan(0);
      expect(category.titleEn.length).toBeGreaterThan(0);
    }
  });

  it('uses url-safe slugs', () => {
    for (const category of marketCategories) {
      expect(category.slug).toMatch(SLUG_PATTERN);
    }
  });

  // Запрещённые категории существуют, чтобы модерация могла переложить в них
  // уже поданное объявление и показать продавцу причину. Пустой список означал
  // бы, что правила Рынка нечем подкрепить.
  it('marks prohibited categories', () => {
    const prohibited = marketCategories.filter((category) => category.prohibited);
    expect(prohibited.length).toBeGreaterThan(0);
    expect(prohibited.map((category) => category.slug)).toEqual(
      expect.arrayContaining(['meat-fish-eggs', 'alcohol-tobacco']),
    );
  });
});
