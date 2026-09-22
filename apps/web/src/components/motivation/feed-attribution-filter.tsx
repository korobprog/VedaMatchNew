"use client";

import { useEffect, useReducer, useRef, useState } from "react";
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
import { cachedAttributions, loadAttributions } from "./attribution-options-cache";

/**
 * Запрос списка к порталу. Вынесен из окна: тот же запрос уходит заранее —
 * по наведению, фокусу и касанию, когда окна ещё нет.
 */
async function fetchAttributions(query: string): Promise<MotivationFeedAttributionsDto> {
  const suffix = query ? `?${query}` : "";
  const response = await apiFetch(`${apiBase()}/motivation/feed/attributions${suffix}`, {
    credentials: "include",
  });
  if (!response.ok) throw new Error(String(response.status));
  return (await response.json()) as MotivationFeedAttributionsDto;
}

/**
 * Фильтр ленты по автору и источнику (VED-206): «покажи только Гиту».
 *
 * Отдельный компонент, а не ещё одна строка в меню категорий: категории —
 * оглавление редакции, а автор и источник — свойство самого афоризма, и
 * списки у них свои.
 *
 * Два варианта отображения (VED-252, круг 4):
 * - `"inline"` (по умолчанию) — один значок в ряду вкладок (между
 *   «Открытки» и «Избранное», `Tabs()`): текст «Автор и источник» под него
 *   в тесный ряд не помещался, а выбор виден и так — чипами ниже, точкой
 *   на значке при активном фильтре.
 * - `"chip"` — самостоятельная пилюля с подписью (вид до VED-252): для
 *   мест без ряда вкладок рядом, где значку без подписи не на что
 *   опереться визуально — например, пустое состояние ленты
 *   (`reels-feed.tsx`, ветки «Открыток здесь пока нет» и т.п.): круг 1
 *   переписал компонент только под «inline»-контекст, и там же
 *   отдельно вызванная кнопка стала голой полупрозрачной иконкой без
 *   рамки и подписи, повисшей само по себе — баг, который поймал не тест,
 *   а второй проход оценщика по коду.
 *
 * Список не грузится вместе с лентой: он нужен одному из многих, а лента
 * открывается у всех. Но и ждать открытия окна незачем — запрос уходит на
 * полшага раньше, по наведению, фокусу и касанию кнопки, а ответ живёт в
 * `attribution-options-cache` и переживает закрытие окна. Это и есть
 * лечение «кнопка открывается с затормаживанием» (VED-252, доработка):
 * тормозило не окно, а «Загружаем…» внутри него.
 */
