import type { LibraryEntryType, LibraryLocale } from "@vedamatch/shared";
import { plural } from "@/lib/plural";
import { categoryCounter } from "./category-tree";

const ui = {
  ru: {
    "service.title": "Образование",
    "service.subtitle":
      "Общая база полезных материалов: пополняйте её и находите нужное быстрее",
    "nav.sections": "Рубрики",
    "nav.add": "Создать пост",
    "nav.back": "Назад",
    "filters.title": "Фильтры",
    "filters.section": "Рубрика",
    "filters.category": "Категория",
    "filters.type": "Тип материала",
    "filters.language": "Язык материала",
    "filters.community": "Организация",
    "filters.anyCommunity": "Любая",
    "filters.sort": "Сортировка",
    "filters.search": "Поиск",
    "filters.reset": "Сбросить",
    "filters.all": "Все",
    "sort.new": "Новое",
    "sort.actual": "Актуальное",
    "sort.popular": "Популярное",
    "feed.empty": "Пока ничего не добавлено",
    "feed.more": "Показать ещё",
    "feed.loading": "Загружаем…",
    "entry.open": "Открыть",
    "entry.addedBy": "Добавил",
    "entry.categories": "Категории",
    "entry.useful": "Полезно",
    "entry.clicks": "Переходов",
    "entry.notFound": "Ссылка не найдена",
    "add.title": "Добавить ссылку",
    "add.url": "Адрес ссылки",
    "add.type": "Тип материала",
    "add.language": "Язык материала",
    "add.titleRu": "Заголовок по-русски",
    "add.titleEn": "Заголовок по-английски",
    "add.descriptionRu": "Описание по-русски",
    "add.descriptionEn": "Описание по-английски",
    "add.categories": "Категории",
    "add.submit": "Добавить",
    "add.titleRequired": "Заполните заголовок хотя бы на одном языке",
    "add.categoryRequired": "Выберите хотя бы одну категорию",
    "add.duplicate": "Такая ссылка уже есть в библиотеке",
    "add.duplicateOpen": "Открыть существующую запись",
    "add.unsupportedUrl": "Ссылка должна начинаться с http:// или https://",
    "add.urlTooLong": "Адрес ссылки слишком длинный",
    "add.titleTooLong": "Заголовок длиннее 200 символов",
    "add.descriptionTooLong": "Описание длиннее 1000 символов",
    "add.tooManyCategories": "Можно выбрать не больше 5 категорий",
    "add.unsupportedType": "Выберите другой тип материала",
    "add.categoryNotFound": "Одна из категорий больше недоступна",
    "add.rateLimited": "Слишком много добавлений подряд, попробуйте позже",
    "add.section": "Раздел",
    "add.categoryNew": "Новая категория",
    "add.categoryCancel": "Отмена",
    "add.categoryCreated": "Категория создана и выбрана",
    "add.failed": "Не удалось добавить ссылку, попробуйте позже",
    "add.modeTitle": "Как заполним карточку?",
    "add.modeSimple": "Простой",
    "add.modeSimpleHint":
      "Четыре коротких шага с подсказками — знать заранее ничего не нужно",
    "add.modeSimpleAction": "Пройти по шагам",
    "add.modePro": "Профи",
    "add.modeProHint":
      "Все поля одной формой: быстрее, когда уже понятно, что заполнять",
    "add.modeProAction": "Открыть полную форму",
    "add.step": "Шаг",
    "add.stepOf": "из",
    "add.next": "Далее",
    "add.prev": "Назад",
    "add.stepUrl": "Ссылка",
    "add.stepAbout": "Название и тип",
    "add.stepPlace": "Раздел и категории",
    "add.stepReview": "Проверка",
    "add.stepUrlHint": "Адрес страницы — сайта, статьи, видео или книги",
    "add.stepAboutHint":
      "Название увидят в списке, тип помогает отфильтровать выдачу",
    "add.stepPlaceHint": "Раздел — это полка, категорий можно выбрать до пяти",
    "add.stepReviewHint": "Всё верно? Описание заполнять не обязательно",
    "add.optional": "не обязательно",
    "add.proWhy": "Зачем заполнять подробно",
    "add.proWhyTitles":
      "Название на двух языках открывает материал англоязычным читателям",
    "add.proWhyDescription":
      "Описание попадает в поиск — карточку находят по смыслу, а не только по названию",
    "add.proWhyCategories":
      "Несколько категорий — материал попадает сразу в несколько подборок",
    "add.hintUrl": "Полный адрес вместе с https://",
    "add.hintTitle": "Коротко и по делу — так, как назвали бы полку",
    "add.hintDescription": "Пара предложений: о чём материал и кому пригодится",
    "add.stepWhat": "Что добавляем",
    "add.stepWhatHint":
      "Тип задаёт, что спросим дальше: видео нужен адрес, книге — источник",
    "add.stepWhere": "Где найти и как называется",
    "add.stepWhereHint":
      "Материал в сети — дайте ссылку; из книги — укажите источник",
    "entry.openCategory": "Где опубликовано",
    "entry.addMore": "Добавить ещё материал",
    "add.cover": "Обложка",
    "add.coverHint":
      "У материала без ссылки картинку взять неоткуда — можно загрузить свою",
    "add.coverChosen": "Выбрано",
    "add.sectionRequest": "Попросить раздел",
    "add.sectionRequestHint":
      "Разделы заводит администрация — опишите, какой нужен, и мы рассмотрим",
    "add.sectionRequestReason": "Зачем он нужен",
    "add.sectionRequestReasonHint":
      "Пара слов: какие материалы туда пойдут и почему не подходят имеющиеся",
    "add.sectionRequestSubmit": "Отправить заявку",
    "add.sectionRequestSent":
      "Заявка отправлена — о решении сообщим уведомлением",
    "add.sectionRequestTitles": "Нужны оба названия — русское и английское",
    "add.sectionNew": "Новый раздел",
    "add.sectionCreated": "Раздел создан и выбран",
    "add.noCategoryFits": "Ничего не подходит?",
    "add.locatorLegend": "Как указать материал",
    "add.locatorUrl": "Есть ссылка",
    "add.locatorSource": "Только источник",
    "add.source": "Источник",
    "add.hintSource":
      "Откуда материал: «Бхагавад-гита 9.22, комментарий Прабхупады»",
    "add.sourceRequired": "Укажите источник или переключитесь на ссылку",
    "add.sourceTooLong": "Источник длиннее 300 символов",
    "entry.preview": "Обложка материала",
    "entry.play": "Смотреть здесь",
    "entry.watchOn": "Смотреть на",
    "bookmark.add": "В избранное",
    "bookmark.remove": "В избранном",
    "bookmark.title": "Избранное",
    "bookmark.empty": "В избранном пока пусто",
    "comments.title": "Комментарии",
    "comments.empty": "Комментариев пока нет — напишите первым",
    "comments.add": "Ваш комментарий",
    "comments.submit": "Отправить",
    "comments.delete": "Удалить комментарий",
    "comments.gone": "Пользователь удалён",
    "comments.tooLong": "Комментарий длиннее 2000 символов",
    "comments.rateLimited": "Слишком много комментариев подряд, попробуйте позже",
    "comments.failed": "Не удалось отправить комментарий, попробуйте позже",
    "category.create": "Создать категорию",
    "category.titleRu": "Название по-русски",
    "category.titleEn": "Название по-английски",
    "category.similar": "Похожие категории уже есть",
    "category.similarHint":
      "Проверьте список: возможно, нужная категория уже создана",
    "category.forceCreate": "Всё равно создать новую",
    "add.community": "От чьего имени",
    "add.communitySelf": "От себя",
    "add.communityHint":
      "Автором всё равно останетесь вы — община только подписывает материал",
    "add.lineage": "Духовная линия материала",
    "add.lineageAll": "Для всех линий",
    "add.lineageHint":
      "Преданные видят материалы своей линии и «для всех». По умолчанию — ваша линия либо ISKCON",
    "lineage.all": "Все линии",
    "lineage.badgeAll": "Для всех линий",
    "feed.emptyLineage":
      "Для вашей линии здесь пока ничего нет. Материалы других линий скрыты",
    "feed.showAllLineages": "Показать материалы всех линий",
    "category.empty": "В этом разделе ещё нет категорий",
    "category.entries": "материалов",
    // Подпись у числа рядом с рубрикой. Без неё «4» одинаково читается и как
    // четыре подраздела, и как четыре материала.
    "count.children": "Подразделов внутри",
    "count.entries": "Материалов",
    "locale.switch": "Язык интерфейса",
    "entry.edit": "Редактировать",
    "entry.save": "Сохранить",
    "entry.cancel": "Отмена",
    "entry.customPreview": "своя обложка",
    "entry.uploadPreview": "Загрузить обложку",
    "entry.previewUploading": "Загружаем…",
    "entry.previewUnsupportedType": "Подойдут jpg, png или webp",
    "entry.previewTooLarge": "Картинка тяжелее 5 МБ",
    "entry.previewUploadUnavailable": "Загрузка обложек сейчас недоступна",
    "entry.previewUploadFailed": "Не удалось загрузить обложку, попробуйте позже",
    "entry.updateFailed": "Не удалось сохранить изменения, попробуйте позже",
    "entry.updated": "Изменения сохранены",
    "entry.urlHint":
      "Смена адреса сбрасывает то, что портал вычитал по прежней ссылке: заголовок источника, фавиконку и обложку",
    "entry.urlRequired":
      "У материала без источника адрес убрать нельзя",
    "entry.delete": "Удалить",
    "entry.deleteConfirm": "Удалить ссылку из библиотеки?",
    "entry.deleteConfirmYes": "Да, удалить",
    "entry.deleting": "Удаляем…",
    "entry.deleteFailed": "Не удалось удалить ссылку, попробуйте позже",
    "category.edit": "Редактировать категорию",
    "category.saved": "Категория обновлена",
    "category.delete": "Удалить рубрику",
    "category.deleteConfirm": "Удалить рубрику? Отменить нельзя.",
    "category.deleteConfirmYes": "Да, удалить",
    "category.deleting": "Удаляем…",
    "category.deleteHasChildren":
      "Внутри ещё есть вложенные рубрики — сначала перенесите или удалите их",
    "category.deleteNotEmpty":
      "В рубрике ещё есть материалы — сначала перенесите или удалите их",
    "category.deleteFailed": "Не удалось удалить рубрику, попробуйте позже",
    "category.deleteDone": "Рубрика удалена",
    "order.label": "Порядок рубрик",
    "order.own": "Свой порядок",
    "order.alpha": "По алфавиту",
    "order.new": "Сначала новые",
    "tree.organize": "Упорядочить",
    "tree.done": "Готово",
    "tree.hint":
      "Тяните вверх-вниз, чтобы переставить, и вправо-влево, чтобы вложить или вынести",
    "tree.keyboardHint":
      "С клавиатуры: Ctrl+↑ и Ctrl+↓ переставляют, Ctrl+→ вкладывает, Ctrl+← выносит",
    "tree.drag": "Переместить рубрику",
    "tree.moveTo": "Переместить в…",
    "tree.moveToRoot": "На верхний уровень",
    "tree.moveDone": "Рубрика перемещена",
    "tree.moveUndo": "Отменить",
    "tree.moveFailed": "Не удалось переместить рубрику",
    "tree.moveCycle": "Рубрику нельзя вложить в саму себя",
    "tree.moveTooDeep": "Глубже трёх уровней вкладывать нельзя",
    "tree.expand": "Развернуть",
    "tree.collapse": "Свернуть",
    "tree.empty": "Рубрик пока нет",
    "tree.subtreeCount": "с вложенными",
    "nav.withDescendants": "Со вложенными",
    "nav.onlyHere": "Только здесь",
    "nav.breadcrumbRoot": "Все рубрики",
  },
  en: {
    "service.title": "Education",
    "service.subtitle":
      "A shared base of useful materials: contribute and find things faster",
    "nav.sections": "Categories",
    "nav.add": "Create a post",
    "nav.back": "Back",
    "filters.title": "Filters",
    "filters.section": "Category",
    "filters.category": "Category",
    "filters.type": "Material type",
    "filters.language": "Material language",
    "filters.community": "Organisation",
    "filters.anyCommunity": "Any",
    "filters.sort": "Sorting",
    "filters.search": "Search",
    "filters.reset": "Reset",
    "filters.all": "All",
    "sort.new": "Newest",
    "sort.actual": "Trending",
    "sort.popular": "Popular",
    "feed.empty": "Nothing here yet",
    "feed.more": "Show more",
    "feed.loading": "Loading…",
    "entry.open": "Open",
    "entry.addedBy": "Added by",
    "entry.categories": "Categories",
    "entry.useful": "Useful",
    "entry.clicks": "Clicks",
    "entry.notFound": "Link not found",
    "add.title": "Add a link",
    "add.url": "Link address",
    "add.type": "Material type",
    "add.language": "Material language",
    "add.titleRu": "Russian title",
    "add.titleEn": "English title",
    "add.descriptionRu": "Russian description",
    "add.descriptionEn": "English description",
    "add.categories": "Categories",
    "add.submit": "Add",
    "add.titleRequired": "Fill in the title in at least one language",
    "add.categoryRequired": "Pick at least one category",
    "add.duplicate": "This link is already in the library",
    "add.duplicateOpen": "Open the existing entry",
    "add.unsupportedUrl": "The link must start with http:// or https://",
    "add.urlTooLong": "The link address is too long",
    "add.titleTooLong": "The title is longer than 200 characters",
    "add.descriptionTooLong": "The description is longer than 1000 characters",
    "add.tooManyCategories": "Pick no more than 5 categories",
    "add.unsupportedType": "Pick another material type",
    "add.categoryNotFound": "One of the categories is no longer available",
    "add.rateLimited": "Too many additions in a row, please try again later",
    "add.section": "Section",
    "add.categoryNew": "New category",
    "add.categoryCancel": "Cancel",
    "add.categoryCreated": "The category is created and selected",
    "add.failed": "Could not add the link, please try again later",
    "add.modeTitle": "How would you like to fill this in?",
    "add.modeSimple": "Simple",
    "add.modeSimpleHint":
      "Four short steps with hints — no prior knowledge needed",
    "add.modeSimpleAction": "Go step by step",
    "add.modePro": "Pro",
    "add.modeProHint":
      "Every field in one form: faster when you already know what to fill in",
    "add.modeProAction": "Open the full form",
    "add.step": "Step",
    "add.stepOf": "of",
    "add.next": "Next",
    "add.prev": "Back",
    "add.stepUrl": "Link",
    "add.stepAbout": "Title and type",
    "add.stepPlace": "Section and categories",
    "add.stepReview": "Review",
    "add.stepUrlHint": "Address of the page — a site, article, video or book",
    "add.stepAboutHint":
      "The title shows up in listings, the type helps filter results",
    "add.stepPlaceHint": "A section is the shelf, pick up to five categories",
    "add.stepReviewHint": "All good? The description is optional",
    "add.optional": "optional",
    "add.proWhy": "Why fill in the details",
    "add.proWhyTitles":
      "A title in both languages opens the material to English readers",
    "add.proWhyDescription":
      "The description feeds search — the card is found by meaning, not just by title",
    "add.proWhyCategories":
      "Several categories put the material into several collections at once",
    "add.hintUrl": "The full address including https://",
    "add.hintTitle": "Short and to the point — the way you would name a shelf",
    "add.hintDescription":
      "A couple of sentences: what it is about and who it helps",
    "add.stepWhat": "What are you adding",
    "add.stepWhatHint":
      "The type decides what comes next: a video needs an address, a book needs a source",
    "add.stepWhere": "Where to find it and what it is called",
    "add.stepWhereHint":
      "Material on the web — give a link; from a book — name the source",
    "entry.openCategory": "Where it is published",
    "entry.addMore": "Add another material",
    "add.cover": "Cover",
    "add.coverHint":
      "There is no picture to take for a material without a link — upload your own",
    "add.coverChosen": "Chosen",
    "add.sectionRequest": "Ask for a section",
    "add.sectionRequestHint":
      "Sections are created by the admins — describe the one you need and we will consider it",
    "add.sectionRequestReason": "Why it is needed",
    "add.sectionRequestReasonHint":
      "A couple of words: what will go there and why the existing ones do not fit",
    "add.sectionRequestSubmit": "Send the request",
    "add.sectionRequestSent":
      "The request is sent — we will let you know the decision",
    "add.sectionRequestTitles": "Both titles are needed — Russian and English",
    "add.sectionNew": "New section",
    "add.sectionCreated": "The section is created and selected",
    "add.noCategoryFits": "Nothing fits?",
    "add.locatorLegend": "How to point to the material",
    "add.locatorUrl": "There is a link",
    "add.locatorSource": "Source only",
    "add.source": "Source",
    "add.hintSource":
      "Where the material comes from: “Bhagavad-gita 9.22, Prabhupada’s purport”",
    "add.sourceRequired": "Name the source or switch to a link",
    "add.sourceTooLong": "The source is longer than 300 characters",
    "entry.preview": "Material cover",
    "entry.play": "Play here",
    "entry.watchOn": "Watch on",
    "bookmark.add": "Save",
    "bookmark.remove": "Saved",
    "bookmark.title": "Saved links",
    "bookmark.empty": "Nothing saved yet",
    "comments.title": "Comments",
    "comments.empty": "No comments yet — be the first",
    "comments.add": "Your comment",
    "comments.submit": "Send",
    "comments.delete": "Delete the comment",
    "comments.gone": "Deleted user",
    "comments.tooLong": "The comment is longer than 2000 characters",
    "comments.rateLimited": "Too many comments in a row, please try again later",
    "comments.failed": "Could not send the comment, please try again later",
    "category.create": "Create a category",
    "category.titleRu": "Russian name",
    "category.titleEn": "English name",
    "category.similar": "Similar categories already exist",
    "category.similarHint":
      "Check the list: the category you need may already be there",
    "category.forceCreate": "Create a new one anyway",
    "add.community": "Published as",
    "add.communitySelf": "Myself",
    "add.communityHint":
      "You stay the author — the community only signs the material",
    "add.lineage": "Spiritual lineage of the material",
    "add.lineageAll": "For all lineages",
    "add.lineageHint":
      "Devotees see materials of their own lineage plus those marked for all. Defaults to your lineage or ISKCON",
    "lineage.all": "All lineages",
    "lineage.badgeAll": "For all lineages",
    "feed.emptyLineage":
      "Nothing here for your lineage yet. Materials of other lineages are hidden",
    "feed.showAllLineages": "Show materials of all lineages",
    "category.empty": "This section has no categories yet",
    "category.entries": "materials",
    "count.children": "Subcategories inside",
    "count.entries": "Materials",
    "locale.switch": "Interface language",
    "entry.edit": "Edit",
    "entry.save": "Save",
    "entry.cancel": "Cancel",
    "entry.customPreview": "custom cover",
    "entry.uploadPreview": "Upload a cover",
    "entry.previewUploading": "Uploading…",
    "entry.previewUnsupportedType": "Use jpg, png or webp",
    "entry.previewTooLarge": "The image is over 5 MB",
    "entry.previewUploadUnavailable": "Cover uploads are unavailable right now",
    "entry.previewUploadFailed": "Could not upload the cover, please try again later",
    "entry.updateFailed": "Could not save changes, please try again later",
    "entry.updated": "Changes saved",
    "entry.urlHint":
      "Changing the address resets what the portal read from the previous link: source title, favicon and cover",
    "entry.urlRequired":
      "An entry without a source cannot have its address removed",
    "entry.delete": "Delete",
    "entry.deleteConfirm": "Delete this link from the library?",
    "entry.deleteConfirmYes": "Yes, delete",
    "entry.deleting": "Deleting…",
    "entry.deleteFailed": "Could not delete the link, please try again later",
    "category.edit": "Edit category",
    "category.saved": "Category updated",
    "category.delete": "Delete category",
    "category.deleteConfirm": "Delete this category? This cannot be undone.",
    "category.deleteConfirmYes": "Yes, delete",
    "category.deleting": "Deleting…",
    "category.deleteHasChildren":
      "This category still has nested ones — move or delete them first",
    "category.deleteNotEmpty":
      "This category still holds material — move or delete it first",
    "category.deleteFailed": "Could not delete the category, please try again later",
    "category.deleteDone": "Category deleted",
    "order.label": "Category order",
    "order.own": "Custom order",
    "order.alpha": "A to Z",
    "order.new": "Newest first",
    "tree.organize": "Organise",
    "tree.done": "Done",
    "tree.hint":
      "Drag up and down to reorder, left and right to nest or unnest",
    "tree.keyboardHint":
      "Keyboard: Ctrl+↑ and Ctrl+↓ reorder, Ctrl+→ nests, Ctrl+← unnests",
    "tree.drag": "Move category",
    "tree.moveTo": "Move to…",
    "tree.moveToRoot": "Top level",
    "tree.moveDone": "Category moved",
    "tree.moveUndo": "Undo",
    "tree.moveFailed": "Could not move the category",
    "tree.moveCycle": "A category cannot be nested inside itself",
    "tree.moveTooDeep": "Nesting deeper than three levels is not allowed",
    "tree.expand": "Expand",
    "tree.collapse": "Collapse",
    "tree.empty": "No categories yet",
    "tree.subtreeCount": "including nested",
    "nav.withDescendants": "Including nested",
    "nav.onlyHere": "Only here",
    "nav.breadcrumbRoot": "All categories",
  },
} as const;

