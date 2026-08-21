"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { MarketCategoryDto, MarketSectionDto } from "@vedamatch/shared";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export interface CatalogSection {
  section: MarketSectionDto;
  categories: MarketCategoryDto[];
}

const field =
  "mt-1 w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0 placeholder:text-text-2";

/**
 * Каталог Рынка: разделы и категории внутри них. Один раскрытый раздел за раз —
 * 57 категорий в общем списке ищутся глазами дольше, чем открывается аккордеон.
 */
export function MarketCatalogEditor({
  sections,
}: {
  sections: CatalogSection[];
}) {
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <CreateSectionForm />

      <ul className="space-y-3">
        {sections.map(({ section, categories }) => (
          <li
            key={section.id}
            className="glass rounded-2xl border border-glass-brd p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-display font-semibold text-text-0">
                  {section.titleRu}
                </p>
                <p className="mt-0.5 font-mono text-xs text-text-2">
                  {section.slug} · позиция {section.position} ·{" "}
                  {section.categoriesCount} категорий · {section.listingsCount}{" "}
                  объявлений
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setOpenSlug(openSlug === section.slug ? null : section.slug)
                }
                aria-expanded={openSlug === section.slug}
                className="rounded-xl border border-glass-brd px-3 py-1.5 text-sm text-text-1 hover:text-text-0"
              >
                {openSlug === section.slug ? "Свернуть" : "Открыть"}
              </button>
            </div>

            {openSlug === section.slug && (
              <div className="mt-4 space-y-5 border-t border-glass-brd pt-4">
                <SectionForm section={section} />
                <CategoryList
                  sectionId={section.id}
                  categories={categories}
                  sections={sections.map((item) => item.section)}
                />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CreateSectionForm() {
  const { pending, error, submit } = useCatalogRequest();
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-xl border border-glass-brd px-3 py-2 text-sm text-text-1 hover:text-text-0"
      >
        Добавить раздел
      </button>
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const ok = await submit("/market/admin/catalog/sections", "POST", {
      slug: String(data.get("slug") ?? "").trim(),
      titleRu: String(data.get("titleRu") ?? "").trim(),
      titleEn: String(data.get("titleEn") ?? "").trim(),
      position: Number(data.get("position") ?? 0),
    });
    if (ok) setOpen(false);
  }

  return (
    <form
      onSubmit={onSubmit}
      className="glass space-y-3 rounded-2xl border border-glass-brd p-4"
    >
      <h2 className="font-display font-semibold text-text-0">Новый раздел</h2>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field name="slug" label="Слаг" required placeholder="services" />
        <Field name="position" label="Позиция" type="number" defaultValue="0" />
        <Field name="titleRu" label="Название (ru)" required />
        <Field name="titleEn" label="Название (en)" required />
      </div>
      <div className="flex gap-2">
        <Button type="submit" loading={pending}>
          Создать
        </Button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-xl border border-glass-brd px-3 py-2 text-sm text-text-1 hover:text-text-0"
        >
          Отмена
        </button>
      </div>
    </form>
  );
}

function SectionForm({ section }: { section: MarketSectionDto }) {
  const { pending, error, saved, submit } = useCatalogRequest();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await submit(
      `/market/admin/catalog/sections/${section.id}`,
      "PATCH",
      {
        titleRu: String(data.get("titleRu") ?? "").trim(),
        titleEn: String(data.get("titleEn") ?? "").trim(),
        descriptionRu: emptyToNull(data.get("descriptionRu")),
        descriptionEn: emptyToNull(data.get("descriptionEn")),
        position: Number(data.get("position") ?? section.position),
      },
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <h3 className="text-sm font-semibold text-text-0">Раздел</h3>
      {error && <Alert tone="error">{error}</Alert>}
      {saved && <Alert tone="success">Раздел сохранён.</Alert>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field name="titleRu" label="Название (ru)" defaultValue={section.titleRu} />
        <Field name="titleEn" label="Название (en)" defaultValue={section.titleEn} />
        <Field
          name="descriptionRu"
          label="Описание (ru)"
          defaultValue={section.descriptionRu ?? ""}
        />
        <Field
          name="descriptionEn"
          label="Описание (en)"
          defaultValue={section.descriptionEn ?? ""}
        />
        <Field
          name="position"
          label="Позиция"
          type="number"
          defaultValue={String(section.position)}
        />
      </div>
      <Button type="submit" loading={pending}>
        Сохранить раздел
      </Button>
    </form>
  );
}

function CategoryList({
  sectionId,
  categories,
  sections,
}: {
  sectionId: string;
  categories: MarketCategoryDto[];
  sections: MarketSectionDto[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-text-0">
        Категории ({categories.length})
      </h3>
      <ul className="space-y-2">
        {categories.map((category) => (
          <li
            key={category.id}
            className="rounded-xl border border-glass-brd p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-text-0">
                {category.titleRu}
                <span className="ml-2 font-mono text-xs text-text-2">
                  {category.slug} · {category.position} ·{" "}
                  {category.listingsCount} объявл.
                </span>
                {category.prohibited && (
                  <span className="ml-2 rounded-full border border-glass-brd px-2 py-0.5 text-xs text-text-1">
                    запрещена
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() =>
                  setEditingId(editingId === category.id ? null : category.id)
                }
                aria-expanded={editingId === category.id}
                className="rounded-lg border border-glass-brd px-2.5 py-1 text-xs text-text-1 hover:text-text-0"
              >
                {editingId === category.id ? "Закрыть" : "Править"}
              </button>
            </div>
            {editingId === category.id && (
              <CategoryForm category={category} sections={sections} />
            )}
          </li>
        ))}
      </ul>
      <CreateCategoryForm sectionId={sectionId} />
    </div>
  );
}

function CategoryForm({
  category,
  sections,
}: {
  category: MarketCategoryDto;
  sections: MarketSectionDto[];
}) {
  const { pending, error, saved, submit } = useCatalogRequest();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await submit(`/market/admin/catalog/categories/${category.id}`, "PATCH", {
      sectionId: String(data.get("sectionId") ?? category.sectionId),
      titleRu: String(data.get("titleRu") ?? "").trim(),
      titleEn: String(data.get("titleEn") ?? "").trim(),
      descriptionRu: emptyToNull(data.get("descriptionRu")),
      descriptionEn: emptyToNull(data.get("descriptionEn")),
      position: Number(data.get("position") ?? category.position),
    });
  }

  return (
    <form onSubmit={onSubmit} className="mt-3 space-y-3 border-t border-glass-brd pt-3">
      {error && <Alert tone="error">{error}</Alert>}
      {saved && <Alert tone="success">Категория сохранена.</Alert>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field name="titleRu" label="Название (ru)" defaultValue={category.titleRu} />
        <Field name="titleEn" label="Название (en)" defaultValue={category.titleEn} />
        <Field
          name="descriptionRu"
          label="Описание (ru)"
          defaultValue={category.descriptionRu ?? ""}
        />
        <Field
          name="descriptionEn"
          label="Описание (en)"
          defaultValue={category.descriptionEn ?? ""}
        />
        <Field
          name="position"
          label="Позиция"
          type="number"
          defaultValue={String(category.position)}
        />
        <label className="block text-sm font-medium text-text-1">
          Раздел
          <select
            name="sectionId"
            defaultValue={category.sectionId}
            className={field}
          >
            {sections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.titleRu}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Button type="submit" loading={pending}>
        Сохранить категорию
      </Button>
    </form>
  );
}

function CreateCategoryForm({ sectionId }: { sectionId: string }) {
  const { pending, error, submit } = useCatalogRequest();
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-xl border border-glass-brd px-3 py-2 text-sm text-text-1 hover:text-text-0"
      >
        Добавить категорию
      </button>
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const ok = await submit("/market/admin/catalog/categories", "POST", {
      sectionId,
      slug: String(data.get("slug") ?? "").trim(),
      titleRu: String(data.get("titleRu") ?? "").trim(),
      titleEn: String(data.get("titleEn") ?? "").trim(),
      position: Number(data.get("position") ?? 0),
    });
    if (ok) setOpen(false);
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3 rounded-xl border border-glass-brd p-3"
    >
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field name="slug" label="Слаг" required placeholder="tutoring" />
        <Field name="position" label="Позиция" type="number" defaultValue="0" />
        <Field name="titleRu" label="Название (ru)" required />
        <Field name="titleEn" label="Название (en)" required />
      </div>
      <div className="flex gap-2">
        <Button type="submit" loading={pending}>
          Создать
        </Button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-xl border border-glass-brd px-3 py-2 text-sm text-text-1 hover:text-text-0"
        >
          Отмена
        </button>
      </div>
    </form>
  );
}

function Field({
  name,
  label,
  type = "text",
  required,
  defaultValue,
  placeholder,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
  placeholder?: string;
}) {
  return (
    <label className="block text-sm font-medium text-text-1">
      {label}
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className={field}
      />
    </label>
  );
}

/** Пустая строка в описании означает «стереть», а не «не менять». */
function emptyToNull(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function useCatalogRequest() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(
    path: string,
    method: "POST" | "PATCH",
    body: unknown,
  ): Promise<boolean> {
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      const res = await apiFetch(`${API_URL}${path}`, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError(await res.text());
        return false;
      }
      setSaved(true);
      router.refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить");
      return false;
    } finally {
      setPending(false);
    }
  }

  return { pending, error, saved, submit };
}
