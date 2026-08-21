"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Bell } from "lucide-react";
import type {
  NotificationPreferencesDto,
  UpdateNotificationPreferencesRequest,
} from "@vedamatch/shared";
import {
  detectPushSupport,
  getPushSupportServerSnapshot,
  subscribePushSupport,
} from "@/lib/pwa/push-subscription";
import { enablePush, syncPushSubscription } from "@/lib/pwa/enable-push";
import { fetchPreferences, savePreferences } from "@/lib/notifications-api";
import { useInstallPrompt } from "./use-install-prompt";

const categories = [
  { key: "chat", label: "Сообщения" },
  { key: "connections", label: "Заявки и совпадения" },
  { key: "support", label: "Поддержка" },
  { key: "transits", label: "Персональный день (астрология)" },
  // Сообщения чата Рынка идут под тумблером «Сообщения»: это та же переписка.
  { key: "market", label: "Заявки на Рынке" },
  // Только про свои публикации: лента мотивации сама по себе не пишет.
  { key: "motivation", label: "Мои рилсы: студия «Мотивации»" },
  { key: "announcements", label: "Новости VedaMatch" },
] as const;

export function NotificationSettings() {
  const { mode } = useInstallPrompt();
  const support = useSyncExternalStore(
    subscribePushSupport,
    detectPushSupport,
    getPushSupportServerSnapshot,
  );
  const [preferences, setPreferences] =
    useState<NotificationPreferencesDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (support !== "granted") return;
    let cancelled = false;
    void fetchPreferences()
      .then((loaded) => {
        if (!cancelled) setPreferences(loaded);
      })
      .catch(() => {
        if (!cancelled) setPreferences(null);
      });
    return () => {
      cancelled = true;
    };
  }, [support]);

  // Подписка могла смениться на стороне браузера или не создаться вовсе;
  // сверяем её при каждой загрузке — воркер отправить новую сам не может.
  useEffect(() => {
    if (support !== "granted") return;
    void syncPushSubscription();
  }, [support]);

  const enable = useCallback(async () => {
    setBusy(true);
    setFailed(false);
    try {
      setFailed((await enablePush()) === "failed");
    } finally {
      setBusy(false);
    }
  }, []);

  const update = useCallback(
    async (patch: UpdateNotificationPreferencesRequest) => {
      const next = await savePreferences(patch);
      setPreferences(next);
    },
    [],
  );

  if (support === "unsupported") return null;

  return (
    <div className="glass rounded-2xl border border-glass-brd p-6">
      <h2 className="flex items-center gap-2 font-display text-lg font-bold text-text-0">
        <Bell className="h-5 w-5" aria-hidden="true" />
        Уведомления
      </h2>

      {mode === "ios-manual" && (
        <p className="mt-3 text-sm text-text-1">
          На iPhone уведомления приходят только в установленное приложение.
          Сначала добавьте VedaMatch на экран «Домой».
        </p>
      )}

      {support === "denied" && (
        <p className="mt-3 text-sm text-text-1">
          Вы запретили уведомления для сайта. Вернуть разрешение можно только в
          настройках браузера — из приложения спросить повторно нельзя.
        </p>
      )}

      {failed && (
        <p className="mt-3 text-sm text-magenta">
          Не удалось включить уведомления. Попробуйте ещё раз позже.
        </p>
      )}

      {support === "default" && (
        <button
          type="button"
          onClick={() => void enable()}
          disabled={busy}
          className="mt-4 w-full rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] px-4 py-3 text-sm font-medium text-white disabled:opacity-60"
        >
          {busy ? "Включаем…" : "Включить уведомления"}
        </button>
      )}

      {support === "granted" && preferences && (
        <div className="mt-4 space-y-3">
          {categories.map((category) => (
            <label
              key={category.key}
              className="flex items-center justify-between text-sm text-text-1"
            >
              {category.label}
              <input
                type="checkbox"
                aria-label={category.label}
                checked={preferences[category.key]}
                onChange={(event) =>
                  void update({ [category.key]: event.target.checked })
                }
                className="h-5 w-5"
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
