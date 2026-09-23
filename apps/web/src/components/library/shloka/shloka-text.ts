import type { LibraryLocale } from "@vedamatch/shared";
import { plural } from "@/lib/plural";

/**
 * Надписи раздела «Шлоки» (VED-386). Отдельным словарём, а не в общем
 * `i18n.ts` Образования: там семь сотен строк, и шлокам в нём тесно.
 */
const text = {
  ru: {
    "section.title": "Шлоки",
    "section.add": "Добавить шлоку",
    "add.modeHint":
      "Стих в разделе-источнике: текст, перевод, пословный перевод, комментарий, изображения и прочтения других ачарьев.",
    "section.search": "Поиск по источнику",
    "section.searchHint": "Номер стиха или слово",
    "section.searchSubmit": "Найти",
    "section.empty": "В этом источнике пока нет шлок. Добавьте первую.",
    "section.nothingFound": "Ничего не нашлось. Попробуйте номер стиха или другое слово.",
    "section.more": "Показать ещё",
    "section.failed": "Не удалось загрузить шлоки. Попробуйте ещё раз.",
    "section.otherMaterials": "Другие материалы раздела",
    "section.noVerse": "б/н",
    "root.hint":
      "Шлоки лежат по источникам: откройте раздел — «Бхагавад-гита», «Шримад-Бхагаватам» — или заведите новый.",
    "root.create": "Создать раздел-источник",
    "root.hide": "Скрыть форму",
    "root.pick": "Выберите источник, в который добавить шлоку:",
    "root.none":
      "Разделов-источников пока нет. Их заводят внутри рубрики «Шлоки» в Образовании.",
    "root.toSection": "Открыть рубрику «Шлоки»",
    "view.mode": "Режим окна шлоки",
    "view.read": "Чтение",
    "view.edit": "Правка",
    "view.prev": "Предыдущая шлока",
    "view.next": "Следующая шлока",
    "view.position": "из",
    "view.verse": "Текст",
    "view.translation": "Перевод",
    "view.wordByWord": "Пословный перевод",
    "view.commentary": "Комментарий",
    "view.images": "Иллюстрации",
    "view.acharyas": "Другие ачарьи",
    "view.source": "Источник",
    "view.keyboardHint": "Листать можно и стрелками ← → на клавиатуре.",
    "view.imageOpen": "Открыть иллюстрацию крупно",
    "view.imageClose": "Закрыть",
    "view.imageAlt": "Иллюстрация к шлоке",
    "view.leaveConfirm": "Изменения не сохранены. Уйти со страницы?",
    "form.createTitle": "Новая шлока",
    "form.source": "Источник",
    "form.sourceHint": "Проставлен по разделу. Поправьте, если нужно уточнить издание или перевод.",
    "form.verse": "Номер стиха",
    "form.verseHint": "Например, 2.13 или 1.2.12 — по нему шлоки встают по порядку.",
    "form.text": "Текст шлоки",
    "form.textHint": "Деванагари, транслитерация или оба — каждой строкой.",
    "form.translation": "Перевод",
    "form.wordByWord": "Пословный перевод",
    "form.commentary": "Комментарий",
    "form.images": "Изображения",
    "form.imagesHint": "JPEG, PNG или WebP до 8 МБ, можно несколько.",
    "form.imagesAdd": "Добавить изображения",
    "form.imageRemove": "Убрать изображение",
    "form.imageRestore": "Вернуть изображение",
    "form.imageNew": "Новое, загрузится при сохранении",
    "form.acharyas": "Другие ачарьи",
    "form.acharyasHint": "Тот же стих в прочтении другого ачарьи: текст, перевод, пословный, комментарий и изображения.",
    "form.acharyaAdd": "Добавить ачарью",
    "form.acharyaName": "Имя ачарьи",
    "form.acharyaRemove": "Убрать блок ачарьи",
    "form.acharyaBlock": "Ачарья",
    "form.required": "обязательно",
    "form.save": "Сохранить",
    "form.publish": "Опубликовать",
    "form.saving": "Сохраняем…",
    "form.cancel": "Отменить",
    "form.saved": "Сохранено",
    "form.imagesFailed":
      "Текст сохранён, но часть изображений не загрузилась. Добавьте их ещё раз в режиме правки.",
    "error.text_required": "Заполните текст шлоки.",
    "error.text_too_long": "Текст шлоки слишком длинный.",
    "error.verse_too_long": "Номер стиха слишком длинный — до 40 знаков.",
    "error.word_by_word_too_long": "Пословный перевод слишком длинный.",
    "error.translation_too_long": "Перевод слишком длинный.",
    "error.commentary_too_long": "Комментарий слишком длинный.",
    "error.source_required": "Укажите источник.",
    "error.source_too_long": "Источник слишком длинный — до 300 знаков.",
    "error.acharya_name_required": "Укажите имя ачарьи в каждом блоке.",
    "error.acharya_empty": "В блоке ачарьи заполните хотя бы одно поле, кроме имени.",
    "error.too_many_acharyas": "Не больше 20 блоков ачарьев.",
    "error.too_many_images": "Не больше 12 изображений на шлоку.",
    "error.category_not_found": "Раздел-источник не найден — возможно, его перенесли.",
    "error.unsupported_image_type": "Это не изображение JPEG, PNG или WebP.",
    "error.image_file_too_large": "Изображение больше 8 МБ.",
    "error.image_upload_unavailable": "Загрузка изображений сейчас недоступна.",
    "error.not_entry_owner": "Править шлоку может автор или администратор.",
    "error.generic": "Не получилось сохранить. Попробуйте ещё раз.",
  },
  en: {
    "section.title": "Shlokas",
    "section.add": "Add a shloka",
    "add.modeHint":
      "A verse in its source section: text, translation, word for word, purport, images and other acharyas' readings.",
    "section.search": "Search this source",
    "section.searchHint": "Verse number or a word",
    "section.searchSubmit": "Search",
    "section.empty": "No shlokas in this source yet. Add the first one.",
    "section.nothingFound": "Nothing found. Try a verse number or another word.",
    "section.more": "Show more",
    "section.failed": "Could not load shlokas. Please try again.",
    "section.otherMaterials": "Other materials in this section",
    "section.noVerse": "n/n",
    "root.hint":
      "Shlokas are grouped by source: open a section — Bhagavad-gita, Srimad-Bhagavatam — or create a new one.",
    "root.create": "Create a source section",
    "root.hide": "Hide the form",
    "root.pick": "Choose the source to add a shloka to:",
    "root.none":
      "There are no source sections yet. They are created inside the Shlokas category.",
    "root.toSection": "Open the Shlokas category",
    "view.mode": "Shloka window mode",
    "view.read": "Read",
    "view.edit": "Edit",
    "view.prev": "Previous shloka",
    "view.next": "Next shloka",
    "view.position": "of",
    "view.verse": "Text",
    "view.translation": "Translation",
    "view.wordByWord": "Word for word",
    "view.commentary": "Purport",
    "view.images": "Illustrations",
    "view.acharyas": "Other acharyas",
    "view.source": "Source",
    "view.keyboardHint": "You can also use the ← → keys.",
    "view.imageOpen": "Open the illustration",
    "view.imageClose": "Close",
    "view.imageAlt": "Illustration to the shloka",
    "view.leaveConfirm": "Changes are not saved. Leave the page?",
    "form.createTitle": "New shloka",
    "form.source": "Source",
    "form.sourceHint": "Filled in from the section. Adjust it to name the edition or translation.",
    "form.verse": "Verse number",
    "form.verseHint": "For example 2.13 or 1.2.12 — shlokas are ordered by it.",
    "form.text": "Shloka text",
    "form.textHint": "Devanagari, transliteration or both — line by line.",
    "form.translation": "Translation",
    "form.wordByWord": "Word for word",
    "form.commentary": "Purport",
    "form.images": "Images",
    "form.imagesHint": "JPEG, PNG or WebP up to 8 MB, several at once.",
    "form.imagesAdd": "Add images",
    "form.imageRemove": "Remove image",
    "form.imageRestore": "Restore image",
    "form.imageNew": "New, uploads on save",
    "form.acharyas": "Other acharyas",
    "form.acharyasHint": "The same verse as read by another acharya: text, translation, word for word, purport and images.",
    "form.acharyaAdd": "Add an acharya",
    "form.acharyaName": "Acharya's name",
    "form.acharyaRemove": "Remove the acharya block",
    "form.acharyaBlock": "Acharya",
    "form.required": "required",
    "form.save": "Save",
    "form.publish": "Publish",
    "form.saving": "Saving…",
    "form.cancel": "Cancel",
    "form.saved": "Saved",
    "form.imagesFailed":
      "The text is saved, but some images failed to upload. Add them again in edit mode.",
    "error.text_required": "Fill in the shloka text.",
    "error.text_too_long": "The shloka text is too long.",
    "error.verse_too_long": "The verse number is too long — up to 40 characters.",
    "error.word_by_word_too_long": "The word-for-word is too long.",
    "error.translation_too_long": "The translation is too long.",
    "error.commentary_too_long": "The purport is too long.",
    "error.source_required": "Name the source.",
    "error.source_too_long": "The source is too long — up to 300 characters.",
    "error.acharya_name_required": "Name the acharya in every block.",
    "error.acharya_empty": "Fill in at least one field besides the name in each acharya block.",
    "error.too_many_acharyas": "No more than 20 acharya blocks.",
    "error.too_many_images": "No more than 12 images per shloka.",
    "error.category_not_found": "The source section was not found — it may have been moved.",
    "error.unsupported_image_type": "This is not a JPEG, PNG or WebP image.",
    "error.image_file_too_large": "The image is larger than 8 MB.",
    "error.image_upload_unavailable": "Image upload is unavailable right now.",
    "error.not_entry_owner": "Only the author or an administrator can edit this shloka.",
    "error.generic": "Could not save. Please try again.",
  },
} as const;

export type ShlokaTextKey = keyof (typeof text)["ru"];

export function st(locale: LibraryLocale, key: ShlokaTextKey): string {
  return text[locale][key] ?? text.ru[key];
}

/**
 * Текст ошибки по коду сервера. Коды блоков ачарьев приходят с приставкой
 * (`acharya_commentary_too_long`) — для них годится та же фраза, что и для
 * поля самой шлоки.
 */
export function shlokaErrorText(locale: LibraryLocale, code: unknown): string {
  if (typeof code === "string") {
    const direct = `error.${code}` as ShlokaTextKey;
    if (direct in text.ru) return st(locale, direct);
    const bare = `error.${code.replace(/^acharya_/, "")}` as ShlokaTextKey;
    if (bare in text.ru) return st(locale, bare);
  }
  return st(locale, "error.generic");
}

export function shlokaCount(locale: LibraryLocale, count: number): string {
  return locale === "ru"
    ? `${count} ${plural(count, "шлока", "шлоки", "шлок")}`
    : `${count} shloka${count === 1 ? "" : "s"}`;
}