export function FeedAttributionFilter({
  state,
  variant = "inline",
}: {
  state: FeedFilterState;
  variant?: "inline" | "chip";
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Закрытое окно возвращает фокус на кнопку — иначе клавиатура теряет место.
  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };
  /* Запрос на полшага раньше окна. Три повода, по одному на способ
     нажатия: `pointerenter` — мышь ещё едет к кнопке, `focus` — клавиатура
     дошла до неё, `pointerdown` — палец уже на стекле, но до `click`
     остаётся подъём пальца. Лишних запросов это не делает: кэш склеивает
     их в один (см. `attribution-options-cache`), а сам запрос уходит
     только когда к кнопке потянулись. */
  const prefetch = () => {
    void loadAttributions(attributionsQuery(state), fetchAttributions);
  };
  const triggerHandlers = {
    onPointerEnter: prefetch,
    onFocus: prefetch,
    onPointerDown: prefetch,
  };
  const active = hasAttributionFilter(state);
  // Избранное — одно на всех, фильтров у него нет, как и папок.
  if (state.tab === "saved") return null;

  const valueChip =
    "inline-flex min-h-8 max-w-[9rem] items-center gap-1 rounded-full border border-white bg-white px-2.5 text-xs font-medium text-[#0A0614] backdrop-blur sm:max-w-[12rem]";
  // Чипы выбранного — общие для обоих вариантов: крестик убирает только своё.
  const valueChips = (
    <>
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
    </>
  );
  const dialog =
    open && createPortal(<FilterSheet state={state} onClose={close} />, document.body);

  if (variant === "chip") {
    // Пилюля сама по себе объясняет, что это фильтр, даже без соседнего
    // ряда вкладок: подпись видна, пока фильтр не выбран, а рамка и
    // подложка отделяют кнопку от текста вокруг (вид, что был до VED-252).
    return (
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(true)}
          {...triggerHandlers}
          aria-haspopup="dialog"
          aria-label={active ? "Изменить фильтр по автору и источнику" : "Фильтр по автору и источнику"}
          className="inline-flex min-h-8 min-w-8 items-center justify-center gap-1 rounded-full border border-white/25 bg-black/40 px-2.5 text-xs font-medium text-white backdrop-blur transition hover:bg-black/60"
        >
          <FilterIcon />
          {!active && "Автор и источник"}
        </button>
        {valueChips}
        {dialog}
      </div>
    );
  }

  return (
    <>
      {/* Значок, без подписи и без своей подложки (VED-252): ряд вкладок
          тесный, а вес — как у соседних текстовых пунктов, не пилюля.
          Круг 3: в раскладке кнопка занимает только ширину иконки (`w-7`=
          28px) — круг 2 держал в раскладке весь хит-бокс `w-10`=40px, и
          при плотных промежутках «Избранное»/«Мои» читались слитно с
          соседями. Хит-зона всё равно ≥40×40 — не сузили, а перенесли:
          прозрачный `before:` раздвигает кликабельную область на ±6px по
          горизонтали (`before:-inset-x-1.5`, 28+6+6=40) поверх соседних
          промежутков, не отнимая их у текста вкладок (`before:absolute` —
          вне потока, ширины `<nav>` не трогает). По вертикали `h-10`
          (40px) — уже полная область без псевдоэлемента,
          `before:inset-y-0` просто повторяет её. */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        {...triggerHandlers}
        aria-haspopup="dialog"
        aria-label={active ? "Изменить фильтр по автору и источнику" : "Фильтр по автору и источнику"}
        className="relative flex h-10 w-7 shrink-0 items-center justify-center text-white/70 drop-shadow transition before:absolute before:-inset-x-1.5 before:inset-y-0 before:content-[''] hover:text-white"
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
          переносит блок на новую строку в `Tabs()`, чей родитель — `flex
          flex-wrap`: это единственное место, где рендерится `"inline"`
          (см. JSDoc выше — вне ряда вкладок используется `"chip"`).
          `order-last` держит чипы после значка. */}
      {(state.work || state.speaker) && (
        <span className="order-last flex w-full flex-wrap items-center justify-center gap-1.5 pt-1">
          {valueChips}
        </span>
      )}
      {/* В портал: значок стоит внутри ряда вкладок со своим `z-index`, и
          окно внутри него оказывалось под нижним рядом кнопок ленты. */}
      {dialog}
    </>
  );
}

function FilterSheet({ state, onClose }: { state: FeedFilterState; onClose: () => void }) {
  const query = attributionsQuery(state);
  /* Список окно не хранит, а читает из памяти вкладки прямо на рисовании:
     уже привезённый (второе открытие или успевшая предзагрузка по
     наведению) появляется тем же кадром, что и само окно, без «Загружаем…»
     и без лишней копии состояния, которую пришлось бы сбрасывать при смене
     запроса. Ответ на запрос, которого в памяти не было, приходит асинхронно
     и просит перерисовать — тогда та же строка прочитает уже привезённое. */
  const data = cachedAttributions(query);
  const [failed, setFailed] = useState(false);
  const [, rerender] = useReducer((value: number) => value + 1, 0);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (cachedAttributions(query)) return;
    let cancelled = false;
    void loadAttributions(query, fetchAttributions).then((body) => {
      if (cancelled) return;
      setFailed(!body);
      if (body) rerender();
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
        /* Подложка непрозрачная и без `backdrop-blur` (VED-252, доработка).
           Размытие здесь стоило прохода по всему кадру поверх играющего
           видео ленты — ровно в момент открытия, когда телефону и так
           тяжело. Пять процентов прозрачности, ради которых оно было, без
           размытия дают просвечивающую цитату — поэтому подложка стала
           сплошной: то же место, тот же цвет, ничего не мельтешит. */
        className="flex max-h-[80svh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-white/15 bg-[#1B0F2E] text-left text-sm text-white/90 sm:rounded-3xl"
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
