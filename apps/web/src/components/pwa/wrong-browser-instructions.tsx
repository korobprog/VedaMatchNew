"use client";

import { useState } from "react";
import { Check, Compass, Copy, ExternalLink, Share2, X } from "lucide-react";
import type { PwaBrowserFamily, PwaPlatform } from "@vedamatch/shared";
import {
  buildAndroidIntentUrl,
  chromeAndroidPackage,
} from "@/lib/pwa/open-in-browser";
import { browserNames } from "@/lib/pwa/browser-names";


/** Сколько ждём перехода, прежде чем решить, что Chrome на телефоне нет. */
const handoffTimeoutMs = 1500;

export function WrongBrowserInstructions({
  browser,
  platform,
  onClose,
}: {
  browser: PwaBrowserFamily;
  platform: PwaPlatform;
  onClose: () => void;
}) {
  const [handoffFailed, setHandoffFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const target = platform === "ios" ? "Safari" : "Chrome";

  function openInChrome() {
    const intentUrl = buildAndroidIntentUrl(
      window.location.href,
      chromeAndroidPackage,
    );
    if (!intentUrl) {
      setHandoffFailed(true);
      return;
    }
    const startedAt = Date.now();
    window.location.href = intentUrl;
    // Узнать, установлен ли Chrome, со страницы нельзя. Судим по косвенному:
    // если через полторы секунды вкладка всё ещё на экране и таймер не был
    // заморожен уходом в фон — переход не состоялся.
    window.setTimeout(() => {
      const stillHere =
        document.visibilityState === "visible" &&
        Date.now() - startedAt < handoffTimeoutMs * 2;
      if (stillHere) setHandoffFailed(true);
    }, handoffTimeoutMs);
  }

  async function shareLink() {
    try {
      await navigator.share({ title: "VedaMatch", url: window.location.origin });
    } catch {
      // Закрытую шторку «Поделиться» браузер отдаёт исключением — это отказ
      // пользователя, а не сбой.
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      setCopied(true);
    } catch {
      setHandoffFailed(true);
    }
  }

  const canShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <div
      role="dialog"
      aria-label={`Как установить приложение через ${target}`}
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4"
    >
      <div className="w-full max-w-sm rounded-2xl border border-glass-brd bg-bg-1 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <h2 className="font-display text-lg font-bold text-text-0">
            Установка через {target}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="shrink-0 text-text-2 transition hover:text-text-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-3 text-sm text-text-1">
          {browser === "yandex-app"
            ? "Приложение Яндекса открывает сайты во встроенном окне — установить портал оттуда нельзя."
            : `${browserNames[browser]} не создаёт настоящее приложение: на экране появится ярлык, который открывает портал внутри браузера — вместе с его поисковой строкой внизу.`}{" "}
          {platform === "ios"
            ? "Полноэкранное приложение на iPhone делает только Safari."
            : "Полноэкранное приложение делают Chrome и Samsung Internet."}
        </p>

        {platform === "ios" ? (
          <>
            <ol className="mt-4 space-y-3 text-sm text-text-1">
              <li className="flex items-center gap-3">
                <Copy className="h-5 w-5 shrink-0 text-text-2" aria-hidden="true" />
                Скопируйте адрес портала
              </li>
              <li className="flex items-center gap-3">
                <Compass
                  className="h-5 w-5 shrink-0 text-text-2"
                  aria-hidden="true"
                />
                Откройте Safari и вставьте его в адресную строку
              </li>
              <li className="flex items-center gap-3">
                <Share2
                  className="h-5 w-5 shrink-0 text-text-2"
                  aria-hidden="true"
                />
                «Поделиться» → «На экран „Домой“»
              </li>
            </ol>
            <button
              type="button"
              onClick={() => void copyLink()}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] px-4 py-3 text-sm font-medium text-white"
            >
              {copied ? (
                <Check className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Copy className="h-4 w-4" aria-hidden="true" />
              )}
              {copied ? "Адрес скопирован" : "Скопировать адрес"}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={openInChrome}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] px-4 py-3 text-sm font-medium text-white"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              Открыть в Chrome
            </button>
            {canShare && (
              <button
                type="button"
                onClick={() => void shareLink()}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-glass-brd px-4 py-3 text-sm font-medium text-text-1 transition hover:text-text-0"
              >
                <Share2 className="h-4 w-4" aria-hidden="true" />
                Отправить ссылку в другой браузер
              </button>
            )}
            {handoffFailed && (
              <div className="mt-4 rounded-xl border border-glass-brd p-4">
                <p className="text-sm font-medium text-text-0">
                  Chrome не открылся
                </p>
                <p className="mt-2 text-sm text-text-1">
                  Похоже, его нет на телефоне. Установите Chrome или Samsung
                  Internet, либо откройте портал там вручную: меню браузера
                  («⋮») → «Открыть в другом приложении».
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
