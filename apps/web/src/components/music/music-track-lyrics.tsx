import type { MusicTrackLyricsDto } from "@vedamatch/shared";

/**
 * Текст бхаджана: оригинал, транслитерация, перевод.
 *
 * Колонки в модели были с первой миграции, админ их пишет, сервер отдаёт — и
 * никто не рисовал. Формально это этап 9, но там речь про синхронный по
 * времени текст, а показать уже введённое стоит одного блока.
 *
 * Тремя колонками, а не вкладками: смысл в том, чтобы читать строку и тут же
 * видеть, как она произносится и что означает. Вкладки заставляют переключаться
 * на каждой строке. На узком экране колонки складываются в столбик — там
 * переключаться всё равно нечем.
 *
 * `whitespace-pre-line`: перенос строк в бхаджане — это разметка, а не
 * оформление, и склеивать её в абзац нельзя.
 */
export function MusicTrackLyrics({ lyrics }: { lyrics: MusicTrackLyricsDto }) {
  const columns = [
    { key: "lyrics", label: "Текст", value: lyrics.lyrics },
    {
      key: "transliteration",
      label: "Транслитерация",
      value: lyrics.transliteration,
    },
    { key: "translation", label: "Перевод", value: lyrics.translation },
  ].filter((column) => column.value);

  if (columns.length === 0) return null;

  return (
    <section className="mt-10" aria-labelledby="music-lyrics">
      <h2
        id="music-lyrics"
        className="font-display text-base font-bold text-text-0"
      >
        Текст
      </h2>

      <div
        className={`mt-4 grid gap-6 ${
          columns.length === 1
            ? "max-w-prose"
            : columns.length === 2
              ? "sm:grid-cols-2"
              : "sm:grid-cols-2 lg:grid-cols-3"
        }`}
      >
        {columns.map((column) => (
          <div key={column.key} className="flex flex-col gap-1.5">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-2">
              {column.label}
            </h3>
            <p className="whitespace-pre-line text-sm leading-relaxed text-text-1">
              {column.value}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
