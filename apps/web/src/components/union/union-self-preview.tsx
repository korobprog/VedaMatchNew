"use client";

import { useEffect, useState } from "react";
import type { UnionRecommendation } from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";
import { Card, CardTitle } from "@/components/ui/card";
import { RecommendationCard } from "./recommendation-card";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * «Как вас видят» — собственная анкета, показанная той же карточкой, что и
 * чужие. Процент заполнения человека не трогает: он не переводится в
 * «карточка без лица, её пролистают». Пустое место вместо фото — переводится.
 *
 * Данные берутся тем же путём, что и у постороннего (`/union/users/:id`),
 * поэтому превью честное: приватность и подписи фото отработают ровно так,
 * как отработают у смотрящего, который ещё не в паре.
 */
export function UnionSelfPreview({ userId }: { userId: string }) {
  const [item, setItem] = useState<UnionRecommendation | null>(null);
  const [inactive, setInactive] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch(`${API_URL}/union/users/${encodeURIComponent(userId)}`, {
      credentials: "include",
      signal: controller.signal,
    })
      .then(async (res) => {
        // 404 здесь означает не «нет такого человека», а «анкета выключена
        // и в ленте её не показывают» — это как раз то, что стоит сказать.
        if (res.status === 404) {
          setInactive(true);
          return null;
        }
        if (!res.ok) return null;
        return (await res.json()) as UnionRecommendation;
      })
      .then((data) => data && setItem(data))
      .catch(() => undefined);
    return () => controller.abort();
  }, [userId]);

  if (inactive) {
    return (
      <Card className="p-6">
        <CardTitle className="mb-2 text-lg">Как вас видят</CardTitle>
        <p className="text-sm text-text-1">
          Анкета сейчас выключена — в ленте знакомств её не показывают.
        </p>
      </Card>
    );
  }

  if (!item) return null;

  const hasPhotos = item.user.photos.length > 0;

  return (
    <Card className="p-6">
      <CardTitle className="mb-2 text-lg">Как вас видят</CardTitle>
      <p className="mb-4 text-sm text-text-1">
        Так ваша анкета выглядит в ленте у человека, который вас ещё не знает.
      </p>
      {!hasPhotos && (
        <p className="mb-4 rounded-xl border border-gold/40 bg-gold/10 px-3 py-2 text-sm text-text-1">
          Фото нет — вместо него показывают аватарку или первую букву имени.
          Такие карточки пролистывают чаще всего.
        </p>
      )}
      <div className="mx-auto max-w-xs">
        <RecommendationCard item={item} preview />
      </div>
    </Card>
  );
}
