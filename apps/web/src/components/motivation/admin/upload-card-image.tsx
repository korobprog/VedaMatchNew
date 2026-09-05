"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImageUp } from "lucide-react";
import { apiFetch } from "@/lib/http-client";
import { secondaryButton } from "./ui";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * Готовая открытка с устройства.
 *
 * Нужна там, где картинку не рисует нейросеть: открытки и подборки редакция
 * готовит сама, и до этого единственным путём было создать карточку и ждать
 * генерацию, которая нарисует не то.
 *
 * Файл уходит `multipart/form-data`, поэтому не через `apiRequest` (тот
 * ставит `content-type: application/json` и ломает границу частей) — но
 * через тот же `apiFetch`: он сам обновляет токен на 401, а редакция сидит
 * на странице часами.
 */
export function UploadCardImage({
  postId,
  label = "Своя картинка",
}: {
  postId: string;
  label?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setPending(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await apiFetch(
        `${API_URL}/admin/motivation/posts/${postId}/image`,
        { method: "POST", body },
      );
      if (!response.ok) {
        // Сервер отвечает человеческим текстом («Файл больше 12 МБ»,
        // «Картинка слишком мелкая») — показываем его, а не «ошибка 400».
        setError((await response.text()) || "Не удалось загрузить картинку");
        return;
      }
      router.refresh();
    } catch {
      setError("Не удалось загрузить картинку");
    } finally {
      setPending(false);
      // Сброс, иначе тот же файл второй раз не выберется: `change` не
      // сработает на неизменившемся значении.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => inputRef.current?.click()}
        className={secondaryButton}
      >
        <ImageUp className="h-4 w-4" />
        {pending ? "Загружаем…" : label}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      {error && (
        <p role="alert" className="mt-2 w-full text-sm font-medium text-red-500">
          {error}
        </p>
      )}
    </>
  );
}
