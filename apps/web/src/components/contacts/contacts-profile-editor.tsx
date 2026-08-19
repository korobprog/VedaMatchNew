"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ContactsAshram,
  ContactsFormat,
  ContactsProfileDto,
  ContactsProfileStatus,
  ContactsTagDto,
  ContactsTagKind,
  ContactsVisibility,
} from "@vedamatch/shared";
import {
  CONTACTS_MAX_HEADLINE_LENGTH,
  CONTACTS_MAX_LANGUAGES,
  CONTACTS_MAX_TAGS,
  CONTACTS_MAX_TEXT_LENGTH,
  buildContactsProfileRequest,
  getContactsProfileState,
  getContactsTags,
  toContactsDraft,
  updateContactsProfile,
  type ContactsProfileDraft,
} from "@/lib/contacts-api";

const ashramLabels: Record<ContactsAshram, string> = {
  brahmachari: "Брахмачари",
  grihastha: "Грихастха",
  vanaprastha: "Ванапрастха",
  sannyasi: "Санньяси",
};

const formatLabels: Record<ContactsFormat, string> = {
  online: "Онлайн",
  offline: "Офлайн",
  any: "Любой",
};

/** Формулировки уровня видимости: значения энума пользователю ничего не говорят. */
const visibilityLabels: Record<ContactsVisibility, string> = {
  everyone: "Виден всем участникам",
  verified_only: "Только подтверждённым преданным",
  same_city: "Только моему городу",
  by_link: "Не в списках, только по прямой ссылке",
  hidden: "Скрыт отовсюду",
};

const visibilityHints: Record<ContactsVisibility, string> = {
  everyone: "Карточку найдёт любой участник сообщества.",
  verified_only:
    "Карточку видят только те, чей статус преданного подтвердила администрация.",
  same_city: "Карточку видят только участники из вашего города.",
  by_link:
    "В списках и поиске карточки нет. Открыть её можно только по ссылке, которую вы дали сами.",
  hidden: "Карточку не видит никто, кроме вас.",
};

const tagKindLabels: Record<ContactsTagKind, string> = {
  service: "Служение",
  profession: "Профессия",
  skill: "Навыки",
  interest: "Интересы",
};

const tagKindOrder: ContactsTagKind[] = [
  "service",
  "profession",
  "skill",
  "interest",
];

const statusLabels: Record<ContactsProfileStatus, string> = {
  draft: "Черновик",
  pending: "На проверке",
  active: "Опубликована",
};

const privacyFields: Array<[keyof ContactsProfileDraft["fieldPrivacy"], string]> =
  [
    ["city", "Показывать город"],
    ["photo", "Показывать фото"],
    ["age", "Показывать возраст"],
  ];

const sectionClass = "glass mb-4 rounded-2xl border border-glass-brd p-4";
const sectionTitleClass =
  "mb-2 text-xs font-semibold uppercase tracking-wide text-text-2";
const selectClass =
  "w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0";
const inputClass = selectClass;
const hintClass = "mt-1 text-xs text-text-2";

function entries<T extends string>(labels: Record<T, string>): Array<[T, string]> {
  return Object.entries(labels) as Array<[T, string]>;
}

