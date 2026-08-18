"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MOTIVATION_IMAGE_MODELS,
  MOTIVATION_MUSIC_MODELS,
  MOTIVATION_VIDEO_MODELS,
  MOTIVATION_VOICE_MODELS,
  MOTIVATION_VOICES,
  type MotivationModelOption,
  type MotivationSettingsDto,
  type MotivationSettingsUpdate,
  type MotivationVisualStyle,
} from "@vedamatch/shared";
import { apiRequest } from "../motivation-admin-api";
import { visualStyles } from "./review-actions";
import { cardClass, fieldClass, labelClass, primaryButton } from "./ui";

/** Значение пункта «другая модель» — не может совпасть с идентификатором. */
const CUSTOM_MODEL = "__custom__";

/**
 * Поле модели: список известных плюс возможность вписать свою.
 *
 * Сначала здесь был `datalist`, и он не работал: браузер фильтрует подсказки по
 * тому, что уже введено, а в поле лежит полный идентификатор модели — под него
 * подходит только он сам, и выбирать оказывается не из чего.
 *
 * Поэтому обычный список, а рядом пункт «другая модель»: у провайдеров они
 * появляются каждый месяц, и запертый перечень не дал бы поставить новую.
 */
function ModelField({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: MotivationModelOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  const known = options.find((option) => option.id === value);
  const [custom, setCustom] = useState(!known && value !== "");

  return (
    <label className={labelClass}>
      {label}
      {custom ? (
        <input
          className={`mt-2 ${fieldClass}`}
          value={value}
          placeholder="идентификатор модели у провайдера"
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <select
          className={`mt-2 ${fieldClass}`}
          value={known ? value : ""}
          onChange={(event) => {
            if (event.target.value === CUSTOM_MODEL) {
              setCustom(true);
              onChange("");
              return;
            }
            onChange(event.target.value);
          }}
        >
          {!known && <option value="">Не выбрана</option>}
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.id} — {option.note}
            </option>
          ))}
          <option value={CUSTOM_MODEL}>Другая модель…</option>
        </select>
      )}
      <span className="mt-1 block text-xs text-text-2">
        {custom ? (
          <button
            type="button"
            onClick={() => {
              setCustom(false);
              onChange(options[0]?.id ?? "");
            }}
            className="underline"
          >
            Вернуться к списку
          </button>
        ) : (
          (known?.note ?? "Выберите модель")
        )}
      </span>
    </label>
  );
}

/**
 * Настройки сервиса.
 *
 * Значения показываются те, что действуют сейчас, — из базы, из окружения или
 * из кода, смотря что нашлось. Отличить источник по форме нельзя, и это
 * осознанно: администратору важно, что применится, а не откуда оно взялось.
 */
