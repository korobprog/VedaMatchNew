"use client";

import { useMemo, useState, type ReactNode } from "react";
import type {
  ContactsAshram,
  ContactsFormat,
  ContactsSearchFacet,
  ContactsSearchFilters,
  ContactsSearchSort,
  ContactsTagDto,
  SpiritualStage,
} from "@vedamatch/shared";
import {
  CONTACTS_ASHRAMS,
  CONTACTS_SEARCH_FORMATS,
  CONTACTS_SEARCH_SORTS,
  CONTACTS_STAGES,
} from "@/lib/chat-people-api";
import {
  contactsAshramLabels,
  contactsFormatLabels,
  contactsSortLabels,
  contactsLanguageOptions,
  contactsRadiusOptions,
  contactsStageLabels,
  contactsTagKindLabels,
  contactsTagKindOrder,
} from "./labels";

const fieldClass =
  "w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0 outline-none transition focus:border-magenta/50";
const labelClass =
  "mb-1 block text-xs font-medium uppercase tracking-wide text-text-2";
const hintClass = "mt-1 text-xs text-text-2";
const legendClass = "mb-2 text-xs font-medium uppercase tracking-wide text-text-2";

function toggle<T>(values: T[], value: T): T[] {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

/**
 * Панель фильтров справочника. Значения копятся в черновике и уходят в URL
 * одной кнопкой: иначе каждый щелчок по тегу перезагружал бы выдачу.
 * Родитель пересоздаёт компонент при смене URL, поэтому черновик всегда
 * согласован с применёнными фильтрами (в том числе после снятия чипа).
 */
export function PeopleSearchFiltersPanel({
  filters,
  tags,
  facets,
  activeCount,
  onApply,
  onReset,
}: {
  filters: ContactsSearchFilters;
  tags: ContactsTagDto[];
  facets: ContactsSearchFacet[];
  /** Сколько условий применено. Приходит извне — тем же счётом, что и чипы. */
  activeCount: number;
  onApply: (filters: ContactsSearchFilters) => void;
  onReset: () => void;
}) {
  const [draft, setDraft] = useState<ContactsSearchFilters>(filters);
  /**
   * Панель свёрнута по умолчанию: большинство приходит смотреть выдачу, а не
   * настраивать поиск, и восемь полей сверху отодвигают людей за край экрана.
   * Что именно сейчас включено, видно по чипам под картой.
   */
  const [open, setOpen] = useState(false);

  // Подсказка про подтверждённых закрыта по умолчанию: она нужна один раз, а
  // место в панели фильтров дорогое.
  const [hintOpen, setHintOpen] = useState(false);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const facet of facets) map.set(facet.tagId, facet.count);
    return map;
  }, [facets]);

  const groupedTags = useMemo(
    () =>
      contactsTagKindOrder
        .map((kind) => ({
          kind,
          items: tags.filter((tag) => tag.kind === kind),
        }))
        .filter((group) => group.items.length > 0),
    [tags],
  );

  // Язык, вписанный в карточку вручную, тоже должен остаться в списке выбора.
  const languageOptions = useMemo(() => {
    const extra = (draft.languages ?? []).filter(
      (language) => !contactsLanguageOptions.includes(language),
    );
    return [...contactsLanguageOptions, ...extra];
  }, [draft.languages]);

  // Сколько условий выбрано во всех группах чипов вместе: число на свёрнутом
  // блоке — единственный намёк, что внутри что-то есть.
  const totalChipSelections =
    (draft.stages ?? []).length +
    (draft.ashram ?? []).length +
    (draft.languages ?? []).length +
    (draft.tagIds ?? []).length;

  function update<K extends keyof ContactsSearchFilters>(
    key: K,
    value: ContactsSearchFilters[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onApply(draft);
      }}
      className="glass mb-6 rounded-3xl border border-glass-brd p-4 sm:p-5"
    >
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls="people-filters-body"
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="text-sm font-semibold text-text-0">
          Поиск и фильтры
        </span>
        <span className="flex items-center gap-2 text-xs text-text-2">
          {activeCount > 0 && (
            <span className="rounded-full border border-magenta/40 bg-magenta/10 px-2 py-0.5 font-semibold text-text-0">
              {activeCount}
            </span>
          )}
          {open ? "Свернуть" : "Развернуть"}
        </span>
      </button>

      {!open && (
        <p className="mt-2 text-xs text-text-2">
          {activeCount > 0
            ? "Условия применены — они перечислены под картой."
            : "Имя, город, служение, навык, язык и остальное."}
        </p>
      )}

      <div id="people-filters-body" hidden={!open}>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <label className="block md:col-span-2">
          <span className={labelClass}>Поиск</span>
          <input
            type="search"
            value={draft.q ?? ""}
            onChange={(event) => update("q", event.target.value)}
            placeholder="Имя, заголовок или описание"
            className={fieldClass}
          />
        </label>
        {/* Порядок — рядом с поиском, а не среди фильтров: фильтры сужают
            выдачу, а это то, как её читать, и ответ на «покажи всех по
            алфавиту» лежит не там, где «только преданных». */}
        <label className="block">
          <span className={labelClass}>Порядок</span>
          <select
            value={draft.sort ?? "active"}
            onChange={(event) =>
              update("sort", event.target.value as ContactsSearchSort)
            }
            className={fieldClass}
          >
            {CONTACTS_SEARCH_SORTS.map((sort) => (
              <option key={sort} value={sort}>
                {contactsSortLabels[sort]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <label className="block">
          <span className={labelClass}>Формат</span>
          <select
            value={draft.format ?? ""}
            onChange={(event) =>
              update(
                "format",
                event.target.value === ""
                  ? undefined
                  : (event.target.value as ContactsFormat),
              )
            }
            className={fieldClass}
          >
            <option value="">Любой</option>
            {CONTACTS_SEARCH_FORMATS.map((format) => (
              <option key={format} value={format}>
                {contactsFormatLabels[format]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <label className="block">
          <span className={labelClass}>Город</span>
          <input
            type="text"
            value={draft.city ?? ""}
            onChange={(event) => update("city", event.target.value)}
            placeholder="Например: Москва"
            className={fieldClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>Страна</span>
          <input
            type="text"
            value={draft.country ?? ""}
            onChange={(event) => update("country", event.target.value)}
            placeholder="Например: Россия"
            className={fieldClass}
          />
        </label>
        <div>
          <label className="block">
            <span className={labelClass}>Радиус</span>
            <select
              value={draft.radiusKm ? String(draft.radiusKm) : ""}
              onChange={(event) =>
                update(
                  "radiusKm",
                  event.target.value === ""
                    ? undefined
                    : Number(event.target.value),
                )
              }
              className={fieldClass}
            >
              <option value="">Без радиуса</option>
              {contactsRadiusOptions.map((radius) => (
                <option key={radius} value={radius}>
                  {radius} км
                </option>
              ))}
            </select>
          </label>
          <p className={hintClass}>
            Радиус считается от точки, выбранной на карте, а если её нет — от
            вашего города из портального профиля. Человек без заполненной
            локации в такую выдачу не попадёт.
          </p>
        </div>
      </div>

      <ChipGroups selectedCount={totalChipSelections}>
      <ChipSection
        title="Духовный этап"
        selectedCount={(draft.stages ?? []).length}
      >
        {CONTACTS_STAGES.map((stage) => (
          <ChipToggle
            key={stage}
            label={contactsStageLabels[stage]}
            selected={(draft.stages ?? []).includes(stage)}
            onToggle={() =>
              update("stages", toggle(draft.stages ?? [], stage) as SpiritualStage[])
            }
          />
        ))}
      </ChipSection>

      <ChipSection title="Ашрам" selectedCount={(draft.ashram ?? []).length}>
        {CONTACTS_ASHRAMS.map((ashram) => (
          <ChipToggle
            key={ashram}
            label={contactsAshramLabels[ashram]}
            selected={(draft.ashram ?? []).includes(ashram)}
            onToggle={() =>
              update(
                "ashram",
                toggle(draft.ashram ?? [], ashram) as ContactsAshram[],
              )
            }
          />
        ))}
      </ChipSection>

      <ChipSection
        title="Языки"
        selectedCount={(draft.languages ?? []).length}
      >
        {languageOptions.map((language) => (
          <ChipToggle
            key={language}
            label={language}
            selected={(draft.languages ?? []).includes(language)}
            onToggle={() =>
              update("languages", toggle(draft.languages ?? [], language))
            }
          />
        ))}
      </ChipSection>

      {groupedTags.map((group) => (
        <ChipSection
          key={group.kind}
          title={contactsTagKindLabels[group.kind]}
          selectedCount={
            group.items.filter((tag) => (draft.tagIds ?? []).includes(tag.id))
              .length
          }
        >
          {group.items.map((tag) => {
            const count = counts.get(tag.id);
            return (
              <ChipToggle
                key={tag.id}
                label={tag.nameRu}
                // Счётчик есть не всегда: бэкенд отдаёт его только по тем
                // тегам, что встречаются в текущей выдаче.
                count={count}
                selected={(draft.tagIds ?? []).includes(tag.id)}
                onToggle={() =>
                  update("tagIds", toggle(draft.tagIds ?? [], tag.id))
                }
              />
            );
          })}
        </ChipSection>
      ))}
      </ChipGroups>

      <div className="mt-4 flex w-fit items-center gap-2">
        <label className="flex w-fit cursor-pointer items-center gap-2 rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-1">
          <input
            type="checkbox"
            checked={draft.verifiedDevoteeOnly ?? false}
            onChange={(event) =>
              update("verifiedDevoteeOnly", event.target.checked)
            }
            className="h-4 w-4 accent-cyan"
          />
          Только подтверждённые
        </label>
        <button
          type="button"
          onClick={() => setHintOpen((open) => !open)}
          aria-expanded={hintOpen}
          aria-controls="people-verified-hint"
          aria-label="Кто такие подтверждённые"
          className="flex size-7 shrink-0 items-center justify-center rounded-full border border-glass-brd bg-bg-1 font-mono text-sm text-text-1 transition-colors hover:text-text-0"
        >
          ?
        </button>
      </div>

      {hintOpen && (
        <p
          id="people-verified-hint"
          className="mt-2 max-w-prose rounded-xl border border-cyan/34 bg-cyan/10 px-3 py-2 text-[13px] text-text-1"
        >
          Статус преданного проверила администрация: человек назвал наставника,
          наставник заполнил форму, администратор её принял. Отметка
          «преданный», выбранная в своей анкете, такой проверки не проходила и
          под этот фильтр не попадает.
        </p>
      )}

      <label className="mt-2 flex w-fit cursor-pointer items-center gap-2 rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-1">
        <input
          type="checkbox"
          checked={draft.photoVerifiedOnly ?? false}
          onChange={(event) => update("photoVerifiedOnly", event.target.checked)}
          className="h-4 w-4 accent-gold"
        />
        Только с проверенным фото
      </label>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          className="rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] px-5 py-2.5 text-sm font-semibold text-white transition hover:shadow-[0_0_20px_var(--vm-glow-magenta)]"
        >
          Применить фильтры
        </button>
        <button
          type="button"
          onClick={onReset}
          className="text-sm font-medium text-text-2 transition hover:text-text-0"
        >
          Сбросить всё
        </button>
      </div>
      </div>
    </form>
  );
}

/**
 * Все группы чипов под одним переключателем.
 *
 * Свернуть каждую группу по отдельности оказалось мало: семь заголовков —
 * это всё равно экран пустых строк между полями поиска и кнопкой «Применить».
 * Целиком свёрнутый блок оставляет от них одну строку.
 *
 * Раскрытым он открывается, только если внутри уже что-то выбрано: иначе
 * применённые условия оказались бы спрятаны сразу за двумя щелчками.
 */
function ChipGroups({
  selectedCount,
  children,
}: {
  selectedCount: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(selectedCount > 0);

  return (
    <div className="mt-4 border-t border-glass-brd/60 pt-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center gap-2 rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-left transition hover:border-magenta/50"
      >
        <span className="flex-1 text-sm font-medium text-text-0">
          Этап, ашрам, языки, служение, профессия, навыки, интересы
        </span>
        {selectedCount > 0 && (
          <span className="rounded-full bg-magenta/15 px-2 py-0.5 text-xs font-medium text-text-0">
            {selectedCount}
          </span>
        )}
        <span
          aria-hidden="true"
          className={`text-xs text-text-2 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        >
          ▾
        </span>
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}

/**
 * Свёрнутая по умолчанию группа чипов.
 *
 * Групп семь, а тегов под сотню: развёрнутыми они занимали несколько экранов,
 * и до кнопки «Применить» приходилось листать мимо всего справочника профессий.
 * Свёрнутой группа остаётся, только пока в ней ничего не выбрано — иначе
 * применённое условие пряталось бы от собственного автора.
 *
 * Начальное состояние берётся один раз при монтировании: панель пересоздаётся
 * по `key={query}` на каждую смену фильтров, так что «развернул и выбрал» не
 * схлопнется обратно от собственного же щелчка.
 */
function ChipSection({
  title,
  selectedCount,
  children,
}: {
  title: string;
  selectedCount: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(selectedCount > 0);

  return (
    // Группу называет кнопка-раскрывашка, поэтому <legend> здесь нет:
    // со скрытым дубликатом скринридер объявлял бы название дважды.
    <fieldset className="mt-4 border-t border-glass-brd/60 pt-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center gap-2 text-left"
      >
        <span className={`${legendClass} mb-0 flex-1`}>{title}</span>
        {selectedCount > 0 && (
          <span className="rounded-full bg-magenta/15 px-2 py-0.5 text-xs font-medium text-text-0">
            {selectedCount}
          </span>
        )}
        <span
          aria-hidden="true"
          className={`text-xs text-text-2 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        >
          ▾
        </span>
      </button>
      {open && <div className="mt-2 flex flex-wrap gap-2">{children}</div>}
    </fieldset>
  );
}

function ChipToggle({
  label,
  count,
  selected,
  onToggle,
}: {
  label: string;
  count?: number;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className={`rounded-full border px-3 py-1.5 text-sm transition ${
        selected
          ? "border-magenta bg-magenta/15 text-text-0"
          : "border-glass-brd text-text-1 hover:text-text-0"
      }`}
    >
      {label}
      {count !== undefined && (
        <span className="ml-1.5 text-xs text-text-2">{count}</span>
      )}
    </button>
  );
}
