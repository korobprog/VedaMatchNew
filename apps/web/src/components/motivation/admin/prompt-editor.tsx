"use client";

import { useState } from "react";
import type { MotivationPromptUpdate } from "@vedamatch/shared";
import type { RunCommand } from "./use-admin-command";
import { fieldClass, secondaryButton } from "./ui";

/**
 * Правка промпта перед генерацией.
 *
 * Раньше собранный автоматом промпт показывался только для чтения: увидеть,
 * что уйдёт в модель, было можно, а поправить — нет, и несовпадение с
 * задумкой лечилось перегенерацией наугад за деньги. Теперь автосборка —
 * черновик, и в генерацию уходит то, что сохранил человек.
 */
export function PromptEditor({
  postId,
  postTitle,
  field,
  hint,
  value,
  placeholder,
  disabled,
  pendingAction,
  run,
}: {
  postId: string;
  postTitle: string;
  field: keyof MotivationPromptUpdate;
  /** Короткая подсказка под полем: что здесь вообще описывают. */
  hint: string;
  value: string | null;
  placeholder?: string;
  disabled: boolean;
  pendingAction: string | undefined;
  run: RunCommand;
}) {
  const saved = value ?? "";
  const [text, setText] = useState(saved);
  // Промпт мог смениться на сервере — перегенерация пересобирает черновик при
  // смене стиля. Без сверки поле показывало бы текст, которого в базе уже нет.
  const [lastSaved, setLastSaved] = useState(saved);
  if (saved !== lastSaved) {
    setLastSaved(saved);
    setText(saved);
  }

  const action = `save-${field}`;
  const label = `Промпт ${field === "videoPrompt" ? "видео" : "изображения"} для «${postTitle}»`;
  const dirty = text.trim() !== saved.trim();

  return (
    <div className="space-y-2">
      <label className="block">
        <span className="sr-only">{label}</span>
        <textarea
          aria-label={label}
          value={text}
          disabled={disabled}
          onChange={(event) => setText(event.target.value)}
          placeholder={placeholder}
          rows={field === "videoPrompt" ? 3 : 6}
          className={fieldClass}
        />
      </label>
      <p className="text-xs leading-5 text-text-2">{hint}</p>
      <button
        type="button"
        disabled={disabled || !dirty}
        onClick={() =>
          run(postId, action, {
            path: `/admin/motivation/posts/${postId}/prompts`,
            body: { [field]: text.trim() },
          })
        }
        className={secondaryButton}
      >
        {pendingAction === action ? "Сохранение…" : "Сохранить промпт"}
      </button>
    </div>
  );
}
