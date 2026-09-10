import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  WellnessRecipeCard,
  WellnessRecipeDetail,
  WellnessRecipeMatchDto,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { rankRecipes } from './recipe-match';

const RECIPE_SELECT = {
  id: true,
  slug: true,
  titleRu: true,
  descriptionRu: true,
  sourceRu: true,
  kcalPer100g: true,
  status: true,
  steps: true,
  ingredients: {
    orderBy: { position: 'asc' },
    select: { nameRu: true, amountRu: true },
  },
} as const;

type RecipeRow = {
  id: string;
  slug: string;
  titleRu: string;
  descriptionRu: string | null;
  sourceRu: string | null;
  kcalPer100g: number | null;
  status: WellnessRecipeCard['status'];
  steps: string | null;
  ingredients: { nameRu: string; amountRu: string | null }[];
};

function toDetail(row: RecipeRow): WellnessRecipeDetail {
  return {
    id: row.id,
    slug: row.slug,
    title: row.titleRu,
    description: row.descriptionRu,
    source: row.sourceRu,
    kcalPer100g: row.kcalPer100g,
    status: row.status,
    steps: row.steps,
    ingredients: row.ingredients.map((item) => ({
      nameRu: item.nameRu,
      amountRu: item.amountRu,
    })),
  };
}

/**
 * Рецепты сервиса «Здоровье» и подбор их под корзину.
 *
 * Подбор идёт по названиям и составам продуктов корзины: разметки «этот
 * продукт — мука» у нас нет и не будет, пока люди приносят состав с упаковки.
 * Поэтому предложение мягкое, а список недостающего — точный.
 */
@Injectable()
export class WellnessRecipesService {
  constructor(private readonly prisma: PrismaService) {}

  async published(): Promise<WellnessRecipeDetail[]> {
    const rows = await this.prisma.wellnessRecipe.findMany({
      where: { status: 'published' },
      orderBy: { titleRu: 'asc' },
      select: RECIPE_SELECT,
    });
    return rows.map(toDetail);
  }

  async bySlug(slug: string): Promise<WellnessRecipeDetail> {
    const row = await this.prisma.wellnessRecipe.findFirst({
      where: { slug, status: 'published' },
      select: RECIPE_SELECT,
    });
    if (!row) throw new NotFoundException('Рецепт не найден');
    return toDetail(row);
  }

  /** Что приготовить из набранного. Пустая корзина — пустой ответ, без выдумок. */
  async forBasket(userId: string): Promise<WellnessRecipeMatchDto[]> {
    const basket = await this.prisma.wellnessBasketItem.findMany({
      where: { userId },
      select: { product: { select: { name: true, ingredientsRaw: true } } },
    });
    if (!basket.length) return [];

    const haystacks = basket.flatMap((row) => [
      row.product.name,
      row.product.ingredientsRaw,
    ]);
    const recipes = await this.published();

    return rankRecipes(
      recipes.map((recipe) => ({
        recipe,
        ingredients: recipe.ingredients.map((item) => item.nameRu),
      })),
      haystacks,
    ).map((row) => ({
      recipe: row.recipe,
      have: row.match.have,
      missing: row.match.missing,
      ratio: row.match.ratio,
    }));
  }

  /** Админка: все рецепты, включая черновики. */
  async all(): Promise<WellnessRecipeDetail[]> {
    const rows = await this.prisma.wellnessRecipe.findMany({
      orderBy: { titleRu: 'asc' },
      select: RECIPE_SELECT,
    });
    return rows.map(toDetail);
  }

  async setStatus(
    id: string,
    status: WellnessRecipeCard['status'],
  ): Promise<{ id: string; status: string }> {
    const exists = await this.prisma.wellnessRecipe.count({ where: { id } });
    if (!exists) throw new NotFoundException('Рецепт не найден');
    return this.prisma.wellnessRecipe.update({
      where: { id },
      data: { status },
      select: { id: true, status: true },
    });
  }

  async remove(id: string): Promise<void> {
    await this.prisma.wellnessRecipe.deleteMany({ where: { id } });
  }
}
