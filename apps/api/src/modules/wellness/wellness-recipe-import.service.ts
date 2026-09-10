import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  parseChapterSize,
  parseHeadings,
  parseRecipePage,
} from './gitabase-recipe-parse';

/**
 * Импорт рецептов из кулинарных книг gitabase.
 *
 * Запускается только из админки и только руками: это выкачивание чужой книги,
 * и оно должно быть осознанным действием оператора портала, а не фоновой
 * задачей. Каждый рецепт ложится черновиком с указанием книги и ссылкой на
 * оригинал — без проверяемого адреса атрибуция это просто слова.
 *
 * Между запросами держится пауза: мы в гостях у чужого сайта.
 */
const BASE_URL = 'https://gitabase.com/the/prasad/rus';
const PAUSE_MS = 700;
const MAX_CHAPTER = 30;

export interface ImportOutcome {
  book: string;
  chapters: number;
  imported: number;
  skipped: number;
}

@Injectable()
export class WellnessRecipeImportService {
  private readonly log = new Logger(WellnessRecipeImportService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Страница объявляет UTF-8, но встречаются битые байты — декодируем
   * снисходительно, иначе одна опечатка издателя рушит всю главу.
   */
  private async page(url: string): Promise<string | null> {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'VedaMatch/1.0 (wellness recipe import)' },
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) return null;
      const bytes = await response.arrayBuffer();
      return new TextDecoder('utf-8').decode(bytes);
    } catch (error) {
      this.log.warn(`Не удалось прочитать ${url}: ${String(error)}`);
      return null;
    }
  }

  private static pause(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
  }

  /** Одна глава книги. `chapter` — её номер в адресе. */
  async importChapter(book: string, chapter: number): Promise<ImportOutcome> {
    const outcome: ImportOutcome = {
      book,
      chapters: 1,
      imported: 0,
      skipped: 0,
    };

    const index = await this.page(`${BASE_URL}/${book}/${chapter}`);
    if (!index) return outcome;

    const size = parseChapterSize(index);
    const bookTitle = parseHeadings(index).book;

    for (let text = 1; text <= size; text += 1) {
      await WellnessRecipeImportService.pause();
      const url = `${BASE_URL}/${book}/${chapter}/${text}`;
      const html = await this.page(url);
      if (!html) {
        outcome.skipped += 1;
        continue;
      }
      const parsed = parseRecipePage(html);
      if (!parsed || !parsed.ingredients.length) {
        outcome.skipped += 1;
        continue;
      }

      await this.save({
        slug: `gitabase-${book.toLowerCase()}-${chapter}-${text}`,
        title: parsed.title,
        description: parsed.description,
        steps: parsed.steps.join('\n'),
        ingredients: parsed.ingredients,
        sourceRu: bookTitle,
        sourceUrl: url,
      });
      outcome.imported += 1;
    }

    return outcome;
  }

  /** Вся книга: главы перебираются по номерам, пока они находятся. */
  async importBook(book: string): Promise<ImportOutcome> {
    const total: ImportOutcome = {
      book,
      chapters: 0,
      imported: 0,
      skipped: 0,
    };
    for (let chapter = 1; chapter <= MAX_CHAPTER; chapter += 1) {
      const one = await this.importChapter(book, chapter);
      if (one.imported === 0 && one.skipped === 0) break;
      total.chapters += 1;
      total.imported += one.imported;
      total.skipped += one.skipped;
    }
    return total;
  }

  /**
   * Повторный импорт не плодит копий и не затирает правки администратора:
   * статус существующего рецепта остаётся прежним.
   */
  private async save(input: {
    slug: string;
    title: string;
    description: string | null;
    steps: string;
    ingredients: string[];
    sourceRu: string | null;
    sourceUrl: string;
  }): Promise<void> {
    const fields = {
      titleRu: input.title,
      descriptionRu: input.description,
      steps: input.steps,
      sourceRu: input.sourceRu,
      sourceUrl: input.sourceUrl,
    };
    const saved = await this.prisma.wellnessRecipe.upsert({
      where: { slug: input.slug },
      update: fields,
      create: { slug: input.slug, ...fields, status: 'draft' },
    });

    await this.prisma.wellnessRecipeIngredient.deleteMany({
      where: { recipeId: saved.id },
    });
    await this.prisma.wellnessRecipeIngredient.createMany({
      data: input.ingredients.map((nameRu, index) => ({
        recipeId: saved.id,
        nameRu,
        amountRu: null,
        position: index,
      })),
    });
  }
}
