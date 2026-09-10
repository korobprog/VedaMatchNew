"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type {
  WellnessRecipeDetail,
  WellnessRecipeMatchDto,
} from "@vedamatch/shared";
import {
  getWellnessRecipes,
  getWellnessRecipesForBasket,
} from "@/lib/wellness-api";
import { isAbort } from "./is-abort";

/**
 * Рецепты и подбор под корзину.
 *
 * Подбор идёт первым, но только когда в корзине что-то есть: пустой блок
 * «из вашей корзины ничего не выходит» — это упрёк человеку, а не помощь.
 */
export function RecipesView() {
  const [all, setAll] = useState<WellnessRecipeDetail[] | null>(null);
  const [matched, setMatched] = useState<WellnessRecipeMatchDto[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      getWellnessRecipes(controller.signal),
      getWellnessRecipesForBasket(controller.signal),
    ])
      .then(([recipes, forBasket]) => {
        setAll(recipes);
        setMatched(forBasket);
      })
      .catch((cause) => {
        if (isAbort(cause)) return;
        setError("Не удалось загрузить рецепты");
      });
    return () => controller.abort();
  }, []);

  if (error) {
    return (
      <p role="alert" className="text-sm text-magenta">
        {error}
      </p>
    );
  }
  if (!all) {
    return (
      <p role="status" className="text-sm text-text-1">
        Загружаем…
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {matched.length > 0 && (
        <section>
          <h2 className="font-display text-lg font-bold text-text-0">
            Из вашей корзины
          </h2>
          <p className="mt-1 text-sm text-text-1">
            Подбор не строгий: у продуктов есть только название и состав с
            упаковки. Смотрите список недостающего — он точный.
          </p>
          <ul className="mt-3 space-y-2">
            {matched.map((row) => (
              <li
                key={row.recipe.id}
                className="rounded-2xl border border-glass-brd bg-glass p-4"
              >
                <Link
                  href={`/wellness/recipes/${row.recipe.slug}`}
                  className="text-sm font-medium text-text-0 underline"
                >
                  {row.recipe.title}
                </Link>
                <p className="mt-1 text-xs text-cyan">
                  Есть: {row.have.join(", ")}
                </p>
                {row.missing.length > 0 && (
                  <p className="mt-0.5 text-xs text-text-2">
                    Докупить: {row.missing.join(", ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="font-display text-lg font-bold text-text-0">
          Все рецепты
        </h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {all.map((recipe) => (
            <li key={recipe.id}>
              <Link
                href={`/wellness/recipes/${recipe.slug}`}
                className="block h-full rounded-2xl border border-glass-brd bg-glass p-4"
              >
                <span className="block font-display text-base font-bold text-text-0">
                  {recipe.title}
                </span>
                {recipe.description && (
                  <span className="mt-1 block text-sm text-text-1">
                    {recipe.description}
                  </span>
                )}
                <span className="mt-2 block text-xs text-text-2">
                  {recipe.ingredients.length} ингредиентов
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
