"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import Link from "next/link";
import {
  Copy,
  Check,
  Pencil,
  Repeat2,
  Trash2,
  Pin,
  Star,
  Square,
  Volume2,
} from "lucide-react";
import type { BlogPostDto } from "@vedamatch/shared";
import { copyText } from "@/lib/copy-text";
import { buildBlogPostCopy } from "@/lib/blog-copy";
import {
  BlogApiError,
  deleteBlogPost,
  repostBlogPost,
  setBlogFavorite,
  setBlogPostPinned,
} from "@/lib/blog-client-api";
import { BlogMedia } from "./blog-media";
import { BlogPostLinkButton, BlogPostLinkCover } from "./blog-post-link";
import {
  buildSpokenPost,
  canSpeak,
  getBlogSpeakingId,
  getBlogSpeakingServerId,
  speakBlogPost,
  stopBlogSpeech,
  subscribeBlogSpeech,
} from "./blog-speech";
import { postMedia } from "./blog-media-list";
import { BlogLifetimeControl } from "./blog-lifetime-control";
import { BlogPostEditor } from "./blog-post-editor";
import {
  BlogMoreButton,
  BlogPostText,
  useBlogTextFold,
} from "./blog-post-text";
import { blogEditedLabel, blogPostDate } from "./blog-format";
import type { PostAction } from "./post-actions-order";
import { usePostActionsOrder } from "./use-post-actions-order";

/**
 * Кнопки под постом. Общий класс, чтобы правка встала в тот же ряд, что
 * «Копировать» и «Удалить», и ряд не разъехался по высоте. `min-h-11` —
 * размер пальца, а не текста: подписи здесь мелкие.
 *
 * На узком экране кнопки квадратные, со значком без подписи (VED-371): с
 * подписями ряд своего поста ложился в две строки, и вместе с «Далее» это
 * 100px на карточку — третий пост на экран 375×812 не влезал. Подпись
 * остаётся в разметке (`ACTION_LABEL`) и служит кнопке именем для
 * скринридера; значки здесь общеупотребимые.
 *
 * Ряд не переносится (VED-509): семь кнопок по 44px на экране в 360–400
 * точек уводили «Удалить» второй строкой. На телефоне кнопки делят ширину
 * поровну (`flex-1`), но не шире 56px — у читателя их четыре, и растянутые
 * на всю карточку они выглядели бы плашками. Подписей нет и на широком
 * экране: карточка там не шире 640px, и с ними ряд тоже ломался надвое.
 */
const ACTION =
  "inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg border border-glass-brd px-0 py-1.5 text-xs text-text-1 disabled:opacity-60 max-sm:min-w-0 max-sm:max-w-14 max-sm:flex-1";
const ACTION_LABEL = "sr-only";

/**
 * Карточка поста блог-ленты.
 *
 * Картинка первой и во всю ширину — по чек-листу VED-238: «в ленте должно
 * быть видно в первую очередь прикреплённая картинка/картинки крупным
 * планом, а также заголовок». Поэтому подпись автора идёт над картинкой
 * одной строкой, а текст — под ней, как в Instagram.
 */
