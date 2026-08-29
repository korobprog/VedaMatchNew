/**
 * Значок кнопки запуска: треугольник, пауза или вертушка ожидания.
 *
 * Один компонент на все три кнопки — карточку каталога, свёрнутую полосу и
 * развёрнутую. Три копии этих `svg` уже разъезжались по размеру; с
 * появлением третьего состояния они разъехались бы и по смыслу.
 *
 * Вертушка крутится только под `motion-safe`: тому, кто отключил анимации,
 * вращение не показывают, а состояние ему сообщает подпись кнопки —
 * «Загружается». Значок и без вращения остаётся не треугольником и не
 * паузой, то есть отличается от обоих.
 */
export function MusicPlayGlyph({
  state,
  className = "size-3.5",
}: {
  state: "loading" | "playing" | "paused";
  className?: string;
}) {
  if (state === "loading") {
    return (
      <svg
        viewBox="0 0 24 24"
        className={`${className} motion-safe:animate-spin`}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        aria-hidden="true"
      >
        {/* Разомкнутое кольцо: у сплошного вращение незаметно, и человек
            читает его как заливку, а не как ожидание. */}
        <path d="M12 3a9 9 0 1 0 9 9" />
      </svg>
    );
  }

  if (state === "playing") {
    return (
      <svg
        viewBox="0 0 24 24"
        className={className}
        fill="currentColor"
        aria-hidden="true"
      >
        <rect x="6" y="4" width="4" height="16" rx="1" />
        <rect x="14" y="4" width="4" height="16" rx="1" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M7 4l13 8-13 8z" />
    </svg>
  );
}

/** Подпись кнопки. Для скринридера ожидание — это отдельное состояние. */
export function playButtonLabel(
  state: "loading" | "playing" | "paused",
  title?: string,
): string {
  const suffix = title ? `: ${title}` : "";
  if (state === "loading") return `Загружается${suffix}`;
  return state === "playing" ? `Пауза${suffix}` : `Слушать${suffix}`;
}
