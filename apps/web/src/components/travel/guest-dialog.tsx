"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  TRAVEL_GUEST_COLORS,
  TRAVEL_GUEST_COLOR_LABELS,
  type TravelGuestColor,
  type TravelGuestDto,
} from "@vedamatch/shared";
import {
  createGuest,
  removeGuest,
  removeGuestPhoto,
  updateGuest,
  uploadGuestPhoto,
} from "@/lib/travel-api";
import { localToday } from "./cash-grouping";
import { GUEST_SWATCH_CLASS } from "./guest-format";

const fieldClass =
  "mt-1 w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0";

/** Черновик диалога: карточка, которую правят, или null — новый гость. */
export interface GuestDraft {
  guest: TravelGuestDto | null;
}

interface FormProps {
  stayId: string;
  rooms: { id: string; label: string }[];
  draft: GuestDraft;
  onCancel: () => void;
  onSaved: () => void;
}

/**
 * Карточка гостя. Как и форма кассы: диалог держит открытие, форма
 * монтируется заново на каждое открытие.
 */
export function GuestDialog({
  draft,
  onClose,
  ...rest
}: Omit<FormProps, "draft" | "onCancel"> & {
  draft: GuestDraft | null;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (draft && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLInputElement>("[data-autofocus]")?.focus();
    }
    if (!draft && dialog.open) dialog.close();
  }, [draft]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="guest-dialog-title"
      onClose={onClose}
      className="m-auto max-h-[92vh] w-[min(94vw,32rem)] overflow-y-auto rounded-3xl border border-glass-brd bg-bg-0 p-0 text-text-0 backdrop:bg-black/60"
    >
      {draft ? (
        <GuestForm
          {...rest}
          draft={draft}
          onCancel={() => dialogRef.current?.close()}
        />
      ) : null}
    </dialog>
  );
}

