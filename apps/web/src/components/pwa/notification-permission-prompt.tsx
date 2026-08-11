"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { Bell, X } from "lucide-react";
import { enablePush } from "@/lib/pwa/enable-push";
import {
  detectPushSupport,
  getPushSupportServerSnapshot,
  subscribePushSupport,
} from "@/lib/pwa/push-subscription";
import {
  getNotificationPromptServerSnapshot,
  getNotificationPromptSnapshot,
  isNotificationPromptDismissed,
  rememberNotificationPromptDismissal,
  subscribeNotificationPrompt,
  type NotificationPromptStage,
} from "@/lib/pwa/notification-prompt-dismissal";
import { useInstallPrompt } from "./use-install-prompt";

/** Окно с предложением включить уведомления. Показываем вошедшему человеку —
 *  сразу после регистрации и ещё раз после установки приложения. */
export function NotificationPermissionPrompt() {
  const { mode } = useInstallPrompt();
  const support = useSyncExternalStore(
    subscribePushSupport,
    detectPushSupport,
    getPushSupportServerSnapshot,
  );
  const dismissedStage = useSyncExternalStore(
    subscribeNotificationPrompt,
    getNotificationPromptSnapshot,
    getNotificationPromptServerSnapshot,
  );
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const stage: NotificationPromptStage =
    mode === "installed" ? "installed" : "browser";

  const dismiss = useCallback(() => {
    rememberNotificationPromptDismissal(window.localStorage, stage);
  }, [stage]);

  const allow = useCallback(async () => {
    setBusy(true);
    setFailed(false);
    try {
      const result = await enablePush();
      if (result === "failed") {
        setFailed(true);
        return;
      }
      // И согласие, и отказ закрывают вопрос: второй раз браузер спросить
      // не даст.
      rememberNotificationPromptDismissal(window.localStorage, stage);
    } finally {
      setBusy(false);
    }
  }, [stage]);

  // Спрашивать нечего, если разрешение уже выдано или окончательно запрещено.
  if (support !== "default") return null;
  if (isNotificationPromptDismissed(dismissedStage, stage)) return null;

  return (
    <div
      role="dialog"
      aria-label="Включить уведомления"
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-4"
    >
      <div className="glass w-full max-w-sm rounded-2xl border border-glass-brd p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-text-0">
            <Bell className="h-5 w-5" aria-hidden="true" />
            Включить уведомления
          </h2>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Закрыть"
            className="text-text-2 transition hover:text-text-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-3 text-sm text-text-1">
          Сообщения, заявки и ответы поддержки будут приходить, даже когда
          VedaMatch закрыт. Категории можно настроить в профиле.
        </p>

        {failed && (
          <p className="mt-3 text-sm text-magenta">
            Не удалось включить уведомления. Попробуйте ещё раз позже.
          </p>
        )}

        <button
          type="button"
          onClick={() => void allow()}
          disabled={busy}
          className="mt-4 w-full rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] px-4 py-3 text-sm font-medium text-white disabled:opacity-60"
        >
          {busy ? "Включаем…" : "Разрешить"}
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="mt-2 w-full rounded-xl px-4 py-3 text-sm font-medium text-text-2 transition hover:text-text-0"
        >
          Не сейчас
        </button>
      </div>
    </div>
  );
}
