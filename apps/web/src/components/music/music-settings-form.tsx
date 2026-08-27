"use client";

import { useState } from "react";
import type {
  MusicNowPlayingVisibility,
  MusicSettingsDto,
} from "@vedamatch/shared";
import { saveMusicSettings } from "@/lib/music-playback-api";
import { Alert } from "@/components/ui/alert";

/**
 * Настройки прослушивания.
 *
 * Общий выключатель видимости — из раздела «Приватность» плана сервиса.
 * Кнопка «невидимый сеанс» в полосе плеера гасит только текущий сеанс; это
 * решение на всегда, и жить оно должно там, где его будут искать, — в
 * настройках, а не в плеере.
 *
 * Сохраняется сразу по выбору, без кнопки «применить»: настройка одна,
 * подтверждать нечего, а забытая несохранённая приватность — это ровно та
 * ошибка, которой здесь быть нельзя.
 */
export function MusicSettingsForm({ initial }: { initial: MusicSettingsDto }) {
  const [settings, setSettings] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function update(patch: Partial<MusicSettingsDto>) {
    const was = settings;
    setSettings({ ...settings, ...patch });
    setSaved(false);
    setError(null);

    const result = await saveMusicSettings(patch);
    if (result) {
      setSettings(result);
      setSaved(true);
    } else {
      // Не сохранилось — возвращаем как было. Показывать «выключено» там,
      // где на сервере включено, здесь опаснее всего.
      setSettings(was);
      setError("Не удалось сохранить. Попробуйте ещё раз.");
    }
  }

  const options: { value: MusicNowPlayingVisibility; label: string; hint: string }[] =
    [
      {
        value: "friends",
        label: "Тем, кому открыта активность",
        hint: "Мэтч в Знакомствах, раскрытые контакты в Общении",
      },
      {
        value: "nobody",
        label: "Никому",
        hint: "Что вы слушаете, не увидит никто",
      },
    ];

  return (
    <div className="flex flex-col gap-6">
      <fieldset className="glass rounded-2xl border border-glass-brd p-4">
        <legend className="px-1 text-sm font-semibold text-text-0">
          Кто видит, что вы слушаете
        </legend>
        <p className="mt-1 text-xs text-text-2">
          Лекции и мантры на ночь — не то, о чём хочется отчитываться. Отдельно
          от этого в плеере есть кнопка невидимого сеанса: она гасит показ до
          закрытия вкладки.
        </p>

        <div className="mt-4 flex flex-col gap-2">
          {options.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-start gap-3 rounded-xl p-2 hover:bg-glass"
            >
              <input
                type="radio"
                name="nowPlayingVisibility"
                value={option.value}
                checked={settings.nowPlayingVisibility === option.value}
                onChange={() =>
                  void update({ nowPlayingVisibility: option.value })
                }
                className="mt-0.5 h-4 w-4 shrink-0"
              />
              <span className="flex flex-col">
                <span className="text-sm text-text-0">{option.label}</span>
                <span className="text-xs text-text-2">{option.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="glass rounded-2xl border border-glass-brd p-4">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={settings.autoplay}
            onChange={(event) => void update({ autoplay: event.target.checked })}
            className="mt-0.5 h-4 w-4 shrink-0"
          />
          <span className="flex flex-col">
            <span className="text-sm text-text-0">
              Продолжать воспроизведение
            </span>
            <span className="text-xs text-text-2">
              Когда запись кончилась, ставить следующую из очереди
            </span>
          </span>
        </label>
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {saved && !error && <Alert tone="success">Сохранено.</Alert>}
    </div>
  );
}