export function MotivationSettingsForm({
  settings,
}: {
  settings: MotivationSettingsDto;
}) {
  const router = useRouter();
  const [form, setForm] = useState(settings);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string>();

  function set<K extends keyof MotivationSettingsDto>(
    key: K,
    value: MotivationSettingsDto[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
    setState("idle");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setState("saving");
    setError(undefined);
    const payload: MotivationSettingsUpdate = {
      videoModel: form.videoModel,
      videoSeconds: form.videoSeconds,
      videoAudio: form.videoAudio,
      voiceModel: form.voiceModel,
      voiceName: form.voiceName,
      imageModel: form.imageModel,
      visualStyle: form.visualStyle,
      dailyBudgetUsd: form.dailyBudgetUsd,
      musicModel: form.musicModel,
    };
    try {
      await apiRequest("/admin/motivation/settings", "PATCH", payload);
      setState("saved");
      router.refresh();
    } catch (requestError) {
      setState("idle");
      setError(
        requestError instanceof Error ? requestError.message : "Не сохранилось",
      );
    }
  }

  return (
    <form onSubmit={(event) => void save(event)} className="grid gap-4">
      <section className={cardClass}>
        <h2 className="mb-3 font-display text-lg font-semibold text-text-0">
          Ролик
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <ModelField
            label="Модель видео"
            options={MOTIVATION_VIDEO_MODELS}
            value={form.videoModel}
            onChange={(value) => set("videoModel", value)}
          />
          <label className={labelClass}>
            Длительность, секунд
            <input
              type="number"
              min={3}
              max={30}
              className={`mt-2 ${fieldClass}`}
              value={form.videoSeconds}
              onChange={(event) =>
                set("videoSeconds", Number(event.target.value))
              }
            />
          </label>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-text-1">
          <input
            type="checkbox"
            checked={form.videoAudio}
            onChange={(event) => set("videoAudio", event.target.checked)}
          />
          Просить звук у видеомодели
        </label>
        <p className="mt-2 text-xs text-text-2">
          Звук модели удорожает ролик и не проверяется человеком. Обычно его
          выключают, а озвучку и музыку накладывают своим пайплайном.
        </p>
      </section>

      <section className={cardClass}>
        <h2 className="mb-3 font-display text-lg font-semibold text-text-0">
          Озвучка
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <ModelField
            label="Модель озвучки"
            options={MOTIVATION_VOICE_MODELS}
            value={form.voiceModel}
            onChange={(value) => set("voiceModel", value)}
          />
          <label className={labelClass}>
            Голос по умолчанию
            <select
              className={`mt-2 ${fieldClass}`}
              value={form.voiceName}
              onChange={(event) => set("voiceName", event.target.value)}
            >
              {MOTIVATION_VOICES.map((voice) => (
                <option key={voice} value={voice}>
                  {voice}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="mt-2 text-xs text-text-2">
          У поста голос можно переопределить. Список голосов относится к
          ElevenLabs; у другого провайдера имена будут иными.
        </p>
      </section>

      <section className={cardClass}>
        <h2 className="mb-3 font-display text-lg font-semibold text-text-0">
          Иллюстрация
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <ModelField
            label="Модель картинки"
            options={MOTIVATION_IMAGE_MODELS}
            value={form.imageModel}
            onChange={(value) => set("imageModel", value)}
          />
          <label className={labelClass}>
            Стиль по умолчанию
            <select
              className={`mt-2 ${fieldClass}`}
              value={form.visualStyle ?? ""}
              onChange={(event) =>
                set(
                  "visualStyle",
                  (event.target.value || null) as MotivationVisualStyle | null,
                )
              }
            >
              <option value="">Автоматически — по смыслу и источнику</option>
              {visualStyles.map((style) => (
                <option key={style.value} value={style.value}>
                  {style.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className={cardClass}>
        <h2 className="mb-3 font-display text-lg font-semibold text-text-0">
          Музыка
        </h2>
        <ModelField
          label="Модель музыки"
          options={MOTIVATION_MUSIC_MODELS}
          value={form.musicModel}
          onChange={(value) => set("musicModel", value)}
        />
        <p className="mt-2 text-xs text-text-2">
          Треки создаются в библиотеке ниже и переиспользуются: клип длится
          секунды, трек — полминуты, платить за музыку под каждый пост незачем.
        </p>
      </section>

      <section className={cardClass}>
        <h2 className="mb-3 font-display text-lg font-semibold text-text-0">
          Расход
        </h2>
        <label className={labelClass}>
          Дневной потолок, $
          <input
            type="number"
            min={1}
            step="0.5"
            className={`mt-2 ${fieldClass} sm:max-w-xs`}
            value={form.dailyBudgetUsd}
            onChange={(event) =>
              set("dailyBudgetUsd", Number(event.target.value))
            }
          />
        </label>
        <p className="mt-2 text-xs text-text-2">
          Проверяется до обращения к провайдеру: списание происходит в момент
          постановки задачи и не отменяется. Персональные лимиты ограничивают
          одного человека, а этот потолок — общий счёт за сутки.
        </p>
      </section>

      {error && (
        <p role="alert" className="text-sm font-medium text-red-500">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={state === "saving"}
          className={primaryButton}
        >
          {state === "saving" ? "Сохраняем…" : "Сохранить"}
        </button>
        {state === "saved" && (
          <span className="text-sm text-cyan">Сохранено</span>
        )}
      </div>
    </form>
  );
}
