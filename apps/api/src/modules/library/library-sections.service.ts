import { Injectable } from '@nestjs/common';
import type { LibrarySectionDto } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class LibrarySectionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<LibrarySectionDto[]> {
    const sections = await this.prisma.librarySection.findMany({
      orderBy: { position: 'asc' },
    });
    const entriesCounts = await Promise.all(
      sections.map((section) =>
        this.prisma.libraryEntry.count({
          where: {
            status: 'published',
            categories: { some: { category: { sectionId: section.id } } },
          },
        }),
      ),
    );
    const categoriesCounts = await Promise.all(
      sections.map((section) =>
        this.prisma.libraryCategory.count({
          where: { sectionId: section.id, status: 'active' },
        }),
      ),
    );

    return sections.map((section, index) => ({
      id: section.id,
      slug: section.slug,
      titleRu: section.titleRu,
      titleEn: section.titleEn,
      descriptionRu: section.descriptionRu,
      descriptionEn: section.descriptionEn,
      iconKey: section.iconKey,
      position: section.position,
      categoriesCount: categoriesCounts[index],
      entriesCount: entriesCounts[index],
    }));
  }
}
