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
        <div className="glass flex items-center gap-3 rounded-2xl border border-glass-brd p-3">
          <Download className="h-5 w-5 shrink-0 text-text-2" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-sm text-text-1">
            Установите VedaMatch на телефон — открывается как приложение.
          </p>
          <button
            type="button"
            onClick={() => {
              if (mode === "ios-manual") setShowInstructions(true);
              else void promptInstall();
            }}
            className="shrink-0 rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] px-3 py-2 text-sm font-medium text-white"
          >
            Установить
          </button>
          <button
            type="button"
            aria-label="Закрыть"
            onClick={() => {
              rememberInstallDismissal(window.localStorage);
              setDismissed(true);
            }}
            className="shrink-0 text-text-2 transition hover:text-text-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
      {showInstructions && (
        <IosInstallInstructions onClose={() => setShowInstructions(false)} />
      )}
    </>
  );
}
