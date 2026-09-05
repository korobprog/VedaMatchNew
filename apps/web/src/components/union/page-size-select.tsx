"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  UNION_PAGE_SIZES,
  resolveUnionPageSize,
  type UnionPageSize,
} from "./page-size";

/**
 * «Показывать по …» рядом с перелистыванием — там, где и возникает вопрос.
 *
 * Значение живёт в адресе, как и все остальные фильтры этого экрана: город,
 * пол, возраст сбрасываются при новом заходе точно так же, и держать одно
 * поле из десяти в хранилище устройства значило бы завести два разных
 * правила на одну панель.
 *
 * Смена размера возвращает на первую страницу: «страница 4 по 12» и
 * «страница 4 по 48» — разные места выдачи, и человек, попросивший показать
 * больше, оказался бы не там, где стоял, а заметно дальше.
 */
export function UnionPageSizeSelect({
  params,
}: {
  params: Record<string, string | string[] | undefined>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = resolveUnionPageSize(params.pageSize);

  function choose(size: UnionPageSize) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("pageSize", String(size));
    next.set("page", "1");
    router.push(`/union/recommendations?${next.toString()}`);
  }

  return (
    <label className="inline-flex items-center gap-2 text-sm text-text-2">
      Показывать по
      <select
        value={current}
        onChange={(event) => choose(Number(event.target.value) as UnionPageSize)}
        className="rounded-xl border border-glass-brd bg-bg-1 px-2 py-1.5 text-sm text-text-0"
      >
        {UNION_PAGE_SIZES.map((size) => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </select>
    </label>
  );
}
