"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CHAT_MOMENT_BACKGROUNDS,
  CHAT_MOMENT_CAPTION_MAX_LENGTH,
  chatMomentBackground,
  type ChatMomentAudience,
  type ChatMomentSettingsState,
} from "@vedamatch/shared";
import {
  publishChatMoment,
  uploadChatMomentImage,
} from "@/lib/chat-moments-api";

/**
 * Публикация момента: фотография с подписью либо записка на подложке.
 *
 * Аудитория выбирается здесь же, а не прячется в настройках: «кто это
 * увидит» — вопрос про конкретную публикацию, и отвечать на него надо перед
 * ней, а не однажды и навсегда.
 */
export function MomentComposer({
  settings,
  remainingToday,
}: {
  settings: ChatMomentSettingsState;
  remainingToday: number;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);

  const [caption, setCaption] = useState("");
  const [background, setBackground] = useState(0);
  const [photo, setPhoto] = useState<{
    url: string;
    width: number | null;
    height: number | null;
    preview: string;
  } | null>(null);
  const [audience, setAudience] = useState<ChatMomentAudience>(
    settings.showToEveryone ? "everyone" : "contacts",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tone = chatMomentBackground(background);
  const canPublish =
    remainingToday > 0 && !busy && (photo !== null || caption.trim().length > 0);

  async function pick(file: File) {
    setBusy(true);
    setError(null);
    try {
      const stored = await uploadChatMomentImage(file);
      setPhoto({ ...stored, preview: URL.createObjectURL(file) });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Не загрузилось");
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    setBusy(true);
    setError(null);
    try {
      await publishChatMoment(
        photo
          ? {
              kind: "photo",
              url: photo.url,
              width: photo.width ?? undefined,
              height: photo.height ?? undefined,
              caption: caption.trim() || undefined,
              audience,
            }
          : { kind: "text", caption: caption.trim(), background, audience },
      );
      router.push("/chat");
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Не опубликовалось");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        style={
          photo
            ? undefined
            : {
                background: `linear-gradient(160deg, ${tone.from}, ${tone.to})`,
                color: tone.ink,
              }
        }
        className="relative flex aspect-[9/16] max-h-[60vh] items-center justify-center overflow-hidden rounded-3xl border border-glass-brd p-6"
      >
        {photo ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.preview}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
            {caption.trim() && (
              <p className="absolute inset-x-0 bottom-0 bg-black/55 p-4 text-center text-sm leading-5 text-white">
                {caption}
              </p>
            )}
          </>
        ) : (
          <p className="text-center font-display text-2xl leading-8">
            {caption || "Что у вас сейчас?"}
          </p>
        )}
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] text-text-1">
          {photo ? "Подпись" : "Текст момента"}
        </span>
        <textarea
          value={caption}
          onChange={(event) =>
            setCaption(event.target.value.slice(0, CHAT_MOMENT_CAPTION_MAX_LENGTH))
          }
          rows={3}
          className="rounded-2xl border border-glass-brd bg-glass p-3 text-sm text-text-0 outline-none placeholder:text-text-2"
          placeholder="Несколько слов"
        />
        <span className="self-end font-mono text-[11px] text-text-2">
          {caption.length} / {CHAT_MOMENT_CAPTION_MAX_LENGTH}
        </span>
      </label>

      {!photo && (
        <fieldset className="flex flex-col gap-2">
          <legend className="pb-1.5 text-[13px] text-text-1">Подложка</legend>
          <div className="flex flex-wrap gap-2">
            {CHAT_MOMENT_BACKGROUNDS.map((item, index) => (
              <button
                key={item.from}
                type="button"
                aria-label={`Подложка ${index + 1}`}
                aria-pressed={background === index}
                onClick={() => setBackground(index)}
                style={{
                  background: `linear-gradient(160deg, ${item.from}, ${item.to})`,
                }}
                className={`size-9 rounded-xl border ${
                  background === index
                    ? "border-magenta"
                    : "border-glass-brd"
                }`}
              />
            ))}
          </div>
        </fieldset>
      )}

      <div className="flex flex-wrap gap-2">
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void pick(file);
            event.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="h-10 rounded-2xl border border-glass-brd bg-glass px-4 text-sm text-text-1 hover:text-text-0"
        >
          {photo ? "Другая фотография" : "Фотография"}
        </button>
        {photo && (
          <button
            type="button"
            onClick={() => setPhoto(null)}
            className="h-10 rounded-2xl border border-glass-brd px-4 text-sm text-text-1 hover:text-text-0"
          >
            Убрать фотографию
          </button>
        )}
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="pb-1.5 text-[13px] text-text-1">Кто увидит</legend>
        <div className="flex gap-2">
          <AudienceButton
            active={audience === "contacts"}
            onClick={() => setAudience("contacts")}
            label="Собеседники"
          />
          <AudienceButton
            active={audience === "everyone"}
            onClick={() => setAudience("everyone")}
            label="Весь портал"
            disabled={!settings.everyoneAllowed}
          />
        </div>
        {!settings.everyoneAllowed && settings.planNote && (
          <p className="text-xs text-text-2">{settings.planNote}</p>
        )}
      </fieldset>

      {error && <p className="text-sm text-magenta">{error}</p>}
      {remainingToday === 0 && (
        <p className="text-sm text-text-1">
          На сегодня моменты закончились — следующий можно опубликовать завтра.
        </p>
      )}

      <button
        type="button"
        onClick={() => void publish()}
        disabled={!canPublish}
        className="h-12 rounded-2xl border border-mint-edge bg-mint text-sm font-bold text-on-mint disabled:opacity-50"
      >
        {busy ? "Минуту…" : "Опубликовать"}
      </button>
    </div>
  );
}

function AudienceButton({
  active,
  onClick,
  label,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`h-10 flex-1 rounded-2xl border text-[13px] transition-colors disabled:opacity-50 ${
        active
          ? "border-glass-brd bg-glass font-bold text-text-0"
          : "border-glass-brd font-medium text-text-1 hover:text-text-0"
      }`}
    >
      {label}
    </button>
  );
}
