"use client";

import { useEffect, useState } from "react";
import type { WellnessRecipeDetail } from "@vedamatch/shared";
import { getWellnessRecipe, WellnessApiError } from "@/lib/wellness-api";
import { isAbort } from "@/lib/is-abort";

export function RecipeDetailView({ slug }: { slug: string }) {
  const [recipe, setRecipe] = useState<WellnessRecipeDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getWellnessRecipe(slug, controller.signal)
      .then(setRecipe)
      .catch((cause) => {
        if (isAbort(cause)) return;
        if (cause instanceof WellnessApiError && cause.status === 404) {
          setMissing(true);
          return;
        }
        setError("Не удалось загрузить рецепт");
      });
    return () => controller.abort();
  }, [slug]);

  if (error) {
    return (
      <p role="alert" className="text-sm text-magenta">
        {error}
      </p>
    );
  }
  if (missing) {
    return <p className="text-sm text-text-1">Такого рецепта у нас нет.</p>;
  }
  if (!recipe) {
    return (
      <p role="status" className="text-sm text-text-1">
        Загружаем…
      </p>
    );
  }

  return (
    <article className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-text-0">
          {recipe.title}
        </h1>
        {recipe.description && (
          <p className="mt-2 text-sm text-text-1">{recipe.description}</p>
        )}
        {recipe.source && (
          <p className="mt-2 text-xs text-text-2">Источник: {recipe.source}</p>
        )}
      </header>

      <section>
        <h2 className="font-display text-lg font-bold text-text-0">
          Что понадобится
        </h2>
        <ul className="mt-2 space-y-1">
          {recipe.ingredients.map((item) => (
            <li key={item.nameRu} className="text-sm text-text-1">
              {item.nameRu}
              {item.amountRu && (
                <span className="text-text-2"> — {item.amountRu}</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {recipe.steps && (
        <section>
          <h2 className="font-display text-lg font-bold text-text-0">
            Как готовить
          </h2>
          <div className="mt-2 space-y-1">
            {recipe.steps.split("\n").map((line) => (
              <p key={line} className="text-sm text-text-1">
                {line}
              </p>
            ))}
          </div>
        </section>
      )}

      {recipe.kcalPer100g !== null && (
        <p className="text-xs text-text-2">
          Примерно {recipe.kcalPer100g} ккал на 100 г.
        </p>
      )}
    </article>
  );
}