export function ContactsProfileEditor() {
  const [draft, setDraft] = useState<ContactsProfileDraft>(() =>
    toContactsDraft(null),
  );
  const [status, setStatus] = useState<ContactsProfileStatus>("draft");
  const [tags, setTags] = useState<ContactsTagDto[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;

    (async () => {
      try {
        const [state, tagsResponse] = await Promise.all([
          getContactsProfileState(controller.signal),
          getContactsTags(controller.signal),
        ]);
        if (!alive) return;
        applyProfile(state.profile);
        setTags(tagsResponse.items);
        setLoadState("ready");
      } catch (e) {
        if (!alive || controller.signal.aborted) return;
        setError(
          e instanceof Error ? e.message : "Не удалось загрузить карточку",
        );
        setLoadState("error");
      }
    })();

    function applyProfile(profile: ContactsProfileDto | null) {
      setDraft(toContactsDraft(profile));
      setStatus(profile?.status ?? "draft");
    }

    return () => {
      alive = false;
      controller.abort();
    };
  }, []);

  const groupedTags = useMemo(() => {
    return tagKindOrder
      .map((kind) => ({
        kind,
        items: tags.filter((tag) => tag.kind === kind),
      }))
      .filter((group) => group.items.length > 0);
  }, [tags]);

  const update = useCallback(
    <K extends keyof ContactsProfileDraft>(
      key: K,
      value: ContactsProfileDraft[K],
    ) => {
      setDraft((current) => ({ ...current, [key]: value }));
      setSaveState("idle");
    },
    [],
  );

  function toggleTag(id: string) {
    setSaveState("idle");
    setDraft((current) => {
      if (current.tagIds.includes(id)) {
        return { ...current, tagIds: current.tagIds.filter((it) => it !== id) };
      }
      // Лимит держим на вводе: молча обрезать выбор при сохранении — обман.
      if (current.tagIds.length >= CONTACTS_MAX_TAGS) return current;
      return { ...current, tagIds: [...current.tagIds, id] };
    });
  }

  function updateLanguage(index: number, value: string) {
    update(
      "languages",
      draft.languages.map((item, i) => (i === index ? value : item)),
    );
  }

  async function save() {
    setSaveState("saving");
    setError(null);
    try {
      const profile = await updateContactsProfile(
        buildContactsProfileRequest(draft),
      );
      setDraft(toContactsDraft(profile));
      setStatus(profile.status);
      setSaveState("saved");
    } catch (e) {
      setSaveState("idle");
      // Текст с бэкенда уже русский и объясняет причину — не подменяем своим.
      setError(e instanceof Error ? e.message : "Не удалось сохранить карточку");
    }
  }

  if (loadState === "loading") {
    return (
      <p className="glass rounded-2xl border border-glass-brd p-4 text-sm text-text-1">
        Загружаем карточку…
      </p>
    );
  }

  if (loadState === "error") {
    return (
      <p
        role="alert"
        className="glass rounded-2xl border border-glass-brd p-4 text-sm text-magenta"
      >
        {error}
      </p>
    );
  }

  const tagsLeft = CONTACTS_MAX_TAGS - draft.tagIds.length;

  return (
    <div>
      <section className={sectionClass}>
        <h2 className={sectionTitleClass}>Состояние карточки</h2>
        <p className="text-sm font-medium text-text-0" data-testid="contacts-status">
          {statusLabels[status]}
        </p>
        <p className={hintClass}>
          {status === "draft"
            ? "Черновик — это карточка с пустым заголовком: пока он не заполнен, вас не показывают в справочнике."
            : "Карточка в справочнике. Черновиком она становится, если очистить заголовок."}
        </p>
      </section>

      <section className={sectionClass}>
        <h2 className={sectionTitleClass}>О себе</h2>

        <label htmlFor="contacts-headline" className="mb-1 block text-sm text-text-1">
          Заголовок
        </label>
        <input
          id="contacts-headline"
          value={draft.headline}
          maxLength={CONTACTS_MAX_HEADLINE_LENGTH}
          placeholder="Одна фраза, которую увидят первой"
          onChange={(event) => update("headline", event.target.value)}
          className={inputClass}
        />
        <p className={hintClass}>
          {draft.headline.length} / {CONTACTS_MAX_HEADLINE_LENGTH}
        </p>

        <label
          htmlFor="contacts-about"
          className="mb-1 mt-4 block text-sm text-text-1"
        >
          О себе
        </label>
        <textarea
          id="contacts-about"
          rows={6}
          value={draft.about}
          maxLength={CONTACTS_MAX_TEXT_LENGTH}
          placeholder="Кто вы, чем занимаетесь, где практикуете"
          onChange={(event) => update("about", event.target.value)}
          className={inputClass}
        />
        <p className={hintClass}>
          {draft.about.length} / {CONTACTS_MAX_TEXT_LENGTH}
        </p>

        <label
          htmlFor="contacts-offers"
          className="mb-1 mt-4 block text-sm text-text-1"
        >
          Чем могу быть полезен
        </label>
        <textarea
          id="contacts-offers"
          rows={6}
          value={draft.offers}
          maxLength={CONTACTS_MAX_TEXT_LENGTH}
          placeholder="Помощь, служение, навыки, которыми готовы поделиться"
          onChange={(event) => update("offers", event.target.value)}
          className={inputClass}
        />
        <p className={hintClass}>
          {draft.offers.length} / {CONTACTS_MAX_TEXT_LENGTH}
        </p>
      </section>

      <section className={sectionClass}>
        <h2 className={sectionTitleClass}>Языки</h2>
        {draft.languages.length === 0 && (
          <p className={hintClass}>Пока не добавлено ни одного языка.</p>
        )}
        <ul className="space-y-2">
          {draft.languages.map((language, index) => (
            <li key={index} className="flex items-center gap-2">
              <input
                aria-label={`Язык ${index + 1}`}
                value={language}
                placeholder="Например: русский"
                onChange={(event) => updateLanguage(index, event.target.value)}
                className={inputClass}
              />
              <button
                type="button"
                aria-label={`Удалить язык ${index + 1}`}
                onClick={() =>
                  update(
                    "languages",
                    draft.languages.filter((_, i) => i !== index),
                  )
                }
                className="rounded-xl border border-glass-brd px-3 py-2 text-sm text-text-1 transition hover:text-magenta"
              >
                Удалить
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          disabled={draft.languages.length >= CONTACTS_MAX_LANGUAGES}
          onClick={() => update("languages", [...draft.languages, ""])}
          className="mt-3 rounded-xl border border-glass-brd px-3 py-2 text-sm text-text-1 transition hover:text-text-0 disabled:opacity-50"
        >
          Добавить язык
        </button>
        <p className={hintClass}>
          Не больше {CONTACTS_MAX_LANGUAGES} языков.
        </p>
      </section>

      <section className={sectionClass}>
        <h2 className={sectionTitleClass}>Ашрам и формат</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="contacts-ashram"
              className="mb-1 block text-sm text-text-1"
            >
              Ашрам
            </label>
            <select
              id="contacts-ashram"
              value={draft.ashram}
              onChange={(event) =>
                update("ashram", event.target.value as ContactsAshram | "")
              }
              className={selectClass}
            >
              <option value="">Не указан</option>
              {entries(ashramLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="contacts-format"
              className="mb-1 block text-sm text-text-1"
            >
              Формат общения
            </label>
            <select
              id="contacts-format"
              value={draft.format}
              onChange={(event) =>
                update("format", event.target.value as ContactsFormat)
              }
              className={selectClass}
            >
              {entries(formatLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className={sectionClass}>
        <h2 className={sectionTitleClass}>Теги</h2>
        <p className={hintClass}>
          Выбрано {draft.tagIds.length} из {CONTACTS_MAX_TAGS}
          {tagsLeft === 0 ? ". Чтобы выбрать другой тег, снимите один." : "."}
        </p>
        {groupedTags.length === 0 && (
          <p className={hintClass}>Справочник тегов пока пуст.</p>
        )}
        {groupedTags.map((group) => (
          <fieldset key={group.kind} className="mt-3">
            <legend className="mb-2 text-sm font-medium text-text-0">
              {tagKindLabels[group.kind]}
            </legend>
            <div className="flex flex-wrap gap-2">
              {group.items.map((tag) => {
                const selected = draft.tagIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    aria-pressed={selected}
                    disabled={!selected && tagsLeft === 0}
                    onClick={() => toggleTag(tag.id)}
                    className={`rounded-full border px-3 py-1.5 text-sm transition disabled:opacity-40 ${
                      selected
                        ? "border-magenta bg-magenta/15 text-text-0"
                        : "border-glass-brd text-text-1 hover:text-text-0"
                    }`}
                  >
                    {tag.nameRu}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
      </section>

      <section className={sectionClass}>
        <h2 className={sectionTitleClass}>Видимость и приватность</h2>

        <label
          htmlFor="contacts-visibility"
          className="mb-1 block text-sm text-text-1"
        >
          Кто видит карточку
        </label>
        <select
          id="contacts-visibility"
          value={draft.visibility}
          onChange={(event) =>
            update("visibility", event.target.value as ContactsVisibility)
          }
          className={selectClass}
        >
          {entries(visibilityLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <p className={hintClass} data-testid="contacts-visibility-hint">
          {visibilityHints[draft.visibility]}
        </p>

        <label
          htmlFor="contacts-paused-until"
          className="mb-1 mt-4 block text-sm text-text-1"
        >
          Пауза до даты
        </label>
        <div className="flex items-center gap-2">
          <input
            id="contacts-paused-until"
            type="date"
            value={draft.pausedUntil}
            onChange={(event) => update("pausedUntil", event.target.value)}
            className={inputClass}
          />
          <button
            type="button"
            disabled={draft.pausedUntil === ""}
            onClick={() => update("pausedUntil", "")}
            className="rounded-xl border border-glass-brd px-3 py-2 text-sm text-text-1 transition hover:text-text-0 disabled:opacity-50"
          >
            Снять паузу
          </button>
        </div>
        <p className={hintClass}>
          До этой даты карточки не будет в справочнике. Возвращать её вручную не
          нужно — после указанной даты она вернётся сама.
        </p>

        <fieldset className="mt-4">
          <legend className="mb-2 text-sm font-medium text-text-0">
            Что видно другим
          </legend>
          {privacyFields.map(([key, label]) => (
            <label
              key={key}
              className="mt-2 flex items-center gap-2 text-sm text-text-1"
            >
              <input
                type="checkbox"
                checked={draft.fieldPrivacy[key] === "everyone"}
                onChange={(event) =>
                  update("fieldPrivacy", {
                    ...draft.fieldPrivacy,
                    [key]: event.target.checked ? "everyone" : "hidden",
                  })
                }
                className="h-4 w-4 accent-magenta"
              />
              {label}
            </label>
          ))}
        </fieldset>

        <label className="mt-4 flex items-center gap-2 text-sm text-text-1">
          <input
            type="checkbox"
            checked={draft.requestsFromVerifiedOnly}
            onChange={(event) =>
              update("requestsFromVerifiedOnly", event.target.checked)
            }
            className="h-4 w-4 accent-magenta"
          />
          Обращения только от подтверждённых преданных
        </label>
        <p className="mt-1 pl-6 text-xs text-text-2">
          Карточку по-прежнему видят все, кому она открыта, но написать вам
          смогут только те, чей статус преданного подтвердила администрация.
        </p>
      </section>

      {error && (
        <p role="alert" className="mb-4 text-sm text-magenta">
          {error}
        </p>
      )}
      {saveState === "saved" && (
        <p role="status" className="mb-4 text-sm text-text-1">
          Карточка сохранена
        </p>
      )}

      <button
        type="button"
        disabled={saveState === "saving"}
        onClick={() => void save()}
        className="btn-mint w-full rounded-xl py-3 text-sm font-medium transition disabled:opacity-50"
      >
        {saveState === "saving" ? "Сохранение…" : "Сохранить карточку"}
      </button>
    </div>
  );
}
