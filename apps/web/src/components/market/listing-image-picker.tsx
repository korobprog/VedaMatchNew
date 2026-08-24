"use client";

import { useEffect, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { ImagePlus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { cropImageToFile, type CropPixels } from "./crop-image";

const ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_IMAGES = 5;

/**
 * Выбор фото до создания объявления — как NoticeImagePicker в Объявлениях:
 * загрузить сразу нельзя, у сервера `/market/listings/:id/images` требует
 * уже существующий listingId, поэтому файлы копятся здесь и отправляются
 * следом за созданием (см. submit() в listing-form.tsx).
 *
 * Каждое выбранное фото сначала проходит через кроп 1:1 — карточки и
 * галерея в Рынке везде квадратные (listing-card.tsx, listing-gallery.tsx),
 * и без принудительной обрезки обложка объявления обрезалась бы `object-cover`
 * непредсказуемо. Формат и сжатие после этого не важны: сервер (market-images
 * .service.ts) перекодирует всё в webp и пересчитает размер сам.
 */
export function ListingImagePicker({
  files,
  onChange,
}: {
  files: File[];
  onChange: (files: File[]) => void;
}) {
  const t = useTranslations("Market");
  // Создание объект-URL держим внутри эффекта, а не в useMemo: в dev
  // StrictMode эффекты монтируются дважды подряд (mount → cleanup → mount),
  // и если сам URL создан в useMemo (один раз, вне этого цикла), первая же
  // фантомная очистка отзывает его навсегда — превью показывает битую
  // картинку. Создание внутри эффекта на втором «монтировании» даёт свежий
  // валидный blob.
  const [previews, setPreviews] = useState<{ file: File; url: string }[]>([]);
  useEffect(() => {
    const next = files.map((file) => ({ file, url: URL.createObjectURL(file) }));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- см. комментарий выше: setState обязан жить в этом же эффекте, иначе фантомный cleanup StrictMode отзовёт единственный созданный blob
    setPreviews(next);
    return () => {
      for (const preview of next) URL.revokeObjectURL(preview.url);
    };
  }, [files]);

  // Очередь на обрезку: выбор нескольких файлов сразу кадрируется по одному,
  // а не всплывающими друг на друге модалками.
  const [queue, setQueue] = useState<File[]>([]);
  const room = MAX_IMAGES - files.length - queue.length;

  function enqueue(picked: File[]) {
    if (picked.length) setQueue((current) => [...current, ...picked]);
  }

  function dequeue() {
    setQueue((current) => current.slice(1));
  }

  return (
    <div>
      {previews.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-2">
          {previews.map((preview, index) => (
            <li key={preview.url} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- локальный предпросмотр */}
              <img
                src={preview.url}
                alt=""
                className="h-24 w-24 rounded-xl border border-glass-brd object-cover"
              />
              <button
                type="button"
                onClick={() => onChange(files.filter((_, i) => i !== index))}
                aria-label={t("sell.removeImage")}
                className="absolute right-1 top-1 rounded-lg border border-glass-brd bg-bg-0/80 p-1 text-text-2 hover:text-magenta"
              >
                <Trash2 aria-hidden className="size-3.5" />
              </button>
              {index === 0 && (
                <span className="absolute bottom-1 left-1 rounded bg-bg-0/80 px-1 text-[10px] text-text-1">
                  {t("sell.cover")}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <label className="flex w-fit cursor-pointer items-center gap-2 rounded-xl border border-glass-brd px-3 py-2 text-sm text-text-1 transition hover:text-text-0 has-[:disabled]:pointer-events-none has-[:disabled]:opacity-50">
        <ImagePlus className="size-4" />
        {files.length ? t("sell.addImages") : t("sell.images")}
        <input
          type="file"
          multiple
          accept={ACCEPT}
          disabled={room <= 0}
          className="sr-only"
          onChange={(event) => {
            enqueue(Array.from(event.target.files ?? []).slice(0, room));
            event.target.value = "";
          }}
        />
      </label>
      <p className="mt-1 text-xs text-text-2">{t("sell.imagesHintCreate")}</p>

      {queue[0] && (
        <CropDialog
          key={`${queue[0].name}-${queue[0].size}-${queue.length}`}
          file={queue[0]}
          onCropped={(cropped) => {
            onChange([...files, cropped]);
            dequeue();
          }}
          onSkip={(original) => {
            onChange([...files, original]);
            dequeue();
          }}
          onCancel={dequeue}
        />
      )}
    </div>
  );
}

function CropDialog({
  file,
  onCropped,
  onSkip,
  onCancel,
}: {
  file: File;
  onCropped: (file: File) => void;
  onSkip: (file: File) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("Market");
  // См. комментарий в ListingImagePicker: URL создаётся внутри эффекта,
  // а не в useMemo, иначе StrictMode-cleanup в dev отзывает его до показа.
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- см. ListingImagePicker выше
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<CropPixels | null>(null);
  const [pending, setPending] = useState(false);

  async function confirm() {
    if (!area || !src || pending) return;
    setPending(true);
    try {
      onCropped(await cropImageToFile(src, area, file.name));
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("sell.cropTitle")}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      onClick={() => onCancel()}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-glass-brd bg-bg-1 p-4"
      >
        <p className="mb-3 text-sm text-text-1">{t("sell.cropTitle")}</p>
        <div className="relative h-72 w-full overflow-hidden rounded-xl bg-bg-0">
          {src && (
            <Cropper
              image={src}
              crop={crop}
              zoom={zoom}
              aspect={1}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(_area, pixels: Area) => setArea(pixels)}
            />
          )}
        </div>
        <input
          type="range"
          min={1}
          max={3}
          step={0.05}
          value={zoom}
          onChange={(event) => setZoom(Number(event.target.value))}
          className="mt-3 w-full"
          aria-label="zoom"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => void confirm()}
            className="rounded-lg bg-glass-brd/40 px-3 py-1.5 text-xs text-text-0 hover:bg-glass-brd/60 disabled:opacity-50"
          >
            {t("sell.cropConfirm")}
          </button>
          <button
            type="button"
            onClick={() => onSkip(file)}
            className="rounded-lg border border-glass-brd px-3 py-1.5 text-xs text-text-1 hover:text-text-0"
          >
            {t("sell.cropSkip")}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-3 py-1.5 text-xs text-text-2 hover:text-text-0"
          >
            {t("sell.cropCancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