export type LibraryTextKey = keyof (typeof ui)["ru"];

const entryTypes: Record<LibraryLocale, Record<LibraryEntryType, string>> = {
  ru: {
    website: "Сайт",
    article: "Статья",
    video: "Видео",
    audio: "Аудио",
    book: "Книга",
    course: "Курс",
    app: "Приложение",
    telegram_channel: "Telegram-канал",
    vk_group: "Группа ВКонтакте",
    community: "Община",
    other: "Другое",
  },
  en: {
    website: "Website",
    article: "Article",
    video: "Video",
    audio: "Audio",
    book: "Book",
    course: "Course",
    app: "App",
    telegram_channel: "Telegram channel",
    vk_group: "VK group",
    community: "Community",
    other: "Other",
  },
};

export const libraryDictionary = ui;

export function t(locale: LibraryLocale, key: LibraryTextKey): string {
  return ui[locale][key] ?? key;
}

/** Контент показываем на текущем языке, но пустоту не показываем никогда. */
export function pickLocalized(
  locale: LibraryLocale,
  value: { ru: string | null; en: string | null },
): string {
  const primary = locale === "en" ? value.en : value.ru;
  const fallback = locale === "en" ? value.ru : value.en;
  return primary?.trim() || fallback?.trim() || "";
}

