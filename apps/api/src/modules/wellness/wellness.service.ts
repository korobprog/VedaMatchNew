import { Injectable } from '@nestjs/common';
import { WELLNESS_HISTORY_LIMIT } from '@vedamatch/shared';
import type {
  WellnessBasketDto,
  WellnessBasketItemDto,
  WellnessDietProfileDto,
  WellnessHistoryItem,
  WellnessIngredientDto,
  WellnessProductCard,
  WellnessScanResult,
  WellnessVerdictResult,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { summarizeBasket } from './basket-summary';
import { resolveVerdict, type WellnessDietRestrictions } from './diet-verdict';
import {
  matchIngredients,
  type WellnessIngredientEntry,
} from './ingredient-match';
import { parseComposition } from './ingredient-parse';
import type { ParsedProductInput, ParsedScanInput } from './wellness-dto';

/** Справочник меняется редко, а читается на каждый скан. */
const CATALOG_TTL_MS = 60_000;

type ProductRow = {
  id: string;
  barcode: string;
  name: string;
  brand: string | null;
  ingredientsRaw: string;
  imageUrl: string | null;
  source: WellnessProductCard['source'];
  status: WellnessProductCard['status'];
  createdAt: Date;
};

function toCard(row: ProductRow): WellnessProductCard {
  return {
    id: row.id,
    barcode: row.barcode,
    name: row.name,
    brand: row.brand,
    ingredientsRaw: row.ingredientsRaw,
    imageUrl: row.imageUrl,
    source: row.source,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

const CARD_SELECT = {
  id: true,
  barcode: true,
  name: true,
  brand: true,
  ingredientsRaw: true,
  imageUrl: true,
  source: true,
  status: true,
  createdAt: true,
} as const;

@Injectable()
export class WellnessService {
  private catalog: { entries: WellnessIngredientEntry[]; at: number } | null =
    null;

  constructor(private readonly prisma: PrismaService) {}

  /** Справочник целиком: он мал (сотни записей) и нужен на каждый разбор. */
  async ingredients(): Promise<WellnessIngredientEntry[]> {
    if (this.catalog && Date.now() - this.catalog.at < CATALOG_TTL_MS) {
      return this.catalog.entries;
    }
    const rows = await this.prisma.wellnessIngredient.findMany({
      select: {
        key: true,
        nameRu: true,
        aliases: true,
        class: true,
        severity: true,
        eNumber: true,
        noteRu: true,
      },
    });
    const entries: WellnessIngredientEntry[] = rows.map((row) => ({
      key: row.key,
      aliases: row.aliases,
      class: row.class,
      severity: row.severity,
      name: row.nameRu,
      eNumber: row.eNumber,
      note: row.noteRu,
    }));
    this.catalog = { entries, at: Date.now() };
    return entries;
  }

  /** Сбрасывается при правке справочника из админки. */
  forgetCatalog(): void {
    this.catalog = null;
  }

  async catalogForUi(): Promise<WellnessIngredientDto[]> {
    const rows = await this.prisma.wellnessIngredient.findMany({
      orderBy: [{ class: 'asc' }, { nameRu: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      key: row.key,
      name: row.nameRu,
      nameRu: row.nameRu,
      nameEn: row.nameEn,
      aliases: row.aliases,
      class: row.class,
      severity: row.severity,
      eNumber: row.eNumber,
      note: row.noteRu,
    }));
  }

  async restrictions(userId: string): Promise<WellnessDietRestrictions> {
    const profile = await this.prisma.wellnessDietProfile.findUnique({
      where: { userId },
      select: { excluded: true, excludedKeys: true },
    });
    return {
      excluded: profile?.excluded ?? [],
      excludedKeys: profile?.excludedKeys ?? [],
    };
  }

  async diet(userId: string): Promise<WellnessDietProfileDto> {
    const profile = await this.prisma.wellnessDietProfile.findUnique({
      where: { userId },
    });
    return {
      excluded: profile?.excluded ?? [],
      excludedKeys: profile?.excludedKeys ?? [],
      updatedAt: profile?.updatedAt.toISOString() ?? null,
    };
  }

  async updateDiet(
    userId: string,
    next: WellnessDietRestrictions,
  ): Promise<WellnessDietProfileDto> {
    const profile = await this.prisma.wellnessDietProfile.upsert({
      where: { userId },
      create: { userId, ...next },
      update: next,
    });
    return {
      excluded: profile.excluded,
      excludedKeys: profile.excludedKeys,
      updatedAt: profile.updatedAt.toISOString(),
    };
  }

  /** Разбор состава и вердикт под конкретного человека. */
  async evaluate(
    ingredientsRaw: string,
    restrictions: WellnessDietRestrictions,
  ): Promise<WellnessVerdictResult> {
    const entries = await this.ingredients();
    const { matches, unrecognized } = matchIngredients(
      parseComposition(ingredientsRaw),
      entries,
    );
    return resolveVerdict(matches, unrecognized, restrictions);
  }

  async productByBarcode(barcode: string): Promise<WellnessProductCard | null> {
    const row = await this.prisma.wellnessProduct.findFirst({
      where: { barcode, status: 'published' },
      select: CARD_SELECT,
    });
    return row ? toCard(row) : null;
  }

  /**
   * Ответ у полки. Продукта может не быть — тогда это не ошибка, а приглашение
   * снять состав: на старте база пустая, и «не найдено» здесь главный путь.
   */
  async scan(
    userId: string,
    input: ParsedScanInput,
  ): Promise<WellnessScanResult> {
    const restrictions = await this.restrictions(userId);
    const product =
      input.kind === 'photo' || !input.barcode
        ? null
        : await this.productByBarcode(input.barcode);

    const source = input.ingredientsRaw ?? product?.ingredientsRaw ?? '';
    const result: WellnessVerdictResult = source
      ? await this.evaluate(source, restrictions)
      : { verdict: 'unknown', reasons: [], hidden: [], unrecognized: [] };

    await this.prisma.wellnessScan.create({
      data: {
        userId,
        kind: input.kind,
        barcode: input.barcode,
        productId: product?.id ?? null,
        ingredientsRaw: input.ingredientsRaw,
        imageUrl: input.imageUrl,
        verdict: result.verdict,
      },
    });

    return {
      kind: input.kind,
      barcode: input.barcode,
      product,
      ingredientsRaw: source || null,
      result,
    };
  }

  async history(userId: string): Promise<WellnessHistoryItem[]> {
    const rows = await this.prisma.wellnessScan.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: WELLNESS_HISTORY_LIMIT,
      select: {
        id: true,
        kind: true,
        barcode: true,
        productId: true,
        verdict: true,
        createdAt: true,
        product: { select: { name: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      barcode: row.barcode,
      productId: row.productId,
      productName: row.product?.name ?? null,
      verdict: row.verdict,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  /**
   * Продукт от человека уходит в очередь модерации: до проверки он не отвечает
   * порталу, иначе чужая опечатка врёт всем.
   */
  async createProduct(
    userId: string,
    input: ParsedProductInput,
  ): Promise<WellnessProductCard> {
    const existing = await this.prisma.wellnessProduct.findUnique({
      where: { barcode: input.barcode },
      select: CARD_SELECT,
    });
    if (existing) return toCard(existing);

    const row = await this.prisma.wellnessProduct.create({
      data: { ...input, addedById: userId, source: 'user', status: 'draft' },
      select: CARD_SELECT,
    });
    await this.storeComposition(row.id, row.ingredientsRaw);
    return toCard(row);
  }

  /** Разобранный состав лежит рядом с продуктом: он нужен админке и поиску. */
  async storeComposition(
    productId: string,
    ingredientsRaw: string,
  ): Promise<void> {
    const entries = await this.ingredients();
    const { matches } = matchIngredients(
      parseComposition(ingredientsRaw),
      entries,
    );
    const ids = await this.prisma.wellnessIngredient.findMany({
      where: { key: { in: matches.map((match) => match.entry.key) } },
      select: { id: true, key: true },
    });
    const idByKey = new Map(ids.map((row) => [row.key, row.id]));

    await this.prisma.wellnessProductIngredient.deleteMany({
      where: { productId },
    });
    const rows = matches
      .map((match) => ({
        productId,
        ingredientId: idByKey.get(match.entry.key) ?? '',
        matchedText: match.matchedText,
        position: match.position,
        severity: match.severity,
      }))
      .filter((row) => row.ingredientId);
    if (rows.length) {
      await this.prisma.wellnessProductIngredient.createMany({ data: rows });
    }
  }

  async report(
    userId: string,
    productId: string,
    comment: string,
  ): Promise<void> {
    await this.prisma.wellnessProductReport.create({
      data: { productId, authorId: userId, comment },
    });
  }

  /**
   * Корзина с вердиктом по каждой позиции. Вердикт считается на лету, а не
   * берётся из истории: человек мог поменять ограничения после того, как
   * положил продукт, и старый ответ был бы враньём.
   */
  async basket(userId: string): Promise<WellnessBasketDto> {
    const rows = await this.prisma.wellnessBasketItem.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true, product: { select: CARD_SELECT } },
    });

    const restrictions = await this.restrictions(userId);
    const items: WellnessBasketItemDto[] = [];
    for (const row of rows) {
      items.push({
        id: row.id,
        product: toCard(row.product),
        result: await this.evaluate(row.product.ingredientsRaw, restrictions),
        createdAt: row.createdAt.toISOString(),
      });
    }

    return {
      items,
      summary: summarizeBasket(items.map((item) => item.result.verdict)),
    };
  }

  async addToBasket(userId: string, productId: string): Promise<void> {
    await this.prisma.wellnessBasketItem.upsert({
      where: { userId_productId: { userId, productId } },
      create: { userId, productId },
      update: {},
    });
  }

  async removeFromBasket(userId: string, productId: string): Promise<void> {
    await this.prisma.wellnessBasketItem.deleteMany({
      where: { userId, productId },
    });
  }
}
