/**
 * Поиск по каталогу.
 *
 * Обычная GET-форма, а не поле с обработчиком: запрос обязан оказаться в
 * адресе — иначе найденное некому переслать, а «назад» уводит с сервиса
 * вместо возврата к выдаче. Работает и без JS.
 *
 * Раздел и корневая категория переносятся скрытыми полями (VED-165): набрать
 * запрос внутри «Традиционного» и «Мантры» и получить выдачу по всему
 * каталогу — не то, чего ждёшь.
 *
 * Кнопка «Найти» — внутри поля и видна, только пока в поле ставят курсор или
 * в нём уже что-то набрано (VED-516): отдельной кнопкой она съедала ширину,
 * и подсказка «Название, исполнитель» обрезалась. Без JS: `focus-within`
 * и `:has(:not(:placeholder-shown))`. Набранный текст держит кнопку на
 * виду и после потери фокуса — Safari снимает фокус с поля раньше, чем
 * засчитает нажатие, и кнопка, пропадающая с фокусом, не нажималась бы.
 */
export function MusicSearchField({
  value,
  root,
  category,
}: {
  value: string | null;
  root: string | null;
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
      className="flex min-w-0 flex-1 sm:flex-none"
    >
      {root && <input type="hidden" name="root" value={root} />}
      {category && <input type="hidden" name="category" value={category} />}
      {/* Обводка фокуса переехала на обёртку: у самого поля она снята, и
          без замены это был бы тот самый регресс, о котором предупреждает
          дизайн-система. Кликабельная область — весь label, 40px. */}
      <div className="glass group flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl pl-3 pr-1 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-magenta sm:w-72 sm:flex-none">
        <label className="flex h-full min-w-0 flex-1 items-center gap-2">
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
            className="h-full min-w-0 flex-1 bg-transparent text-sm text-text-0 placeholder:text-text-2"
            // Обводка — у всей рамки поля (`focus-within` выше). Глобальное
            // `*:focus-visible` в globals.css стоит вне слоёв и перебивает
            // утилиту `outline-none`, поэтому сняли его здесь: иначе поле
            // обводилось дважды — рамкой и отдельно вокруг текста.
            style={{ outline: "none" }}
          />
        </label>
        <button
          type="submit"
          className="btn-mint hidden h-8 shrink-0 items-center rounded-lg px-3 text-sm font-semibold group-focus-within:flex group-has-[input:not(:placeholder-shown)]:flex"
        >
          Найти
        </button>
      </div>
    </form>
  );
}
