"use client";

import { useEffect, useState } from "react";
import {
  WELLNESS_INGREDIENT_CLASSES,
  type WellnessIngredientClass,
} from "@vedamatch/shared";
import {
  getWellnessDiet,
  updateWellnessDiet,
  WellnessApiError,
} from "@/lib/wellness-api";
import { isAbort } from "@/lib/is-abort";
import { ingredientClassLabel } from "./verdict-labels";

/**
 * Ограничения человека. Без них сканер честно молчит: судить не о чем, и
 * вердикт всегда «подходит». Поэтому экран начинается с готовых наборов —
 * иначе первый скан ничего не покажет и сервис выглядит сломанным.
 */
const PRESETS: { name: string; hint: string; classes: WellnessIngredientClass[] }[] =
  [
    {
      name: "Вегетарианец",
      hint: "Без мяса, рыбы, желатина и сычужного фермента",
      classes: ["meat", "fish", "gelatin", "rennet"],
    },
    {
      name: "Вайшнав",
      hint: "То же плюс лук, чеснок и грибы",
      classes: [
        "meat",
        "fish",
        "egg",
        "gelatin",
        "rennet",
        "onion",
        "garlic",
        "mushroom",
      ],
    },
    {
      name: "Строгий",
      hint: "Плюс молочное, мёд, алкоголь, кофеин и спорные добавки",
      classes: [...WELLNESS_INGREDIENT_CLASSES].filter(
        (value) => value !== "other",
      ),
    },
  ];

export function DietForm() {
  const [excluded, setExcluded] = useState<WellnessIngredientClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getWellnessDiet(controller.signal)
      .then((profile) => {
        setExcluded(profile.excluded);
        setLoading(false);
      })
      .catch((cause) => {
        if (isAbort(cause)) return;
        setError("Не удалось загрузить настройки");
        setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const toggle = (value: WellnessIngredientClass) => {
    setSaved(false);
    setExcluded((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateWellnessDiet({ excluded });
      setSaved(true);
    } catch (cause) {
      setError(
        cause instanceof WellnessApiError
          ? cause.message
          : "Не удалось сохранить",
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <p role="status" className="text-sm text-text-1">
        Загружаем настройки…
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-lg font-bold text-text-0">
          Готовые наборы
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.name}
              type="button"
              onClick={() => {
                setSaved(false);
                setExcluded(preset.classes);
              }}
              className="rounded-xl border border-glass-brd px-3 py-2 text-left"
            >
              <span className="block text-sm font-medium text-text-0">
                {preset.name}
              </span>
              <span className="block text-xs text-text-2">{preset.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <fieldset>
        <legend className="font-display text-lg font-bold text-text-0">
          Что исключаем
        </legend>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {WELLNESS_INGREDIENT_CLASSES.filter((value) => value !== "other").map(
            (value) => (
              <label
                key={value}
                className="flex items-center gap-3 rounded-xl border border-glass-brd px-3 py-2"
              >
                <input
                  type="checkbox"
                  checked={excluded.includes(value)}
                  onChange={() => toggle(value)}
                  className="size-4"
                />
                <span className="text-sm text-text-0">
                  {ingredientClassLabel(value)}
                </span>
              </label>
            ),
          )}
        </div>
      </fieldset>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded-xl bg-magenta px-4 py-2 text-sm font-medium text-bg-0 disabled:opacity-50"
        >
          Сохранить
        </button>
        {saved && (
          <span role="status" className="text-sm text-cyan">
            Сохранено
          </span>
        )}
        {error && (
          <span role="alert" className="text-sm text-magenta">
            {error}
          </span>
        )}
      </div>

      {excluded.length === 0 && (
        <p className="rounded-xl border border-glass-brd px-3 py-2 text-sm text-text-1">
          Пока ничего не исключено — сканер будет показывать состав, но не
          станет судить, подходит вам продукт или нет.
        </p>
      )}
    </div>
  );
}
