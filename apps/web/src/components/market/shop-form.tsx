"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { MarketDeliveryOption, MarketShopDto } from "@vedamatch/shared";
import { marketErrorCode, marketErrorText } from "./use-market-error";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const DELIVERIES: MarketDeliveryOption[] = [
  "pickup",
  "courier",
  "post",
  "cdek",
  "digital",
  "shipping_worldwide",
];

/**
 * Форма магазина: одна и та же для создания и правки. Отличие в двух вещах —
 * при создании обязателен чекбокс согласия с правилами, а слаг после создания
 * уже не меняется, поэтому поля для него нет вовсе.
 */
export function ShopForm({ shop }: { shop?: MarketShopDto }) {
  const t = useTranslations("Market");
  const router = useRouter();

  const [name, setName] = useState(shop?.name ?? "");
  const [taglineRu, setTaglineRu] = useState(shop?.taglineRu ?? "");
  const [aboutRu, setAboutRu] = useState(shop?.aboutRu ?? "");
  const [city, setCity] = useState(shop?.location?.city ?? shop?.city ?? "");
  const [telegram, setTelegram] = useState(shop?.messengers?.telegram ?? "");
  const [phone, setPhone] = useState(shop?.messengers?.phone ?? "");
  const [delivery, setDelivery] = useState<MarketDeliveryOption[]>(
    shop?.deliveryOptions ?? [],
  );
  const [closed, setClosed] = useState(shop?.status === "closed");
  const [rulesAccepted, setRulesAccepted] = useState(false);

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function toggleDelivery(option: MarketDeliveryOption) {
    setDelivery((current) =>
      current.includes(option)
        ? current.filter((item) => item !== option)
        : [...current, option],
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    setSaved(false);

    // Гео передаём только когда город указан: без координат бэкенд всё равно
    // не построит фильтр, а пустой объект затёр бы префилл из профиля.
    const location = city.trim()
      ? {
          city: city.trim(),
          country: shop?.location?.country,
          lat: shop?.location?.lat ?? 0,
          lon: shop?.location?.lon ?? 0,
        }
      : null;

    const payload = {
      name: name.trim(),
      taglineRu: taglineRu.trim() || null,
      aboutRu: aboutRu.trim() || null,
      location,
      messengers: {
        ...(telegram.trim() ? { telegram: telegram.trim() } : {}),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
      },
      deliveryOptions: delivery,
      ...(shop
        ? { status: closed ? ("closed" as const) : ("active" as const) }
        : { rulesAccepted }),
    };

    try {
      const res = await fetch(
        shop ? `${API_URL}/market/shops/${shop.id}` : `${API_URL}/market/shops`,
        {
          method: shop ? "PATCH" : "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        setError(await marketErrorCode(res));
        return;
      }
      setSaved(true);
      router.push("/market/sell");
      router.refresh();
    } catch {
      setError("unknown");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="glass rounded-2xl border border-glass-brd p-5">
      <Field label={t("sell.name")}>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={80}
          required
          className={inputClass}
        />
      </Field>

      <Field label={t("sell.tagline")}>
        <input
          value={taglineRu}
          onChange={(event) => setTaglineRu(event.target.value)}
          maxLength={160}
          className={inputClass}
        />
      </Field>

      <Field label={t("sell.about")}>
        <textarea
          value={aboutRu}
          onChange={(event) => setAboutRu(event.target.value)}
          rows={5}
          maxLength={4000}
          className={inputClass}
        />
      </Field>

      <Field label={t("sell.location")}>
        <input
          value={city}
          onChange={(event) => setCity(event.target.value)}
          className={inputClass}
        />
      </Field>

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
                onChange={() => toggleDelivery(option)}
                className="sr-only"
              />
              {t(`delivery.${option}`)}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="mb-4">
        <legend className="mb-1 block text-sm text-text-2">
          {t("sell.messengers")}
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            value={telegram}
            onChange={(event) => setTelegram(event.target.value)}
            placeholder="Telegram"
            className={inputClass}
          />
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="+7…"
            className={inputClass}
          />
        </div>
      </fieldset>

      {shop ? (
        <label className="mb-4 flex items-center gap-2 text-sm text-text-1">
          <input
            type="checkbox"
            checked={closed}
            onChange={(event) => setClosed(event.target.checked)}
            className="h-4 w-4 rounded border-glass-brd"
          />
          {t("sell.statusClosed")}
        </label>
      ) : (
        <label className="mb-4 flex items-start gap-2 text-sm text-text-1">
          <input
            type="checkbox"
            checked={rulesAccepted}
            onChange={(event) => setRulesAccepted(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-glass-brd"
          />
          <span>
            {t("sell.acceptRules")}{" "}
            <Link href="/market/rules" className="underline hover:text-text-0">
              {t("rules.title")}
            </Link>
          </span>
        </label>
      )}

      {error && (
        <p className="mb-3 rounded-xl border border-magenta/40 bg-magenta/10 px-3 py-2 text-sm text-text-0">
          {marketErrorText(t, error)}
        </p>
      )}
      {saved && <p className="mb-3 text-sm text-text-2">{t("sell.saved")}</p>}

      <button
        type="submit"
        disabled={pending || (!shop && !rulesAccepted)}
        className="rounded-xl bg-glass-brd/40 px-4 py-2 text-sm text-text-0 hover:bg-glass-brd/60 disabled:opacity-50"
      >
        {shop ? t("sell.save") : t("sell.createCta")}
      </button>
    </form>
  );
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
