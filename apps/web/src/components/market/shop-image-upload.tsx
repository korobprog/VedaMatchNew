"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { marketErrorCode, marketErrorText } from "./use-market-error";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * Логотип и обложка магазина. Ключ в S3 фиксированный, поэтому перезалив
 * затирает старый объект; кеш иммутабельный, и к готовой ссылке на витрине
 * дописывается `?v=…`, иначе браузер продолжит показывать прежнюю картинку.
 */
export function ShopImageUpload({
  shopId,
  kind,
  currentUrl,
}: {
  shopId: string;
  kind: "logo" | "cover";
  currentUrl: string | null;
}) {
  const t = useTranslations("Market");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  async function upload(file: File) {
    setPending(true);
    setError(null);
    // Локальное превью сразу: загрузка в S3 занимает секунды, и пустое место
    // всё это время выглядит как несработавшая кнопка.
    setPreview(URL.createObjectURL(file));

    const form = new FormData();
    form.append("file", file);
    try {
      const res = await apiFetch(`${API_URL}/market/shops/${shopId}/${kind}`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!res.ok) {
        setError(await marketErrorCode(res));
        setPreview(null);
        return;
      }
      router.refresh();
    } catch {
      setError("unknown");
      setPreview(null);
    } finally {
      setPending(false);
    }
  }

  const shown = preview ?? currentUrl;

  return (
    <div className="mb-4">
      <p className="mb-1 text-sm text-text-2">
        {kind === "logo" ? t("sell.logo") : t("sell.cover")}
      </p>

      {shown && (
        // eslint-disable-next-line @next/next/no-img-element -- превью или наш S3
        <img
          src={shown}
          alt=""
          className={
            kind === "logo"
              ? "mb-2 h-20 w-20 rounded-xl border border-glass-brd object-cover"
              : "mb-2 h-28 w-full rounded-xl border border-glass-brd object-cover"
          }
        />
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
          event.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={pending}
        onClick={() => inputRef.current?.click()}
        className="rounded-xl border border-glass-brd px-3 py-1.5 text-sm text-text-2 hover:text-text-0 disabled:opacity-50"
      >
        {t("sell.upload")}
      </button>

      {error && (
        <p className="mt-2 text-sm text-magenta">{marketErrorText(t, error)}</p>
      )}
    </div>
  );
}
