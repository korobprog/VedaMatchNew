"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Bell } from "lucide-react";
import type {
  NotificationDeliveryStatusDto,
  NotificationPreferencesDto,
  UpdateNotificationPreferencesRequest,
} from "@vedamatch/shared";
import {
  detectPushSupport,
  getPushSupportServerSnapshot,
  subscribePushSupport,
} from "@/lib/pwa/push-subscription";
import { enablePush, syncPushSubscription } from "@/lib/pwa/enable-push";
import { deliveryWarning } from "@/lib/pwa/delivery-warning";
import {
  fetchDeliveryStatus,
  fetchPreferences,
  savePreferences,
} from "@/lib/notifications-api";
import { notificationCategoryRows } from "@/lib/notification-categories";
import { useInstallPrompt } from "./use-install-prompt";


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
  // Что о доставке думает сервер. Разрешение браузера об этом не говорит:
  // подписка могла не дойти, протухнуть или быть помечена мёртвой (VED-314).
  const [delivery, setDelivery] = useState<NotificationDeliveryStatusDto | null>(
    null,
  );
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

  const refreshDelivery = useCallback(async () => {
    try {
      setDelivery(await fetchDeliveryStatus());
    } catch {
      // Молчание сервера — не повод обещать человеку неприятности: без ответа
      // предупреждение не показывается вовсе.
      setDelivery(null);
    }
  }, []);

  // Подписка могла смениться на стороне браузера или не создаться вовсе;
  // сверяем её при каждой загрузке — воркер отправить новую сам не может.
  // Состояние доставки спрашиваем ПОСЛЕ сверки, иначе увидим вчерашнюю правду.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (support === "granted") await syncPushSubscription();
      if (!cancelled) await refreshDelivery();
    })();
    return () => {
      cancelled = true;
    };
  }, [support, refreshDelivery]);

  const enable = useCallback(async () => {
    setBusy(true);
    setProblem(null);
    try {
      if ((await enablePush()) === "failed") {
        setProblem("Не удалось включить уведомления. Попробуйте ещё раз позже.");
      }
      // Подписка только что появилась — предупреждение должно уйти сразу, а не
      // до следующей загрузки страницы.
      await refreshDelivery();
    } finally {
      setBusy(false);
    }
  }, [refreshDelivery]);

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

  const warning = deliveryWarning({
    enabled: preferences?.enabled ?? true,
    status: delivery,
    support,
  });

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

          {/* Правда вместо молчания (VED-314): включённые уведомления без
              живой точки доставки — это тишина, и сказать об этом нужно там,
              где человек их включает. */}
          {warning ? (
            <div className="mt-3 rounded-xl border border-gold/50 bg-gold/15 px-3 py-2">
              <p className="text-sm font-semibold text-text-0" role="status">
                {warning.title}
              </p>
              <p className="mt-1 text-sm text-text-1">{warning.hint}</p>
            </div>
          ) : (
            support === "granted" &&
            preferences?.enabled !== false && (
              <p className="mt-3 text-sm text-text-1">
                Уведомления приходят и на это устройство
                {delivery && delivery.app > 0 ? " и в приложение" : ""}.
              </p>
            )
          )}

          {/* Пока предупреждения нет, про запрет и неумение браузера
              рассказывают эти две строки; когда оно есть — там уже сказано и
              то же самое, и что делать, а повторять дважды незачем. */}
          {!warning && support === "denied" && (
            <p className="mt-3 text-sm text-text-1">
              На устройство уведомления приходить не будут: вы запретили их для
              сайта, а вернуть разрешение можно только в настройках браузера.
              Колокольчик в шапке работает и без него.
            </p>
          )}

          {!warning && support === "unsupported" && (
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
          <label className="flex cursor-pointer items-center justify-between gap-4 text-sm font-semibold text-text-0">
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
            {notificationCategoryRows(preferences).map((category) => (
              <label
                key={category.key}
                // Запертая строка курсор-руку не показывает: рука обещает
                // нажатие, а нажимать здесь пока нечего.
                className="flex cursor-pointer items-center justify-between gap-4 text-sm text-text-1 has-[:disabled]:cursor-default"
              >
                <span>
                  {category.label}
                  {/* Что именно выключается — словами (VED-361). Без этой
                      строки два соседних тумблера читаются как один, и
                      человек, заглушивший переписку, ждёт тишины и от
                      звонков. */}
                  {category.note && (
                    <span
                      id={`notification-note-${category.key}`}
                      // text-text-1, а не text-text-2: вторичный токен на
                      // стекле светлой темы опускается до 4,14:1 — ниже AA
                      // (см. заметку про полосу плеера в globals.css).
                      className="mt-1 block text-xs text-text-1"
                    >
                      {category.note}
                    </span>
                  )}
                </span>
                <input
                  type="checkbox"
                  aria-label={category.label}
                  aria-describedby={
                    category.note
                      ? `notification-note-${category.key}`
                      : undefined
                  }
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
