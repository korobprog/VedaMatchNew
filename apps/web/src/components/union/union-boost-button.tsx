"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { UnionBoostStatus } from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * Буст «Внимание»: пока он активен, анкета показывается раньше остальных.
 * Кнопка живёт поверх колоды, состояние подтягивается с сервера — счётчик
 * должен пережить перезагрузку страницы.
 */
export function UnionBoostButton() {
  const router = useRouter();
  const [status, setStatus] = useState<UnionBoostStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch(`${API_URL}/union/boost/status`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: UnionBoostStatus | null) => {
        if (!cancelled && data) setStatus(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Локальный отсчёт: дёргать сервер раз в секунду ради таймера незачем.
  useEffect(() => {
    if (!status?.active) return;
    const timer = setInterval(() => {
      setStatus((current) => {
        if (!current?.active) return current;
        const secondsLeft = current.secondsLeft - 1;
        if (secondsLeft > 0) return { ...current, secondsLeft };
        return { ...current, active: false, secondsLeft: 0, expiresAt: null };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [status?.active]);

  async function activate() {
    setPending(true);
    setError(null);
    try {
      const res = await apiFetch(`${API_URL}/union/boost`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      setStatus((await res.json()) as UnionBoostStatus);
      setOpen(false);
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Не удалось включить внимание",
      );
    } finally {
      setPending(false);
    }
  }

  const active = status?.active === true;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={active ? "Внимание активно" : "Включить внимание"}
        className={`absolute right-3 top-8 z-10 flex h-11 items-center justify-center gap-1.5 rounded-full px-3 text-lg backdrop-blur transition ${
          active
            ? "bg-gradient-to-r from-[#FFB020] to-[#FF7A00] text-white shadow-[0_0_20px_rgba(255,140,0,0.45)]"
            : "bg-white/90 text-[#FF9500] hover:bg-white"
        }`}
      >
        ⚡
        {active && (
          <span className="text-sm font-semibold tabular-nums">
            {formatLeft(status.secondsLeft)}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="union-boost-title"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="glass w-full max-w-sm rounded-3xl border border-glass-brd p-6 text-center"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#FFB020]/15 text-3xl">
              ⚡
            </span>
            <h2
              id="union-boost-title"
              className="mb-2 font-display text-xl font-bold text-text-0"
            >
              Внимание
            </h2>
            <p className="mb-6 text-sm text-text-1">
              {active
                ? `Внимание активно. Ваша анкета показывается раньше остальных ещё ${formatLeft(status.secondsLeft)}.`
                : `${status?.durationMinutes ?? 40} минут ваша анкета будет показываться раньше остальных. Больше людей вас увидят и выразят симпатию.`}
            </p>
            {error && <p className="mb-3 text-sm text-red-500">{error}</p>}
            {active ? (
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-full rounded-2xl glass border border-glass-brd px-4 py-3 text-sm font-semibold text-text-1 transition hover:text-text-0"
              >
                Понятно
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void activate()}
                disabled={pending}
                className="w-full rounded-2xl bg-gradient-to-r from-[#FFB020] to-[#FF7A00] px-4 py-3 text-sm font-semibold text-white transition hover:shadow-[0_0_24px_rgba(255,140,0,0.45)] disabled:opacity-60"
              >
                {pending ? "Включаем…" : "Активировать внимание"}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/** Остаток в виде «мм:сс» — как на таймере в карточке. */
function formatLeft(secondsLeft: number): string {
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
