"use client";

import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { UserProfile } from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { apiBase } from "@/lib/api-base";

const API_URL = apiBase();
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Фото профиля — первым на странице профиля (VED-479): «чтобы фото для
 * аватарки можно было выбирать в самом верху окна, куда заходишь при
 * нажатии на аватарку». Раньше выбор жил в редакторе профиля под всеми
 * настройками, на несколько экранов ниже.
 *
 * Своё состояние, отдельно от формы профиля: фото сохраняется своей
 * кнопкой и не ждёт «Сохранить профиль».
 */
export function ProfileAvatarCard({ user }: { user: UserProfile }) {
  const router = useRouter();
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl);
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const preview = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file],
  );

  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  function select(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0] ?? null;
    setError(null);
    setMessage(null);
    if (!next) {
      setFile(null);
      return;
    }
    if (!AVATAR_TYPES.includes(next.type)) {
      setError("Разрешены только jpg, jpeg, png и webp");
      event.target.value = "";
      return;
    }
    if (next.size > MAX_AVATAR_SIZE) {
      setError("Размер аватара не должен превышать 5 MB");
      event.target.value = "";
      return;
    }
    setFile(next);
  }

  async function send(method: "POST" | "DELETE") {
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      let body: FormData | undefined;
      if (method === "POST") {
        if (!file) return;
        body = new FormData();
        body.append("file", file);
      }
      const res = await apiFetch(`${API_URL}/profile/avatar`, {
        method,
        credentials: "include",
        body,
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = (await res.json()) as UserProfile;
      setAvatarUrl(updated.avatarUrl);
      setFile(null);
      setMessage(method === "POST" ? "Аватар сохранён" : "Аватар удалён");
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : method === "POST"
            ? "Не удалось загрузить аватар"
            : "Не удалось удалить аватар",
      );
    } finally {
      setPending(false);
    }
  }

  const src = preview ?? avatarUrl;

  return (
    <Card className="mb-6 p-6">
      <CardTitle className="mb-4 text-lg">Аватар</CardTitle>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={user.displayName}
            className="h-24 w-24 rounded-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="flex h-24 w-24 items-center justify-center rounded-full bg-glass text-3xl font-semibold text-text-0">
            {user.displayName.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="flex-1 space-y-3">
          <input
            type="file"
            accept={AVATAR_TYPES.join(",")}
            onChange={select}
            aria-label="Выбрать фото для аватара"
            className="block w-full text-sm text-text-1 file:mr-4 file:rounded-lg file:border-0 file:bg-mint file:px-4 file:py-2 file:text-sm file:font-medium file:text-on-mint"
          />
          <p className="text-xs text-text-2">
            JPG, PNG или WebP до 5 MB. Перед сохранением показывается preview.
          </p>
          {!avatarUrl && (
            <p className="rounded-xl border border-gold/40 bg-gold/10 px-3 py-2 text-xs text-text-1">
              Без фото ваши сообщения незнакомым людям сворачиваются в «Скрытый
              запрос» — так же, как у спам-профилей. С фото сообщение видно
              сразу.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => void send("POST")}
              disabled={!file}
              loading={pending}
            >
              {pending ? "Сохраняем..." : "Сохранить аватар"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => void send("DELETE")}
              disabled={!avatarUrl || pending}
            >
              Удалить
            </Button>
          </div>
          {error && <Alert tone="error">{error}</Alert>}
          {message && <Alert tone="success">{message}</Alert>}
        </div>
      </div>
    </Card>
  );
}