export function entryTypeLabel(
  locale: LibraryLocale,
  type: LibraryEntryType,
): string {
  return entryTypes[locale][type];
}

/**
 * Подпись к числу рядом с рубрикой: «Подразделов внутри: 4».
 *
 * Одна на все списки — иначе полоса рубрик и режим упорядочивания однажды
 * скажут об одном и том же числе разными словами.
 */
export function categoryCountLabel(
  locale: LibraryLocale,
  category: { childrenCount: number; entriesCount: number },
): string {
  const counter = categoryCounter(category);
  const kind = counter.kind === "children" ? "count.children" : "count.entries";
  return `${t(locale, kind)}: ${counter.value}`;
}

/**
 * Строка под названием рубрики — то же одно число, что и в плитке.
 *
 * Раздел показывает свои подразделы, подраздел — свои материалы, и ничего
 * чужого. Двух чисел здесь нет намеренно: «4 подраздела · 3 материала»
 * заставляет выбирать, какое из них про эту страницу, а ответ нужен один.
 *
 * Число материалов раздела не показывается вовсе — ни своё, ни вложенных.
 * Своё почти всегда ноль и выглядит как поломка; вложенных — то самое чужое,
 * из-за которого правка и начиналась. Что лежит в подразделах, видно на них
 * самих, строкой ниже.
 */
export function categoryPageSummary(
  locale: LibraryLocale,
  category: { childrenCount: number; entriesCount: number },
): string {
  const counter = categoryCounter(category);

  if (counter.kind === "children") {
    return locale === "ru"
      ? `${counter.value} ${plural(
          counter.value,
          "подраздел",
          "подраздела",
          "подразделов",
        )}`
      : `${counter.value} subsection${counter.value === 1 ? "" : "s"}`;
  }

  return locale === "ru"
    ? `${counter.value} ${plural(
        counter.value,
        "материал",
        "материала",
        "материалов",
      )}`
    : `${counter.value} material${counter.value === 1 ? "" : "s"}`;
}
