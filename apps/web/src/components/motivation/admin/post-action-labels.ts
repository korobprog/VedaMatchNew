import type { MotivationAdminCandidateDto } from "@vedamatch/shared";

/**
 * Подписи к кнопкам карточки редакции — отдельным модулем, без React.
 *
 * Зачем вообще подписи (VED-251). Кнопки карточки свели к сетке квадратов
 * со значками (VED-199), а слова спрятали в `aria-label` и `title`. Мышь
 * всплывающую подсказку показывает, палец — нет: на телефоне `title` не
 * появляется никогда. Редакция нажала перечёркнутый глаз, не зная, что он
 * делает, афоризм ушёл из ленты, и вопрос «что это за кнопка» задали уже
 * после нажатия. Значок без слова — загадка, а не кнопка, поэтому у каждой
 * клетки теперь есть видимая подпись.
 *
 * Три строки, а не одна: под значком помещается одно слово (`caption`),
 * скринридеру нужна фраза (`label`), а всплывающей подсказке иногда идёт
 * пояснение подлиннее (`hint`). Собираются они здесь вместе, чтобы не
 * разойтись: подпись, которая говорит не то же, что `aria-label`, хуже
 * отсутствующей — глазами читают одно, голосом слышат другое.
 */
export type ActionLabel = {
  /** Полная фраза: `aria-label` кнопки. */
  label: string;
  /** Видимая подпись под значком: одно слово, не длиннее `CAPTION_MAX`. */
  caption: string;
  /** Подсказка `title`, когда ей есть что добавить к `label`. */
  hint?: string;
};

/**
 * Предел длины видимой подписи.
 *
 * Клетка сетки на телефоне (375px, три колонки во всю ширину карточки) —
 * около 92px. При 12px это примерно дюжина знаков в строку. Что длиннее —
 * рвёт сетку или обрезается многоточием, то есть снова становится загадкой.
 */
export const CAPTION_MAX = 12;

/**
 * «Открыть в ленте» — посмотреть афоризм глазами читателя. Та самая вторая
 * кнопка из VED-251, про которую спросили «она просто выносит нас обратно в
 * ленту»: да, именно это она и делает, и теперь так и подписана.
 *
 * У скрытой карточки адреса нет вовсе: публичная лента ищет пост по слагу
 * только среди опубликованных, и ссылка вела бы в тупик. Кнопка на своём
 * месте остаётся, но неактивной, и говорит, что сделать сначала.
 *
 * `returning` — карточка, ради которой пришли из ленты: адрес тот же, но
 * подписан возвращением, а не открытием.
 */
export function feedActionLabel(
  hidden: boolean,
  returning: boolean,
): ActionLabel {
  if (hidden)
    return { label: "Скрыто — сначала верните в ленту", caption: "В ленту" };
  return returning
    ? { label: "Вернуться в ленту", caption: "В ленту" }
    : { label: "Открыть в ленте", caption: "В ленте" };
}

/**
 * Перечёркнутый глаз — та самая кнопка из VED-251.
 *
 * Полная фраза говорит про ленту, а не просто «скрыть»: скрыть можно и
 * текст на картинке, и карточку в списке, а тут — убрать афоризм из общей
 * ленты. Второе нажатие возвращает, и подпись у обратного действия
 * зеркальная: отмену ищут там же, где нажали.
 */
export function hideActionLabel(hidden: boolean): ActionLabel {
  return hidden
    ? { label: "Вернуть в ленту", caption: "Вернуть" }
    : { label: "Скрыть из ленты", caption: "Скрыть" };
}

export function editActionLabel(editing: boolean): ActionLabel {
  return editing
    ? { label: "Не править", caption: "Не править" }
    : { label: "Править текст", caption: "Править" };
}

export function readActionLabel(reading: boolean): ActionLabel {
  return reading
    ? { label: "Свернуть текст", caption: "Свернуть" }
    : { label: "Читать полностью", caption: "Читать" };
}

export function uploadActionLabel(pending: boolean): ActionLabel {
  return pending
    ? { label: "Загружаем картинку…", caption: "Загружаем…" }
    : { label: "Заменить картинку", caption: "Заменить" };
}

export const deleteActionLabel: ActionLabel = {
  label: "Удалить",
  caption: "Удалить",
};

export const searchActionLabel: ActionLabel = {
  label: "Поиск",
  caption: "Поиск",
  hint: "Поиск по цитате или автору",
};

export const hiddenTabActionLabel: ActionLabel = {
  label: "Скрытые",
  caption: "Скрытые",
  hint: "Все скрытые афоризмы",
};

/** Что показать в `title`: пояснение, если оно есть, иначе сама фраза. */
export function titleOf(action: ActionLabel): string {
  return action.hint ?? action.label;
}

/**
 * Что сказать сразу после нажатия на перечёркнутый глаз.
 *
 * Подсказка висит под карточкой, пока с ней не сделают что-то ещё, и
 * называет оба пути назад: ту же кнопку рядом и вкладку «Скрытые», где
 * лежит весь список снятого с показа. Возврат в ленту подсказку снимает —
 * отменять уже нечего.
 */
export function hideNoticeText(hidden: boolean): string | null {
  if (!hidden) return null;
  return "Афоризм убран из ленты — читатели его больше не видят. Вернуть можно этой же кнопкой или на вкладке «Скрытые».";
}

/**
 * Все подписи карточки разом — чтобы тест прошёлся по каждой, а не по тем,
 * о которых вспомнил автор теста.
 */
export function allActionLabels(
  post: Pick<MotivationAdminCandidateDto, "status">,
): ActionLabel[] {
  const hidden = post.status === "hidden";
  return [
    feedActionLabel(hidden, false),
    feedActionLabel(hidden, true),
    hideActionLabel(hidden),
    editActionLabel(false),
    editActionLabel(true),
    readActionLabel(false),
    readActionLabel(true),
    uploadActionLabel(false),
    uploadActionLabel(true),
    deleteActionLabel,
    searchActionLabel,
    hiddenTabActionLabel,
  ];
}
