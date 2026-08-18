"use client";

import { useRef, useState } from "react";
import { apiRequest } from "../motivation-admin-api";
import { secondaryButton } from "./ui";

/**
 * Прослушивание голоса перед выбором.
 *
 * Без него голос выбирается вслепую из двадцати одного имени: услышать его
 * можно было только пересняв ролик — две минуты ожидания и двенадцать центов.
 * Образец стоит меньше половины цента.
 */
export function VoicePreviewButton({ voice }: { voice: string | null }) {
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  // Держим один проигрыватель: иначе быстрые нажатия наложат записи друг на
  // друга и разобрать голос станет невозможно.
  const player = useRef<HTMLAudioElement | null>(null);

  async function play() {
    setState("loading");
    try {
      const result = (await apiRequest(
        "/admin/motivation/voice-preview",
        "POST",
        { voice },
      )) as { audio?: string } | null;
      if (!result?.audio) throw new Error("Пустой ответ");
      // Ответ теперь ссылка на файл в хранилище, а не запись целиком: образец
      // каждого голоса синтезируется один раз за всё время.

      player.current?.pause();
      const audio = new Audio(result.audio);
      player.current = audio;
      await audio.play();
      setState("idle");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => void play()}
        disabled={state === "loading"}
        className={secondaryButton}
      >
        {state === "loading" ? "Готовим…" : "Прослушать"}
      </button>
      {state === "error" && (
        <span role="alert" className="text-sm text-red-500">
          Не получилось
        </span>
      )}
    </div>
  );
}
