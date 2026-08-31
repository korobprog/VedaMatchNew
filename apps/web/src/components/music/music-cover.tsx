import type { CSSProperties } from "react";

/**
 * Обложка записи, альбома или подборки.
 *
 * Настоящих файлов в каталоге пока нет, и заглушка здесь не временная
 * затычка, а рабочее состояние: у отдельного киртана, вырезанного из
 * программы, своей обложки обычно не будет никогда. Поэтому пустая плитка —
 * не серый прямоугольник, а узнаваемый градиент, постоянный для конкретной
 * записи: сетка каталога должна оставаться различимой глазом даже целиком
 * без картинок.
 *
 * Градиенты собраны из токенов через `color-mix`, а не из хардкода: иначе на
 * светлой теме они остались бы от тёмной.
 */
const COVER_TONES = [
  ["--vm-violet", "--vm-magenta"],
  ["--vm-cyan", "--vm-blue"],
  ["--vm-magenta", "--vm-violet"],
  ["--vm-gold", "--vm-magenta"],
  ["--vm-blue", "--vm-violet"],
  ["--vm-cyan", "--vm-violet"],
] as const;

/**
 * Тон по идентификатору, а не по индексу в списке: при фильтрации и
 * пагинации порядок меняется, и запись, перекрашивающаяся при каждом клике
 * по чипу, читается как другая запись.
 */
function toneFor(seed: string): (typeof COVER_TONES)[number] {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 100_000;
  }
  return COVER_TONES[hash % COVER_TONES.length];
}

function placeholderStyle(seed: string): CSSProperties {
  const [from, to] = toneFor(seed);
  return {
    backgroundImage: `linear-gradient(140deg,
      color-mix(in srgb, var(${from}) 38%, var(--vm-bg-1)) 0%,
      color-mix(in srgb, var(${to}) 30%, var(--vm-bg-1)) 55%,
      var(--vm-bg-1) 100%)`,
  };
}

export function MusicCover({
  url,
  seed,
  alt,
  className = "",
  rounded = "rounded-2xl",
  fill = true,
}: {
  url: string | null;
  /** Постоянный ключ записи — обычно её id. */
  seed: string;
  alt: string;
  className?: string;
  rounded?: string;
  /**
   * Растянуть обложку по родителю. Так устроено большинство мест: плитку
   * размечает сетка, а обложка её заполняет.
   *
   * Когда размер задаёт сам вызывающий (`size-8` в списке плейлистов),
   * `fill` надо снять. Иначе `w-full` из этого файла и `size-8` из вызова
   * оказываются в одной группе утилит, и кто победит — решает порядок в
   * собранном CSS, а не порядок в атрибуте: обложка растягивалась на всю
   * ширину карточки и выдавливала название со счётчиком за её границу.
   */
  fill?: boolean;
}) {
  const size = fill ? "h-full w-full" : "";
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- обложка в нашем S3
      <img
        src={url}
        alt={alt}
        loading="lazy"
        className={`${size} object-cover ${rounded} ${className}`}
      />
    );
  }

  return (
    <div
      // Заглушка декоративна: название записи стоит рядом, и дублировать его
      // для скринридера значит читать одно и то же дважды.
      aria-hidden="true"
      style={placeholderStyle(seed)}
      className={`flex ${size} items-center justify-center ${rounded} ${className}`}
    >
      <svg
        viewBox="0 0 28 28"
        className="h-1/3 w-1/3 max-h-12 max-w-12"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M9 3.5h10L24 14l-5 10.5H9L4 14z"
          stroke="currentColor"
          strokeWidth="1.1"
          strokeLinejoin="round"
          className="text-text-2 opacity-50"
        />
        <path
          d="M11.5 18.5v-8l6-1v7.5"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-text-1"
        />
      </svg>
    </div>
  );
}
