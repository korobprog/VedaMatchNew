"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  type CreateLibraryEntryRequest,
  type LibraryCategoryDto,
  type LibraryDuplicateEntryConflict,
  type LibraryCategoryTreeNode,
  type LibraryEntryType,
  type LibraryLocale,
  DEFAULT_CONTENT_LINEAGE,
  type LineageId,
} from "@vedamatch/shared";
import { CategoryPicker } from "./category-picker";
import { LibraryCommunitySelect } from "./community-select";
import { LineageSelect } from "@/components/lineage-picker";
import { insertIntoTree, renameInTree } from "./category-tree";
import { entryTypeLabel, t } from "./i18n";
import { apiFetch } from "@/lib/http-client";
import {
  buildCreateEntryBody,
  defaultLocator,
  ENTRY_TYPES,
  entrySubmitFailure,
  failureText,
  locatorForType,
  MAX_BODY_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_SOURCE_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_URL_LENGTH,
  validateEntryDraft,
  type EntryLocator,
  type LibraryEntryDraft,
} from "./entry-draft";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function AddEntryForm({
  locale,
  tree,
  initialCategorySlug,
  canCreateRoot = false,
  defaultLineage = DEFAULT_CONTENT_LINEAGE,
}: {
  locale: LibraryLocale;
  tree: LibraryCategoryTreeNode[];
  /** Рубрика, с которой пришли: её и предлагаем родителем для новой. */
  initialCategorySlug?: string;
  canCreateRoot?: boolean;
  /** Линия автора, если он преданный, иначе ISKCON — см. defaultLineageFor. */
  defaultLineage?: LineageId;
}) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [source, setSource] = useState("");
  /** Текст катхи целиком. */
  const [text, setText] = useState("");
  const [locator, setLocator] = useState<EntryLocator>(
    defaultLocator("article"),
  );
  const [locatorTouched, setLocatorTouched] = useState(false);
  const [type, setType] = useState<LibraryEntryType>("article");
  const [contentLanguage, setContentLanguage] = useState("ru");
  /** От имени какой общины. Пустая строка — от себя лично. */
  const [communityId, setCommunityId] = useState("");
  /** Духовная линия материала. Пустая строка — для всех линий. */
  const [lineage, setLineage] = useState<string>(defaultLineage);
  const [titleRu, setTitleRu] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [descriptionRu, setDescriptionRu] = useState("");
  const [descriptionEn, setDescriptionEn] = useState("");
  const [categories, setCategories] = useState(tree);
  const [selected, setSelected] = useState<LibraryCategoryDto[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateId, setDuplicateId] = useState<string | null>(null);

  function toggleCategory(category: LibraryCategoryDto) {
    setSelected((current) =>
      current.some((item) => item.id === category.id)
        ? current.filter((item) => item.id !== category.id)
        : [...current, category],
    );
  }

  function handleCategoryRenamed(updated: LibraryCategoryDto) {
    setCategories((current) => renameInTree(current, updated));
    setSelected((current) =>
      current.map((item) => (item.id === updated.id ? updated : item)),
    );
  }

  function handleCategoryCreated(category: LibraryCategoryDto) {
    setCategories((current) => insertIntoTree(current, category));
    setSelected((current) =>
      current.some((item) => item.id === category.id)
        ? current
        : [...current, category],
    );
    setNotice(t(locale, "add.categoryCreated"));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setDuplicateId(null);

    // Правила те же, что у мастера, — через общий черновик, а не своей
    // копией проверок: копия здесь уже была и расходилась бы с мастером на
    // первом же новом поле (так и случилось бы с текстом катхи).
    const draft: LibraryEntryDraft = {
      url,
      source,
      body: text,
      locator,
      type,
      contentLanguage,
      titleRu,
      titleEn,
      descriptionRu,
      descriptionEn,
      categoryIds: selected.map((item) => item.id),
      communityId,
      lineage,
    };
    const invalid = validateEntryDraft(draft);
    if (invalid) {
      setError(t(locale, invalid));
      return;
    }
    const body: CreateLibraryEntryRequest = buildCreateEntryBody(draft);

    setPending(true);
    try {
      const res = await apiFetch(`${API_URL}/library/entries`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.status === 409) {
        const payload = (await res.json()) as LibraryDuplicateEntryConflict;
        setDuplicateId(payload.entry?.id ?? null);
        setError(t(locale, "add.duplicate"));
        return;
      }
      if (!res.ok) {
        setError(failureText(locale, await entrySubmitFailure(res)));
        return;
      }

      const created = (await res.json()) as { id: string };
      router.push(`/library/entry/${created.id}`);
    } catch {
      // Сюда доходит только сорванный запрос: ответ с кодом разобран выше.
      setError(t(locale, "add.networkError"));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      {/* Подсказка — сиблинг label, а не её содержимое: внутри она попадает
          в доступное имя поля («Адрес ссылки Полный адрес вместе с https://»),
          и скринридер называет поле целой фразой. Описание вешаем через
          aria-describedby — оно читается отдельно от имени. */}
      {/* Катхе переключатель ни к чему: указывать ей есть на что одно — на
          собственный текст. Без maxLength у текста: на вставке он молча
          обрезал бы длинную лекцию, а так превышение видно в подсказке. */}
      {locator === "body" && (
        <>
          <div>
            <label className="text-sm text-text-1">
              {t(locale, "add.body")}
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                rows={12}
                lang={contentLanguage}
                aria-describedby="add-body-hint"
                required
                className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
              />
            </label>
            <span id="add-body-hint" className="mt-1 block text-xs text-text-2">
              {text.trim().length > MAX_BODY_LENGTH
                ? t(locale, "add.bodyTooLong")
                : t(locale, "add.hintBody")}{" "}
              · {text.length}/{MAX_BODY_LENGTH}
            </span>
          </div>
          <div>
            <label className="text-sm text-text-1">
              {t(locale, "add.source")}
              <input
                value={source}
                onChange={(event) => setSource(event.target.value)}
                className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
                maxLength={MAX_SOURCE_LENGTH}
                aria-describedby="add-katha-source-hint"
              />
            </label>
            <span
              id="add-katha-source-hint"
              className="mt-1 block text-xs text-text-2"
            >
              {t(locale, "add.hintKathaSource")}
            </span>
          </div>
        </>
      )}

      {locator !== "body" && (
        <fieldset className="text-sm text-text-1">
          <legend className="mb-2">{t(locale, "add.locatorLegend")}</legend>
          <div className="flex flex-wrap gap-4">
            {(["url", "source"] as const).map((value) => (
              <label key={value} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="add-locator"
                  checked={locator === value}
                  onChange={() => {
                    setLocatorTouched(true);
                    setLocator(value);
                  }}
                />
                {t(
                  locale,
                  value === "url" ? "add.locatorUrl" : "add.locatorSource",
                )}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {locator === "body" ? null : locator === "url" ? (
        <div>
          <label className="text-sm text-text-1">
            {t(locale, "add.url")}
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
              placeholder="https://"
              maxLength={MAX_URL_LENGTH}
              aria-describedby="add-url-hint"
              required
            />
          </label>
          <span id="add-url-hint" className="mt-1 block text-xs text-text-2">
            {t(locale, "add.hintUrl")}
          </span>
        </div>
      ) : (
        <div>
          <label className="text-sm text-text-1">
            {t(locale, "add.source")}
            <input
              value={source}
              onChange={(event) => setSource(event.target.value)}
              className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
              maxLength={MAX_SOURCE_LENGTH}
              aria-describedby="add-source-hint"
              required
            />
          </label>
          <span id="add-source-hint" className="mt-1 block text-xs text-text-2">
            {t(locale, "add.hintSource")}
          </span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm text-text-1">
          {t(locale, "add.type")}
          <select
            value={type}
            onChange={(event) => {
              const next = event.target.value as LibraryEntryType;
              setType(next);
              // Пока человек не трогал переключатель сам, его двигает тип;
              // после ручного выбора не перебиваем — он знает лучше. Катха —
              // исключение в обе стороны, см. locatorForType.
              setLocator((current) =>
                locatorForType(next, current, locatorTouched),
              );
            }}
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
            value={contentLanguage}
            onChange={(event) => setContentLanguage(event.target.value)}
            className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
          >
            <option value="ru">RU</option>
            <option value="en">EN</option>
          </select>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-sm text-text-1">
            {t(locale, "add.titleRu")}
            <input
              value={titleRu}
              onChange={(event) => setTitleRu(event.target.value)}
              maxLength={MAX_TITLE_LENGTH}
              aria-describedby="add-title-hint"
              className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
            />
          </label>
          <span id="add-title-hint" className="mt-1 block text-xs text-text-2">
            {t(locale, "add.hintTitle")}
          </span>
        </div>
        <label className="text-sm text-text-1">
          {t(locale, "add.titleEn")}
          <input
            value={titleEn}
            onChange={(event) => setTitleEn(event.target.value)}
            maxLength={MAX_TITLE_LENGTH}
            className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
          />
        </label>
        <div>
          <label className="text-sm text-text-1">
            {t(locale, "add.descriptionRu")}
            <textarea
              value={descriptionRu}
              onChange={(event) => setDescriptionRu(event.target.value)}
              rows={3}
              maxLength={MAX_DESCRIPTION_LENGTH}
              aria-describedby="add-description-hint"
              className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
            />
          </label>
          <span
            id="add-description-hint"
            className="mt-1 block text-xs text-text-2"
          >
            {t(locale, "add.hintDescription")} · {descriptionRu.length}/
            {MAX_DESCRIPTION_LENGTH}
          </span>
        </div>
        <label className="text-sm text-text-1">
          {t(locale, "add.descriptionEn")}
          <textarea
            value={descriptionEn}
            onChange={(event) => setDescriptionEn(event.target.value)}
            rows={3}
            maxLength={MAX_DESCRIPTION_LENGTH}
            className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
          />
          <span className="mt-1 block text-xs text-text-2">
            {descriptionEn.length}/{MAX_DESCRIPTION_LENGTH}
          </span>
        </label>
      </div>

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

      <LibraryCommunitySelect
        locale={locale}
        value={communityId}
        onChange={setCommunityId}
        disabled={pending}
      />

      <LineageSelect
        value={lineage}
        onChange={setLineage}
        allLabel={t(locale, "add.lineageAll")}
        label={t(locale, "add.lineage")}
        hint={t(locale, "add.lineageHint")}
        disabled={pending}
        className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
      />

      {notice && (
        <p className="glass rounded-xl border border-glass-brd p-3 text-sm text-text-1">
          {notice}
        </p>
      )}

      {error && (
        <p className="glass rounded-xl border border-glass-brd p-3 text-sm text-text-0">
          {error}
          {duplicateId && (
            <Link
              href={`/library/entry/${duplicateId}`}
              className="ml-2 underline"
            >
              {t(locale, "add.duplicateOpen")}
            </Link>
          )}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-glass-brd/40 px-4 py-2 text-sm text-text-0 hover:bg-glass-brd/60 disabled:opacity-50"
      >
        {t(locale, "add.submit")}
      </button>
    </form>
  );
}
