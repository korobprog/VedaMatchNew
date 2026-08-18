"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { MarketListingImageDto } from "@vedamatch/shared";
import { marketErrorCode, marketErrorText } from "./use-market-error";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const MAX_IMAGES = 8;

/** Фотографии объявления. Первая по порядку становится обложкой в ленте,
 *  поэтому порядок меняется стрелками — без drag-and-drop, который на телефоне
 *  всё равно конфликтует с прокруткой. */
export function ListingImagesUpload({
  listingId,
  images: initial,
}: {
  listingId: string;
  images: MarketListingImageDto[];
}) {
  const t = useTranslations("Market");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addFiles(files: FileList) {
    if (pending) return;
    setPending(true);
    setError(null);

    const form = new FormData();
    for (const file of Array.from(files).slice(0, MAX_IMAGES - images.length)) {
      form.append("files", file);
    }

    try {
      const res = await apiFetch(`${API_URL}/market/listings/${listingId}/images`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!res.ok) {
        setError(await marketErrorCode(res));
        return;
      }
      const next = (await res.json()) as { images: MarketListingImageDto[] };
      setImages(next.images);
      router.refresh();
    } catch {
      setError("unknown");
    } finally {
      setPending(false);
    }
  }

  async function remove(imageId: string) {
    setError(null);
    try {
      const res = await apiFetch(
        `${API_URL}/market/listings/${listingId}/images/${imageId}`,
        { method: "DELETE", credentials: "include" },
      );
      if (!res.ok) {
        setError(await marketErrorCode(res));
        return;
      }
      setImages((current) => current.filter((image) => image.id !== imageId));
      router.refresh();
    } catch {
      setError("unknown");
    }
  }

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= images.length) return;
    const reordered = [...images];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setImages(reordered);

    try {
      // Сервер требует полный список: частичный порядок оставил бы дыры
      // в sortOrder и молча поменял обложку.
      const res = await apiFetch(
        `${API_URL}/market/listings/${listingId}/images/order`,
        {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageIds: reordered.map((image) => image.id) }),
        },
      );
      if (!res.ok) {
        setError(await marketErrorCode(res));
        setImages(images);
        return;
      }
      router.refresh();
    } catch {
      setError("unknown");
      setImages(images);
    }
  }

  return (
    <section className="glass rounded-2xl border border-glass-brd p-5">
      <h2 className="mb-1 font-display text-lg font-semibold text-text-0">
        {t("sell.images")}
      </h2>
      <p className="mb-3 text-xs text-text-2">{t("sell.imagesHint")}</p>

      {images.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-2">
          {images.map((image, index) => (
            <li key={image.id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- картинка в нашем S3 */}
              <img
                src={image.url}
                alt=""
                className="h-24 w-24 rounded-xl border border-glass-brd object-cover"
              />
              <div className="mt-1 flex items-center justify-center gap-1">
                <button
                  type="button"
                  onClick={() => void move(index, -1)}
                  disabled={index === 0}
                  aria-label="←"
                  className="rounded-lg border border-glass-brd px-1.5 text-xs text-text-2 hover:text-text-0 disabled:opacity-30"
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={() => void move(index, 1)}
                  disabled={index === images.length - 1}
                  aria-label="→"
                  className="rounded-lg border border-glass-brd px-1.5 text-xs text-text-2 hover:text-text-0 disabled:opacity-30"
                >
                  →
                </button>
                <button
                  type="button"
                  onClick={() => void remove(image.id)}
                  aria-label={t("sell.removeImage")}
                  className="rounded-lg border border-glass-brd px-1.5 text-text-2 hover:text-magenta"
                >
                  <Trash2 aria-hidden className="h-3 w-3" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(event) => {
          if (event.target.files?.length) void addFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={pending || images.length >= MAX_IMAGES}
        onClick={() => inputRef.current?.click()}
        className="rounded-xl border border-glass-brd px-3 py-1.5 text-sm text-text-2 hover:text-text-0 disabled:opacity-50"
      >
        {t("sell.addImages")}
      </button>

      {error && (
        <p className="mt-2 text-sm text-magenta">{marketErrorText(t, error)}</p>
      )}
    </section>
  );
}
