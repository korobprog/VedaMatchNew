"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  TRAVEL_STAY_KIND_LABELS,
  TRAVEL_STAY_KINDS,
  TRAVEL_STAY_PAYMENTS,
  TRAVEL_STAY_PAYMENT_LABELS,
  type TravelStayCardDto,
  type TravelStayKind,
  type TravelStayPayment,
} from "@vedamatch/shared";
import { createManagedStay, getManagedStays } from "@/lib/travel-api";
import { priceLabel } from "./price";

export function ManageView() {
  const [items, setItems] = useState<TravelStayCardDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [kind, setKind] = useState<TravelStayKind>("hostel");
  const [name, setName] = useState("");
  const [payment, setPayment] = useState<TravelStayPayment>("paid");
  const [price, setPrice] = useState("");
  const [address, setAddress] = useState("");
  const [sevaNote, setSevaNote] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    getManagedStays(controller.signal)
      .then((res) => setItems(res.items))
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "Не загрузилось");
      });
    return () => controller.abort();
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      // Цену человек пишет рублями, база хранит копейки — округляем здесь, а
      // не молча теряем в API.
      const priceMinor = price.trim()
        ? Math.round(Number(price.replace(",", ".")) * 100)
        : null;
      const created = await createManagedStay({
        kind,
        name,
        payment,
        priceMinor,
        address,
        sevaNote: sevaNote || null,
      });
      setItems((current) => [created, ...(current ?? [])]);
      setOpen(false);
      setName("");
      setPrice("");
      setAddress("");
      setSevaNote("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не сохранилось");
    } finally {
      setSaving(false);
    }
  }

  const fieldClass =
    "rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0";

  return (
    <div className="space-y-5">
      <p className="text-sm text-text-1">
        Заводите жильё, которое принимаете: хостел при храме, гостевой дом,
        комнату. Новый объект появляется черновиком — опубликуете, когда
        заполните комнаты и цены.
      </p>

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="rounded-xl border border-magenta px-4 py-2 text-sm text-text-0"
      >
        {open ? "Свернуть" : "Добавить жильё"}
      </button>

      {open ? (
        <form
          onSubmit={submit}
          className="space-y-3 rounded-2xl border border-glass-brd p-4"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-text-2">
              Вид
              <select
                className={fieldClass}
                value={kind}
                onChange={(event) =>
                  setKind(event.target.value as TravelStayKind)
                }
              >
                {TRAVEL_STAY_KINDS.map((value) => (
                  <option key={value} value={value}>
                    {TRAVEL_STAY_KIND_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-2">
              Название
              <input
                className={fieldClass}
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                maxLength={120}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-2">
              Оплата
              <select
                className={fieldClass}
                value={payment}
                onChange={(event) =>
                  setPayment(event.target.value as TravelStayPayment)
                }
              >
                {TRAVEL_STAY_PAYMENTS.map((value) => (
                  <option key={value} value={value}>
                    {TRAVEL_STAY_PAYMENT_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-2">
              Цена за ночь, ₽
              <input
                className={fieldClass}
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                inputMode="decimal"
                placeholder="За служение — оставьте пустым"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-xs text-text-2">
            Адрес
            <input
              className={fieldClass}
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              maxLength={300}
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-text-2">
            Какое служение ждёте от гостя
            <textarea
              className={fieldClass}
              value={sevaNote}
              onChange={(event) => setSevaNote(event.target.value)}
              rows={2}
              maxLength={4000}
            />
          </label>

          {error ? (
            <p role="alert" className="text-sm text-magenta">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={saving}
            className="rounded-xl border border-magenta px-4 py-2 text-sm text-text-0 disabled:opacity-60"
          >
            {saving ? "Сохраняем…" : "Завести черновик"}
          </button>
        </form>
      ) : null}

      {!items ? (
        <p className="text-sm text-text-2">Загружаем…</p>
      ) : items.length ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((stay) => (
            <li
              key={stay.id}
              className="rounded-2xl border border-glass-brd bg-glass p-4"
            >
              <p className="text-xs uppercase tracking-wide text-text-2">
                {TRAVEL_STAY_KIND_LABELS[stay.kind]} · код {stay.publicCode}
              </p>
              <p className="mt-1 font-display text-lg text-text-0">
                {stay.name}
              </p>
              <p className="mt-1 text-sm text-text-1">
                {priceLabel(stay.priceMinor, stay.currency, stay.payment)}
              </p>
              <Link
                href={`/travel/manage/${stay.id}/bookings`}
                className="mt-2 inline-block text-sm text-cyan underline"
              >
                Заявки и комнаты
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-text-2">Пока ничего не заведено.</p>
      )}
    </div>
  );
}
