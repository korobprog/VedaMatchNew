"use client";

import { useState, useSyncExternalStore } from "react";
import { Download, X } from "lucide-react";
import {
  getInstallDismissalServerSnapshot,
  getInstallDismissalSnapshot,
  rememberInstallDismissal,
  subscribeInstallDismissal,
} from "@/lib/pwa/install-dismissal";
import { useInstallPrompt } from "./use-install-prompt";
import { IosInstallInstructions } from "./ios-install-instructions";
import { WrongBrowserInstructions } from "./wrong-browser-instructions";

export function InstallBanner() {
  const { mode, browser, platform, promptInstall } = useInstallPrompt();
  // Считаем закрытым до гидратации: так баннер не мигает при загрузке.
  const dismissed = useSyncExternalStore(
    subscribeInstallDismissal,
    getInstallDismissalSnapshot,
    getInstallDismissalServerSnapshot,
  );
  const [showInstructions, setShowInstructions] = useState(false);

  if (dismissed || mode === "installed" || mode === "unsupported") return null;

  const wrongBrowser = mode === "wrong-browser";

  return (
    <>
      {/* Нижний отступ считаем от safe-area: под ней и вырез iPhone, и панель
          жестов Android — иначе баннер прижимается к самому краю. */}
      <div
        className="install-banner-enter fixed inset-x-0 bottom-0 z-40 p-3 sm:hidden"
        style={{
          paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))",
        }}
      >
        <div className="install-banner-ping rounded-2xl border border-glass-brd bg-bg-1 p-4 shadow-2xl">
          {/* Текст занимает всю ширину: в одну строку с кнопкой он на 375px
              разваливается на четыре строки. */}
          <div className="flex items-start gap-3">
            <Download
              className="mt-0.5 h-5 w-5 shrink-0 text-text-2"
              aria-hidden="true"
            />
            <p className="min-w-0 flex-1 text-sm text-text-1">
              {wrongBrowser
                ? `Установите VedaMatch на телефон — но ${platform === "ios" ? "через Safari" : "через Chrome"}: здесь получится ярлык с поисковой строкой.`
                : "Установите VedaMatch на телефон — открывается как приложение."}
            </p>
            <button
              type="button"
              aria-label="Закрыть"
              onClick={() => rememberInstallDismissal(window.localStorage)}
              className="-mt-1 shrink-0 p-1 text-text-2 transition hover:text-text-0"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              if (mode === "can-prompt") void promptInstall();
              else setShowInstructions(true);
            }}
            className="mt-3 w-full rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] px-4 py-3 text-sm font-medium text-white"
          >
            {wrongBrowser ? "Как установить" : "Установить"}
          </button>
        </div>
      </div>
      {showInstructions &&
        (wrongBrowser ? (
          <WrongBrowserInstructions
            browser={browser}
            platform={platform}
            onClose={() => setShowInstructions(false)}
          />
        ) : (
          <IosInstallInstructions onClose={() => setShowInstructions(false)} />
        ))}
    </>
  );
}
