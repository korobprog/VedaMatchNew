"use client";

import { Share, Plus, X } from "lucide-react";

export function IosInstallInstructions({ onClose }: { onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-label="Как установить приложение на iPhone"
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4"
    >
      <div className="w-full max-w-sm rounded-2xl border border-glass-brd bg-bg-1 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <h2 className="font-display text-lg font-bold text-text-0">
            Установка на iPhone
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
            <Share className="h-5 w-5 shrink-0 text-text-2" aria-hidden="true" />
            Нажмите «Поделиться» в нижней панели Safari
          </li>
          <li className="flex items-center gap-3">
            <Plus className="h-5 w-5 shrink-0 text-text-2" aria-hidden="true" />
            Выберите «На экран „Домой“»
          </li>
        </ol>
      </div>
    </div>
  );
}
