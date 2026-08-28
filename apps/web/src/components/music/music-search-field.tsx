/**
 * Поиск по каталогу.
 *
 * Обычная GET-форма, а не поле с обработчиком: запрос обязан оказаться в
 * адресе — иначе найденное некому переслать, а «назад» уводит с сервиса
 * вместо возврата к выдаче. Работает и без JS.
 *
 * Раздел переносится скрытым полем: набрать запрос внутри «Бхаджанов» и
 * получить выдачу по всему каталогу — не то, чего ждёшь.
 */
export function MusicSearchField({
  value,
  category,
}: {
  value: string | null;
  category: string | null;
}) {
  return (
    <form
      action="/music"
      method="get"
      role="search"
      // `flex-1 min-w-0`, а не `w-full`: рядом в той же строке стоит кнопка
      // «Загрузить», и форма шириной в сто процентов выталкивала её за экран
      // на телефоне — страница становилась шире окна на её ширину.
      className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none"
    >
      {category && <input type="hidden" name="category" value={category} />}
      {/* Обводка фокуса переехала на обёртку: у самого поля она снята, и
          без замены это был бы тот самый регресс, о котором предупреждает
          дизайн-система. Кликабельная область — весь label, 40px. */}
      <label className="glass flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl px-3 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-magenta sm:w-64 sm:flex-none">
        <span className="sr-only">Поиск по каталогу</span>
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4 shrink-0 text-text-2"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <input
          type="search"
          name="q"
          defaultValue={value ?? ""}
          placeholder="Название, исполнитель"
          className="h-full min-w-0 flex-1 bg-transparent text-sm text-text-0 placeholder:text-text-2 focus:outline-none"
        />
      </label>
      <button
        type="submit"
        className="btn-mint h-10 shrink-0 rounded-xl px-4 text-sm font-semibold"
      >
        Найти
      </button>
    </form>
  );
}
