"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import type {
  MotivationAttributionOptionDto,
  MotivationFeedAttributionsDto,
} from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";
import { apiBase } from "@/lib/api-base";
import {
  attributionsQuery,
  filterHref,
  hasAttributionFilter,
  sameAttribution,
  type FeedFilterState,
} from "./attribution-filter";

/**
 * Фильтр ленты по автору и источнику (VED-206): «покажи только Гиту».
 *
 * Отдельный компонент, а не ещё одна строка в меню категорий: категории —
 * оглавление редакции, а автор и источник — свойство самого афоризма, и
 * списки у них свои. Кнопка-триггер — один значок в ряду вкладок (VED-252,
 * между «Открытки» и «Избранное»): текст «Автор и источник» под неё в
 * тесный ряд не помещался, а выбор виден и так — чипами ниже.
 *
 * Список грузится при открытии: он нужен одному из многих, а лента
 * открывается у всех.
 */
export function FeedAttributionFilter({ state }: { state: FeedFilterState }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Закрытое окно возвращает фокус на кнопку — иначе клавиатура теряет место.
  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };
  const active = hasAttributionFilter(state);
  // Избранное — одно на всех, фильтров у него нет, как и папок.
  if (state.tab === "saved") return null;

  const valueChip =
    "inline-flex min-h-8 max-w-[9rem] items-center gap-1 rounded-full border border-white bg-white px-2.5 text-xs font-medium text-[#0A0614] backdrop-blur sm:max-w-[12rem]";
  return (
    <>
      {/* Значок, без подписи и без своей подложки (VED-252): ряд вкладок
          тесный, а вес — как у соседних текстовых пунктов, не пилюля.
          `h-10 w-10` — полная область нажатия ≥40×40 (круг 2: первая версия
          сузила её до `w-8`=32px ради бюджета ширины — оценщик справедливо
          указал, что хит-зона интерактивного элемента ужиматься не должна;
          бюджет ряда пересчитан в Tabs() под полные 40px значка по живому
          замеру в браузере, а не наоборот). `<FilterIcon />` внутри рисуется
          мелким сама по себе — большая кликабельная область не увеличивает
          видимый значок. */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={active ? "Изменить фильтр по автору и источнику" : "Фильтр по автору и источнику"}
        className="relative flex h-10 w-10 shrink-0 items-center justify-center text-white/70 drop-shadow transition hover:text-white"
      >
        <FilterIcon />
        {/* Активный фильтр отмечен точкой — тем же приёмом, что активная
            вкладка отмечена подчёркиванием, а не текстом на значке. */}
        {active && (
          <span aria-hidden="true" className="absolute right-1 top-1.5 size-1.5 rounded-full bg-magenta" />
        )}
      </button>
      {/* Выбранное — чипами с крестиком строкой ниже: в самом ряду вкладок
          им места нет, а прежний приём «чип убирает своё» остаётся. `w-full`
          (не `basis-full` — в `flex-col` пустого состояния ленты «базис» это
          высота, не ширина) переносит блок на новую строку в `Tabs()`, где
          родитель `flex flex-wrap`, и остаётся обычной полноширинной строкой
          там, где родитель `flex-col` (пустая лента). `order-last` держит
          чипы после значка в обоих случаях. */}
      {(state.work || state.speaker) && (
        <span className="order-last flex w-full flex-wrap items-center justify-center gap-1.5 pt-1">
          {state.work && (
            <Link
              href={filterHref(state, { work: null })}
              aria-label={`Убрать фильтр по источнику: ${state.work}`}
              className={valueChip}
            >
              <span aria-hidden="true">📖</span>
              <span className="truncate">{state.work}</span>
              <span aria-hidden="true">✕</span>
            </Link>
          )}
          {state.speaker && (
            <Link
              href={filterHref(state, { speaker: null })}
              aria-label={`Убрать фильтр по автору: ${state.speaker}`}
              className={valueChip}
            >
              <span aria-hidden="true">🪶</span>
              <span className="truncate">{state.speaker}</span>
              <span aria-hidden="true">✕</span>
            </Link>
          )}
        </span>
      )}
      {/* В портал: значок стоит внутри ряда вкладок со своим `z-index`, и
          окно внутри него оказывалось под нижним рядом кнопок ленты. */}
      {open &&
        createPortal(<FilterSheet state={state} onClose={close} />, document.body)}
    </>
  );
}

