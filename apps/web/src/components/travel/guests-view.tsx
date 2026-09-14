"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { TravelGuestsResponse } from "@vedamatch/shared";
import { getGuests } from "@/lib/travel-api";
import { GuestDialog, type GuestDraft } from "./guest-dialog";
import {
  GUEST_SWATCH_CLASS,
  guestPaymentLabel,
  matchesGuest,
  shortDate,
} from "./guest-format";

/**
 * Клиентская база объекта: все, кто жил и живёт. Живущие сейчас — сверху
 * (порядок задаёт сервер), долг по оплате виден в строке.
 */
export function GuestsView({ stayId }: { stayId: string }) {
  const [data, setData] = useState<TravelGuestsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<GuestDraft | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void getGuests(stayId, controller.signal)
      .then((response) => {
        setData(response);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof Error ? cause.message : "База не загрузилась",
        );
      });
    return () => controller.abort();
  }, [stayId, reloadKey]);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  const visible = useMemo(
    () => (data?.items ?? []).filter((guest) => matchesGuest(guest, query)),
    [data, query],
  );
  const livingCount = visible.filter((guest) => guest.living).length;

  return (
    <div className="space-y-5 pb-10">
      <header className="space-y-3">
        <div>
          <p className="text-sm text-text-2">
            <Link
              href={`/travel/manage/${stayId}/cash`}
              className="underline-offset-4 hover:underline"
            >
              Касса
            </Link>
          </p>
          <h1 className="font-display text-2xl text-text-0">Клиентская база</h1>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1 text-sm text-text-1">
            Поиск
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Имя, телефон, ключ, комната"
              className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
            />
          </label>
          <button
            type="button"
            onClick={() => setDraft({ guest: null })}
            className="btn-mint rounded-xl px-4 py-2 text-sm font-semibold"
          >
            + Гость
          </button>
        </div>
      </header>

      {error ? (
        <p role="alert" className="text-sm text-magenta">
          {error}
        </p>
      ) : null}

      {!data ? (
        <p className="text-sm text-text-2">Загружаем базу…</p>
      ) : visible.length === 0 ? (
        <p className="rounded-2xl border border-glass-brd p-4 text-sm text-text-1">
          {query
            ? "Никого не нашли."
            : "Гостей пока нет. Заведите карточку — её можно будет выбрать в доходе кассы."}
        </p>
      ) : (
        <ul className="space-y-2" aria-label="Гости объекта">
          {visible.map((guest, index) => {
            const firstLeft = !guest.living && index === livingCount;
            const payment = guestPaymentLabel(guest);
            return (
              <li key={guest.id}>
                {firstLeft ? (
                  <p className="mt-4 mb-2 text-xs uppercase tracking-wide text-text-2">
                    Выехали
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={() => setDraft({ guest })}
                  className="flex w-full items-center gap-3 rounded-2xl border border-glass-brd bg-glass px-4 py-3 text-left hover:bg-bg-1"
                >
                  <span
                    aria-hidden="true"
                    className={`size-3.5 shrink-0 rounded-full ${GUEST_SWATCH_CLASS[guest.color]}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold text-text-0">
                        {guest.fullName}
                      </span>
                      {guest.living ? (
                        <span className="rounded-lg border border-magenta px-1.5 py-0.5 text-xs text-text-0">
                          Живёт сейчас
                        </span>
                      ) : null}
                    </span>
                    <span className="block truncate text-xs text-text-1">
                      {[
                        guest.roomLabel,
                        guest.keyLabel ? `ключ ${guest.keyLabel}` : null,
                        `заезд ${shortDate(guest.checkInOn)}`,
                        guest.leftOn
                          ? `выезд ${shortDate(guest.leftOn)}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    {payment ? (
                      <span
                        className={`block truncate text-xs ${
                          guest.unpaidNights > 0
                            ? "font-semibold text-text-0"
                            : "text-text-2"
                        }`}
                      >
                        {payment}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <GuestDialog
        stayId={stayId}
        rooms={data?.rooms ?? []}
        draft={draft}
        onClose={() => setDraft(null)}
        onSaved={() => {
          setDraft(null);
          reload();
        }}
      />
    </div>
  );
}
