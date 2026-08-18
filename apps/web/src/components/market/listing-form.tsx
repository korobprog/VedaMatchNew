"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type {
  MarketCategoryDto,
  MarketCurrency,
  MarketDeliveryOption,
  MarketListingCondition,
  MarketListingDto,
  MarketListingKind,
  MarketPriceMode,
  MarketSectionDto,
  MarketServiceFormat,
  MarketShelfDto,
} from "@vedamatch/shared";
import type { Locale } from "@/lib/locale";
import { marketErrorCode, marketErrorText } from "./use-market-error";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const CURRENCIES: MarketCurrency[] = ["rub", "usd", "eur", "inr"];
const CONDITIONS: MarketListingCondition[] = [
  "new_item",
  "like_new",
  "used",
  "refurbished",
];
const FORMATS: MarketServiceFormat[] = ["online", "offline", "any"];
const PRICE_MODES: MarketPriceMode[] = ["fixed", "from", "negotiable", "free"];
const DELIVERIES: MarketDeliveryOption[] = [
  "pickup",
  "courier",
  "post",
  "cdek",
  "digital",
  "shipping_worldwide",
];
const MAX_CATEGORIES = 5;

/**
 * Форма объявления. Одна на создание и правку, но `kind` после создания не
 * меняется: переключение товар↔услуга обнулило бы половину полей и запутало
 * покупателя, поэтому при правке тип показан только как подпись.
 */
