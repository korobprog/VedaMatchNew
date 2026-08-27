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
  // Отдельно от Рынка: выключив коммерцию, человек не должен молча потерять
  // доску общины — подписки на рубрику и город, отклики на свои объявления.
  { key: "notices", label: "Доска «Объявления»" },
  // Только про свои публикации: лента вдохновения сама по себе не пишет.
  { key: "motivation", label: "Мои рилсы: студия «Вдохновения»" },
  // Тоже только про своё: о чужих новинках каталога тумблер не сообщает.
  { key: "music", label: "Мои записи в «Музыке»" },
  { key: "announcements", label: "Новости VedaMatch" },
] as const;

/**
 * Настройки уведомлений.
 *
 * Разрешение браузера и тумблеры ниже — про разное, и раньше это было
 * перепутано: список категорий показывался только при выданном разрешении на
 * пуш. Но категории гасят и колокольчик в шапке, который работает вообще без
 * разрешения, — то есть отказавший браузеру человек не мог выключить ни одну
 * категорию, а в браузере без поддержки пушей карточка не появлялась совсем.
 *
 * Теперь порядок такой: сверху — куда приходят уведомления (канал устройства),
 * снизу — о чём уведомлять (и колокольчик, и устройство). Второе доступно
 * всегда.
 */
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
  const [problem, setProblem] = useState<string | null>(null);
  // Серверный снимок — всегда «unsupported», и до гидратации любая строка про
  // канал устройства была бы неправдой у того, кто разрешение уже выдал.
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    let cancelled = false;
    void fetchPreferences()
      .then((loaded) => {
        if (!cancelled) setPreferences(loaded);
      })
      .catch(() => {
        if (!cancelled) {
          setProblem("Не удалось загрузить настройки. Обновите страницу.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Подписка могла смениться на стороне браузера или не создаться вовсе;
  // сверяем её при каждой загрузке — воркер отправить новую сам не может.
  useEffect(() => {
    if (support !== "granted") return;
    void syncPushSubscription();
  }, [support]);

  const enable = useCallback(async () => {
    setBusy(true);
    setProblem(null);
    try {
      if ((await enablePush()) === "failed") {
        setProblem("Не удалось включить уведомления. Попробуйте ещё раз позже.");
      }
    } finally {
      setBusy(false);
    }
  }, []);

  const update = useCallback(
    async (patch: UpdateNotificationPreferencesRequest) => {
      try {
        setPreferences(await savePreferences(patch));
        setProblem(null);
      } catch {
        setProblem("Не удалось сохранить. Попробуйте ещё раз.");
      }
    },
    [],
  );

  return (
    <div className="glass rounded-2xl border border-glass-brd p-6">
      <h2 className="flex items-center gap-2 font-display text-lg font-bold text-text-0">
        <Bell className="h-5 w-5" aria-hidden="true" />
        Уведомления
      </h2>

      {mounted && (
        <>
          {mode === "ios-manual" && (
            <p className="mt-3 text-sm text-text-1">
              На iPhone уведомления приходят только в установленное приложение.
              Сначала добавьте VedaMatch на экран «Домой».
            </p>
          )}

          {support === "granted" && preferences?.enabled !== false && (
            <p className="mt-3 text-sm text-text-1">
              Уведомления приходят и на это устройство.
            </p>
          )}

          {support === "denied" && (
            <p className="mt-3 text-sm text-text-1">
              На устройство уведомления приходить не будут: вы запретили их для
              сайта, а вернуть разрешение можно только в настройках браузера.
              Колокольчик в шапке работает и без него.
            </p>
          )}

          {support === "unsupported" && (
            <p className="mt-3 text-sm text-text-1">
              Этот браузер не умеет присылать уведомления на устройство.
              Колокольчик в шапке работает и без этого.
            </p>
          )}

          {support === "default" && (
            <button
              type="button"
              onClick={() => void enable()}
              disabled={busy}
              className="mt-4 w-full rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] px-4 py-3 text-sm font-medium text-white disabled:opacity-60"
            >
              {busy ? "Включаем…" : "Включить уведомления на устройство"}
            </button>
          )}
        </>
      )}

      {problem && (
        <p className="mt-3 text-sm text-magenta" role="alert">
          {problem}
        </p>
      )}

      {preferences && (
        <div className="mt-5 border-t border-glass-brd pt-5">
          <label className="flex items-center justify-between gap-4 text-sm font-semibold text-text-0">
            Все уведомления
            <input
              type="checkbox"
              aria-label="Все уведомления"
              checked={preferences.enabled}
              onChange={(event) => void update({ enabled: event.target.checked })}
              className="h-6 w-6 shrink-0"
            />
          </label>

          <p className="mt-2 text-sm text-text-1">
            {preferences.enabled
              ? "О чём уведомлять. Выключенное не придёт ни на устройство, ни в колокольчик."
              : "Пока выключено, не придёт ничего. Категории ниже сохранены и заработают снова, как только включите."}
          </p>

          {/* Категории не прячем и не приглушаем: спрятанное выглядит как
              потерянное, а приглушённый текст роняет контраст ниже 4.5:1 —
              состояние несёт слово выше и `disabled` у самих полей. */}
          <div className="mt-4 space-y-3">
            {categories.map((category) => (
              <label
                key={category.key}
                className="flex items-center justify-between gap-4 text-sm text-text-1"
              >
                {category.label}
                <input
                  type="checkbox"
                  aria-label={category.label}
                  checked={preferences[category.key]}
                  disabled={!preferences.enabled}
                  onChange={(event) =>
                    void update({ [category.key]: event.target.checked })
                  }
                  // 24px — нижняя граница размера цели по WCAG 2.5.8; при 20px
                  // в неё не попасть пальцем.
                  className="h-6 w-6 shrink-0"
                />
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
