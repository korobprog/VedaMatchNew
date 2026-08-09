"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import {
  isInstallBannerDismissed,
  rememberInstallDismissal,
} from "@/lib/pwa/install-dismissal";
import { useInstallPrompt } from "./use-install-prompt";
import { IosInstallInstructions } from "./ios-install-instructions";

export function InstallBanner() {
  const { mode, promptInstall } = useInstallPrompt();
  // Считаем закрытым до проверки хранилища: так баннер не мигает при загрузке.
  const [dismissed, setDismissed] = useState(true);
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    setDismissed(isInstallBannerDismissed(window.localStorage));
  }, []);

  if (dismissed || mode === "installed" || mode === "unsupported") return null;

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-40 p-3 sm:hidden">
        <div className="glass rounded-2xl border border-glass-brd p-4">
          {/* Текст занимает всю ширину: в одну строку с кнопкой он на 375px
              разваливается на четыре строки. */}
          <div className="flex items-start gap-3">
            <Download
              className="mt-0.5 h-5 w-5 shrink-0 text-text-2"
              aria-hidden="true"
            />
            <p className="min-w-0 flex-1 text-sm text-text-1">
              Установите VedaMatch на телефон — открывается как приложение.
            </p>
            <button
              type="button"
              aria-label="Закрыть"
              onClick={() => {
                rememberInstallDismissal(window.localStorage);
                setDismissed(true);
              }}
              className="-mt-1 shrink-0 p-1 text-text-2 transition hover:text-text-0"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              if (mode === "ios-manual") setShowInstructions(true);
              else void promptInstall();
            }}
            className="mt-3 w-full rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] px-4 py-3 text-sm font-medium text-white"
          >
            Установить
          </button>
        </div>
      </div>
      {showInstructions && (
        <IosInstallInstructions onClose={() => setShowInstructions(false)} />
      )}
    </>
  );
}
