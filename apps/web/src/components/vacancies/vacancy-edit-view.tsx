"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import type { VacancyOfferDto } from "@vedamatch/shared";
import { VacanciesApiError, getVacancy } from "@/lib/vacancies-api";
import { VacancyForm } from "./vacancy-form";

/** Загружает предложение и отдаёт форме; чужое или пропавшее — 404-текст. */
export function VacancyEditView({ id }: { id: string }) {
  const [offer, setOffer] = useState<VacancyOfferDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getVacancy(id)
      .then((found) => {
        if (!alive) return;
        if (!found.isMine) setError("Это не ваше предложение");
        else setOffer(found);
      })
      .catch((e: unknown) => {
        if (alive)
          setError(
            e instanceof VacanciesApiError && e.status === 404
              ? "Предложение не найдено"
              : "Не удалось загрузить предложение",
          );
      });
    return () => {
      alive = false;
    };
  }, [id]);

  if (error)
    return (
      <div className="glass rounded-2xl border border-glass-brd p-6 text-sm text-text-1">
        <p role="alert">{error}</p>
        <Link href="/vacancies/mine" className="mt-2 inline-block text-text-0 underline">
          Мои предложения
        </Link>
      </div>
    );

  if (!offer)
    return (
      <p className="flex items-center gap-2 text-sm text-text-1">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Загружаем…
      </p>
    );

  return <VacancyForm offer={offer} />;
}
