"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MusicPlaylistVisibility } from "@vedamatch/shared";
import { updatePlaylist } from "@/lib/music-playlists-api";

const OPTIONS: {
  value: MusicPlaylistVisibility;
  label: string;
  hint: string;
}[] = [
  {
    value: "private",
    label: "Только я",
    hint: "Подборку не видит никто, кроме вас",
  },
  {
    value: "friends",
    label: "Друзьям",
    hint: "Видят те, кто открыл вам доступ: мэтч в Знакомствах или раскрытые контакты",
  },
  {
    value: "public",
    label: "Всем",
    hint: "Видит любой, у кого есть ссылка, и поисковики",
  },
];

/**
 * Кому виден плейлист. См. docs/music-service-plan.md.
 *
 * До этого поле существовало только в API: подборку заводили закрытой, и
 * открыть её было нечем — «Плейлисты друзей» оставались пустыми у всех, а
 * событие «опубликовал подборку» не наступало ни разу.
 *
 * Три кнопки, а не переключатель «поделиться»: разница между «друзьям» и
 * «всем» существенная, и прятать её за одним тумблером значит однажды
 * открыть чью-то подборку поисковикам вместо круга знакомых.
 *
 * Смена сразу уходит на сервер, без кнопки «сохранить»: это одно поле, и
 * подтверждать выбор из трёх кнопок отдельным нажатием незачем.
 */
export function MusicPlaylistVisibilityPicker({
  playlistId,
  value,
}: {
  playlistId: string;
  value: MusicPlaylistVisibility;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState(value);
  const [pending, setPending] = useState<MusicPlaylistVisibility | null>(null);
  const [error, setError] = useState<string | null>(null);

  const choose = async (next: MusicPlaylistVisibility) => {
    if (next === current || pending) return;
    setPending(next);
    setError(null);
    // Показываем выбранное сразу: ждать ответа сервера, чтобы подсветить
    // нажатую кнопку, — это полсекунды, в которые кажется, что не нажалось.
    const before = current;
    setCurrent(next);
    try {
      await updatePlaylist(playlistId, { visibility: next });
      // Подпись под названием и список «у друзей» считаются на сервере.
      router.refresh();
    } catch (e) {
      setCurrent(before);
      setError(e instanceof Error ? e.message : "Не удалось изменить доступ");
    } finally {
      setPending(null);
    }
  };

  const hint = OPTIONS.find((item) => item.value === current)?.hint;

  return (
    <div className="flex flex-col gap-1.5">
      <div
        role="group"
        aria-label="Кому виден плейлист"
        className="flex flex-wrap gap-1.5"
      >
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={current === option.value}
            disabled={pending !== null}
            onClick={() => void choose(option.value)}
            className={`h-9 rounded-full border px-3.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
              current === option.value
                ? "border-magenta/50 bg-glass text-text-0"
                : "border-glass-brd text-text-1 hover:text-text-0"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-text-2" aria-live="polite">
        {error ? <span className="text-magenta">{error}</span> : hint}
      </p>
    </div>
  );
}
