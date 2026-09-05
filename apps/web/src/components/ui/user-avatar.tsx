/**
 * Аватар участника — один на весь портал.
 *
 * До него каждое место рисовало свой `<img>`, и они разошлись двумя способами.
 * Часть забывала `object-cover`: непрямоугольное фото растягивалось в
 * квадратной рамке — то самое «расплющенное фото». Часть забывала
 * `referrer-policy`, а Google отдаёт фотографию профиля только без заголовка
 * `Referer` — отсюда «где-то видно, где-то нет».
 *
 * Оба правила теперь живут в одном месте. Заглушка тоже: буква имени на
 * стекле, а не пустой прямоугольник и не битая картинка.
 */
export function UserAvatar({
  name,
  avatarUrl,
  size = 40,
  rounded = "rounded-full",
  className = "",
}: {
  /** Имя — из него берётся буква заглушки; в `alt` не идёт (см. ниже). */
  name: string;
  avatarUrl: string | null | undefined;
  /** Сторона в пикселях: аватар всегда квадратный. */
  size?: number;
  rounded?: string;
  className?: string;
}) {
  const box = { width: size, height: size };
  const letter = name.trim().charAt(0).toUpperCase() || "?";

  if (avatarUrl)
    return (
      // Ссылка подписана и живёт минуты — next/image не годится для
      // произвольно меняющегося домена подписи.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        // Пустая: имя человека всегда стоит рядом текстом, и второе прочтение
        // подряд скринридеру не нужно.
        alt=""
        style={box}
        // Без него Google отдаёт 403 на фотографию профиля.
        referrerPolicy="no-referrer"
        className={`shrink-0 object-cover ${rounded} ${className}`}
      />
    );

  return (
    <span
      style={{ ...box, fontSize: Math.round(size * 0.4) }}
      aria-hidden
      className={`flex shrink-0 items-center justify-center bg-glass font-semibold text-text-0 ${rounded} ${className}`}
    >
      {letter}
    </span>
  );
}
