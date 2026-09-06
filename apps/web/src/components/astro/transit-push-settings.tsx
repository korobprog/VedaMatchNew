"use client";

import { useState } from "react";
import Link from "next/link";
import type { AstroTransitPreferenceDto } from "@vedamatch/shared";
import { saveAstroTransitPreferences } from "@/lib/astro-client-api";
import { TimeZoneField } from "@/components/time-zone-field";
import { fieldClassName } from "@/components/ui/input";

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

/**
 * Когда приходит персональный день.
 *
 * Два решения рядом, потому что человек спрашивает одно: «почему пришло
 * вечером?». Час — настройка Астрологии; пояс — портальный, общий для всех
 * рассылок, и правится тем же полем, что в профиле. Включить или выключить
 * саму рассылку — в настройках уведомлений, ссылка ниже.
 */
export function TransitPushSettings({
  initial,
}: {
  initial: AstroTransitPreferenceDto;
}) {
  const [prefs, setPrefs] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function changeHour(pushHour: number) {
    const was = prefs;
    setPrefs({ ...prefs, pushHour });
    setSaved(false);
    setError(null);
    try {
      setPrefs(await saveAstroTransitPreferences({ pushHour }));
      setSaved(true);
    } catch (e) {
      setPrefs(was);
      setError(e instanceof Error ? e.message : "Не удалось сохранить");
    }
  }

  const zone = prefs.timeZone ?? "Europe/Moscow";

  return (
    <section
      aria-labelledby="transit-push-title"
      className="rounded-2xl border border-glass-brd p-4"
    >
      <h2 id="transit-push-title" className="text-sm font-medium text-text-2">
        Уведомление о персональном дне
      </h2>
      <p className="mt-1 text-sm text-text-1">
        Придёт в {hourLabel(prefs.pushHour)} по поясу {zone}
        {prefs.timeZone ? "" : " (пояс ещё не определён — пока по Москве)"}.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs text-text-2">Во сколько</span>
          <select
            value={prefs.pushHour}
            onChange={(event) => void changeHour(Number(event.target.value))}
            className={fieldClassName}
          >
            {HOURS.map((hour) => (
              <option key={hour} value={hour}>
                {hourLabel(hour)}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-text-2">
            Местное время. Рассылка идёт в течение пары часов после.
          </span>
        </label>

        <div>
          <span className="mb-1 block text-xs text-text-2">Часовой пояс</span>
          <TimeZoneField
            timeZone={prefs.timeZone}
            timeZoneLocked={prefs.timeZoneLocked}
            onSaved={(next) => setPrefs({ ...prefs, ...next })}
          />
        </div>
      </div>

      {error && <p className="mt-3 text-xs text-magenta">{error}</p>}
      {saved && !error && (
        <p className="mt-3 text-xs text-cyan" role="status">
          Сохранено.
        </p>
      )}

      <p className="mt-4 text-xs text-text-2">
        Включить или выключить само уведомление —{" "}
        <Link href="/profile" className="underline hover:text-text-0">
          в настройках уведомлений
        </Link>
        .
      </p>
    </section>
  );
}
