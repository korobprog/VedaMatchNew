"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/http-client";
import { fieldClassName } from "@/components/ui/input";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const AUTO = "";

/** Зона устройства; в SSR и без Intl — undefined. */
export function detectDeviceTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

/** Список зон из самого браузера; старые браузеры без него получают короткий запасной. */
function supportedTimeZones(): string[] {
  try {
    const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
    const list = intl.supportedValuesOf?.("timeZone");
    if (list && list.length > 0) return list;
  } catch {
    // ниже — запасной список
  }
  return [
    "Europe/Kaliningrad",
    "Europe/Moscow",
    "Europe/Samara",
    "Asia/Yekaterinburg",
    "Asia/Omsk",
    "Asia/Novosibirsk",
    "Asia/Krasnoyarsk",
    "Asia/Irkutsk",
    "Asia/Yakutsk",
    "Asia/Vladivostok",
    "Asia/Magadan",
    "Asia/Kamchatka",
    "Asia/Kolkata",
    "Europe/Kyiv",
    "Europe/Minsk",
    "Asia/Almaty",
    "Asia/Tashkent",
  ];
}

/**
 * Часовой пояс человека: автоматически с устройства или выбран руками.
 *
 * Автоматика — норма: браузер знает зону сам, и спрашивать незачем. Ручной
 * выбор нужен тем, у кого VPN или системные настройки врут о зоне: тогда
 * рассылка приходила бы не утром. Ручной выбор фиксирует пояс, и
 * автоопределение его больше не трогает; «Автоматически» снимает фиксацию.
 *
 * Портальный компонент: пояс — поле `User`, и им пользуются все ежедневные
 * рассылки, а не одна Астрология. Пишет через `PATCH /profile`.
 */
export function TimeZoneField({
  timeZone,
  timeZoneLocked,
  onSaved,
}: {
  timeZone: string | null;
  timeZoneLocked: boolean;
  onSaved?: (next: { timeZone: string | null; timeZoneLocked: boolean }) => void;
}) {
  const router = useRouter();
  const [value, setValue] = useState<string>(timeZoneLocked ? (timeZone ?? AUTO) : AUTO);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const zones = useMemo(() => supportedTimeZones(), []);
  const device = detectDeviceTimeZone();

  async function change(next: string) {
    const previous = value;
    setValue(next);
    setPending(true);
    setError(null);
    try {
      const res = await apiFetch(`${API_URL}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        // Пустое — вернуться к автоматике: сервер снимает фиксацию, а зону
        // устройства досылаем следом, не дожидаясь следующего входа.
        body: JSON.stringify(next ? { timeZone: next } : { timeZone: null }),
      });
      if (!res.ok) throw new Error(await res.text());
      if (!next && device) {
        // Сервер после сброса ждёт зону устройства отдельным полем — второй
        // запрос в той же паре обновлений, чтобы профиль не остался пустым.
        await apiFetch(`${API_URL}/profile`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ detectedTimeZone: device }),
        });
      }
      onSaved?.({
        timeZone: next || device || null,
        timeZoneLocked: Boolean(next),
      });
      router.refresh();
    } catch (e) {
      setValue(previous);
      setError(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setPending(false);
    }
  }

  const autoLabel = device
    ? `Автоматически — ${device}`
    : "Автоматически, с устройства";

  return (
    <div>
      <select
        aria-label="Часовой пояс"
        value={value}
        disabled={pending}
        onChange={(event) => void change(event.target.value)}
        className={fieldClassName}
      >
        <option value={AUTO}>{autoLabel}</option>
        {zones.map((zone) => (
          <option key={zone} value={zone}>
            {zone}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-text-2">
        {value
          ? "Выбран вручную: определение с устройства его не меняет."
          : "Определяется по устройству. Если VPN или система показывают не тот пояс, выберите свой из списка."}
      </p>
      {error && <p className="mt-1 text-xs text-magenta">{error}</p>}
    </div>
  );
}
