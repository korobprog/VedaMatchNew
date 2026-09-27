"use client";

import { type ChangeEvent, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/http-client";
import { apiBase } from "@/lib/api-base";
import { Button } from "@/components/ui/button";
import { AVATAR_TYPES, avatarFileError } from "./avatar-file";

const API_URL = apiBase();

/**
 * Кнопка «Установить фото» рядом с аватаркой в шапке профиля (VED-479).
 *
 * Заказчик просил выбирать фото «в самом верху», но не отдельной карточкой на
 * полстраницы — поэтому только кнопка: выбрал файл, и он сразу загружается.
 * Удаление и предпросмотр остались в блоке «Аватар» редактора ниже.
 */
export function ProfileAvatarButton({ hasAvatar }: { hasAvatar: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function select(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setMessage(null);
    setError(null);
    if (!file) return;
    const invalid = avatarFileError(file);
    if (invalid) {
      setError(invalid);
      return;
    }
    setPending(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await apiFetch(`${API_URL}/profile/avatar`, {
        method: "POST",
        credentials: "include",
        body,
      });
      if (!res.ok) throw new Error(await res.text());
      setMessage("Фото сохранено");
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error && e.message
          ? e.message
          : "Не удалось загрузить фото",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-2 flex flex-col items-start gap-1">
      <input
        ref={inputRef}
        type="file"
        accept={AVATAR_TYPES.join(",")}
        onChange={(event) => void select(event)}
        hidden
        tabIndex={-1}
        aria-hidden
      />
      <Button
        type="button"
        size="sm"
        variant="secondary"
        loading={pending}
        aria-describedby={hintId}
        onClick={() => inputRef.current?.click()}
      >
        {pending
          ? "Загружаем…"
          : hasAvatar
            ? "Сменить фото"
            : "Установить фото"}
      </Button>
      <span id={hintId} className="sr-only">
        Откроется выбор файла: JPG, PNG или WebP до 5 MB
      </span>
      <p role="status" className="text-xs text-text-1 empty:hidden">
        {message}
      </p>
      {error && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
