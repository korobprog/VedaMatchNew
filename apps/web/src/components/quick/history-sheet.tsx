"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { useServiceNames } from "@/components/service-catalog-provider";
import { groupNavigationHistory } from "@/lib/navigation-history";
import {
  PORTAL_LOCATION_JOINER,
  portalLocation,
} from "@/lib/portal-location";
import {
  clearNavigationHistory,
  readNavigationHistory,
} from "./navigation-history-store";
import { withoutOneShotParams } from "@/lib/one-shot-params";

/**
 * История перемещений по порталу (VED-392).
 *
 * Одна строка — один заход в сервис: название сервиса выделено и стоит
 * ПЕРВЫМ, один раз, а за ним в ту же строку идут ступени, по которым в нём
 * прошли подряд, — «Работа · Доска · Повестка». Строка переносится у
 * правого края шторки, а не уезжает вбок: на экране 320 горизонтальной
 * прокрутки быть не должно. Каждое звено — ссылка назад.
 *
 * Выделение сервиса — полужирным шрифтом заголовков и `--vm-violet`: 5,61:1
 * поверх `--vm-bg-1` светлой темы и 7,69:1 тёмной (замерено по фактической
 * подложке шторки). Ступени — `--vm-text-1`, как подписи во всей панели
 * (см. комментарий в `quick-panel.tsx`). Цвет — не единственный признак:
 * сервис отличается ещё и начертанием, и местом в строке.
 *
 * Историю читаем один раз, при открытии шторки: шторка рисуется только по
 * нажатию, то есть уже в браузере, — ленивое начальное значение не даёт
 * расхождения гидратации (тем же способом снимает текущую страницу
 * `BookmarksSheet`).
 */
export function HistorySheet({
  onClose,
  onNavigate,
}: {
  onClose: () => void;
  /** Переход по ссылке закрывает и шторку, и саму панель. */
  onNavigate: () => void;
}) {
  const names = useServiceNames();
  const [entries, setEntries] = useState(() =>
    typeof window === "undefined" ? [] : readNavigationHistory(),
  );
  const [here] = useState(() =>
    typeof window === "undefined"
      ? null
      : `${window.location.pathname}${window.location.search}`,
  );
  const groups = useMemo(
    () =>
      groupNavigationHistory(entries, (url) => portalLocation(url, names)),
    [entries, names],
  );

  return (
    <div className="mt-3 rounded-xl border border-glass-brd bg-bg-1 p-3 text-sm text-text-1">
      {/* Своей прокрутки нет: листается вся панель (VED-399). */}
      <div>
        {groups.length === 0 ? (
          <p className="px-1 py-2 text-xs text-text-1">
            Пока пусто. Здесь появятся сервисы и разделы, где вы побываете, —
            ссылкой, чтобы вернуться.
          </p>
        ) : (
          <ol aria-label="История перемещений" className="space-y-0.5">
            {groups.map((group, index) => (
              <li
                // Один и тот же сервис встречается в истории много раз;
                // уникальна только пара «сервис + время последнего захода».
                key={`${group.key}:${group.at}:${index}`}
                className="flex flex-wrap items-center gap-x-0.5 rounded-lg px-1 py-0.5"
              >
                <Link
                  href={group.rootUrl}
                  onClick={onNavigate}
                  aria-current={group.rootUrl === here ? "page" : undefined}
                  className="inline-flex min-h-9 items-center rounded-md px-1 font-display text-[13px] font-bold text-violet transition-colors hover:bg-white/4"
                >
                  {group.root}
                </Link>
                {group.steps.map((step, at) => (
                  <Fragment key={`${step.url}:${at}`}>
                    <span aria-hidden="true" className="text-text-2">
                      {PORTAL_LOCATION_JOINER.trim()}
                    </span>
                    <Link
                      // Записи до VED-500 могли унести разовый ключ задачи.
                      href={withoutOneShotParams(step.url)}
                      onClick={onNavigate}
                      /* Одна ступень без сервиса скринридеру ничего не
                         говорит: «Доска» — чья? Полное имя места — то же,
                         что в подсказке кнопки окна. */
                      aria-label={`${group.root}${PORTAL_LOCATION_JOINER}${step.label}`}
                      aria-current={step.url === here ? "page" : undefined}
                      className="inline-flex min-h-9 items-center rounded-md px-1 text-sm text-text-1 transition-colors hover:bg-white/4 hover:text-text-0 aria-[current=page]:text-text-0 aria-[current=page]:underline"
                    >
                      {step.label}
                    </Link>
                  </Fragment>
                ))}
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {groups.length > 0 && (
          <button
            type="button"
            onClick={() => {
              clearNavigationHistory();
              setEntries([]);
            }}
            className="rounded-lg border border-glass-brd px-3 py-1.5 text-xs text-text-1 hover:text-text-0"
          >
            Очистить историю
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-glass-brd px-3 py-1.5 text-xs text-text-1 hover:text-text-0"
        >
          Закрыть
        </button>
      </div>
    </div>
  );
}
