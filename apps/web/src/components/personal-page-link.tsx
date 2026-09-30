import Link from "next/link";
import { BookUser } from "lucide-react";

/**
 * Вход на личную страницу участника (VED-685, VED-686): кнопка-надпись и
 * пояснение, что там. Пока личная страница — это блог автора
 * (`/blog/authors/<id>`), разделы «о себе», материалы и альбом добавятся
 * туда же, адрес кнопки не поменяется.
 */
export function PersonalPageLink({
  userId,
  own = false,
}: {
  userId: string;
  /** Своя страница — «Личная страница … о себе», чужая — «Страница участника». */
  own?: boolean;
}) {
  return (
    <Link
      href={`/blog/authors/${encodeURIComponent(userId)}`}
      className="glass inline-flex min-h-11 items-center gap-3 rounded-2xl border border-glass-brd px-4 py-2 text-left hover:border-cyan/60"
    >
      <BookUser aria-hidden className="size-5 shrink-0 text-cyan" />
      <span className="flex flex-col">
        <span className="text-sm font-semibold text-text-0">
          {own ? "Личная страница" : "Страница участника"}
        </span>
        <span className="text-xs text-text-1">
          {own
            ? "Блог-лента, материалы, информация о себе"
            : "Блог-лента, материалы, информация о личности"}
        </span>
      </span>
    </Link>
  );
}
