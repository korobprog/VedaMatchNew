"use client";

import { useState } from "react";
import type {
  NotificationDeviceStats,
  NotificationDeviceTestResult,
} from "@vedamatch/shared";
import { Alert } from "@/components/ui/alert";
import { API_URL, apiFetch } from "@/lib/http-client";
import { plural } from "@/lib/plural";

/**
 * Пуши в приложение VedaMatch: сколько телефонов подключено и тестовый пуш
 * себе. Тест проверяет всю цепочку сразу: ключ FCM на сервере, токен в базе и
 * канал уведомлений в приложении.
 */
export function NotificationDevicesPanel({
  stats,
}: {
  stats: NotificationDeviceStats | null;
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!stats) {
    return (
      <Alert tone="error" className="mb-8">
        Не удалось загрузить телефоны с приложением.
      </Alert>
    );
  }

  async function sendTest() {
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const res = await apiFetch(`${API_URL}/admin/notifications/devices/test`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Тестовый пуш не отправился");
      const result = (await res.json()) as NotificationDeviceTestResult;
      setNotice(
        result.devices === 0
          ? "У вас нет телефона с приложением: войдите в приложение и разрешите уведомления"
          : `Принято ${result.delivered} из ${result.devices} ${plural(result.devices, "телефона", "телефонов", "телефонов")}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Тестовый пуш не отправился");
    } finally {
      setBusy(false);
    }
  }

  const figures = [
    { label: "Телефонов", value: stats.total },
    { label: "Людей", value: stats.users },
    { label: "Через FCM", value: stats.byProvider.fcm },
    { label: "Через RuStore", value: stats.byProvider.rustore },
  ];

  return (
    <section className="mb-8 rounded-2xl border border-glass-brd bg-glass p-4">
      <h2 className="font-display text-base font-semibold text-text-0">
        Приложение
      </h2>
      <p className="mt-1 text-sm text-text-1">
        Телефоны получают те же уведомления, что и браузеры.
        {stats.fcmConfigured
          ? " Отправка через FCM настроена."
          : " Ключ FCM на сервере не задан, пуши в приложение не уходят."}{" "}
        RuStore пока только регистрирует телефоны.
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {figures.map((figure) => (
          <div
            key={figure.label}
            className="rounded-xl border border-glass-brd bg-bg-1 px-3 py-2"
          >
            <dt className="hyphens-auto break-words text-xs text-text-1">
              {figure.label}
            </dt>
            <dd className="font-mono text-xl text-text-0">{figure.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4">
        <button
          type="button"
          onClick={() => void sendTest()}
          disabled={busy || !stats.fcmConfigured}
          className="btn-mint rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {busy ? "Отправляем…" : "Тестовый пуш себе"}
        </button>
      </div>
      {notice && (
        <p role="status" className="mt-2 text-sm text-text-1">
          {notice}
        </p>
      )}
      {error && (
        <Alert tone="error" className="mt-3">
          {error}
        </Alert>
      )}
    </section>
  );
}
