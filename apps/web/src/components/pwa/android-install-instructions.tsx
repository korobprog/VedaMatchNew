"use client";

import { MoreVertical, Download, X } from "lucide-react";

/**
 * Показывается там, где установка настоящая, но системного диалога нет:
 * Chrome шлёт beforeinstallprompt один раз и по своему усмотрению, а через
 * меню браузера портал ставится всегда.
 */
export function AndroidInstallInstructions({
  onClose,
}: {
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-label="Как установить приложение на Android"
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4"
    >
      <div className="w-full max-w-sm rounded-2xl border border-glass-brd bg-bg-1 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <h2 className="font-display text-lg font-bold text-text-0">
            Установка на Android
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="text-text-2 transition hover:text-text-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <ol className="mt-4 space-y-3 text-sm text-text-1">
          <li className="flex items-center gap-3">
            <MoreVertical
              className="h-5 w-5 shrink-0 text-text-2"
              aria-hidden="true"
            />
            Откройте меню браузера — три точки в правом верхнем углу
          </li>
          <li className="flex items-center gap-3">
            <Download
              className="h-5 w-5 shrink-0 text-text-2"
              aria-hidden="true"
            />
            Выберите «Установить приложение» или «Добавить на главный экран»
          </li>
        </ol>
      </div>
    </div>
  );
}
