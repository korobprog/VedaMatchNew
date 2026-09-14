"use client";

import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";

/**
 * QR-код страницы объекта для стойки хостела. Код рисуется в браузере из
 * адреса страницы — сервер и сторонние генераторы в этом не участвуют.
 *
 * Цвета QR — чёрный на белом при любой теме портала: сканеры телефонов
 * хуже читают светлый код на тёмном фоне, а распечатка всё равно белая.
 */
export function StayQrDialog({ code, name }: { code: string; name: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [svg, setSvg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  async function show() {
    const address = `${window.location.origin}/travel/s/${code}`;
    setUrl(address);
    setCopied(false);
    setSvg(
      await QRCode.toString(address, {
        type: "svg",
        margin: 2,
        errorCorrectionLevel: "M",
        color: { dark: "#000000", light: "#ffffff" },
      }),
    );
    setOpen(true);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  function download() {
    if (!svg) return;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    link.download = `qr-${code}.svg`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void show()}
        className="rounded-xl border border-glass-brd px-3 py-2 text-sm text-text-1"
      >
        QR-код для стойки
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby="stay-qr-title"
        onClose={() => setOpen(false)}
        className="m-auto w-[min(94vw,24rem)] rounded-3xl border border-glass-brd bg-bg-0 p-0 text-text-0 backdrop:bg-black/60"
      >
        <div className="space-y-4 p-6 text-center">
          <h2 id="stay-qr-title" className="font-display text-lg font-bold">
            {name}
          </h2>
          {svg ? (
            <div
              role="img"
              aria-label={`QR-код страницы объекта, код ${code}`}
              className="mx-auto w-56 rounded-2xl bg-white p-2 [&>svg]:h-auto [&>svg]:w-full"
              // SVG собран библиотекой из нашего же адреса, пользовательского
              // ввода в нём нет.
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ) : null}
          <p className="font-mono text-3xl font-bold tracking-[0.3em]">
            {code}
          </p>
          <p className="text-xs text-text-2">
            Гость сканирует код или набирает его после адреса страницы. Входить
            в VedaMatch для заявки не нужно.
          </p>
          <p className="break-all text-sm text-text-1">{url}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => void copy()}
              className="rounded-xl border border-glass-brd px-3 py-2 text-sm text-text-1"
            >
              {copied ? "Скопировано" : "Скопировать ссылку"}
            </button>
            <button
              type="button"
              onClick={download}
              className="rounded-xl border border-glass-brd px-3 py-2 text-sm text-text-1"
            >
              Скачать для печати
            </button>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="btn-mint rounded-xl px-4 py-2 text-sm font-semibold"
            >
              Готово
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
