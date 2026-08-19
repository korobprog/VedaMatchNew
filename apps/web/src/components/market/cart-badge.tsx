"use client";

import Link from "next/link";
import { ShoppingBasket } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import {
  getCartCount,
  getCartCountServerSnapshot,
  setCartCount,
  subscribeCartCount,
} from "@/lib/market-cart-badge";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Опрос вместо сокета: одно число раз в минуту дешевле постоянного соединения. */
const pollIntervalMs = 60_000;

export function CartBadge({ className = "" }: { className?: string }) {
  const count = useSyncExternalStore(
    subscribeCartCount,
    getCartCount,
    getCartCountServerSnapshot,
  );

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      // Вкладка в фоне — запрос всё равно отложится браузером, не тратим его.
      if (document.visibilityState === "hidden") return;
      void apiFetch(`${API_URL}/market/cart/count`, { credentials: "include" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { count: number } | null) => {
          if (!cancelled && data) setCartCount(data.count);
        })
        .catch(() => {
          // Молча: сломанный значок не повод показывать ошибку в шапке.
        });
    };

    refresh();
    const timer = window.setInterval(refresh, pollIntervalMs);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const label = count > 0 ? `Корзина, позиций: ${count}` : "Корзина";

  return (
    <Link
      href="/market/cart"
      aria-label={label}
      title={label}
      className={`relative flex h-9 w-9 items-center justify-center rounded-lg text-text-1 transition-colors hover:bg-glass hover:text-text-0 ${className}`}
    >
      <ShoppingBasket size={20} aria-hidden="true" />
      {count > 0 && (
        <span
          aria-hidden="true"
          className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-bold leading-none text-bg-0"
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
