"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { WellnessHistoryItem } from "@vedamatch/shared";
import { getWellnessHistory } from "@/lib/wellness-api";
import { verdictLook } from "./verdict-labels";

const KIND_LABEL: Record<WellnessHistoryItem["kind"], string> = {
  barcode: "штрихкод",
  photo: "снимок состава",
  manual: "ввод вручную",
};

export function HistoryList() {
  const [items, setItems] = useState<WellnessHistoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getWellnessHistory(controller.signal)
      .then(setItems)
      .catch(() => setError("Не удалось загрузить историю"));
    return () => controller.abort();
  }, []);

  if (error) {
    return (
      <p role="alert" className="text-sm text-magenta">
        {error}
      </p>
    );
  }
  if (!items) {
    return (
      <p role="status" className="text-sm text-text-1">
        Загружаем…
      </p>
    );
  }
  if (!items.length) {
    return (
      <p className="text-sm text-text-1">
        Здесь появятся продукты, которые вы проверяли.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const look = verdictLook(item.verdict);
        return (
          <li
            key={item.id}
            className="flex items-center gap-3 rounded-xl border border-glass-brd px-3 py-2"
          >
            <span aria-hidden className="font-mono text-text-1">
              {look.glyph}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-text-0">
                {item.productName ?? item.barcode ?? "Снимок состава"}
              </span>
              <span className="block text-xs text-text-2">
                {look.label} · {KIND_LABEL[item.kind]} ·{" "}
                {new Date(item.createdAt).toLocaleDateString("ru-RU")}
              </span>
            </span>
            {item.barcode && (
              <Link
                href={`/wellness/products/${item.barcode}`}
                className="text-sm text-cyan underline"
              >
                Открыть
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
