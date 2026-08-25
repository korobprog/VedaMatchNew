"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type {
  MarketCartDto,
  MarketCartItemDto,
  MarketCartShopGroup,
  MarketDeliveryOption,
} from "@vedamatch/shared";
import type { Locale } from "@/lib/locale";
import { setCartCount } from "@/lib/market-cart-badge";
import { deriveCartQuantities, setCartQuantities } from "@/lib/market-cart-items";
import { listingTitle } from "./listing-card";
import { formatPriceMinor, priceText } from "./price";
import { marketErrorCode, marketErrorText } from "./use-market-error";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function CartPanel({
  initial,
  locale,
}: {
  initial: MarketCartDto;
  locale: Locale;
}) {
  const t = useTranslations("Market");
  const router = useRouter();
  const [cart, setCart] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function apply(next: MarketCartDto) {
    setCart(next);
    setCartCount(next.itemsCount);
    setCartQuantities(deriveCartQuantities(next));
  }

  // Данные с сервера уже под рукой — не ждём опроса значка в шапке, чтобы
  // карточки товаров сразу знали, что уже лежит в корзине. `cart` тут не
  // трогаем: он и так стартует с того же `initial` через useState.
  useEffect(() => {
    setCartCount(initial.itemsCount);
    setCartQuantities(deriveCartQuantities(initial));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function mutate(path: string, init: RequestInit) {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await apiFetch(`${API_URL}${path}`, {
        credentials: "include",
        ...init,
      });
      if (!res.ok) {
        setError(await marketErrorCode(res));
        return;
      }
      const text = await res.text();
      if (text) apply(JSON.parse(text) as MarketCartDto);
      else apply({ groups: [], unavailable: [], itemsCount: 0 });
    } catch {
      setError("unknown");
    } finally {
      setPending(false);
    }
  }

  const changeQuantity = (listingId: string, quantity: number) =>
    mutate(`/market/cart/items/${listingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity }),
    });

  const removeItem = (listingId: string) =>
    mutate(`/market/cart/items/${listingId}`, { method: "DELETE" });

  if (cart.groups.length === 0 && cart.unavailable.length === 0) {
    return (
      <div className="glass rounded-2xl border border-glass-brd p-8 text-center">
        <p className="text-text-1">{t("cart.empty")}</p>
        <p className="mt-1 text-sm text-text-2">{t("cart.emptyHint")}</p>
        <Link
          href="/market"
          className="mt-4 inline-block rounded-xl bg-glass-brd/40 px-4 py-2 text-sm text-text-0 hover:bg-glass-brd/60"
        >
          {t("nav.catalog")}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-xl border border-magenta/40 bg-magenta/10 px-3 py-2 text-sm text-text-0">
          {marketErrorText(t, error)}
        </p>
      )}

      {/* Оплаты на Рынке нет — говорим об этом до кнопки, а не после. */}
      <p className="rounded-xl border border-glass-brd bg-glass-brd/20 px-3 py-2 text-sm text-text-1">
        {t("cart.noteAboutPayment")}
      </p>

      {cart.groups.map((group) => (
        <CartGroup
          key={`${group.shopId}:${group.currency}`}
          group={group}
          locale={locale}
          pending={pending}
          onQuantity={changeQuantity}
          onRemove={removeItem}
          onCheckedOut={(next) => {
            apply(next);
            router.refresh();
          }}
          onError={setError}
        />
      ))}

      {cart.unavailable.length > 0 && (
        <section className="glass rounded-2xl border border-glass-brd p-4">
          <h2 className="text-sm font-semibold text-text-0">
            {t("cart.unavailableTitle")}
          </h2>
          <p className="mb-3 text-xs text-text-2">{t("cart.unavailableHint")}</p>
          <ul className="space-y-2">
            {cart.unavailable.map((item) => (
              <li
                key={item.listingId}
                className="flex items-center gap-3 text-sm text-text-2"
              >
                <span className="min-w-0 flex-1 truncate line-through">
                  {listingTitle(item, locale)}
                </span>
                <button
                  type="button"
                  onClick={() => void removeItem(item.listingId)}
                  aria-label={t("cart.remove")}
                  className="text-text-2 hover:text-magenta"
                >
                  <Trash2 aria-hidden className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function CartGroup({
  group,
  locale,
  pending,
  onQuantity,
  onRemove,
  onCheckedOut,
  onError,
}: {
  group: MarketCartShopGroup;
  locale: Locale;
  pending: boolean;
  onQuantity: (listingId: string, quantity: number) => void;
  onRemove: (listingId: string) => void;
  onCheckedOut: (cart: MarketCartDto) => void;
  onError: (code: string) => void;
}) {
  const t = useTranslations("Market");
  const [delivery, setDelivery] = useState<MarketDeliveryOption | "">(
    group.deliveryOptions[0] ?? "",
  );
  const [note, setNote] = useState("");
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);

  async function checkout() {
    if (sending) return;
    setSending(true);
    try {
      const res = await apiFetch(`${API_URL}/market/cart/checkout`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groups: [
            {
              shopId: group.shopId,
              currency: group.currency,
              deliveryOption: delivery || null,
              deliveryNote: note.trim() || null,
              comment: comment.trim() || null,
            },
          ],
        }),
      });
      if (!res.ok) {
        onError(await marketErrorCode(res));
        return;
      }
      const cart = await apiFetch(`${API_URL}/market/cart`, {
        credentials: "include",
      }).then((r) => r.json() as Promise<MarketCartDto>);
      onCheckedOut(cart);
    } catch {
      onError("unknown");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="glass rounded-2xl border border-glass-brd p-4">
      <div className="mb-3 flex items-center gap-2">
        <Link
          href={`/market/shops/${group.shopSlug}`}
          className="font-medium text-text-0 hover:underline"
        >
          {group.shopName}
        </Link>
        <span className="text-xs uppercase text-text-2">{group.currency}</span>
      </div>

      <ul className="space-y-3">
        {group.items.map((item) => (
          <CartRow
            key={item.listingId}
            item={item}
            locale={locale}
            pending={pending}
            onQuantity={onQuantity}
            onRemove={onRemove}
          />
        ))}
      </ul>

      <p className="mt-3 border-t border-glass-brd pt-3 text-right text-sm text-text-1">
        {t("cart.subtotal")}:{" "}
        <span className="font-display font-semibold text-text-0">
          {formatPriceMinor(group.subtotalMinor, group.currency)}
        </span>
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {group.deliveryOptions.length > 0 && (
          <label className="text-sm">
            <span className="mb-1 block text-text-2">{t("cart.deliveryOption")}</span>
            <select
              value={delivery}
              onChange={(event) =>
                setDelivery(event.target.value as MarketDeliveryOption | "")
              }
              className={inputClass}
            >
              <option value="">—</option>
              {group.deliveryOptions.map((option) => (
                <option key={option} value={option}>
                  {t(`delivery.${option}`)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="text-sm">
          <span className="mb-1 block text-text-2">{t("cart.deliveryNote")}</span>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={500}
            className={inputClass}
          />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block text-text-2">{t("cart.comment")}</span>
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            rows={2}
            maxLength={2000}
            className={inputClass}
          />
        </label>
      </div>

      <button
        type="button"
        onClick={() => void checkout()}
        disabled={sending || group.items.length === 0}
        className="mt-3 rounded-xl bg-glass-brd/40 px-4 py-2 text-sm text-text-0 hover:bg-glass-brd/60 disabled:opacity-50"
      >
        {t("cart.checkoutGroup")}
      </button>
    </section>
  );
}

function CartRow({
  item,
  locale,
  pending,
  onQuantity,
  onRemove,
}: {
  item: MarketCartItemDto;
  locale: Locale;
  pending: boolean;
  onQuantity: (listingId: string, quantity: number) => void;
  onRemove: (listingId: string) => void;
}) {
  const t = useTranslations("Market");
  const priceLabels = {
    negotiable: t("price.negotiable"),
    free: t("price.free"),
    from: String(t.raw("price.from")),
    range: String(t.raw("price.range")),
  };

  return (
    <li className="flex items-center gap-3">
      {item.primaryImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- картинка в нашем S3
        <img
          src={item.primaryImageUrl}
          alt=""
          loading="lazy"
          className="h-14 w-14 shrink-0 rounded-xl border border-glass-brd object-cover"
        />
      ) : (
        <span className="h-14 w-14 shrink-0 rounded-xl border border-glass-brd" />
      )}

      <div className="min-w-0 flex-1">
        <Link
          href={`/market/listing/${item.listingId}`}
          className="block truncate text-sm text-text-0 hover:underline"
        >
          {listingTitle(item, locale)}
        </Link>
        <p className="text-xs text-text-2">{priceText(item.price, priceLabels)}</p>
        {item.quantityAvailable !== null && (
          <p className="text-xs text-text-2">
            {t("cart.inStock", { count: item.quantityAvailable })}
          </p>
        )}
      </div>

      <input
        type="number"
        min={1}
        value={item.quantity}
        disabled={pending}
        aria-label={t("cart.quantity")}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isInteger(next) && next >= 1) {
            onQuantity(item.listingId, next);
          }
        }}
        className="w-16 rounded-xl border border-glass-brd bg-bg-1 px-2 py-1 text-sm text-text-0"
      />

      <span className="w-24 text-right text-sm text-text-1">
        {item.lineTotalMinor === null
          ? "—"
          : formatPriceMinor(item.lineTotalMinor, item.price.currency)}
      </span>

      <button
        type="button"
        onClick={() => onRemove(item.listingId)}
        aria-label={t("cart.remove")}
        className="text-text-2 hover:text-magenta"
      >
        <Trash2 aria-hidden className="h-4 w-4" />
      </button>
    </li>
  );
}

const inputClass =
  "w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0";
