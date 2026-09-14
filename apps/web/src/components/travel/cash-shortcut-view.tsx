"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { TravelStayCardDto } from "@vedamatch/shared";
import { getManagedStays } from "@/lib/travel-api";
import { LAST_CASH_STAY_KEY } from "./cash-view";

function lastStay(): string | null {
  try {
    return window.localStorage.getItem(LAST_CASH_STAY_KEY);
  } catch {
    return null;
  }
}

/**
 * Вход в кассу с ярлыка приложения: сразу в форму дохода той кассы, что
 * открывали последней. Выбор объекта — только если их несколько и последняя
 * касса неизвестна или больше недоступна.
 */
export function CashShortcutView() {
  const router = useRouter();
  const [stays, setStays] = useState<TravelStayCardDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void getManagedStays(controller.signal)
      .then(({ items }) => {
        const remembered = lastStay();
        const target =
          items.find((stay) => stay.id === remembered) ??
          (items.length === 1 ? items[0] : null);
        if (target) {
          router.replace(`/travel/manage/${target.id}/cash?add=income`);
          return;
        }
        setStays(items);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "Не загрузилось");
      });
    return () => controller.abort();
  }, [router]);

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl text-text-0">Касса</h1>
      {error ? (
        <p role="alert" className="text-sm text-magenta">
          {error}
        </p>
      ) : !stays ? (
        <p className="text-sm text-text-2">Открываем кассу…</p>
      ) : stays.length === 0 ? (
        <p className="text-sm text-text-1">
          Касса ведётся у объекта размещения.{" "}
          <Link
            href="/travel/manage"
            className="text-text-0 underline underline-offset-4"
          >
            Завести объект
          </Link>
        </p>
      ) : (
        <>
          <p className="text-sm text-text-1">Какую кассу открыть?</p>
          <ul className="space-y-2">
            {stays.map((stay) => (
              <li key={stay.id}>
                <Link
                  href={`/travel/manage/${stay.id}/cash?add=income`}
                  className="block rounded-2xl border border-glass-brd bg-glass px-4 py-3 text-text-0"
                >
                  {stay.name}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
