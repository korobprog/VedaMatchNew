"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  LibraryCategoryDto,
  LibraryDuplicateEntryConflict,
  LibraryEntryType,
  LibraryCategoryTreeNode,
  LibraryLocale,
} from "@vedamatch/shared";
import { CategoryPicker } from "./category-picker";
import { LibraryCommunitySelect } from "./community-select";
import { insertIntoTree, renameInTree } from "./category-tree";
import { SectionRequestForm } from "./section-request-form";
import { entryTypeLabel, pickLocalized, t, type LibraryTextKey } from "./i18n";
import { apiFetch } from "@/lib/http-client";
import {
  badRequestKey,
  buildCreateEntryBody,
  defaultLocator,
  ENTRY_TYPES,
  isWizardStepReady,
  MAX_DESCRIPTION_LENGTH,
  MAX_SOURCE_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_URL_LENGTH,
  validateEntryDraft,
  WIZARD_STEPS,
  type EntryLocator,
  type LibraryEntryDraft,
} from "./entry-draft";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Заголовок и подсказка каждого шага — порядок задаёт номер шага. */
const STEPS: { title: LibraryTextKey; hint: LibraryTextKey }[] = [
  { title: "add.stepWhat", hint: "add.stepWhatHint" },
  { title: "add.stepWhere", hint: "add.stepWhereHint" },
  { title: "add.stepPlace", hint: "add.stepPlaceHint" },
  { title: "add.stepReview", hint: "add.stepReviewHint" },
];

/**
 * Простой режим добавления: те же поля, что и в полной форме, но по одному
 * решению на экран. Правила приёма общие с формой «профи» (entry-draft.ts) —
 * расходиться им нельзя, иначе мастер пропустит то, что отвергнет форма.
 *
 * Заводить новую категорию отсюда нельзя намеренно: это ветвление посреди
 * линейного пути, ради которого и существует простой режим.
 */
