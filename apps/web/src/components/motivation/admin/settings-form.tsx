"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MOTIVATION_IMAGE_MODELS,
  MOTIVATION_MUSIC_MODELS,
  MOTIVATION_VIDEO_MODELS,
  MOTIVATION_VOICE_MODELS,
  MOTIVATION_VOICES,
  MOTIVATION_VOICE_LABELS,
  type MotivationModelOption,
  type MotivationSettingsDto,
  type MotivationSettingsUpdate,
  type MotivationVisualStyle,
} from "@vedamatch/shared";
import { apiRequest } from "../motivation-admin-api";
import { visualStyles } from "./review-actions";
import { VoicePreviewButton } from "./voice-preview-button";
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
      userReelsEnabled: form.userReelsEnabled,
      userDailyLimit: form.userDailyLimit,
      aiModerationMode: form.aiModerationMode,
      aiApproveThreshold: form.aiApproveThreshold,
      aiRejectThreshold: form.aiRejectThreshold,
      aiEditorialRules: form.aiEditorialRules,
      reportsToHide: form.reportsToHide,
      userVideoEnabled: form.userVideoEnabled,
      userVoices: form.userVoices,
      userVoiceDefault: form.userVoiceDefault,
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

      <section className={cardClass}>
        <h2 className="mb-3 font-display text-lg font-semibold text-text-0">
          Рилсы участников
        </h2>
        <label className="flex items-center gap-2 text-sm text-text-1">
          <input
            type="checkbox"
            checked={form.userReelsEnabled}
            onChange={(event) => set("userReelsEnabled", event.target.checked)}
          />
          Разрешить участникам создавать свои рилсы
        </label>
        <label className={`${labelClass} mt-3`}>
          Лимит в день на человека (админам не считается)
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            className={`mt-2 ${fieldClass} sm:max-w-xs`}
            value={form.userDailyLimit}
            onChange={(event) =>
              set("userDailyLimit", Number(event.target.value))
            }
          />
        </label>
        <label className="mt-3 flex items-center gap-2 text-sm text-text-1">
          <input
            type="checkbox"
            checked={form.userVideoEnabled}
            onChange={(event) => set("userVideoEnabled", event.target.checked)}
          />
          Разрешить оживлять свои рилсы в видео
        </label>
        <p className="mt-1 text-xs text-text-2">
          Ролик стоит заметно дороже картинки: расход пойдёт в тот же дневной потолок.
        </p>

        {form.userVideoEnabled && (
          <fieldset className="mt-4">
            <legend className="text-sm font-medium text-text-1">
              Голоса, которые увидит автор рилса
            </legend>
            <p className="mt-1 text-xs text-text-2">
              Отметьте несколько — из двух десятков имён провайдера человек всё равно
              выбирает наугад. Образец можно послушать здесь же; он записывается один
              раз и потом достаётся из хранилища.
            </p>
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {MOTIVATION_VOICES.map((voice) => {
                const chosen = form.userVoices.includes(voice);
                return (
                  <div key={voice} className="flex items-center gap-2">
                    <label className="flex flex-1 items-center gap-2 text-sm text-text-1">
                      <input
                        type="checkbox"
                        checked={chosen}
                        onChange={(event) =>
                          set(
                            "userVoices",
                            event.target.checked
                              ? [...form.userVoices, voice]
                              : form.userVoices.filter((item) => item !== voice),
                          )
                        }
                      />
                      <span className="truncate">
                        {voice}
                        {MOTIVATION_VOICE_LABELS[voice] ? (
                          <span className="text-text-2"> · {MOTIVATION_VOICE_LABELS[voice]}</span>
                        ) : null}
                      </span>
                    </label>
                    <VoicePreviewButton voice={voice} />
                  </div>
                );
              })}
            </div>
            <label className={`${labelClass} mt-3`}>
              Предвыбранный голос
              <select
                className={`mt-2 ${fieldClass} sm:max-w-xs`}
                value={form.userVoiceDefault ?? ""}
                onChange={(event) =>
                  set("userVoiceDefault", (event.target.value || null) as typeof form.userVoiceDefault)
                }
              >
                <option value="">Без озвучки</option>
                {form.userVoices.map((voice) => (
                  <option key={voice} value={voice}>
                    {voice}
                    {MOTIVATION_VOICE_LABELS[voice] ? ` · ${MOTIVATION_VOICE_LABELS[voice]}` : ""}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
        )}
        <label className={`${labelClass} mt-3`}>
          Скрывать рилс после жалоб
          <input
            type="number"
            min={1}
            max={100}
            step={1}
            className={`mt-2 ${fieldClass} sm:max-w-xs`}
            value={form.reportsToHide}
            onChange={(event) => set("reportsToHide", Number(event.target.value))}
          />
        </label>
        <p className="mt-2 text-xs text-text-2">
          Набрав столько жалоб, рилс уходит из ленты до вашего решения — не удаляется.
        </p>
        <p className="mt-2 text-xs text-text-2">
          Отклонённые рилсы в лимит не входят: отказ модератора не сжигает
          единственную попытку дня. 0 — создание закрыто для всех, кроме админов.
        </p>
      </section>

      <section className={cardClass}>
        <h2 className="mb-3 font-display text-lg font-semibold text-text-0">
          ИИ-модерация
        </h2>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Режим ИИ-модерации">
          {(
            [
              ["off", "Выкл", "всё в очередь админа"],
              ["assist", "Подсказывает", "вердикт в карточке, решает человек"],
              ["autonomous", "Решает сам", "по умолчанию: исполняет уверенные вердикты, сомнительное — к админу"],
            ] as const
          ).map(([mode, title, hint]) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={form.aiModerationMode === mode}
              onClick={() => set("aiModerationMode", mode)}
              className={`rounded-xl border px-3 py-2 text-left text-sm ${
                form.aiModerationMode === mode
                  ? "border-cyan bg-cyan/10 text-text-0"
                  : "border-glass-brd text-text-1"
              }`}
            >
              <span className="block font-semibold">{title}</span>
              <span className="block text-xs text-text-2">{hint}</span>
            </button>
          ))}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            Одобрять автоматически от
            <input
              type="number"
              min={0.5}
              max={1}
              step={0.05}
              className={`mt-2 ${fieldClass}`}
              value={form.aiApproveThreshold}
              onChange={(event) =>
                set("aiApproveThreshold", Number(event.target.value))
              }
            />
          </label>
          <label className={labelClass}>
            Отклонять без человека от
            <input
              type="number"
              min={0.5}
              max={1}
              step={0.05}
              className={`mt-2 ${fieldClass}`}
              value={form.aiRejectThreshold}
              onChange={(event) =>
                set("aiRejectThreshold", Number(event.target.value))
              }
            />
          </label>
        </div>
        <p className="mt-2 text-xs text-text-2">
          Уверенность модели от 0,5 до 1. Между порогами — эскалация к вам.
          В автономном режиме одобренный текст уходит в генерацию, а готовый кадр
          публикуется без ручной проверки.
        </p>
        <label className={`${labelClass} mt-4`}>
          Правила редакции (дописываются к промпту модератора)
          <textarea
            rows={4}
            className={`mt-2 ${fieldClass}`}
            value={form.aiEditorialRules}
            onChange={(event) => set("aiEditorialRules", event.target.value)}
            placeholder="Не пропускать политику и упоминания живых публичных лиц. Цитаты ачарьев — только с локатором…"
          />
        </label>
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
