"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  LibraryCategoryDto,
  LibraryDuplicateEntryConflict,
  LibraryEntryType,
  LibraryLocale,
  LibrarySectionDto,
} from "@vedamatch/shared";
import { entryTypeLabel, pickLocalized, t, type LibraryTextKey } from "./i18n";
import { apiFetch } from "@/lib/http-client";
import {
  badRequestKey,
  buildCreateEntryBody,
  ENTRY_TYPES,
  isWizardStepReady,
  MAX_DESCRIPTION_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_URL_LENGTH,
  validateEntryDraft,
  WIZARD_STEPS,
  type LibraryEntryDraft,
} from "./entry-draft";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Заголовок и подсказка каждого шага — порядок задаёт номер шага. */
const STEPS: { title: LibraryTextKey; hint: LibraryTextKey }[] = [
  { title: "add.stepUrl", hint: "add.stepUrlHint" },
  { title: "add.stepAbout", hint: "add.stepAboutHint" },
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
  sections,
  categories,
  initialSectionSlug,
}: {
  locale: LibraryLocale;
  sections: LibrarySectionDto[];
  categories: LibraryCategoryDto[];
  initialSectionSlug?: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [sectionSlug, setSectionSlug] = useState(
    initialSectionSlug ?? sections[0]?.slug ?? "",
  );
  const [sectionCategories, setSectionCategories] = useState(categories);
  const [selected, setSelected] = useState<LibraryCategoryDto[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateId, setDuplicateId] = useState<string | null>(null);

  const [draft, setDraft] = useState<LibraryEntryDraft>({
    url: "",
    type: "article",
    contentLanguage: locale,
    titleRu: "",
    titleEn: "",
    descriptionRu: "",
    descriptionEn: "",
    categoryIds: [],
  });

  function patch(next: Partial<LibraryEntryDraft>) {
    setDraft((current) => ({ ...current, ...next }));
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

  async function changeSection(slug: string) {
    setSectionSlug(slug);
    if (!slug) return;
    const response = await apiFetch(
      `${API_URL}/library/categories/section/${encodeURIComponent(slug)}`,
      { credentials: "include" },
    ).catch(() => null);
    if (!response?.ok) return;
    setSectionCategories((await response.json()) as LibraryCategoryDto[]);
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
          // Подсказка — сиблинг label, а не её содержимое: внутри она вошла бы
          // в доступное имя поля, и скринридер назвал бы поле целой фразой.
          <div>
            <label className="text-sm text-text-1">
              {t(locale, "add.url")}
              <input
                value={draft.url}
                onChange={(event) => patch({ url: event.target.value })}
                placeholder="https://"
                maxLength={MAX_URL_LENGTH}
                autoFocus
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
        )}

        {step === 2 && (
          <>
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
                  autoFocus
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

            <label className="text-sm text-text-1">
              {t(locale, "add.type")}
              <select
                value={draft.type}
                onChange={(event) =>
                  patch({ type: event.target.value as LibraryEntryType })
                }
                className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
              >
                {ENTRY_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {entryTypeLabel(locale, value)}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        {step === 3 && (
          <>
            <label className="text-sm text-text-1">
              {t(locale, "add.section")}
              <select
                value={sectionSlug}
                onChange={(event) => void changeSection(event.target.value)}
                className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
              >
                {sections.map((section) => (
                  <option key={section.id} value={section.slug}>
                    {pickLocalized(locale, {
                      ru: section.titleRu,
                      en: section.titleEn,
                    })}
                  </option>
                ))}
              </select>
            </label>

            <fieldset className="text-sm text-text-1">
              <legend className="mb-2">{t(locale, "add.categories")}</legend>
              <div className="flex flex-wrap gap-3">
                {sectionCategories.map((category) => {
                  const label = pickLocalized(locale, {
                    ru: category.titleRu,
                    en: category.titleEn,
                  });
                  return (
                    <label
                      key={category.id}
                      className="flex items-center gap-2"
                    >
                      <input
                        type="checkbox"
                        aria-label={label}
                        checked={selected.some(
                          (item) => item.id === category.id,
                        )}
                        onChange={() => toggleCategory(category)}
                      />
                      {label}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </>
        )}

        {step === WIZARD_STEPS && (
          <>
            <dl className="grid gap-2 rounded-xl border border-glass-brd p-3 text-sm">
              <Row label={t(locale, "add.url")} value={draft.url} />
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
