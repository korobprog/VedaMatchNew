import { Search } from "lucide-react";

/**
 * Поле поиска по порталу (VED-75): на главной и над выдачей.
 *
 * Обычная форма GET на /search, а не клиентский виджет: работает без
 * JavaScript, адрес выдачи можно переслать, «назад» возвращает к ней. Сам
 * компонент не знает ни одного эндпоинта — выдачу собирает страница поиска.
 */
export function PortalSearchField({
  defaultValue = "",
  autoFocus = false,
  compact = false,
  className = "",
}: {
  defaultValue?: string;
  autoFocus?: boolean;
  /**
   * Поле по ширине надписи, а не на всю строку (VED-89) — так на главной:
   * там оно приглашает искать и не должно спорить с блоками ниже. Над
   * выдачей поле остаётся широким: там правят длинный запрос.
   */
  compact?: boolean;
  className?: string;
}) {
  return (
    <form
      action="/search"
      method="get"
      role="search"
      className={`flex gap-2 ${className}`}
    >
      <label
        className={`relative min-w-0 ${compact ? "w-52 flex-none" : "flex-1"}`}
      >
        <span className="sr-only">Поиск по VedaMatch</span>
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-2"
        />
        <input
          type="search"
          name="q"
          defaultValue={defaultValue}
          autoFocus={autoFocus}
          required
          minLength={2}
          maxLength={120}
          enterKeyHint="search"
          // Только название (VED-89): перечень «лекции, киртаны, объявления»
          // на телефоне всё равно обрывался на полуслове. Что именно ищется,
          // сказано на странице выдачи.
          placeholder="Поиск по VedaMatch"
          className="h-11 w-full rounded-xl border border-glass-brd bg-bg-1 pl-9 pr-3 text-sm text-text-0 placeholder:text-text-2"
        />
      </label>
      <button
        type="submit"
        className="btn-mint h-11 shrink-0 rounded-xl px-4 text-sm font-bold"
      >
        Найти
      </button>
    </form>
  );
}
