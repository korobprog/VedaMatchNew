"use client";

import { useEffect } from "react";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const STORAGE_KEY = "vm_time_zone_synced";

/**
 * Сообщает порталу часовой пояс устройства.
 *
 * Пояс нужен рассылкам: персональный день приходит в 09:00 местного, и без
 * него сервер считал бы по Москве — на Дальнем Востоке пуш приходил к вечеру.
 * Спрашивать человека не нужно: браузер знает зону сам. Отправляем один раз
 * на зону и запоминаем в localStorage, чтобы не дёргать профиль на каждой
 * странице; переезд в другой пояс снимает отметку сам собой.
 *
 * Отправляется как `detectedTimeZone`, а не `timeZone`: ручной выбор
 * человека (VPN и системные настройки иногда врут о зоне) сервер фиксирует,
 * и автоопределение его не перезаписывает.
 *
 * Монтируется только у вошедшего: гостю профиля нет.
 */
export function TimeZoneSync() {
  useEffect(() => {
    let timeZone: string | undefined;
    try {
      timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return;
    }
    if (!timeZone) return;
    try {
      if (localStorage.getItem(STORAGE_KEY) === timeZone) return;
    } catch {
      // Хранилище недоступно — просто отправим ещё раз.
    }
    const controller = new AbortController();
    void apiFetch(`${API_URL}/profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ detectedTimeZone: timeZone }),
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) return;
        try {
          localStorage.setItem(STORAGE_KEY, timeZone);
        } catch {
          // Не запомнили — отправим в следующий раз, это дёшево.
        }
      })
      .catch(() => {
        // Сеть или сессия — не повод показывать ошибку: попробуем на
        // следующей странице.
      });
    return () => controller.abort();
  }, []);

  return null;
}