function FilterSheet({ state, onClose }: { state: FeedFilterState; onClose: () => void }) {
  const [data, setData] = useState<MotivationFeedAttributionsDto | null>(null);
  const [failed, setFailed] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const query = attributionsQuery(state);

  useEffect(() => {
    let cancelled = false;
    const suffix = query ? `?${query}` : "";
    apiFetch(`${apiBase()}/motivation/feed/attributions${suffix}`, { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        const body = (await response.json()) as MotivationFeedAttributionsDto;
        if (!cancelled) setData(body);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  /* Фокус — в окно, Escape — закрыть: иначе с клавиатуры из него не выйти.
     Обработчик читается через ref: лента перерисовывается на каждом свайпе,
     и эффект с `onClose` в зависимостях снова уводил бы фокус на «Закрыть». */
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    /* `fixed` от окна просмотра, как у «Цитаты целиком»: снизу — шторкой на
       телефоне, по центру — на широком экране. */
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="feed-filter-title"
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[80svh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-white/15 bg-[#1B0F2E]/95 text-left text-sm text-white/90 backdrop-blur sm:rounded-3xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-3">
          <h2 id="feed-filter-title" className="font-display text-sm font-semibold">
            Автор и источник
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-xs text-white/75 hover:bg-white/10"
          >
            Закрыть
          </button>
        </div>
        <div className="min-h-0 space-y-5 overflow-y-auto px-5 py-4">
          {failed ? (
            <p role="alert" className="text-[#FFB4D9]">
              Не удалось загрузить список. Попробуйте ещё раз позже.
            </p>
          ) : !data ? (
            <p aria-live="polite" className="text-white/70">
              Загружаем…
            </p>
          ) : (
            <>
              <OptionList
                title="Источник"
                icon="📖"
                options={data.works}
                current={state.work}
                empty="Источников здесь пока нет"
                hrefFor={(work) => filterHref(state, { work })}
                onPick={onClose}
              />
              <OptionList
                title="Автор"
                icon="🪶"
                options={data.speakers}
                current={state.speaker}
                empty="Авторов здесь пока нет"
                hrefFor={(speaker) => filterHref(state, { speaker })}
                onPick={onClose}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function OptionList({
  title,
  icon,
  options,
  current,
  empty,
  hrefFor,
  onPick,
}: {
  title: string;
  icon: string;
  options: MotivationAttributionOptionDto[];
  current?: string;
  empty: string;
  /** `null` — сбросить это измерение. */
  hrefFor: (value: string | null) => string;
  onPick: () => void;
}) {
  const item = (active: boolean) =>
    `flex min-h-10 w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 ${
      active
        ? "border-white bg-white text-[#0A0614]"
        : "border-white/15 bg-white/5 text-white hover:bg-white/15"
    }`;
  const titleId = `feed-filter-${icon === "📖" ? "work" : "speaker"}`;
  return (
    <section aria-labelledby={titleId}>
      <h3 id={titleId} className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/70">
        <span aria-hidden="true">{icon} </span>
        {title}
      </h3>
      {options.length === 0 ? (
        <p className="text-white/70">{empty}</p>
      ) : (
        <ul className="space-y-1.5">
          <li>
            <Link
              href={hrefFor(null)}
              onClick={onPick}
              aria-current={!current ? "true" : undefined}
              className={item(!current)}
            >
              <span>Все</span>
            </Link>
          </li>
          {options.map((option) => {
            const active = sameAttribution(option.label, current);
            return (
              <li key={option.label}>
                <Link
                  href={hrefFor(option.label)}
                  onClick={onPick}
                  aria-current={active ? "true" : undefined}
                  className={item(active)}
                >
                  <span className="min-w-0 break-words">{option.label}</span>
                  <span
                    className={`shrink-0 font-mono text-xs ${active ? "text-[#0A0614]/70" : "text-white/70"}`}
                  >
                    {option.count}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function FilterIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 5h18l-7 8v6l-4-2v-4z" />
    </svg>
  );
}
