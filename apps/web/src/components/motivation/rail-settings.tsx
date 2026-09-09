"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Minus, Plus, RotateCcw } from "lucide-react";
import {
  DEFAULT_RAIL,
  RAIL_ACTIONS,
  RAIL_STORAGE_KEY,
  moveRailAction,
  parseRailConfig,
  railActionMeta,
  serializeRailConfig,
  toggleRailAction,
  type RailActionId,
} from "./rail-actions";

/**
 * Настройка ряда кнопок под афоризмом.
 *
 * Живёт здесь, а не в самой ленте: ряд и без того тесен, и девятая кнопка
 * «настроить» спорила бы с тем, ради чего настройку заводят. Из ленты сюда
 * ведёт «Настройки ленты» в её конце — и, если человек захочет, своя кнопка
 * «Настройки» прямо в ряду.
 *
 * Стрелками, а не перетаскиванием: настройку открывают с телефона одной
 * рукой, и жест на десяти строках промахивается чаще, чем попадает.
 */
export function MotivationRailSettings() {
  const [ids, setIds] = useState<RailActionId[]>([...DEFAULT_RAIL]);
  const [saved, setSaved] = useState(false);

  /* Читаем эффектом: на сервере `localStorage` нет, и ленивый `useState` дал
     бы расхождение гидратации. Тем же способом читают своё панель горячих
     кнопок портала и переключатель темы. */
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- см. комментарий выше. */
    try {
      setIds(parseRailConfig(window.localStorage.getItem(RAIL_STORAGE_KEY)));
    } catch {
      setIds([...DEFAULT_RAIL]);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  function apply(next: RailActionId[]) {
    setIds(next);
    try {
      window.localStorage.setItem(RAIL_STORAGE_KEY, serializeRailConfig(next));
      setSaved(true);
    } catch {
      // Приватный режим: раскладка живёт до конца сессии.
    }
  }

  const rest = RAIL_ACTIONS.filter((action) => !ids.includes(action.id));

  return (
    <section className="mt-6 rounded-2xl border border-glass-brd bg-bg-1 p-4">
      <h2 className="font-display text-lg font-bold text-text-0">
        Ряд кнопок под афоризмом
      </h2>
      <p className="mt-1 text-sm text-text-1">
        Кнопки делят ширину экрана поровну, поэтому каждая лишняя отнимает у
        остальных. Оставьте те, которыми пользуетесь, и поставьте в удобном
        порядке — сверху вниз здесь, слева направо в ленте.
      </p>
      {/* Честно говорим, где это хранится: человек вправе знать, почему на
          другом телефоне ряд прежний. */}
      <p className="mt-1 text-xs text-text-2">
        Раскладка запоминается на этом устройстве.
      </p>

      <h3 className="mt-4 text-sm font-semibold text-text-0">В ряду</h3>
      {ids.length === 0 ? (
        <p className="mt-2 text-sm text-text-2">
          Ряд пуст — под афоризмом не будет ни одной кнопки. Это тоже выбор,
          вернуть их можно ниже.
        </p>
      ) : (
        <ol className="mt-2 space-y-2">
          {ids.map((id, index) => {
            const meta = railActionMeta(id);
            return (
              <li
                key={id}
                className="flex items-start gap-2 rounded-xl border border-glass-brd bg-bg-0 p-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-text-0">
                    {index + 1}. {meta.label}
                  </span>
                  <span className="block text-xs text-text-1">{meta.hint}</span>
                  {meta.onlyWhen && (
                    <span className="block text-xs text-text-2">
                      {meta.onlyWhen}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  disabled={index === 0}
                  aria-label={`Передвинуть «${meta.label}» левее`}
                  onClick={() => apply(moveRailAction(ids, id, -1))}
                  className="rounded-lg p-2 text-text-1 hover:text-text-0 disabled:opacity-30"
                >
                  <ArrowUp aria-hidden className="size-4" />
                </button>
                <button
                  type="button"
                  disabled={index === ids.length - 1}
                  aria-label={`Передвинуть «${meta.label}» правее`}
                  onClick={() => apply(moveRailAction(ids, id, 1))}
                  className="rounded-lg p-2 text-text-1 hover:text-text-0 disabled:opacity-30"
                >
                  <ArrowDown aria-hidden className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label={`Убрать «${meta.label}» из ряда`}
                  onClick={() => apply(toggleRailAction(ids, id))}
                  className="rounded-lg p-2 text-text-1 hover:text-magenta"
                >
                  <Minus aria-hidden className="size-4" />
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {rest.length > 0 && (
        <>
          <h3 className="mt-4 text-sm font-semibold text-text-0">
            Можно добавить
          </h3>
          <ul className="mt-2 space-y-2">
            {rest.map((meta) => (
              <li
                key={meta.id}
                className="flex items-start gap-2 rounded-xl border border-dashed border-glass-brd p-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-text-0">
                    {meta.label}
                  </span>
                  <span className="block text-xs text-text-1">{meta.hint}</span>
                  {meta.onlyWhen && (
                    <span className="block text-xs text-text-2">
                      {meta.onlyWhen}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  aria-label={`Добавить «${meta.label}» в ряд`}
                  onClick={() => apply(toggleRailAction(ids, meta.id))}
                  className="rounded-lg p-2 text-text-1 hover:text-text-0"
                >
                  <Plus aria-hidden className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => apply([...DEFAULT_RAIL])}
          className="flex items-center gap-1 rounded-xl border border-glass-brd px-3 py-2 text-sm text-text-1 hover:text-text-0"
        >
          <RotateCcw aria-hidden className="size-4" />
          Вернуть как было
        </button>
        {/* Сохранять нечего: раскладка применяется сразу. Строка нужна, чтобы
            это было видно, — иначе человек ищет кнопку «Сохранить». */}
        <p aria-live="polite" className="text-xs text-text-2">
          {saved
            ? "Сохранено — откройте ленту"
            : "Меняется сразу, без кнопки «Сохранить»"}
        </p>
      </div>
    </section>
  );
}