export function ListingForm({
  sections,
  categoriesBySection,
  shelves,
  locale,
  listing,
}: {
  sections: MarketSectionDto[];
  categoriesBySection: Record<string, MarketCategoryDto[]>;
  shelves: MarketShelfDto[];
  locale: Locale;
  listing?: MarketListingDto;
}) {
  const t = useTranslations("Market");
  const router = useRouter();

  const [kind, setKind] = useState<MarketListingKind>(listing?.kind ?? "product");
  const [titleRu, setTitleRu] = useState(listing?.titleRu ?? "");
  const [descriptionRu, setDescriptionRu] = useState(listing?.descriptionRu ?? "");
  const [priceMode, setPriceMode] = useState<MarketPriceMode>(
    listing?.price.mode ?? "fixed",
  );
  const [price, setPrice] = useState(
    listing?.price.minor != null ? String(listing.price.minor / 100) : "",
  );
  const [priceMax, setPriceMax] = useState(
    listing?.priceMaxMinor != null ? String(listing.priceMaxMinor / 100) : "",
  );
  const [currency, setCurrency] = useState<MarketCurrency>(
    listing?.price.currency ?? "rub",
  );
  const [condition, setCondition] = useState<MarketListingCondition | "">(
    listing?.condition ?? "",
  );
  const [trackStock, setTrackStock] = useState(listing?.trackStock ?? false);
  const [quantity, setQuantity] = useState(
    listing?.quantity != null ? String(listing.quantity) : "1",
  );
  const [serviceFormat, setServiceFormat] = useState<MarketServiceFormat | "">(
    listing?.serviceFormat ?? "offline",
  );
  const [duration, setDuration] = useState(
    listing?.serviceDurationMinutes != null
      ? String(listing.serviceDurationMinutes)
      : "",
  );
  const [sectionSlug, setSectionSlug] = useState(
    listing?.categories[0]?.sectionSlug ?? sections[0]?.slug ?? "",
  );
  const [categoryIds, setCategoryIds] = useState<string[]>(
    listing?.categories.map((category) => category.id) ?? [],
  );
  const [shelfIds, setShelfIds] = useState<string[]>(
    listing?.shelves.map((shelf) => shelf.id) ?? [],
  );
  const [delivery, setDelivery] = useState<MarketDeliveryOption[]>(
    listing?.deliveryOptions ?? [],
  );

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const priceless = priceMode === "negotiable" || priceMode === "free";
  // Запрещённые правилами категории в выборе не показываем: API их всё равно
  // отклонит, а узнавать об этом после отправки формы — плохой размен.
  // В каталоге они остаются: туда модерация перекладывает уже поданное.
  const categories = (categoriesBySection[sectionSlug] ?? []).filter(
    (category) => !category.prohibited || categoryIds.includes(category.id),
  );

  function toggleCategory(id: string) {
    setCategoryIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : current.length >= MAX_CATEGORIES
          ? current
          : [...current, id],
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);

    const numeric = (value: string) =>
      value.trim() === "" ? null : Number(value.replace(",", "."));

    const payload = {
      ...(listing ? {} : { kind }),
      titleRu: titleRu.trim() || null,
      descriptionRu: descriptionRu.trim() || null,
      priceMode,
      // У «договорной» и «даром» цены нет по определению — присылать её здесь
      // значит получить price_invalid.
      price: priceless ? null : numeric(price),
      priceMax: priceMode === "from" ? numeric(priceMax) : null,
      currency,
      condition: kind === "product" && condition ? condition : null,
      trackStock: kind === "product" ? trackStock : false,
      quantity: kind === "product" && trackStock ? numeric(quantity) : null,
      serviceFormat: kind === "service" ? serviceFormat || null : null,
      serviceDurationMinutes: kind === "service" ? numeric(duration) : null,
      deliveryOptions: delivery,
      categoryIds,
      ...(listing ? {} : { shelfIds }),
    };

    try {
      const res = await apiFetch(
        listing
          ? `${API_URL}/market/listings/${listing.id}`
          : `${API_URL}/market/listings`,
        {
          method: listing ? "PATCH" : "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        setError(await marketErrorCode(res));
        return;
      }
      const saved = (await res.json()) as MarketListingDto;

      // Полки при правке ставятся отдельным маршрутом: они не часть тела
      // объявления, чтобы счётчики полок двигались своей транзакцией.
      if (listing) {
        await apiFetch(`${API_URL}/market/listings/${listing.id}/shelves`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shelfIds }),
        });
      }

      router.push(`/market/sell/listings/${saved.id}`);
      router.refresh();
    } catch {
      setError("unknown");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="glass rounded-2xl border border-glass-brd p-5">
      <fieldset className="mb-4">
        <legend className="mb-1 block text-sm text-text-2">{t("form.kind")}</legend>
        {listing ? (
          <p className="text-sm text-text-1">
            {kind === "service" ? t("listing.kindService") : t("listing.kindProduct")}
          </p>
        ) : (
          <div className="flex gap-2">
            {(["product", "service"] as const).map((value) => (
              <label
                key={value}
                className={[
                  "cursor-pointer rounded-xl border px-3 py-1.5 text-sm transition-colors",
                  kind === value
                    ? "border-glass-brd bg-glass-brd/50 text-text-0"
                    : "border-glass-brd text-text-2 hover:text-text-0",
                ].join(" ")}
              >
                <input
                  type="radio"
                  name="kind"
                  checked={kind === value}
                  onChange={() => setKind(value)}
                  className="sr-only"
                />
                {value === "service"
                  ? t("listing.kindService")
                  : t("listing.kindProduct")}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <Field label={t("form.titleRu")}>
        <input
          value={titleRu}
          onChange={(event) => setTitleRu(event.target.value)}
          maxLength={140}
          required
          className={inputClass}
        />
      </Field>

      <Field label={t("form.descriptionRu")}>
        <textarea
          value={descriptionRu}
          onChange={(event) => setDescriptionRu(event.target.value)}
          rows={6}
          maxLength={8000}
          className={inputClass}
        />
      </Field>

      <fieldset className="mb-4">
        <legend className="mb-1 block text-sm text-text-2">
          {t("form.priceMode")}
        </legend>
        <div className="mb-2 flex flex-wrap gap-2">
          {PRICE_MODES.map((mode) => (
            <label
              key={mode}
              className={[
                "cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors",
                priceMode === mode
                  ? "border-glass-brd bg-glass-brd/50 text-text-0"
                  : "border-glass-brd text-text-2 hover:text-text-0",
              ].join(" ")}
            >
              <input
                type="radio"
                name="priceMode"
                checked={priceMode === mode}
                onChange={() => setPriceMode(mode)}
                className="sr-only"
              />
              {priceModeLabel(t, mode)}
            </label>
          ))}
        </div>

        {!priceless && (
          <div className="flex flex-wrap gap-2">
            <input
              type="number"
              min={0}
              step="0.01"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              placeholder={t("form.priceValue")}
              required
              className={`${inputClass} max-w-[10rem]`}
            />
            {priceMode === "from" && (
              <input
                type="number"
                min={0}
                step="0.01"
                value={priceMax}
                onChange={(event) => setPriceMax(event.target.value)}
                placeholder={t("form.priceMax")}
                className={`${inputClass} max-w-[10rem]`}
              />
            )}
            <select
              value={currency}
              onChange={(event) =>
                setCurrency(event.target.value as MarketCurrency)
              }
              className={`${inputClass} max-w-[7rem]`}
            >
              {CURRENCIES.map((value) => (
                <option key={value} value={value}>
                  {value.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        )}
      </fieldset>

      {kind === "product" ? (
        <>
          <Field label={t("form.condition")}>
            <select
              value={condition}
              onChange={(event) =>
                setCondition(event.target.value as MarketListingCondition | "")
              }
              className={inputClass}
            >
              <option value="">—</option>
              {CONDITIONS.map((value) => (
                <option key={value} value={value}>
                  {t(`condition.${value}`)}
                </option>
              ))}
            </select>
          </Field>

          <label className="mb-2 flex items-center gap-2 text-sm text-text-1">
            <input
              type="checkbox"
              checked={trackStock}
              onChange={(event) => setTrackStock(event.target.checked)}
              className="h-4 w-4 rounded border-glass-brd"
            />
            {t("form.trackStock")}
          </label>
          {trackStock && (
            <Field label={t("form.quantity")}>
              <input
                type="number"
                min={0}
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                className={`${inputClass} max-w-[8rem]`}
              />
            </Field>
          )}
        </>
      ) : (
        <>
          <Field label={t("form.serviceFormat")}>
            <select
              value={serviceFormat}
              onChange={(event) =>
                setServiceFormat(event.target.value as MarketServiceFormat)
              }
              required
              className={inputClass}
            >
              {FORMATS.map((value) => (
                <option key={value} value={value}>
                  {t(`serviceFormat.${value}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("form.duration")}>
            <input
              type="number"
              min={1}
              max={1440}
              value={duration}
              onChange={(event) => setDuration(event.target.value)}
              className={`${inputClass} max-w-[8rem]`}
            />
          </Field>
        </>
      )}

      <Field label={t("filters.section")}>
        <select
          value={sectionSlug}
          onChange={(event) => setSectionSlug(event.target.value)}
          className={inputClass}
        >
          {sections.map((section) => (
            <option key={section.id} value={section.slug}>
              {locale === "en" ? section.titleEn : section.titleRu}
            </option>
          ))}
        </select>
      </Field>

      <fieldset className="mb-4">
        <legend className="mb-1 block text-sm text-text-2">
          {t("form.categories")}
        </legend>
        <div className="flex flex-wrap gap-2">
          {categories.map((category) => {
            const checked = categoryIds.includes(category.id);
            return (
              <label
                key={category.id}
                className={[
                  "cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors",
                  checked
                    ? "border-glass-brd bg-glass-brd/50 text-text-0"
                    : "border-glass-brd text-text-2 hover:text-text-0",
                ].join(" ")}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleCategory(category.id)}
                  className="sr-only"
                />
                {locale === "en" ? category.titleEn : category.titleRu}
              </label>
            );
          })}
        </div>
      </fieldset>

      {shelves.length > 0 && (
        <fieldset className="mb-4">
          <legend className="mb-1 block text-sm text-text-2">
            {t("form.shelves")}
          </legend>
          <div className="flex flex-wrap gap-2">
            {shelves.map((shelf) => {
              const checked = shelfIds.includes(shelf.id);
              return (
                <label
                  key={shelf.id}
                  className={[
                    "cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors",
                    checked
                      ? "border-glass-brd bg-glass-brd/50 text-text-0"
                      : "border-glass-brd text-text-2 hover:text-text-0",
                  ].join(" ")}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      setShelfIds((current) =>
                        current.includes(shelf.id)
                          ? current.filter((item) => item !== shelf.id)
                          : [...current, shelf.id],
                      )
                    }
                    className="sr-only"
                  />
                  {shelf.titleRu ?? shelf.titleEn ?? shelf.slug}
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      <fieldset className="mb-4">
        <legend className="mb-1 block text-sm text-text-2">
          {t("sell.deliveryOptions")}
        </legend>
        <div className="flex flex-wrap gap-2">
          {DELIVERIES.map((option) => (
            <label
              key={option}
              className={[
                "cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors",
                delivery.includes(option)
                  ? "border-glass-brd bg-glass-brd/50 text-text-0"
                  : "border-glass-brd text-text-2 hover:text-text-0",
              ].join(" ")}
            >
              <input
                type="checkbox"
                checked={delivery.includes(option)}
                onChange={() =>
                  setDelivery((current) =>
                    current.includes(option)
                      ? current.filter((item) => item !== option)
                      : [...current, option],
                  )
                }
                className="sr-only"
              />
              {t(`delivery.${option}`)}
            </label>
          ))}
        </div>
      </fieldset>

      {error && (
        <p className="mb-3 rounded-xl border border-magenta/40 bg-magenta/10 px-3 py-2 text-sm text-text-0">
          {marketErrorText(t, error)}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || categoryIds.length === 0}
        className="rounded-xl bg-glass-brd/40 px-4 py-2 text-sm text-text-0 hover:bg-glass-brd/60 disabled:opacity-50"
      >
        {listing ? t("sell.save") : t("form.submit")}
      </button>
    </form>
  );
}

function priceModeLabel(
  t: (key: string) => string,
  mode: MarketPriceMode,
): string {
  if (mode === "fixed") return t("form.priceFixed");
  if (mode === "from") return t("form.priceFrom");
  if (mode === "negotiable") return t("form.priceNegotiable");
  return t("form.priceFree");
}

const inputClass =
  "w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0 placeholder:text-text-2";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="mb-4 block">
      <span className="mb-1 block text-sm text-text-2">{label}</span>
      {children}
    </label>
  );
}