export function BlogPostCard({
  post,
  onChanged,
  onRemoved,
  expanded = false,
}: {
  post: BlogPostDto;
  onChanged?: (post: BlogPostDto) => void;
  onRemoved?: (id: string) => void;
  /** Страница одного поста: текст сразу целиком, без «Далее». */
  expanded?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const source = post.repostOf;
  const edited = blogEditedLabel(post.editedAt, post.createdAt);
  const { fold, attachBody, attachTitle } = useBlogTextFold(
    post.text,
    source ? null : post.title,
    expanded,
  );
  const favorited = post.favorited ?? false;

  /** Выход из правки возвращает клавиатуру на кнопку, которой её открыли. */
  function closeEditor() {
    setEditing(false);
    window.setTimeout(() => editButtonRef.current?.focus(), 0);
  }

  async function copy() {
    const text = buildBlogPostCopy(post, { origin: window.location.origin });
    const ok = await copyText(text);
    if (!ok) {
      setError("Буфер обмена недоступен.");
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  async function repost() {
    setPending(true);
    setError(null);
    try {
      await repostBlogPost(post.id, { text: "" });
      onChanged?.({ ...post, repostCount: post.repostCount + 1 });
    } catch (cause) {
      setError(cause instanceof BlogApiError ? cause.message : "Не вышло.");
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    setPending(true);
    setError(null);
    try {
      await deleteBlogPost(post.id);
      onRemoved?.(post.id);
    } catch (cause) {
      setError(cause instanceof BlogApiError ? cause.message : "Не вышло.");
      setPending(false);
    }
  }

  /**
   * «Избранное» (VED-238). Звёздочка меняется сразу, а не после ответа: на
   * медленной сети нажатие без отклика нажимают второй раз, и второе
   * нажатие снимало бы только что поставленную отметку.
   */
  async function toggleFavorite() {
    const next = !favorited;
    setError(null);
    onChanged?.({ ...post, favorited: next });
    try {
      await setBlogFavorite(post.id, next);
    } catch (cause) {
      onChanged?.({ ...post, favorited });
      setError(cause instanceof BlogApiError ? cause.message : "Не вышло.");
    }
  }

  async function togglePin() {
    setPending(true);
    setError(null);
    try {
      onChanged?.(await setBlogPostPinned(post.id, !post.pinned));
    } catch (cause) {
      setError(cause instanceof BlogApiError ? cause.message : "Не вышло.");
    } finally {
      setPending(false);
    }
  }

  // Кнопки под постом — в порядке из настройки (VED-509): порядок меняют
  // кнопкой рядом с «Поделиться» на странице поста, и он один на всю ленту.
  const actionOrder = usePostActionsOrder();
  const actions: Record<PostAction, ReactNode> = {
    speak: <BlogSpeakButton key="speak" post={post} />,
    copy: (
      <button
        key="copy"
        type="button"
        onClick={copy}
        className={`${ACTION} hover:border-cyan/60`}
      >
        {copied ? (
          <Check aria-hidden className="size-3.5" />
        ) : (
          <Copy aria-hidden className="size-3.5" />
        )}
        <span className={ACTION_LABEL}>
          {copied ? "Скопировано" : "Копировать"}
        </span>
      </button>
    ),
    favorite: (
      <button
        key="favorite"
        type="button"
        onClick={toggleFavorite}
        aria-pressed={favorited}
        className={`${ACTION} hover:border-gold/60`}
      >
        <Star
          aria-hidden
          className={`size-3.5 ${favorited ? "fill-gold text-gold" : ""}`}
        />
        <span className={ACTION_LABEL}>Избранное</span>
      </button>
    ),
    repost: (
      <button
        key="repost"
        type="button"
        onClick={repost}
        disabled={pending}
        className={`${ACTION} hover:border-cyan/60`}
      >
        <Repeat2 aria-hidden className="size-3.5" />
        <span className={ACTION_LABEL}>Репост</span>
        {post.repostCount > 0 && (
          <span className="text-text-2">{post.repostCount}</span>
        )}
      </button>
    ),
    // Правка стоит среди тех же кнопок, где «Удалить» (VED-321): у репоста
    // её нет вовсе — правится оригинал его автором, и сервер отвечает тем же
    // отказом, даже если кнопку подделать.
    edit: post.canEdit ? (
      <button
        key="edit"
        ref={editButtonRef}
        type="button"
        onClick={() => {
          setError(null);
          setEditing(true);
        }}
        disabled={pending}
        className={`${ACTION} hover:border-cyan/60`}
      >
        <Pencil aria-hidden className="size-3.5" />
        <span className={ACTION_LABEL}>Изменить</span>
      </button>
    ) : null,
    pin: post.canModerate ? (
      <button
        key="pin"
        type="button"
        onClick={togglePin}
        disabled={pending}
        className={`${ACTION} hover:border-gold/60`}
      >
        <Pin aria-hidden className="size-3.5" />
        <span className={ACTION_LABEL}>
          {post.pinned ? "Открепить" : "Закрепить"}
        </span>
      </button>
    ) : null,
    delete: post.canManage ? (
      <button
        key="delete"
        type="button"
        onClick={remove}
        disabled={pending}
        className={`${ACTION} hover:border-magenta/60`}
      >
        <Trash2 aria-hidden className="size-3.5" />
        <span className={ACTION_LABEL}>Удалить</span>
      </button>
    ) : null,
  };

  return (
    <article className="overflow-hidden rounded-2xl border border-glass-brd bg-glass">
      <header className="flex items-center gap-3 px-4 py-2">
        <Link
          href={`/blog/authors/${post.author.id}`}
          className="flex min-w-0 items-center gap-3"
        >
          <Avatar name={post.author.name} url={post.author.avatarUrl} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-text-0">
              {post.author.name}
            </span>
            {/* `--vm-text-1`, а не `--vm-text-2`: на тёмной теме поверх
                стекла карточки вторая ступень даёт 4,06:1 при 11px — ниже
                порога, а в этой строке теперь стоит ещё и отметка о правке,
                которую надо прочитать. */}
            <span className="block text-[11px] text-text-1">
              {blogPostDate(post.createdAt)}
              {/* Отметка о правке — той же тихой строкой, что дата: пост
                  поправили, а не опубликовали заново (VED-321). */}
              {edited && ` · ${edited}`}
              {post.pinned && " · закреплено"}
              {!post.inFeed && " · вне ленты"}
            </span>
          </span>
        </Link>
        {/* «Далее / Свернуть» — в шапке, справа (VED-501): внизу, под
            развёрнутым текстом, до неё и до остальных кнопок «слишком долго
            мотать». У репоста своя кнопка — под чужим текстом. */}
        {!editing && !source && (
          <BlogMoreButton fold={fold} compact className="ml-auto shrink-0" />
        )}
      </header>

      {editing ? (
        <BlogPostEditor
          post={post}
          onSaved={(saved) => {
            onChanged?.(saved);
            closeEditor();
          }}
          onCancel={closeEditor}
        />
      ) : (
        <>
          {source ? (
            <RepostSource source={source} />
          ) : (
            <>
              <BlogMedia media={postMedia(post)} alt={post.title} />
              {post.link && post.media.length === 0 && (
                <BlogPostLinkCover link={post.link} alt={post.title} />
              )}
              {/* 16px, а не 18px (VED-371): Unbounded широкий, и при 18px
                  заголовок в три слова на телефоне ложился в две строки —
                  22px на карточку, которых не хватало третьему посту.
                  Отступ сверху нужен только под картинкой: без неё над
                  заголовком уже стоит шапка со своим отступом. */}
              {post.title && (
                <p
                  id={fold.titleId}
                  ref={attachTitle}
                  className={`px-4 font-display text-base leading-snug text-text-0 ${
                    post.images.length > 0 || post.link?.imageUrl
                      ? "pt-3"
                      : "pt-0.5"
                  } ${fold.titleClassName}`}
                >
                  {post.title}
                </p>
              )}
            </>
          )}

          {/* Свёрнутый текст (VED-371): пост теперь бывает на восемь
              страниц, и целиком развёрнутым он выталкивает из ленты
              соседей. Кнопка «Далее» — первой в ряду действий ниже. */}
          <BlogPostText fold={fold} attach={attachBody} className="px-4 pt-1" />
          {!source && post.link && (
            <BlogPostLinkButton link={post.link} className="mx-4 mt-2" />
          )}

          <footer className="flex flex-nowrap items-center gap-1.5 px-4 pb-2 pt-2 max-sm:gap-1">
            {actionOrder.map((id) => actions[id])}
          </footer>
        </>
      )}

      {post.canModerate && !editing && (
        <BlogLifetimeControl post={post} onChanged={onChanged} />
      )}

      {error && (
        <p role="alert" className="px-4 pb-3 text-xs text-magenta">
          {error}
        </p>
      )}
    </article>
  );
}

/** Вложенная карточка исходного поста под репостом. */
function RepostSource({
  source,
}: {
  source: NonNullable<BlogPostDto["repostOf"]>;
}) {
  const { fold, attachBody, attachTitle } = useBlogTextFold(
    source.text,
    source.title,
  );
  return (
    <div className="mx-4 mb-3 rounded-xl border border-glass-brd bg-bg-1 p-3">
      <p className="mb-2 text-[11px] text-text-2">
        Репост:{" "}
        <Link
          href={`/blog/authors/${source.author.id}`}
          className="underline underline-offset-2"
        >
          {source.author.name}
        </Link>
      </p>
      {source.title && (
        <p
          id={fold.titleId}
          ref={attachTitle}
          className={`mb-1 font-display text-base text-text-0 ${fold.titleClassName}`}
        >
          {source.title}
        </p>
      )}
      <BlogMedia media={postMedia(source)} alt={source.title} compact />
      {source.link && source.media.length === 0 && (
        <BlogPostLinkCover link={source.link} alt={source.title} />
      )}
      {/* Чужой длинный текст сворачивается так же: репост вдвое длиннее
          оригинала — это не то, что человек пересылал. */}
      <BlogPostText fold={fold} attach={attachBody} className="mt-2" />
      {source.link && (
        <BlogPostLinkButton link={source.link} className="mt-2" />
      )}
      <BlogMoreButton fold={fold} className="mt-2 w-full" />
    </div>
  );
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        className="size-9 shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-bg-2 text-sm font-semibold text-text-1"
    >
      {name.slice(0, 1)}
    </span>
  );
}

const subscribeNothing = () => () => {};

/**
 * «Слушать» (VED-476): пост читает голос браузера. Кнопки нет, где синтеза
 * речи нет, и у поста без текста. Нажатие во время чтения — «Стоп».
 */
function BlogSpeakButton({ post }: { post: BlogPostDto }) {
  const speakingId = useSyncExternalStore(
    subscribeBlogSpeech,
    getBlogSpeakingId,
    getBlogSpeakingServerId,
  );
  const available = useSyncExternalStore(
    subscribeNothing,
    canSpeak,
    () => false,
  );
  const speaking = speakingId === post.id;

  // Карточка ушла со страницы — голос не должен читать в пустоту.
  useEffect(
    () => () => {
      if (getBlogSpeakingId() === post.id) stopBlogSpeech();
    },
    [post.id],
  );

  const text = buildSpokenPost(post);
  if (!available || !text) return null;

  return (
    <button
      type="button"
      onClick={() =>
        speaking ? stopBlogSpeech() : speakBlogPost(post.id, text)
      }
      aria-pressed={speaking}
      className={`${ACTION} hover:border-cyan/60 ${speaking ? "border-cyan" : ""}`}
    >
      {speaking ? (
        <Square aria-hidden className="size-3.5" fill="currentColor" />
      ) : (
        <Volume2 aria-hidden className="size-3.5" />
      )}
      <span className={ACTION_LABEL}>{speaking ? "Стоп" : "Слушать"}</span>
    </button>
  );
}
