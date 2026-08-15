"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import type { MarketCategoryDto } from "@vedamatch/shared";
import type { Locale } from "@/lib/locale";

export interface FilterLabels {
  title: string;
  searchPlaceholder: string;
  submit: string;
  reset: string;
  kind: string;
  anyKind: string;
  product: string;
  service: string;
  category: string;
  anyCategory: string;
  price: string;
  priceFrom: string;
  priceTo: string;
  condition: string;
  anyCondition: string;
  conditions: Record<string, string>;
  city: string;
  delivery: string;
  anyDelivery: string;
  deliveries: Record<string, string>;
  available: string;
  sort: string;
  sorts: Record<string, string>;
}

const CONDITIONS = ["new_item", "like_new", "used", "refurbished"] as const;
const DELIVERIES = [
  "pickup",
  "courier",
  "post",
  "cdek",
  "digital",
  "shipping_worldwide",
] as const;
const SORTS = ["new", "price_asc", "price_desc", "popular"] as const;

/**
 * Фильтры каталога. Состояние живёт в адресе, а не в компоненте: так выдачу
 * можно переслать ссылкой, а «назад» возвращает прежний набор.
 */
export function ListingFilters({
  labels,
  categories,
  locale,
}: {
  labels: FilterLabels;
  categories: MarketCategoryDto[];
  locale: Locale;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  const current = (key: string) => searchParams.get(key) ?? "";

  function apply(patch: Record<string, string | undefined>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === "") next.delete(key);
      else next.set(key, value);
    }
    // Курсор посчитан для прежней выдачи: оставить его — значит открыть
    // вторую страницу нового фильтра и потерять первую.
    next.delete("cursor");
    const query = next.toString();
    router.push(query ? `?${query}` : "?");
  }

  const hasFilters = [
    "q",
    "kind",
    "categorySlug",
    "priceMin",
    "priceMax",
    "condition",
    "city",
    "delivery",
    "available",
  ].some((key) => searchParams.get(key));

  return (
    <section className="mb-4">
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          apply({ q: String(data.get("q") ?? "").trim() || undefined });
        }}
      >
        <input
          name="q"
          defaultValue={current("q")}
          placeholder={labels.searchPlaceholder}
          className="min-w-0 flex-1 rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0 placeholder:text-text-2"
        />
        <button
          type="submit"
          className="rounded-xl bg-glass-brd/40 px-4 py-2 text-sm text-text-0 hover:bg-glass-brd/60"
        >
          {labels.submit}
        </button>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="inline-flex items-center gap-1.5 rounded-xl border border-glass-brd px-3 py-2 text-sm text-text-2 hover:text-text-0"
        >
          <SlidersHorizontal aria-hidden className="h-4 w-4" />
          <span className="hidden sm:inline">{labels.title}</span>
        </button>
      </form>

      {open && (
        <div className="glass mt-3 grid gap-3 rounded-2xl border border-glass-brd p-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={labels.kind}>
            <Select
              value={current("kind")}
              onChange={(value) => apply({ kind: value })}
              options={[
                { value: "", label: labels.anyKind },
                { value: "product", label: labels.product },
                { value: "service", label: labels.service },
              ]}
            />
          </Field>

          {categories.length > 0 && (
            <Field label={labels.category}>
              <Select
                value={current("categorySlug")}
                onChange={(value) => apply({ categorySlug: value })}
                options={[
                  { value: "", label: labels.anyCategory },
                  ...categories.map((category) => ({
                    value: category.slug,
                    label: locale === "en" ? category.titleEn : category.titleRu,
                  })),
                ]}
              />
            </Field>
          )}

          <Field label={labels.price}>
            <div className="flex gap-2">
              <input
                type="number"
                min={0}
                inputMode="decimal"
                defaultValue={current("priceMin")}
                placeholder={labels.priceFrom}
                onBlur={(event) => apply({ priceMin: event.target.value })}
                className="w-full min-w-0 rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
              />
              <input
                type="number"
                min={0}
                inputMode="decimal"
                defaultValue={current("priceMax")}
                placeholder={labels.priceTo}
                onBlur={(event) => apply({ priceMax: event.target.value })}
                className="w-full min-w-0 rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
              />
            </div>
          </Field>

          <Field label={labels.condition}>
            <Select
              value={current("condition")}
              onChange={(value) => apply({ condition: value })}
              options={[
                { value: "", label: labels.anyCondition },
                ...CONDITIONS.map((value) => ({
                  value,
                  label: labels.conditions[value] ?? value,
                })),
              ]}
            />
          </Field>

          <Field label={labels.city}>
            <input
              defaultValue={current("city")}
              onBlur={(event) => apply({ city: event.target.value })}
              className="w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
            />
          </Field>

          <Field label={labels.delivery}>
            <Select
              value={current("delivery")}
              onChange={(value) => apply({ delivery: value })}
              options={[
                { value: "", label: labels.anyDelivery },
                ...DELIVERIES.map((value) => ({
                  value,
                  label: labels.deliveries[value] ?? value,
                })),
              ]}
            />
          </Field>

          <Field label={labels.sort}>
            <Select
              value={current("sort")}
              onChange={(value) => apply({ sort: value })}
              options={SORTS.map((value) => ({
                value,
                label: labels.sorts[value] ?? value,
              }))}
            />
          </Field>

          <label className="flex items-center gap-2 self-end text-sm text-text-1">
            <input
              type="checkbox"
              checked={current("available") === "true"}
              onChange={(event) =>
                apply({ available: event.target.checked ? "true" : undefined })
              }
              className="h-4 w-4 rounded border-glass-brd"
            />
            {labels.available}
          </label>

          {hasFilters && (
            <button
              type="button"
              onClick={() => router.push("?")}
              className="self-end rounded-xl border border-glass-brd px-3 py-2 text-sm text-text-2 hover:text-text-0"
            >
              {labels.reset}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-text-2">{label}</span>
      {children}
    </label>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