function GuestForm({ stayId, rooms, draft, onCancel, onSaved }: FormProps) {
  const { guest } = draft;
  const [fullName, setFullName] = useState(guest?.fullName ?? "");
  const [phone, setPhone] = useState(guest?.phone ?? "");
  const [keyLabel, setKeyLabel] = useState(guest?.keyLabel ?? "");
  const [roomId, setRoomId] = useState(guest?.roomId ?? "");
  const [personalInfo, setPersonalInfo] = useState(guest?.personalInfo ?? "");
  const [color, setColor] = useState<TravelGuestColor>(guest?.color ?? "none");
  const [checkInOn, setCheckInOn] = useState(
    () => guest?.checkInOn ?? localToday(),
  );
  const [leftOn, setLeftOn] = useState(guest?.leftOn ?? "");
  const [photoUrl, setPhotoUrl] = useState(guest?.photoUrl ?? null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const body = {
      fullName,
      phone,
      keyLabel,
      roomId: roomId || null,
      personalInfo,
      color,
      checkInOn,
      leftOn: leftOn || null,
    };
    setPending(true);
    setError(null);
    try {
      if (guest) await updateGuest(stayId, guest.id, body);
      else await createGuest(stayId, body);
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не сохранилось");
      setPending(false);
    }
  }

  async function remove() {
    if (!guest) return;
    if (
      !window.confirm(
        `Удалить карточку «${guest.fullName}»? Записи кассы останутся, но без гостя.`,
      )
    ) {
      return;
    }
    setPending(true);
    try {
      await removeGuest(stayId, guest.id);
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалилось");
      setPending(false);
    }
  }

  async function changePhoto(file: File | undefined) {
    if (!guest || !file) return;
    setError(null);
    try {
      const updated = await uploadGuestPhoto(stayId, guest.id, file);
      setPhotoUrl(updated.photoUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Фото не загрузилось");
    }
  }

  async function dropPhoto() {
    if (!guest) return;
    try {
      await removeGuestPhoto(stayId, guest.id);
      setPhotoUrl(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Фото не удалилось");
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-4 p-6">
      <h2 id="guest-dialog-title" className="font-display text-lg font-bold">
        {guest ? "Карточка гостя" : "Новый гость"}
      </h2>
      <p className="text-xs text-text-2">
        Карточку видят только управляющие этого объекта.
      </p>

      <label className="block text-sm text-text-1">
        ФИО
        <input
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          required
          maxLength={120}
          data-autofocus
          autoComplete="off"
          className={fieldClass}
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm text-text-1">
          Телефон
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            type="tel"
            maxLength={40}
            autoComplete="off"
            className={fieldClass}
          />
        </label>
        <label className="block text-sm text-text-1">
          Ключ
          <input
            value={keyLabel}
            onChange={(event) => setKeyLabel(event.target.value)}
            maxLength={40}
            autoComplete="off"
            className={fieldClass}
          />
        </label>
      </div>

      <label className="block text-sm text-text-1">
        Корпус и номер
        <select
          value={roomId}
          onChange={(event) => setRoomId(event.target.value)}
          className={fieldClass}
        >
          <option value="">Не выбрано</option>
          {rooms.map((room) => (
            <option key={room.id} value={room.id}>
              {room.label}
            </option>
          ))}
        </select>
        {rooms.length === 0 ? (
          <span className="mt-1 block text-xs text-text-2">
            Комнаты заводятся на экране «Заявки и комнаты».
          </span>
        ) : null}
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm text-text-1">
          Заезд
          <input
            type="date"
            value={checkInOn}
            onChange={(event) => setCheckInOn(event.target.value)}
            required
            className={fieldClass}
          />
        </label>
        <label className="block text-sm text-text-1">
          Выезд
          <input
            type="date"
            value={leftOn}
            onChange={(event) => setLeftOn(event.target.value)}
            className={fieldClass}
          />
        </label>
      </div>

      <fieldset>
        <legend className="text-sm text-text-1">Цвет</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {TRAVEL_GUEST_COLORS.map((value) => (
            <label
              key={value}
              className={`flex cursor-pointer items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-magenta ${
                color === value
                  ? "border-magenta text-text-0"
                  : "border-glass-brd text-text-1"
              }`}
            >
              <input
                type="radio"
                name="guest-color"
                value={value}
                checked={color === value}
                onChange={() => setColor(value)}
                className="sr-only"
              />
              <span
                aria-hidden="true"
                className={`size-3.5 rounded-full ${GUEST_SWATCH_CLASS[value]}`}
              />
              {TRAVEL_GUEST_COLOR_LABELS[value]}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block text-sm text-text-1">
        Личная информация
        <textarea
          value={personalInfo}
          onChange={(event) => setPersonalInfo(event.target.value)}
          rows={3}
          maxLength={2000}
          className={fieldClass}
        />
      </label>

      {guest ? (
        <div className="space-y-2">
          <p className="text-sm text-text-1">Фото</p>
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- подписанная ссылка живёт час, оптимизатор Next её не кэширует
            <img
              src={photoUrl}
              alt={`Фото: ${guest.fullName}`}
              className="size-24 rounded-2xl object-cover"
            />
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <label className="cursor-pointer rounded-xl border border-glass-brd px-3 py-2 text-sm text-text-1 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-magenta">
              {photoUrl ? "Заменить фото" : "Прикрепить фото"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(event) => void changePhoto(event.target.files?.[0])}
              />
            </label>
            {photoUrl ? (
              <button
                type="button"
                onClick={() => void dropPhoto()}
                className="rounded-xl px-3 py-2 text-sm text-text-2 underline-offset-4 hover:underline"
              >
                Убрать фото
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="text-xs text-text-2">
          Фото прикрепляется после сохранения карточки.
        </p>
      )}

      {error ? (
        <p role="alert" className="text-sm text-magenta">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="btn-mint flex-1 rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {pending ? "Сохраняем…" : "Сохранить"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-glass-brd px-4 py-2 text-sm text-text-1"
        >
          Отмена
        </button>
        {guest ? (
          <button
            type="button"
            onClick={() => void remove()}
            disabled={pending}
            className="rounded-xl border border-glass-brd px-4 py-2 text-sm text-text-1 disabled:opacity-50"
          >
            Удалить
          </button>
        ) : null}
      </div>
    </form>
  );
}
