import type { MusicTrackLyricsDto } from "@vedamatch/shared";

/**
 * Текст бхаджана: оригинал, перевод, транслитерация.
 *
 * Раньше три поля рисовались колонками рядом (на широком экране) — это и
 * была жалоба VED-248: «перевод» уезжал в свою колонку сбоку, и его читали
 * отдельно от самого текста, не строка за строкой, а целым блоком где-то
 * сбоку или, на телефоне, ниже длинной портянки транслитерации. Теперь —
 * одно окно, блоки подряд сверху вниз, независимо от ширины экрана: текст
 * сразу же продолжается переводом, а транслитерация (нужна реже — спеть,
 * а не понять) идёт последней.
 *
 * `whitespace-pre-line`: перенос строк в бхаджане — это разметка, а не
 * оформление, и склеивать её в абзац нельзя.
 *
 * Компонент встречается на двух экранах разом: на странице записи и — при
 * прослушивании этой же записи — во всплывающей панели плеера (плеер не
 * размонтируется при переходе на страницу трека). `headingId` держит
 * заголовок с уникальным `id` в каждом месте: одинаковый `id="music-lyrics"`
 * в обоих экземплярах разом дал бы дублирующийся `id` в DOM и непредсказуемое
 * поведение `aria-labelledby`. `compact` убирает верхний отступ, рассчитанный
 * на страницу записи, — в узкой панели он лишний.
 */
export function MusicTrackLyrics({
  lyrics,
  headingId = "music-lyrics",
  compact = false,
}: {
  lyrics: MusicTrackLyricsDto;
  headingId?: string;
  compact?: boolean;
}) {
  // Перевод — сразу за текстом: их читают вместе, строка за строкой.
  // Транслитерация — нужна реже (спеть, а не понять) и идёт последней.
  const blocks = [
    { key: "lyrics", label: "Текст", value: lyrics.lyrics },
    { key: "translation", label: "Перевод", value: lyrics.translation },
    {
      key: "transliteration",
      label: "Транслитерация",
      value: lyrics.transliteration,
    },
  ].filter((block) => block.value);

  if (blocks.length === 0) return null;

  return (
    <section className={compact ? undefined : "mt-10"} aria-labelledby={headingId}>
      <h2
        id={headingId}
        className="font-display text-base font-bold text-text-0"
      >
        Текст
      </h2>

      {/* Одно окно, а не колонки (VED-248): блоки идут подряд сверху вниз
          на любой ширине экрана, а не рядом друг с другом на широких. */}
      <div className="mt-4 flex max-w-prose flex-col gap-6">
        {blocks.map((block) => (
          <div key={block.key} className="flex flex-col gap-1.5">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-2">
              {block.label}
            </h3>
            <p className="whitespace-pre-line text-sm leading-relaxed text-text-1">
              {block.value}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