export function AddEntryWizard({
  locale,
  tree,
  initialCategorySlug,
  canCreateRoot = false,
}: {
  locale: LibraryLocale;
  tree: LibraryCategoryTreeNode[];
  initialCategorySlug?: string;
  canCreateRoot?: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [categories, setCategories] = useState(tree);
  const [selected, setSelected] = useState<LibraryCategoryDto[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateId, setDuplicateId] = useState<string | null>(null);
  const [locatorTouched, setLocatorTouched] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);

  const [draft, setDraft] = useState<LibraryEntryDraft>({
    url: "",
    source: "",
    locator: defaultLocator("article"),
    type: "article",
    contentLanguage: locale,
    titleRu: "",
    titleEn: "",
    descriptionRu: "",
    descriptionEn: "",
    categoryIds: [],
    communityId: "",
  });

  function patch(next: Partial<LibraryEntryDraft>) {
    setDraft((current) => ({ ...current, ...next }));
  }

  /**
   * Пока человек не трогал переключатель сам, его положение задаёт тип.
   * После ручного выбора тип его больше не двигает: иначе «книга, но по
   * ссылке» сбрасывалось бы каждый раз при возврате на первый шаг.
   */
  function changeType(type: LibraryEntryType) {
    patch(locatorTouched ? { type } : { type, locator: defaultLocator(type) });
  }

  function changeLocator(locator: EntryLocator) {
    setLocatorTouched(true);
    patch({ locator });
  }

  function toggleCategory(category: LibraryCategoryDto) {
    setSelected((current) => {
      const next = current.some((item) => item.id === category.id)
        ? current.filter((item) => item.id !== category.id)
        : [...current, category];
      patch({ categoryIds: next.map((item) => item.id) });
      return next;
    });
  }

  function handleCategoryRenamed(updated: LibraryCategoryDto) {
    setCategories((current) => renameInTree(current, updated));
    setSelected((current) =>
      current.map((item) => (item.id === updated.id ? updated : item)),
    );
  }

  function handleCategoryCreated(category: LibraryCategoryDto) {
    setCategories((current) => insertIntoTree(current, category));
    // Свежесозданную сразу отмечаем: её ради этого и заводили.
    setSelected((current) => {
      if (current.some((item) => item.id === category.id)) return current;
      const next = [...current, category];
      patch({ categoryIds: next.map((item) => item.id) });
      return next;
    });
    setNotice(t(locale, "add.categoryCreated"));
  }


  async function submit() {
    setError(null);
    setDuplicateId(null);

    const invalid = validateEntryDraft(draft);
    if (invalid) {
      setError(t(locale, invalid));
      return;
    }

    setPending(true);
    try {
      const res = await apiFetch(`${API_URL}/library/entries`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildCreateEntryBody(draft)),
      });

      if (res.status === 409) {
        const payload = (await res.json()) as LibraryDuplicateEntryConflict;
        setDuplicateId(payload.entry?.id ?? null);
        setError(t(locale, "add.duplicate"));
        return;
      }
      if (res.status === 429) {
        setError(t(locale, "add.rateLimited"));
        return;
      }
      if (res.status === 400) {
        setError(t(locale, await badRequestKey(res)));
        return;
      }
      if (!res.ok) {
        setError(t(locale, "add.failed"));
        return;
      }

      const created = (await res.json()) as { id: string };

      // Обложка уезжает уже к созданной записи: отдельного эндпоинта на
      // «загрузить до создания» нет, а этот переиспользуется как есть.
      // Неудача не отменяет добавление — запись уже существует, и на её
      // странице загрузку можно повторить.
      if (coverFile) {
        const cover = new FormData();
        cover.append("file", coverFile);
        await apiFetch(`${API_URL}/library/entries/${created.id}/preview`, {
          method: "POST",
          credentials: "include",
          body: cover,
        }).catch(() => null);
      }

      router.push(`/library/entry/${created.id}`);
    } catch {
      setError(t(locale, "add.failed"));
    } finally {
      setPending(false);
    }
  }

  const current = STEPS[step - 1];
  const ready = isWizardStepReady(step, draft);

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <div className="flex items-center gap-2" aria-hidden>
          {STEPS.map((_, index) => (
            <span
              key={index}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                index + 1 <= step ? "bg-cyan" : "bg-glass-brd/60"
              }`}
            />
          ))}
        </div>
        <p className="text-xs text-text-2">
          {t(locale, "add.step")} {step} {t(locale, "add.stepOf")}{" "}
          {WIZARD_STEPS} · {t(locale, current.title)}
        </p>
      </div>

      <div className="grid gap-3">
        <h2 className="font-display text-lg font-semibold text-text-0">
          {t(locale, current.title)}
        </h2>
        <p className="text-sm text-text-1">{t(locale, current.hint)}</p>

        {step === 1 && (
          <>
            <label className="text-sm text-text-1">
              {t(locale, "add.type")}
              <select
                value={draft.type}
                onChange={(event) =>
                  changeType(event.target.value as LibraryEntryType)
                }
                autoFocus
                className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
              >
                {ENTRY_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {entryTypeLabel(locale, value)}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm text-text-1">
              {t(locale, "add.language")}
              <select
                value={draft.contentLanguage}
                onChange={(event) =>
                  patch({ contentLanguage: event.target.value })
                }
                className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
              >
                <option value="ru">RU</option>
                <option value="en">EN</option>
              </select>
            </label>
          </>
        )}

        {step === 2 && (
          <>
            <fieldset className="text-sm text-text-1">
              {/* Легенда скрыта: на экране она повторяла бы заголовок шага,
                  а скринридеру нужна, чтобы сгруппировать переключатели. */}
              <legend className="sr-only">
                {t(locale, "add.locatorLegend")}
              </legend>
              <div className="flex flex-wrap gap-4">
                {(["url", "source"] as const).map((value) => (
                  <label key={value} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="wizard-locator"
                      checked={draft.locator === value}
                      onChange={() => changeLocator(value)}
                    />
                    {t(
                      locale,
                      value === "url" ? "add.locatorUrl" : "add.locatorSource",
                    )}
                  </label>
                ))}
              </div>
            </fieldset>

            {/* Подсказка — сиблинг label, а не её содержимое: внутри она вошла
                бы в доступное имя поля, и скринридер назвал бы поле фразой. */}
            {draft.locator === "url" ? (
              <div>
                <label className="text-sm text-text-1">
                  {t(locale, "add.url")}
                  <input
                    value={draft.url}
                    onChange={(event) => patch({ url: event.target.value })}
                    placeholder="https://"
                    maxLength={MAX_URL_LENGTH}
                    aria-describedby="wizard-url-hint"
                    className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
                  />
                </label>
                <span
                  id="wizard-url-hint"
                  className="mt-1 block text-xs text-text-2"
                >
                  {t(locale, "add.hintUrl")}
                </span>
              </div>
            ) : (
              <div>
                <label className="text-sm text-text-1">
                  {t(locale, "add.source")}
                  <input
                    value={draft.source}
                    onChange={(event) => patch({ source: event.target.value })}
                    maxLength={MAX_SOURCE_LENGTH}
                    aria-describedby="wizard-source-hint"
                    className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
                  />
                </label>
                <span
                  id="wizard-source-hint"
                  className="mt-1 block text-xs text-text-2"
                >
                  {t(locale, "add.hintSource")}
                </span>
              </div>
            )}

            <div>
              <label className="text-sm text-text-1">
                {locale === "ru"
                  ? t(locale, "add.titleRu")
                  : t(locale, "add.titleEn")}
                <input
                  value={locale === "ru" ? draft.titleRu : draft.titleEn}
                  onChange={(event) =>
                    patch(
                      locale === "ru"
                        ? { titleRu: event.target.value }
                        : { titleEn: event.target.value },
                    )
                  }
                  maxLength={MAX_TITLE_LENGTH}
                  aria-describedby="wizard-title-hint"
                  className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
                />
              </label>
              <span
                id="wizard-title-hint"
                className="mt-1 block text-xs text-text-2"
              >
                {t(locale, "add.hintTitle")}
              </span>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <CategoryPicker
              locale={locale}
              tree={categories}
              selected={selected}
              onToggle={toggleCategory}
              onRenamed={handleCategoryRenamed}
              onCreated={handleCategoryCreated}
              initialParentSlug={initialCategorySlug}
              canCreateRoot={canCreateRoot}
            />

            {/* Рядом с рубриками, а не на первом шаге: и то и другое — про
                «куда это относится», и спрашивать об этом дважды в разных
                местах мастера незачем. */}
            <LibraryCommunitySelect
              locale={locale}
              value={draft.communityId}
              onChange={(communityId) => patch({ communityId })}
            />

            {/* Подходящей рубрики может не оказаться, а тупик посреди мастера
                хуже лишней кнопки. Верхний уровень заводит администрация —
                остальным остаётся заявка, и бэкенд отказал бы им всё равно. */}
            <div className="flex flex-col gap-2">
              {!canCreateRoot && (
                <>
                  <p className="text-xs text-text-2">
                    {t(locale, "add.noCategoryFits")}
                  </p>
                  <button
                    type="button"
                    onClick={() => setRequestOpen((open) => !open)}
                    className="self-start rounded-xl border border-glass-brd px-3 py-1.5 text-sm text-text-0 hover:bg-glass-brd/40"
                  >
                    {requestOpen
                      ? t(locale, "add.categoryCancel")
                      : t(locale, "add.sectionRequest")}
                  </button>

                  {requestOpen && (
                    <div className="rounded-xl border border-glass-brd p-3">
                      <SectionRequestForm locale={locale} />
                    </div>
                  )}
                </>
              )}

              {notice && <p className="text-xs text-cyan">{notice}</p>}
            </div>
          </>
        )}

        {step === WIZARD_STEPS && (
          <>
            <dl className="grid gap-2 rounded-xl border border-glass-brd p-3 text-sm">
              <Row
                label={t(
                  locale,
                  draft.locator === "url" ? "add.url" : "add.source",
                )}
                value={draft.locator === "url" ? draft.url : draft.source}
              />
              <Row
                label={t(locale, "add.type")}
                value={entryTypeLabel(locale, draft.type)}
              />
              <Row
                label={
                  locale === "ru"
                    ? t(locale, "add.titleRu")
                    : t(locale, "add.titleEn")
                }
                value={locale === "ru" ? draft.titleRu : draft.titleEn}
              />
              <Row
                label={t(locale, "add.categories")}
                value={selected
                  .map((item) =>
                    pickLocalized(locale, {
                      ru: item.titleRu,
                      en: item.titleEn,
                    }),
                  )
                  .join(", ")}
              />
            </dl>

            {/* Обложку предлагаем только материалу без ссылки: у остальных
                картинку тянет обогащение со страницы источника. */}
            {draft.locator === "source" && (
              <div>
                <label className="text-sm text-text-1">
                  {t(locale, "add.cover")}{" "}
                  <span className="text-text-2">
                    — {t(locale, "add.optional")}
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) =>
                      setCoverFile(event.target.files?.[0] ?? null)
                    }
                    aria-describedby="wizard-cover-hint"
                    className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-sm text-text-0"
                  />
                </label>
                <span
                  id="wizard-cover-hint"
                  className="mt-1 block text-xs text-text-2"
                >
                  {t(locale, "add.coverHint")}
                  {coverFile && ` · ${t(locale, "add.coverChosen")}: ${coverFile.name}`}
                </span>
              </div>
            )}

            <div>
              <label className="text-sm text-text-1">
                {locale === "ru"
                  ? t(locale, "add.descriptionRu")
                  : t(locale, "add.descriptionEn")}
                <textarea
                  value={
                    locale === "ru" ? draft.descriptionRu : draft.descriptionEn
                  }
                  onChange={(event) =>
                    patch(
                      locale === "ru"
                        ? { descriptionRu: event.target.value }
                        : { descriptionEn: event.target.value },
                    )
                  }
                  rows={3}
                  maxLength={MAX_DESCRIPTION_LENGTH}
                  aria-describedby="wizard-description-hint"
                  className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
                />
              </label>
              <span
                id="wizard-description-hint"
                className="mt-1 block text-xs text-text-2"
              >
                {t(locale, "add.hintDescription")} ·{" "}
                {t(locale, "add.optional")}
              </span>
            </div>
          </>
        )}
      </div>

      {error && (
        <p className="glass rounded-xl border border-glass-brd p-3 text-sm text-text-0">
          {error}
          {duplicateId && (
            <>
              {" "}
              <Link
                href={`/library/entry/${duplicateId}`}
                className="underline"
              >
                {t(locale, "add.duplicateOpen")}
              </Link>
            </>
          )}
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setStep((value) => Math.max(1, value - 1))}
          disabled={step === 1 || pending}
          className="rounded-xl border border-glass-brd px-4 py-2 text-sm text-text-1 hover:text-text-0 disabled:opacity-40"
        >
          {t(locale, "add.prev")}
        </button>

        {step < WIZARD_STEPS ? (
          <button
            type="button"
            onClick={() => setStep((value) => value + 1)}
            disabled={!ready}
            className="rounded-xl bg-glass-brd/40 px-5 py-2 text-sm text-text-0 hover:bg-glass-brd/60 disabled:opacity-40"
          >
            {t(locale, "add.next")}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!ready || pending}
            className="rounded-xl bg-glass-brd/40 px-5 py-2 text-sm text-text-0 hover:bg-glass-brd/60 disabled:opacity-40"
          >
            {t(locale, "add.submit")}
          </button>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-text-2">{label}</dt>
      <dd className="min-w-0 flex-1 truncate text-text-0">{value || "—"}</dd>
    </div>
  );
}
