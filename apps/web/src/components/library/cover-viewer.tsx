"use client";

import {
  type MouseEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Download, X } from "lucide-react";
import type { LibraryLocale } from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";
import { apiBase } from "@/lib/api-base";
import { fitSize, type Size, ZOOM, zoomScrollOffset } from "./cover-zoom";
import { t } from "./i18n";

const API_URL = apiBase();

/**
 * Картинка материала во весь экран — «увеличить нажатием и скачать» (VED-138).
 *
 * Обёртка-кнопка вокруг обложки: нажатие открывает её поверх страницы
 * целиком, во весь экран. Нажатие на открытую картинку приближает её вокруг
 * пальца, дальше её водят прокруткой; щипок браузера тоже работает — масштаб
 * страницы портал не запрещает. Закрывают крестиком, Esc или «Назад».
 *
 * «Скачать» — подписанная ссылка на свою копию обложки: хранилище отдаёт её
 * файлом, с заголовком материала в имени. Ссылку берём при открытии, а не по
 * нажатию: иначе после ожидания ответа браузер счёл бы переход не вызванным
 * человеком. Если копии нет (картинка так и осталась адресом чужого сайта)
 * или API не ответил, кнопка открывает саму картинку в новой вкладке — там
 * её сохраняют долгим нажатием.
 */
export function CoverViewer({
  locale,
  entryId,
  src,
  alt,
  children,
  className = "",
}: {
  locale: LibraryLocale;
  entryId: string;
  src: string;
  alt: string;
  /** Обложка, по которой нажимают. */
  children: ReactNode;
  className?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [natural, setNatural] = useState<Size | null>(null);
  const [area, setArea] = useState<Size | null>(null);
  const [zoomed, setZoomed] = useState(false);
  /** Куда прокрутить после приближения — считается по нажатию. */
  const pendingScroll = useRef<{ left: number; top: number } | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Страница под открытой картинкой не прокручивается: на телефоне палец,
  // водящий приближенную картинку, иначе уводил бы ленту.
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = before;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const node = areaRef.current;
    if (!node) return;
    const update = () =>
      setArea({ width: node.clientWidth, height: node.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    apiFetch(`${API_URL}/library/entries/${entryId}/preview/download`, {
      credentials: "include",
    })
      .then(async (res) => {
        if (!res.ok) return;
        const body = (await res.json()) as { url?: unknown };
        if (!cancelled && typeof body.url === "string") setDownloadUrl(body.url);
      })
      .catch(() => {
        // Нет ссылки — останется запасной путь: картинка в новой вкладке.
      });
    return () => {
      cancelled = true;
    };
  }, [open, entryId]);

  useLayoutEffect(() => {
    const node = areaRef.current;
    const target = pendingScroll.current;
    if (!node || !target) return;
    pendingScroll.current = null;
    node.scrollLeft = target.left;
    node.scrollTop = target.top;
  }, [zoomed]);

  const fit = natural && area ? fitSize(natural, area) : null;
  const scale = zoomed ? ZOOM : 1;
  const shown = fit
    ? { width: fit.width * scale, height: fit.height * scale }
    : null;

  function toggleZoom(event: MouseEvent<HTMLImageElement>) {
    const node = areaRef.current;
    if (!node || !fit) return;
    if (zoomed) {
      setZoomed(false);
      return;
    }
    const box = event.currentTarget.getBoundingClientRect();
    const view = node.getBoundingClientRect();
    const zoomedSize = { width: fit.width * ZOOM, height: fit.height * ZOOM };
    pendingScroll.current = {
      left: zoomScrollOffset(
        (event.clientX - box.left) / box.width,
        zoomedSize.width,
        node.clientWidth,
        event.clientX - view.left,
      ),
      top: zoomScrollOffset(
        (event.clientY - box.top) / box.height,
        zoomedSize.height,
        node.clientHeight,
        event.clientY - view.top,
      ),
    };
    setZoomed(true);
  }

  // Отступы — у каждой кнопки свои: у квадратного крестика их нет вовсе,
  // и общий `px-4` сплющил бы иконку до щели.
  const control =
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-glass-brd bg-bg-1 text-sm font-semibold text-text-0 hover:bg-bg-2";

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setZoomed(false);
          setOpen(true);
        }}
        aria-haspopup="dialog"
        aria-label={t(locale, "cover.enlarge")}
        className={`block w-full cursor-zoom-in text-left ${className}`}
      >
        {children}
      </button>
      <dialog
        ref={dialogRef}
        aria-label={t(locale, "cover.viewer")}
        onClose={() => setOpen(false)}
        className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none bg-bg-0 p-0 text-text-0 backdrop:bg-bg-0"
      >
        {open && (
          <div className="safe-top flex h-full flex-col">
            <div className="flex shrink-0 items-center justify-end gap-2 p-3">
              <a
                href={downloadUrl ?? src}
                // Своя подписанная ссылка отдаёт файл сама; чужой адрес
                // открываем рядом, чтобы не уводить со страницы.
                {...(downloadUrl
                  ? {}
                  : { target: "_blank", rel: "noopener noreferrer" })}
                className={`${control} px-4`}
              >
                <Download aria-hidden className="h-4 w-4" />
                {t(locale, "cover.download")}
              </a>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t(locale, "cover.close")}
                className={`${control} w-11 shrink-0`}
              >
                <X aria-hidden className="h-6 w-6" />
              </button>
            </div>
            <div
              ref={areaRef}
              data-cover-viewer-area=""
              className="min-h-0 flex-1 overflow-auto overscroll-contain"
            >
              {/* `w-max`: приближенная картинка шире области, и по центру
                  обычного блока её левый край ушёл бы туда, куда прокрутка
                  не достаёт. */}
              <div
                className="flex w-max items-center justify-center"
                style={
                  area
                    ? { minWidth: area.width, minHeight: area.height }
                    : undefined
                }
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- обложка лежит в нашем S3 */}
                <img
                  src={src}
                  alt={alt}
                  onLoad={(event) => {
                    const img = event.currentTarget;
                    setNatural({
                      width: img.naturalWidth,
                      height: img.naturalHeight,
                    });
                  }}
                  onClick={toggleZoom}
                  style={
                    shown
                      ? {
                          width: shown.width,
                          height: shown.height,
                          maxWidth: "none",
                        }
                      : { visibility: "hidden" }
                  }
                  className={`block shrink-0 ${zoomed ? "cursor-zoom-out" : "cursor-zoom-in"}`}
                />
              </div>
            </div>
            <p
              aria-live="polite"
              className="shrink-0 px-4 py-3 text-center text-xs text-text-1"
            >
              {t(locale, zoomed ? "cover.unzoomHint" : "cover.zoomHint")}
            </p>
          </div>
        )}
      </dialog>
    </>
  );
}
