"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  ContactsSearchFilters,
  ContactsSearchResponse,
  ContactsTagDto,
} from "@vedamatch/shared";
import { CONTACTS_COUNT_THRESHOLD } from "@vedamatch/shared";
import {
  buildContactsSearchQuery,
  getContactsTags,
  parseContactsSearchFilters,
  searchContacts,
} from "@/lib/contacts-api";
import { ContactsSearchCard } from "./contacts-search-card";
import { ContactsSearchFiltersPanel } from "./contacts-search-filters";
import {
  contactsAshramLabels,
  contactsFormatLabels,
  contactsStageLabels,
} from "./labels";

interface FilterChip {
  id: string;
  label: string;
  /** Фильтры без этого условия — их и отправляем в URL при снятии чипа. */
  next: ContactsSearchFilters;
}

function withoutValue<T>(values: T[] | undefined, value: T): T[] {
  return (values ?? []).filter((item) => item !== value);
}

/** Снимаемые чипы применённых условий: что именно сужает выдачу прямо сейчас. */
export function activeFilterChips(
  filters: ContactsSearchFilters,
  tags: ContactsTagDto[],
): FilterChip[] {
  const chips: FilterChip[] = [];

  if (filters.q) {
    chips.push({
      id: "q",
      label: `Поиск: ${filters.q}`,
      next: { ...filters, q: undefined },
    });
  }
  if (filters.city) {
    chips.push({
      id: "city",
      label: `Город: ${filters.city}`,
      next: { ...filters, city: undefined },
    });
  }
  if (filters.country) {
    chips.push({
      id: "country",
      label: `Страна: ${filters.country}`,
      next: { ...filters, country: undefined },
    });
  }
  if (filters.radiusKm) {
    chips.push({
      id: "radiusKm",
      label: `Радиус: ${filters.radiusKm} км`,
      next: { ...filters, radiusKm: undefined },
    });
  }
  for (const stage of filters.stages ?? []) {
    chips.push({
      id: `stages:${stage}`,
      label: contactsStageLabels[stage],
      next: { ...filters, stages: withoutValue(filters.stages, stage) },
    });
  }
  for (const ashram of filters.ashram ?? []) {
    chips.push({
      id: `ashram:${ashram}`,
      label: contactsAshramLabels[ashram],
      next: { ...filters, ashram: withoutValue(filters.ashram, ashram) },
    });
  }
  for (const language of filters.languages ?? []) {
    chips.push({
      id: `languages:${language}`,
      label: `Язык: ${language}`,
      next: {
        ...filters,
        languages: withoutValue(filters.languages, language),
      },
    });
  }
  for (const tagId of filters.tagIds ?? []) {
    chips.push({
      id: `tagIds:${tagId}`,
      // Справочник тегов мог ещё не догрузиться — тогда показываем сам id,
      // иначе снять непонятный фильтр было бы нечем.
      label: tags.find((tag) => tag.id === tagId)?.nameRu ?? tagId,
      next: { ...filters, tagIds: withoutValue(filters.tagIds, tagId) },
    });
  }
  if (filters.format) {
    chips.push({
      id: "format",
      label: `Формат: ${contactsFormatLabels[filters.format]}`,
      next: { ...filters, format: undefined },
    });
  }
  if (filters.verifiedDevoteeOnly) {
    chips.push({
      id: "verifiedDevoteeOnly",
      label: "Только подтверждённые преданные",
      next: { ...filters, verifiedDevoteeOnly: false },
    });
  }
  if (filters.photoVerifiedOnly) {
    chips.push({
      id: "photoVerifiedOnly",
      label: "Только с проверенным фото",
      next: { ...filters, photoVerifiedOnly: false },
    });
  }

  return chips;
}

