"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronDown,
  ExternalLink,
  Eye,
  EyeOff,
  Inbox,
  Pencil,
  Search,
  Share2,
  Trash2,
  X,
} from "lucide-react";
import type {
  MotivationAdminCandidateDto,
  MotivationCategoryDto,
} from "@vedamatch/shared";
import {
  joinQuoteAndExplanation,
  splitQuoteAndExplanation,
} from "../quote-text";
import { CategorySelect } from "./category-select";
import { DeletePostConfirm } from "./delete-post-button";
import {
  deleteActionLabel,
  editActionLabel,
  feedActionLabel,
  hiddenTabActionLabel,
  hideActionLabel,
  hideNoticeText,
  searchActionLabel,
  shareActionLabel,
  titleOf,
} from "./post-action-labels";
import { postShareHref } from "../post-share";
import { reelsHref } from "../feed-style";
import {
  POST_KIND_LABELS,
  filterByKind,
  kindHref,
  type PostKind,
} from "./post-kind";
import { cardText, expandHint } from "./card-text";
import { SCROLL_NAV_GUTTER, ScrollNavButtons } from "@/components/ui/scroll-nav-buttons";
import { UploadCardImage } from "./upload-card-image";
import { LoadFailure } from "./load-failure";
import { useAdminCommand } from "./use-admin-command";
import {
  badgeClass,
  cardClass,
  fieldClass,
  iconTile,
  iconTileDanger,
  labelClass,
  secondaryButton,
} from "./ui";

/**
 * Опубликованное: то, что люди уже читают в ленте, плюс то, что читали до
 * недавнего «Скрыть» (`selectPublishedPosts`, VED-251) — скрытая карточка
 * помечена бейджем «Скрыто из ленты» и той же кнопкой-переключателем, не
 * покидая список.
 *
 * Раньше этого раздела не было вовсе — опубликованное лежало свёрнутым
 * списком в самом низу очереди, вперемешку с отклонённым и скрытым, и найти
 * вышедшую карточку можно было только развернув «Уже прошли очередь».
 *
 * Список, а не сетка карточек: сюда приходят с готовым вопросом — поправить
 * опечатку, снять с показа, удалить.
 *
 * Карточка ужата вдвое (VED-199): картинка крупнее — по ней узнают афоризм
 * быстрее, чем по тексту, — из текста остался один афоризм (автор и источник
 * только занимали место), а пять кнопок во всю ширину стали квадратами со
 * значками в два ряда рядом с картинкой. Подпись у каждого значка — в
 * `aria-label` и всплывающей подсказке.
 * Поиск по названию и цитате: за полгода публикаций пролистать до нужной
 * дороже, чем набрать три слова.
 *
 * Тот же компонент рисует и вкладку «Скрытые» (VED-251, VED-264,
 * `variant="hidden"`) — список тех же карточек с тем же `PostActions`, без
 * дублирования кнопок и правки. Меняется только то, что зависит от смысла
 * списка: подсказка при пустом списке и строка-счётчик над ним.
 */
