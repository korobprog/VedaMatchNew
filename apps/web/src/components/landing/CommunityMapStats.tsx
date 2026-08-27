"use client";

import { useRef } from "react";
import { useInView } from "framer-motion";
import { useTranslations } from "next-intl";
import type { ChatMapCommunity } from "@vedamatch/shared";
import { MemberCounter } from "@/components/member-counter";
import { summarizeCommunities } from "@/lib/landing/community-stats";

/**
 * Цифры над картой общин. Считаются из того же ответа, что рисует метки, —
 * разбор в lib/landing/community-stats.ts.
 *
 * Счёт запускается не при монтировании, а когда до блока долистали:
 * `MemberCounter` анимируется с появлением, а секция лежит глубоко на
 * странице — смонтируй её сразу, и гость дойдёт до готовых чисел, ни разу не
 * увидев самого счёта. `once: true` — считаем один раз: цифра, скачущая туда-
 * сюда при каждой прокрутке мимо, читается как поломка, а не как акцент.
 */
export function CommunityMapStats({
  communities,
}: {
  communities: ChatMapCommunity[];
}) {
  const t = useTranslations("Landing.serviceDetail");
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, amount: 0.6 });
  const summary = summarizeCommunities(communities);

  /*
    Подписи — в форме, которая согласуется с любым числом («Общин», а не
    «община»), как в счётчиках на главной. Склонять по живому числу нельзя:
    до появления в кадре счётчик показывает ноль, и «0 община на карте»
    осталось бы и в серверной разметке, и у гостя без JS.
  */
  const tiles = [
    { value: summary.communities, label: t("statCommunities") },
    { value: summary.cities, label: t("statCities") },
    { value: summary.talks, label: t("statTalks") },
  ];

  return (
    <div
      ref={ref}
      className="mx-auto mb-8 flex max-w-lg items-stretch justify-center gap-4 sm:gap-8"
    >
      {tiles.map((tile, index) => (
        <div key={tile.label} className="flex min-w-0 items-stretch gap-4 sm:gap-8">
          {index > 0 && <div className="w-px shrink-0 bg-glass-brd" />}
          <div className="min-w-0 text-center">
            <div className="font-display text-2xl md:text-3xl font-bold text-text-0">
              {/* До появления в кадре — тот же ноль, с которого начинает сам
                  счётчик: подмены числа на глазах не происходит. */}
              {seen ? <MemberCounter total={tile.value} /> : 0}
            </div>
            <div className="text-xs sm:text-sm text-text-1">{tile.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