export function ContactsSearchView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.toString();

  // Считаем от строки, а не от объекта: иначе новый объект на каждый рендер
  // перезапускал бы поиск бесконечно.
  const filters = useMemo(
    () => parseContactsSearchFilters(new URLSearchParams(query)),
    [query],
  );

  const [tags, setTags] = useState<ContactsTagDto[]>([]);
  /**
   * Результат помнит запрос, на который он пришёл. Пока `query` не совпал —
   * идёт загрузка; отдельного флага не нужно, и старая выдача не может
   * подписаться числом «найдено» под уже изменившиеся фильтры.
   */
  const [result, setResult] = useState<{
    query: string;
    response?: ContactsSearchResponse;
    error?: string;
  } | null>(null);

  const current = result?.query === query ? result : null;
  const response = current?.response ?? null;
  const error = current?.error ?? null;
  const state = current ? (current.error ? "error" : "ready") : "loading";

  useEffect(() => {
    const controller = new AbortController();
    getContactsTags(controller.signal)
      .then((result) => setTags(result.items))
      // Без тегов поиск остаётся рабочим — просто не будет их фильтра,
      // поэтому эта ошибка не должна ронять всю страницу.
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;

    searchContacts(filters, controller.signal)
      .then((response) => {
        if (alive) setResult({ query, response });
      })
      .catch((e: unknown) => {
        if (!alive || controller.signal.aborted) return;
        // Текст с бэкенда уже русский и объясняет причину — не подменяем своим.
        setResult({
          query,
          error:
            e instanceof Error ? e.message : "Не удалось выполнить поиск",
        });
      });

    return () => {
      alive = false;
      controller.abort();
    };
  }, [filters, query]);

  function pushFilters(next: ContactsSearchFilters) {
    // Условия поменялись — прежний номер страницы к ним не относится.
    const search = buildContactsSearchQuery({ ...next, page: undefined });
    router.push(search ? `/contacts?${search}` : "/contacts");
  }

  function goToPage(page: number) {
    const search = buildContactsSearchQuery({
      ...filters,
      page: page > 1 ? page : undefined,
    });
    router.push(search ? `/contacts?${search}` : "/contacts");
  }

  const chips = activeFilterChips(filters, tags);

  return (
    <div>
      <ContactsSearchFiltersPanel
        // Черновик панели пересобирается, когда фильтры меняются извне:
        // например, после снятия чипа или перехода «назад» в браузере.
        key={query}
        filters={filters}
        tags={tags}
        facets={response?.facets ?? []}
        onApply={pushFilters}
        onReset={() => router.push("/contacts")}
      />

      {chips.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => pushFilters(chip.next)}
              className="flex items-center gap-1.5 rounded-full border border-magenta/40 bg-magenta/10 px-3 py-1 text-sm text-text-0 transition hover:border-magenta"
            >
              {chip.label}
              <span aria-hidden="true" className="text-text-2">
                ×
              </span>
              <span className="sr-only">Снять фильтр</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => router.push("/contacts")}
            className="text-sm font-medium text-text-2 transition hover:text-text-0"
          >
            Сбросить всё
          </button>
        </div>
      )}

      {state === "loading" && (
        <p className="glass rounded-2xl border border-glass-brd p-4 text-sm text-text-1">
          Ищем по справочнику…
        </p>
      )}

      {state === "error" && (
        <p
          role="alert"
          className="glass rounded-2xl border border-glass-brd p-4 text-sm text-magenta"
        >
          {error}
        </p>
      )}

      {state === "ready" && response && (
        <>
          {response.items.length === 0 ? (
            <div className="glass rounded-3xl border border-glass-brd p-10 text-center text-sm text-text-1">
              По этим условиям в справочнике никого нет. Снимите часть фильтров,
              расширьте радиус или поищите по другому тегу — например, только по
              служению, без города.
            </div>
          ) : (
            <>
              <p className="mb-4 text-sm text-text-2" data-testid="contacts-total">
                {response.total === null
                  ? // Ниже порога точное число не называется: узкий фильтр
                    // не должен работать счётчиком живых людей.
                    `Найдено мало — меньше ${CONTACTS_COUNT_THRESHOLD} человек. Страница ${response.page}.`
                  : `Найдено: ${response.total}. Страница ${response.page}.`}
              </p>

              <div className="grid gap-4 md:grid-cols-2">
                {response.items.map((card) => (
                  <ContactsSearchCard key={card.userId} card={card} />
                ))}
              </div>

              <div className="mt-6 flex justify-center gap-3">
                {response.page > 1 && (
                  <button
                    type="button"
                    onClick={() => goToPage(response.page - 1)}
                    className="glass rounded-xl border border-glass-brd px-4 py-2 text-sm font-medium text-text-1 hover:text-text-0"
                  >
                    ← Назад
                  </button>
                )}
                {response.hasMore && (
                  <button
                    type="button"
                    onClick={() => goToPage(response.page + 1)}
                    className="rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] px-4 py-2 text-sm font-medium text-white hover:shadow-[0_0_20px_rgba(255,62,158,0.4)]"
                  >
                    Далее →
                  </button>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