export function MotivationPublishedList({
  posts: allPosts,
  categories = [],
  openSlug,
  variant = "published",
  kind,
}: {
  posts: MotivationAdminCandidateDto[] | null;
  /**
   * Какая из двух редакций открыта (VED-299): нейро-афоризмы или открытки.
   * «Править» в ленте передаёт вид своей карточки. Без вида — все, как было.
   */
  kind?: PostKind;
  /** Справочник для выбора категории в правке. */
  categories?: MotivationCategoryDto[];
  /**
   * Слаг карточки, ради которой сюда пришли из ленты. Её правка открыта
   * сразу: искать глазами то, на что только что смотрел, — лишний шаг.
   */
  openSlug?: string;
  /**
   * «Скрытые» показывает только снятое с показа — здесь кнопка «Скрытые» у
   * самой карточки лишняя (страница и так эта вкладка), поэтому на её месте
   * остаётся пустая клетка сетки, а не ссылка саму на себя.
   */
  variant?: "published" | "hidden";
}) {
  const posts = useMemo(
    () => (allPosts ? filterByKind(allPosts, kind) : null),
    [allPosts, kind],
  );
  const kindCounts = useMemo(
    () => ({
      art: allPosts ? filterByKind(allPosts, "art").length : 0,
      cards: allPosts ? filterByKind(allPosts, "cards").length : 0,
      all: allPosts?.length ?? 0,
    }),
    [allPosts],
  );
  const basePath =
    variant === "hidden" ? "/admin/motivation/hidden" : "/admin/motivation/published";
  const { pending, errors, run } = useAdminCommand();
  const [query, setQuery] = useState("");
  /** Ref на поле поиска — кнопка «Поиск» в карточке (VED-264) ведёт сюда,
      не заставляя мотать список вверх руками. */
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const focusSearch = () => {
    searchInputRef.current?.focus();
    searchInputRef.current?.scrollIntoView({ block: "start" });
  };
  const openId = useMemo(
    () => posts?.find((post) => post.slug === openSlug)?.id ?? null,
    [posts, openSlug],
  );
  const [editing, setEditing] = useState<string | null>(openId);
  /**
   * Карточки с развёрнутым текстом (VED-264). Каждая сама по себе, а не
   * «одна открытая за раз»: свернуть чужую карточку выше по списку значило
   * бы сдвинуть страницу под пальцем.
   */
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const toggleExpanded = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  /** Карточка, у которой спросили «удалить?»: вопрос встаёт под ней. */
  const [deleting, setDeleting] = useState<string | null>(null);
  /** Ошибки загрузки картинки — под карточкой, а не в клетке значка. */
  const [uploadErrors, setUploadErrors] = useState<
    Record<string, string | null>
  >({});
  /**
   * Карточки, которые скрыли этим же сеансом (VED-251): под ними висит
   * подсказка, что делать дальше, — без таймера, до следующего действия над
   * карточкой. Ключ убирается сам при возврате в ленту — обратное действие
   * в подсказке уже не нуждается.
   */
  const [hideNotice, setHideNotice] = useState<Record<string, boolean>>({});

  /**
   * Пришли из ленты — подводим к той самой карточке.
   *
   * Правка открывалась и раньше, но список опубликованного при загрузке
   * показывает своё начало, а нужная карточка лежала на второй-третьей
   * тысяче пикселей вниз. Человек нажимал «Править» на одном афоризме и
   * упирался в чужой: открытая форма была за экраном, и о ней нельзя было
   * догадаться.
   *
   * `block: "center"` без плавности: прокрутка здесь не эффект, а способ
   * оказаться на месте, и `prefers-reduced-motion` она не нарушает.
   * Миниатюры фиксированного размера, поэтому дозагрузка картинок выше
   * список не сдвинет.
   */
  const openCard = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    if (openId) openCard.current?.scrollIntoView({ block: "center" });
  }, [openId]);

  const found = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("ru-RU");
    if (!needle || !posts) return posts ?? [];
    return posts.filter((post) =>
      [post.title, post.text, post.attributionSpeaker, post.categoryTitle]
        .filter(Boolean)
        .some((field) => field!.toLocaleLowerCase("ru-RU").includes(needle)),
    );
  }, [posts, query]);

  /** Для счётчика над списком: сколько из показанного реально в ленте. */
  const hiddenCount = posts?.filter((post) => post.status === "hidden").length ?? 0;
  const publishedCount = (posts?.length ?? 0) - hiddenCount;

  if (!posts) return <LoadFailure what="опубликованные вдохновения" />;

  /* Переключатель двух редакций (VED-299). Ссылками: вид живёт в адресе,
     и «Править» из ленты открывает сразу нужную редакцию. */
  const kindNav = (
    <nav aria-label="Какую редакцию показать" className="mb-4 flex flex-wrap gap-2">
      {(["art", "cards", undefined] as const).map((value) => {
        const current = kind === value;
        return (
          <Link
            key={value ?? "all"}
            href={kindHref(basePath, value)}
            aria-current={current ? "page" : undefined}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition-colors ${
              current
                ? "border-cyan/40 bg-cyan/10 text-text-0"
                : "border-glass-brd text-text-1 hover:text-text-0"
            }`}
          >
            {POST_KIND_LABELS[value ?? "all"]}
            <span className="font-mono text-xs font-normal text-text-1">
              {kindCounts[value ?? "all"]}
            </span>
          </Link>
        );
      })}
    </nav>
  );

  if (posts.length === 0)
    return (
      <>
        {kind && kindNav}
        <p className={`${cardClass} text-center text-text-2`}>
          {kind
            ? kind === "cards"
              ? "Открыток в этом списке нет."
              : "Нейро-афоризмов в этом списке нет."
            : variant === "hidden"
              ? "Скрытых нет. Всё, что видно в ленте, лежит во вкладке «Опубликованные»."
              : "Пока ничего не опубликовано. Всё, что ждёт проверки, — во вкладке «Заготовки»."}
        </p>
      </>
    );

  return (
    <>
      {kindNav}
      {/* Дорога обратно. Из ленты сюда приходят с одним вопросом — поправить
          то, на что смотрели, — и уходить должны туда же, а не искать ленту
          заново через меню. Ссылки нет, когда во вкладку зашли сами: тогда
          «назад» вело бы в ленту, из которой не приходили. */}
      {openSlug && (
        <Link
          href={reelsHref({
            tab: kind === "cards" ? "cards" : "forYou",
            post: openSlug,
          })}
          className="mb-4 inline-flex items-center gap-1 text-sm text-text-1 hover:text-text-0"
        >
          <ArrowLeft aria-hidden className="size-4" />
          Назад к афоризму в ленте
        </Link>
      )}

      <label className="block max-w-md">
        <span className={labelClass}>Найти по цитате или автору</span>
        <input
          ref={searchInputRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Например: Прабхупада"
          className={`${fieldClass} mt-1`}
        />
      </label>

      <p className="mt-3 text-sm text-text-2">
        {query.trim()
          ? `Найдено: ${found.length} из ${posts.length}`
          : variant === "hidden"
            ? // На «Скрытых» весь список и так скрыт — считать «Опубликовано: 0»
              // рядом с ним только сбивало бы с толку.
              `Скрыто: ${hiddenCount}`
            : // `posts` — это `published` и `hidden` вместе (VED-251), и
              // «Опубликовано: N» врало бы, если часть N на деле скрыта из
              // ленты. Хвост «· Скрыто: M» показываем только когда скрытые
              // действительно есть — не загромождать подпись нулём.
              hiddenCount > 0
              ? `Опубликовано: ${publishedCount} · Скрыто: ${hiddenCount}`
              : `Опубликовано: ${publishedCount}`}
      </p>

      {/* Пришли из ленты, а карточки здесь нет — значит, её успели удалить.
          Скрытая (VED-251) сюда бы уже попала: этот же список показывает и
          опубликованное, и снятое с показа (см. selectPublishedPosts), так
          что «не нашлась» теперь однозначно значит «удалена». Молча
          показывать начало списка нельзя: человек решит, что «Править»
          открыло не тот афоризм. */}
      {openSlug && !openId && (
        <p role="status" className={`${cardClass} mt-4 text-sm text-text-1`}>
          Карточка, с которой вы пришли из ленты, среди опубликованного не
          нашлась — похоже, её удалили.
        </p>
      )}

      {found.length === 0 ? (
        <p className={`${cardClass} mt-4 text-center text-text-2`}>
          Ничего не нашлось. Попробуйте другое слово.
        </p>
      ) : (
        // На широком экране — две колонки: карточка стала узкой и высокой, и
        // в одну колонку справа от кнопок оставалась пустая полоса.
        // Справа на телефоне — поле под плавающие кнопки прокрутки
        // (`SCROLL_NAV_GUTTER`): без него они ложились на правый столбец
        // кнопок карточки, и «Поделиться»/«Скрытые» было не нажать.
        <ul
          className={`mt-4 grid items-start gap-3 lg:grid-cols-2 ${SCROLL_NAV_GUTTER}`}
        >
          {found.map((post) => (
            <li
              key={post.id}
              ref={post.id === openId ? openCard : undefined}
              // Та самая карточка обведена: после прокрутки видно, что
              // открылась именно она, а не соседняя.
              className={`${cardClass} ${
                post.id === openId ? "ring-2 ring-magenta" : ""
              }`}
            >
              <div className="flex items-start gap-3 sm:gap-4">
                {/* Картинка крупнее прежней миниатюры (VED-199): 2:3, как её
                    рисуют, — редактор узнаёт карточку по ней, а не по тексту. */}
                {post.imageUrl ? (
                  // Ссылка на хранилище подписана и может истечь — next/image
                  // не годится для произвольно меняющегося домена подписи.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={post.imageUrl}
                    alt=""
                    className="aspect-[2/3] w-28 shrink-0 rounded-xl object-cover sm:w-36"
                  />
                ) : (
                  <div className="aspect-[2/3] w-28 shrink-0 rounded-xl bg-bg-1 sm:w-36" />
                )}

                <div className="min-w-0 flex-1">
                  {/* Свёрнуто — только сам афоризм: автор, дата и категория
                      только занимали место (VED-199). Нажатие на текст
                      раскрывает его целиком (VED-264). */}
                  <ExpandableCardText
                    post={post}
                    expanded={expanded.has(post.id)}
                    onToggle={() => toggleExpanded(post.id)}
                  />
                  {post.status === "hidden" && (
                    <span className={`${badgeClass} mt-1`}>Скрыто из ленты</span>
                  )}
                </div>
              </div>

              {/* Кнопки — под картинкой и текстом, во всю ширину карточки.
                  Рядом с текстом они стояли, пока были голыми значками
                  (VED-199); с подписями (VED-251) в остатке колонки им уже
                  не хватало ширины на телефоне. */}
              <PostActions
                post={post}
                variant={variant}
                returning={post.id === openId}
                editing={editing === post.id}
                deleting={deleting === post.id}
                pendingAction={pending[post.id]}
                onEdit={() =>
                  setEditing((current) =>
                    current === post.id ? null : post.id,
                  )
                }
                onFocusSearch={focusSearch}
                onDelete={() =>
                  setDeleting((current) =>
                    current === post.id ? null : post.id,
                  )
                }
                onUploadError={(message) =>
                  setUploadErrors((current) => ({
                    ...current,
                    [post.id]: message,
                  }))
                }
                onHideToggle={(nextHidden) =>
                  setHideNotice((current) => {
                    // Возврат в ленту снимает подсказку: она была про то,
                    // как отменить именно скрытие.
                    if (!nextHidden) {
                      if (!current[post.id]) return current;
                      const next = { ...current };
                      delete next[post.id];
                      return next;
                    }
                    return { ...current, [post.id]: true };
                  })
                }
                run={run}
              />

              {hideNotice[post.id] && (
                <p role="status" className="mt-2 text-sm text-text-1">
                  {hideNoticeText(true)}
                </p>
              )}

              {deleting === post.id && (
                <div className="mt-3">
                  <DeletePostConfirm
                    postId={post.id}
                    status={post.status}
                    pendingAction={pending[post.id]}
                    run={run}
                    onCancel={() => setDeleting(null)}
                  />
                </div>
              )}

              {uploadErrors[post.id] && (
                <p role="alert" className="mt-2 text-sm font-medium text-red-500">
                  {uploadErrors[post.id]}
                </p>
              )}

              {errors[post.id] && (
                <p role="alert" className="mt-2 text-sm font-medium text-red-500">
                  {errors[post.id]}
                </p>
              )}

              {editing === post.id && (
                <PublishedTextForm
                  post={post}
                  categories={categories}
                  pendingAction={pending[post.id]}
                  onSaved={() => setEditing(null)}
                  run={run}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {/* VED-265: длинную ленту редакции быстрее пролистать кнопками у
          края, чем крутить руками. */}
      <ScrollNavButtons />
    </>
  );
}

/**
 * Текст карточки, который раскрывается нажатием на него самого (VED-264:
 * «показать текст афоризма полностью — быстро, без возвращения в ленту»).
 *
 * Отдельной кнопки «Читать» больше нет — её клетку забрала «Поделиться»
 * (VED-343), а четвёртого ряда кнопок заказчик не хочет. Поэтому кнопка —
 * сам текст: настоящий `<button>` с `aria-expanded`, он берёт фокус с
 * клавиатуры и срабатывает на Enter и пробел. Подсказка «Показать
 * полностью» со стрелкой под текстом — чтобы догадаться, что абзац
 * нажимается; она же заканчивает имя кнопки для скринридера.
 *
 * Внутри кнопки только строчные элементы (`span` с `block`): абзацы в
 * `<button>` HTML не допускает.
 */
function ExpandableCardText({
  post,
  expanded,
  onToggle,
}: {
  post: MotivationAdminCandidateDto;
  expanded: boolean;
  onToggle: () => void;
}) {
  const id = useId();
  const { quote, explanation, attribution } = cardText(post);
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-controls={id}
      className="group block w-full rounded-md text-left"
    >
      <span id={id} className="block">
        <span
          // Без `block` у свёрнутого: `line-clamp` работает только на
          // `display: -webkit-box`, и `block` рядом молча его отменял.
          className={`text-sm text-text-0 ${
            expanded ? "block whitespace-pre-line" : "line-clamp-4"
          }`}
        >
          {quote}
        </span>
        {expanded && explanation && (
          <span className="mt-2 block whitespace-pre-line text-sm text-text-1">
            {explanation}
          </span>
        )}
        {expanded && attribution && (
          <span className="mt-2 block text-xs text-text-2">{attribution}</span>
        )}
      </span>
      <span className="mt-1 inline-flex min-h-6 items-center gap-0.5 text-xs font-medium text-text-1 group-hover:text-text-0">
        {expandHint(expanded)}
        <ChevronDown
          aria-hidden
          className={`size-4 transition-transform motion-reduce:transition-none ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </span>
    </button>
  );
}

/**
 * Восемь действий карточки — квадратами со значками, сеткой 4×2 (VED-343:
 * «Сделай 2 ряда клавиш вместо трех»). Ряд первый: посмотреть, править,
 * скрыть, поделиться. Ряд второй: заменить картинку, удалить, поиск,
 * «Скрытые».
 *
 * «Поделиться» стоит на месте «Читать полностью» (VED-264): отправить
 * афоризм из карточки было нечем, а полный текст теперь раскрывается
 * нажатием на сам текст (`ExpandableCardText`), без отдельной клетки. Под
 * «←» у подсвеченной карточки встаёт «Заменить» — промах по нему безопасен:
 * он открывает выбор файла, а не меняет картинку сразу.
 *
 * Четыре колонки и на 360px: клетка там около 65px, поэтому подпись 11px и
 * поля клетки ужаты (см. `iconTile`), а высота клетки остаётся 56px — цель
 * касания не меньше 44px с запасом.
 */
function PostActions({
  post,
  variant,
  returning,
  editing,
  deleting,
  pendingAction,
  onEdit,
  onFocusSearch,
  onDelete,
  onUploadError,
  onHideToggle,
  run,
}: {
  post: MotivationAdminCandidateDto;
  variant: "published" | "hidden";
  /** Карточка, ради которой пришли из ленты: ссылка ведёт обратно. */
  returning: boolean;
  editing: boolean;
  deleting: boolean;
  pendingAction: string | undefined;
  onEdit: () => void;
  onFocusSearch: () => void;
  onDelete: () => void;
  onUploadError: (message: string | null) => void;
  /** `true` — карточку только что скрыли, `false` — вернули в ленту. */
  onHideToggle: (nextHidden: boolean) => void;
  run: ReturnType<typeof useAdminCommand>["run"];
}) {
  const hidden = post.status === "hidden";
  /* Открывает ленту прямо на этой карточке — тем же адресом, что и переход
     из «Студии». У карточки, ради которой пришли из ленты, та же ссылка
     подписана возвращением: адрес совпадает с дорогой назад.
     У скрытой карточки ссылка вела бы в тупик: публичная лента ищет пост по
     slug только среди `status: 'published'` (motivation.service.ts, метод
     ленты) — для скрытого `?post=slug` молча ничего не подсветит. Вместо
     ссылки — неактивная кнопка на том же месте сетки (та же клетка, тот же
     размер), с подсказкой, что сначала нужно вернуть в ленту. */
  const feed = feedActionLabel(hidden, returning);
  const edit = editActionLabel(editing);
  const hide = hideActionLabel(hidden);
  const share = shareActionLabel(hidden);
  return (
    // Сетка во всю ширину карточки, а не `w-fit` рядом с текстом: подписи
    // шире голых значков, и в остатке колонки справа от картинки им уже не
    // хватало места на телефоне (VED-251). Четыре колонки на любом экране
    // (VED-343), промежуток на телефоне уже — клетке нужна каждая пара px.
    <div className="mt-3 grid grid-cols-4 gap-1.5 sm:gap-2">
      {hidden ? (
        <button
          type="button"
          // `disabled` вместо `aria-disabled`, чтобы клик по кнопке нигде
          // не путался с настоящей навигацией — на скрытом посте у неё нет
          // рабочего адреса вовсе.
          disabled
          aria-label={feed.label}
          title={titleOf(feed)}
          className={iconTile}
        >
          <ExternalLink aria-hidden className="size-5" />
          <span aria-hidden>{feed.caption}</span>
        </button>
      ) : (
        <Link
          href={`/motivation?post=${encodeURIComponent(post.slug)}`}
          aria-label={feed.label}
          title={titleOf(feed)}
          className={iconTile}
        >
          {returning ? (
            <ArrowLeft aria-hidden className="size-5" />
          ) : (
            <ExternalLink aria-hidden className="size-5" />
          )}
          <span aria-hidden>{feed.caption}</span>
        </Link>
      )}

      <button
        type="button"
        onClick={onEdit}
        aria-expanded={editing}
        aria-label={edit.label}
        title={titleOf(edit)}
        className={iconTile}
      >
        {editing ? (
          <X aria-hidden className="size-5" />
        ) : (
          <Pencil aria-hidden className="size-5" />
        )}
        <span aria-hidden>{edit.caption}</span>
      </button>

      {/* Скрыть, а не удалить: снятая с показа карточка уходит из ленты, но
          остаётся у тех, кто уже сохранил её в избранном, — и решение можно
          отменить той же кнопкой. Карточка при этом остаётся здесь же, в
          «Опубликованных» (VED-251) — раньше она в ту же секунду пропадала
          из списка и находилась только в «Заготовках», без кнопки возврата.
          Подпись «Скрыть» видна до нажатия: раньше слово жило только в
          `title`, которого на телефоне не бывает, и перечёркнутый глаз
          нажимали вслепую. */}
      <button
        type="button"
        disabled={pendingAction !== undefined}
        onClick={async () => {
          const nextHidden = !hidden;
          const ok = await run(post.id, "hide", {
            path: `/admin/motivation/posts/${post.id}`,
            method: "PATCH",
            body: { hidden: nextHidden },
          });
          if (ok) onHideToggle(nextHidden);
        }}
        aria-label={hide.label}
        title={titleOf(hide)}
        className={iconTile}
      >
        {hidden ? (
          <Eye aria-hidden className="size-5" />
        ) : (
          <EyeOff aria-hidden className="size-5" />
        )}
        <span aria-hidden>{hide.caption}</span>
      </button>

      {/* «Поделиться» (VED-343) — тот же экран, что у кнопки ленты: адрес
          собирает `postShareHref`. У скрытой карточки страницы поста нет,
          поэтому здесь, как у «В ленту», неактивная кнопка на том же месте. */}
      {hidden ? (
        <button
          type="button"
          disabled
          aria-label={share.label}
          title={titleOf(share)}
          className={iconTile}
        >
          <Share2 aria-hidden className="size-5" />
          <span aria-hidden>{share.caption}</span>
        </button>
      ) : (
        <Link
          href={postShareHref(post)}
          aria-label={share.label}
          title={titleOf(share)}
          className={iconTile}
        >
          <Share2 aria-hidden className="size-5" />
          <span aria-hidden>{share.caption}</span>
        </Link>
      )}

      {/* Открытку редакция рисует сама — генерация нарисует не то. Замена
          картинки со стадией карточки ничего не делает: опубликованная
          остаётся опубликованной. */}
      <UploadCardImage postId={post.id} iconOnly onError={onUploadError} />

      {/* Удаление в два нажатия: вопрос встаёт под карточкой во всю ширину. */}
      <button
        type="button"
        disabled={pendingAction !== undefined}
        onClick={onDelete}
        aria-expanded={deleting}
        aria-label={deleteActionLabel.label}
        title={titleOf(deleteActionLabel)}
        className={iconTileDanger}
      >
        <Trash2 aria-hidden className="size-5" />
        <span aria-hidden>{deleteActionLabel.caption}</span>
      </button>

      {/* «Поиск» (VED-264): фокус на поле поиска вверху экрана, чтобы не
          мотать длинный список руками. */}
      <button
        type="button"
        onClick={onFocusSearch}
        aria-label={searchActionLabel.label}
        title={titleOf(searchActionLabel)}
        className={iconTile}
      >
        <Search aria-hidden className="size-5" />
        <span aria-hidden>{searchActionLabel.caption}</span>
      </button>

      {/* «Скрытые» (VED-264): весь список снятого с показа. На самой
          вкладке «Скрытые» кнопка вела бы саму на себя — вместо ссылки там
          пустая клетка, чтобы сетка не съезжала. */}
      {variant === "hidden" ? (
        <span aria-hidden className="min-h-14 w-full" />
      ) : (
        <Link
          href="/admin/motivation/hidden"
          aria-label={hiddenTabActionLabel.label}
          title={titleOf(hiddenTabActionLabel)}
          className={iconTile}
        >
          <Inbox aria-hidden className="size-5" />
          <span aria-hidden>{hiddenTabActionLabel.caption}</span>
        </Link>
      )}
    </div>
  );
}

/**
 * Правка текста уже вышедшей карточки.
 *
 * Заголовка здесь нет (VED-199): читатель его не видит, а редакции он только
 * занимал место. Сервер оставляет прежний, а собранный из цитаты — пересобирает
 * вслед за ней.
 *
 * Надпись на картинке и полный текст — два поля (VED-241): длинную шлоку на
 * кадре сокращают, не трогая окно «Читать полностью», где её дочитывают.
 *
 * Только русский: остальные языки заводит генерация, и подсовывать здесь
 * пустые поля под них значило бы предлагать перевести вручную то, что
 * переводится не здесь.
 *
 * Подпись правится, но не бесплатно: сервер снимает отметку о проверенном
 * источнике — она относилась к тому, что сверяли, а не к тому, что
 * переписали руками. Об этом сказано прямо, до нажатия.
 */
function PublishedTextForm({
  post,
  categories,
  pendingAction,
  onSaved,
  run,
}: {
  post: MotivationAdminCandidateDto;
  categories: MotivationCategoryDto[];
  pendingAction: string | undefined;
  onSaved: () => void;
  run: ReturnType<typeof useAdminCommand>["run"];
}) {
  /* Сервер хранит цитату и пояснение одной строкой, склеенными пустой
     строкой, но править их одним полем нельзя: поле называлось «Пояснение», а
     показывало ещё и афоризм — тот же текст, что стоит в карточке выше.
     Редактор разбирает строку на части, правит их порознь и склеивает обратно
     тем же разделителем. */
  const initial = splitQuoteAndExplanation(post.text);
  const [quote, setQuote] = useState(initial.quote);
  const [explanation, setExplanation] = useState(initial.explanation);
  const text = joinQuoteAndExplanation(quote, explanation);
  const savedImageText = post.imageText?.trim() ?? "";
  const [imageText, setImageText] = useState(savedImageText);
  const [speaker, setSpeaker] = useState(post.attributionSpeaker ?? "");
  const [work, setWork] = useState(post.attributionWork ?? "");
  const [category, setCategory] = useState(post.category);

  /* Надпись поверх картинки рисует лента только у обычной иллюстрации. У
     открытки текст напечатан на самом файле, у ролика — вшит в кадр: поле
     там ничего бы не меняло. */
  const pictureEditable = !post.captionInImage && !post.videoUrl;

  /* Место в произведении из формы убрано, но из запроса — нет:
     `attribution` перезаписывает все три поля разом (`locator?.trim() ||
     null`), и правка одного автора молча обнуляла бы место. */
  const locator = post.attributionLocator ?? "";

  /* Сравниваем со склейкой разобранного, а не с исходной строкой: разбор
     подрезает пробелы по краям, и у поста с лишним переносом «Сохранить»
     загоралась бы сразу при открытии, ничего не тронув. */
  const savedText = joinQuoteAndExplanation(initial.quote, initial.explanation);
  const fullTextChanged = text !== savedText;
  const imageTextChanged =
    pictureEditable && imageText.trim() !== savedImageText;
  const textChanged = fullTextChanged || imageTextChanged;
  const attributionChanged =
    speaker !== (post.attributionSpeaker ?? "") ||
    work !== (post.attributionWork ?? "");
  const categoryChanged = category !== post.category;
  const changed = textChanged || attributionChanged || categoryChanged;

  return (
    <div className="mt-3 space-y-3 border-t border-glass-brd pt-3">
      {pictureEditable ? (
        <label className="block">
          <span className={labelClass}>Текст на картинке</span>
          <textarea
            value={imageText}
            rows={3}
            placeholder="Пусто — как в полном тексте"
            onChange={(event) => setImageText(event.target.value)}
            className={`${fieldClass} mt-1`}
          />
          <span className="mt-1 block text-xs font-normal text-text-2">
            Что стоит поверх картинки в ленте. Если пусто — там полный текст
            афоризма.
          </span>
        </label>
      ) : (
        <p className="text-xs text-text-2">
          {post.captionInImage
            ? "Текст на этой картинке напечатан в самом файле — поправить его можно только заменой картинки."
            : "Текст на ролике вшит в кадр — поправка ниже изменит только окно «Читать полностью»."}
        </p>
      )}

      <label className="block">
        <span className={labelClass}>Полный текст</span>
        <textarea
          value={quote}
          rows={3}
          onChange={(event) => setQuote(event.target.value)}
          className={`${fieldClass} mt-1`}
        />
        <span className="mt-1 block text-xs font-normal text-text-2">
          Его показывает окно «Читать полностью».
        </span>
      </label>

      <label className="block">
        <span className={labelClass}>Пояснение</span>
        <textarea
          value={explanation}
          rows={4}
          placeholder="Почему эта цитата важна и как её применить"
          onChange={(event) => setExplanation(event.target.value)}
          className={`${fieldClass} mt-1`}
        />
        <span className="mt-1 block text-xs font-normal text-text-2">
          Если пусто — в карточке останется одна цитата, без блока «Пояснение».
        </span>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={labelClass}>Автор</span>
          <input
            value={speaker}
            onChange={(event) => setSpeaker(event.target.value)}
            className={`${fieldClass} mt-1`}
          />
        </label>
        <label className="block">
          <span className={labelClass}>Произведение</span>
          <input
            value={work}
            onChange={(event) => setWork(event.target.value)}
            className={`${fieldClass} mt-1`}
          />
        </label>
      </div>

      {/* Категория правится здесь же: заводя карточку, её кладут в папку
          наугад, а разложить по местам приходят потом — и до этой правки
          единственным способом было пересоздать карточку. */}
      <CategorySelect
        categories={categories}
        value={category}
        onChange={setCategory}
      />

      {attributionChanged && (
        <p className="text-xs text-text-2">
          Правка подписи снимет отметку о проверенном источнике: она относилась
          к тому, что сверяли.
          {post.origin === "user" &&
            " Рилс участника уйдёт из общей ленты, пока источник не сверят заново."}
        </p>
      )}

      <button
        type="button"
        disabled={!changed || pendingAction !== undefined}
        onClick={async () => {
          await run(post.id, "edit", {
            path: `/admin/motivation/posts/${post.id}`,
            method: "PATCH",
            body: {
              // Отправляем только то, что тронули: подпись тянет за собой
              // сброс проверки источника, и слать её «на всякий случай»
              // значило бы снимать отметку при правке одной опечатки.
              // Заголовок и подпись для Stories не шлём вовсе — сервер
              // оставляет их как есть.
              ...(textChanged
                ? {
                    translations: {
                      ru: {
                        text,
                        ...(imageTextChanged
                          ? { imageText: imageText.trim() }
                          : {}),
                      },
                    },
                  }
                : {}),
              ...(attributionChanged
                ? { attribution: { speaker, work, locator } }
                : {}),
              ...(categoryChanged ? { category } : {}),
            },
          });
          onSaved();
        }}
        className={secondaryButton}
      >
        {pendingAction === "edit" ? "Сохраняем…" : "Сохранить"}
      </button>
    </div>
  );
}
