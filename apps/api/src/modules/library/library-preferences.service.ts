import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  LibraryLocale,
  LibraryPreferencesDto,
  UpdateLibraryPreferencesRequest,
} from '@vedamatch/shared';
import { isLineagePreference, toLineagePreference } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';

const LOCALES: LibraryLocale[] = ['ru', 'en'];
const MAX_CONTENT_LANGUAGES = 8;

@Injectable()
export class LibraryPreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<LibraryPreferencesDto> {
    const row = await this.prisma.libraryPreference.findUnique({
      where: { userId },
    });
    return {
      uiLanguage: toLocale(row?.uiLanguage),
      contentLanguages: row?.contentLanguages ?? [],
      lineage: toLineagePreference(row?.lineage),
    };
  }

  async update(
    userId: string,
    body: UpdateLibraryPreferencesRequest,
  ): Promise<LibraryPreferencesDto> {
    if (body.uiLanguage && !LOCALES.includes(body.uiLanguage)) {
      throw new BadRequestException('unsupported_locale');
    }
    if (body.contentLanguages) {
      if (body.contentLanguages.length > MAX_CONTENT_LANGUAGES) {
        throw new BadRequestException('too_many_languages');
      }
      if (body.contentLanguages.some((value) => value.length > 8)) {
        throw new BadRequestException('unsupported_language');
      }
    }

    // Линия: идентификатор из справочника, `all` или `null` («как в
    // профиле»). Всё остальное — ошибка формы, а не новая линия.
    if (body.lineage !== undefined && !isLineagePreference(body.lineage)) {
      throw new BadRequestException('unsupported_lineage');
    }

    const update: Record<string, unknown> = {};
    if (body.uiLanguage) update.uiLanguage = body.uiLanguage;
    if (body.contentLanguages) update.contentLanguages = body.contentLanguages;
    if (body.lineage !== undefined) update.lineage = body.lineage;

    const row = await this.prisma.libraryPreference.upsert({
      where: { userId },
      create: {
        userId,
        uiLanguage: body.uiLanguage ?? 'ru',
        contentLanguages: body.contentLanguages ?? [],
        lineage: body.lineage ?? null,
      },
      update,
    });

    return {
      uiLanguage: toLocale(row.uiLanguage),
      contentLanguages: row.contentLanguages,
      lineage: toLineagePreference(row.lineage),
    };
  }
}

function toLocale(value: string | undefined): LibraryLocale {
  return value === 'en' ? 'en' : 'ru';
}
