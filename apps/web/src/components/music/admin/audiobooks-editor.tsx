"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  MusicAdminAudiobookChapterDto,
  MusicAdminAudiobookDto,
  MusicArtistDto,
  MusicAudiobookKind,
  MusicTrackStatus,
} from "@vedamatch/shared";
import {
  createMusicAudiobook,
  deleteMusicAudiobook,
  findMusicAudiobookCandidates,
  setMusicAudiobookChapters,
  updateMusicAudiobook,
} from "@/lib/music-admin-client-api";
import { MusicCoverField } from "@/components/music/cover-field";
import { Alert } from "@/components/ui/alert";
import { formatTrackDuration } from "@/lib/music-duration";
import { plural } from "@/lib/plural";
import { moveChapter } from "./audiobook-order";
import {
  AUDIOBOOK_KIND_COPY,
  audiobookHref,
} from "@/components/music/audiobook-kind";

const field =
  "min-h-11 w-full rounded-lg border border-glass-brd bg-bg-1 px-2.5 text-sm text-text-0";
const smallButton =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-glass-brd px-2 text-sm text-text-1 hover:text-text-0 disabled:opacity-40";

const STATUS_LABEL: Record<MusicTrackStatus, string> = {
  published: "опубликована",
  pending: "ждёт проверки",
  draft: "черновик",
  rejected: "отклонена",
  hidden: "скрыта",
};

const message = (cause: unknown, fallback: string) =>
  cause instanceof Error ? cause.message : fallback;

/**
 * Редактор аудиокниг (VED-297). Книга — самостоятельная единица: название,
 * автор, чтец, описание, обложка и главы по порядку. Главы — записи
 * каталога: их берут из уже загруженного (поиском или из записей чтеца) или
 * грузят новыми прямо в книгу.
 *
 * Состав книги уходит на сервер целиком после каждого действия — добавить,
 * убрать, переставить — поэтому кнопки «Сохранить порядок» нет и порядок не
 * теряется, если закрыть вкладку посреди работы.
 */
export function MusicAudiobooksEditor({
  kind = "audiobook",
  books: allBooks,
  unassigned,
  artists,
}: {
  /** Раздел, который правит вкладка: «Аудиокниги» или «Лекции» (VED-437). */
  kind?: MusicAudiobookKind;
  books: MusicAdminAudiobookDto[];
  unassigned: MusicAdminAudiobookChapterDto[];
  artists: MusicArtistDto[];
}) {
  const books = allBooks.filter((book) => book.kind === kind);
  const section = AUDIOBOOK_KIND_COPY[kind].section;
  return (
    <div className="flex flex-col gap-6">
      <NewAudiobookForm artists={artists} kind={kind} />

      {unassigned.length > 0 && (
        <UnassignedTracks tracks={unassigned} books={books} />
      )}

      {books.length === 0 ? (
        <p className="text-sm text-text-1">
          {kind === "lecture" ? "Циклов" : "Книг"} пока нет. Создайте первый —
          он появится в разделе «{section}», когда вы отметите его
          опубликованным и в нём будет хотя бы одна опубликованная часть.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {books.map((book) => (
            <li key={book.id}>
              <AudiobookCard book={book} artists={artists} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReaderSelect({
  artists,
  value,
  onChange,
}: {
  artists: MusicArtistDto[];
  value: string;
  onChange: (value: string) => void;
}) {
  // Чтецы (отметка «Аудиокниги» в справочнике) — первыми: книгу почти
  // всегда читает кто-то из них.
  const readers = artists.filter((row) => row.isAudiobook);
  const others = artists.filter((row) => !row.isAudiobook);
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={field}
    >
      <option value="">Не указан</option>
      {readers.length > 0 && (
        <optgroup label="Чтецы">
          {readers.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </optgroup>
      )}
      <optgroup label="Все исполнители">
        {others.map((row) => (
          <option key={row.id} value={row.id}>
            {row.name}
          </option>
        ))}
      </optgroup>
    </select>
  );
}

function NewAudiobookForm({
  artists,
  kind,
}: {
  artists: MusicArtistDto[];
  kind: MusicAudiobookKind;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [readerId, setReaderId] = useState("");
  const [description, setDescription] = useState("");
  const [coverKey, setCoverKey] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      await createMusicAudiobook({
        kind,
        title: title.trim(),
        author: author.trim() || null,
        readerId: readerId || null,
        description: description.trim() || null,
        coverKey,
      });
      setTitle("");
      setAuthor("");
      setReaderId("");
      setDescription("");
      setCoverKey(null);
      router.refresh();
    } catch (cause) {
      setError(message(cause, "Не удалось создать книгу"));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="glass flex flex-col gap-3 rounded-2xl border border-glass-brd p-4">
      <h2 className="font-display text-base font-bold text-text-0">
        {kind === "lecture" ? "Новый цикл лекций" : "Новая книга"}
      </h2>
      <p className="text-xs text-text-2">
        Книга создаётся черновиком: соберите главы, проверьте страницу и
        отметьте «Опубликована». Разные начитки одной книги — разные книги с
        одним названием и разными чтецами.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs text-text-2">Название</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className={field}
            placeholder="Бхагавад-гита как она есть"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-text-2">Автор текста</span>
          <input
            value={author}
            onChange={(event) => setAuthor(event.target.value)}
            className={field}
            placeholder="Шрила Прабхупада"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-text-2">Чтец</span>
          <ReaderSelect
            artists={artists}
            value={readerId}
            onChange={setReaderId}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-text-2">Описание</span>
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className={field}
            placeholder="О чём книга — пара строк"
          />
        </label>
      </div>
      <MusicCoverField scope="audiobook" value={coverKey} onChange={setCoverKey} />
      <button
        type="button"
        disabled={pending || !title.trim()}
        onClick={() => void submit()}
        className="btn-mint min-h-11 self-start rounded-xl px-4 text-sm font-semibold disabled:opacity-50"
      >
        Создать черновик
      </button>
      {error && <Alert tone="error">{error}</Alert>}
    </section>
  );
}

function AudiobookCard({
  book,
  artists,
}: {
  book: MusicAdminAudiobookDto;
  artists: MusicArtistDto[];
}) {
  const router = useRouter();
  /**
   * Состав, показанный до ответа сервера, — вместе с тем списком из
   * пропсов, поверх которого он собран. Пришли свежие пропсы (после
   * `router.refresh()` или правки из списка «вне книг») — прежний черновик
   * сам перестаёт действовать, и экран показывает то, что в базе. Копия
   * пропсов в `useState` здесь застревала: глава, добавленная соседним
   * блоком, не появлялась, пока страницу не перезагрузят.
   */
  const [draft, setDraft] = useState<{
    base: MusicAdminAudiobookChapterDto[];
    list: MusicAdminAudiobookChapterDto[];
  } | null>(null);
  const chapters =
    draft && draft.base === book.chapters ? draft.list : book.chapters;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /**
   * Новый состав — сразу на сервер. Экран меняется до ответа, а при отказе
   * возвращается к тому, что было: иначе на экране остался бы порядок,
   * которого в базе нет.
   */
  async function save(next: MusicAdminAudiobookChapterDto[], done: string) {
    setDraft({ base: book.chapters, list: next });
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await setMusicAudiobookChapters(
        book.id,
        next.map((row) => row.trackId),
      );
      setNotice(done);
      router.refresh();
    } catch (cause) {
      setDraft(null);
      setError(message(cause, "Не удалось сохранить главы"));
    } finally {
      setBusy(false);
    }
  }

  const published = chapters.filter((row) => row.status === "published");
  const status = book.isPublished
    ? published.length > 0
      ? "в разделе"
      : "опубликована, но без опубликованных глав — в разделе не видна"
    : "черновик";

  return (
    <details className="glass group rounded-2xl border border-glass-brd">
      <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 p-4">
        <span className="font-display text-base font-bold text-text-0">
          {book.title}
        </span>
        <span className="text-xs text-text-2">
          {[
            book.readerName ? `читает ${book.readerName}` : null,
            `${chapters.length} ${plural(chapters.length, "глава", "главы", "глав")}`,
            status,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
        <span
          aria-hidden="true"
          className="ml-auto text-text-2 transition-transform group-open:rotate-180"
        >
          ▾
        </span>
      </summary>

      <div className="flex flex-col gap-5 border-t border-glass-brd p-4">
        <div className="flex flex-wrap gap-2">
          <Link
            href={audiobookHref(book.kind, book.slug)}
            className="inline-flex min-h-11 items-center rounded-lg border border-glass-brd px-3 text-sm text-text-1 hover:text-text-0"
          >
            Открыть страницу книги
          </Link>
          <Link
            href={`/music/uploads?audiobook=${encodeURIComponent(book.slug)}`}
            className="inline-flex min-h-11 items-center rounded-lg border border-glass-brd px-3 text-sm text-text-1 hover:text-text-0"
          >
            Загрузить новые главы
          </Link>
        </div>

        <BookFields book={book} artists={artists} />

        <section aria-label={`Главы книги «${book.title}»`}>
          <h3 className="font-display text-sm font-bold text-text-0">Главы</h3>
          {chapters.length === 0 ? (
            <p className="mt-2 text-sm text-text-1">
              Глав пока нет — добавьте из загруженных ниже или загрузите новые.
            </p>
          ) : (
            <ol className="mt-2 flex flex-col gap-1">
              {chapters.map((chapter, at) => (
                <li
                  key={chapter.trackId}
                  className="flex flex-wrap items-center gap-2 rounded-lg px-1 py-1 hover:bg-glass"
                >
                  <span className="w-7 shrink-0 text-right font-mono text-xs text-text-2">
                    {at + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-text-0">
                      {chapter.title}
                    </span>
                    <span className="block text-xs text-text-2">
                      {[
                        formatTrackDuration(chapter.durationSeconds),
                        chapter.status === "published"
                          ? null
                          : `${STATUS_LABEL[chapter.status]} — в разделе не видна`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      disabled={busy || at === 0}
                      onClick={() =>
                        void save(
                          moveChapter(chapters, at, -1),
                          `«${chapter.title}» — теперь глава ${at}`,
                        )
                      }
                      className={smallButton}
                      aria-label={`Поднять главу «${chapter.title}» выше`}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={busy || at === chapters.length - 1}
                      onClick={() =>
                        void save(
                          moveChapter(chapters, at, 1),
                          `«${chapter.title}» — теперь глава ${at + 2}`,
                        )
                      }
                      className={smallButton}
                      aria-label={`Опустить главу «${chapter.title}» ниже`}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void save(
                          chapters.filter((_, index) => index !== at),
                          `«${chapter.title}» убрана из книги`,
                        )
                      }
                      className={smallButton}
                      aria-label={`Убрать главу «${chapter.title}» из книги`}
                    >
                      ✕
                    </button>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <ChapterPicker
          readerId={book.readerId}
          excluded={new Set(chapters.map((row) => row.trackId))}
          disabled={busy}
          onAdd={(track) =>
            void save([...chapters, track], `«${track.title}» — глава ${chapters.length + 1}`)
          }
        />

        <div aria-live="polite">
          {notice && <Alert tone="success">{notice}</Alert>}
          {error && <Alert tone="error">{error}</Alert>}
        </div>

        <DeleteBook book={book} />
      </div>
    </details>
  );
}

function BookFields({
  book,
  artists,
}: {
  book: MusicAdminAudiobookDto;
  artists: MusicArtistDto[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState(book.title);
  const [author, setAuthor] = useState(book.author ?? "");
  const [readerId, setReaderId] = useState(book.readerId ?? "");
  const [description, setDescription] = useState(book.description ?? "");
  const [coverKey, setCoverKey] = useState<string | null>(book.coverKey);
  const [isPublished, setIsPublished] = useState(book.isPublished);
  const [kind, setKind] = useState<MusicAudiobookKind>(book.kind);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit() {
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      await updateMusicAudiobook(book.id, {
        title: title.trim(),
        author: author.trim() || null,
        readerId: readerId || null,
        description: description.trim() || null,
        coverKey,
        isPublished,
        kind,
      });
      setSaved(true);
      router.refresh();
    } catch (cause) {
      setError(message(cause, "Не удалось сохранить"));
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      aria-label={`Карточка книги «${book.title}»`}
      className="flex flex-col gap-3"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs text-text-2">Название</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className={field}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-text-2">Автор текста</span>
          <input
            value={author}
            onChange={(event) => setAuthor(event.target.value)}
            className={field}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-text-2">Чтец</span>
          <ReaderSelect
            artists={artists}
            value={readerId}
            onChange={setReaderId}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-text-2">Раздел</span>
          <select
            value={kind}
            onChange={(event) =>
              setKind(event.target.value as MusicAudiobookKind)
            }
            className={field}
          >
            <option value="audiobook">Аудиокниги</option>
            <option value="lecture">Лекции</option>
          </select>
        </label>
        <label className="flex min-h-11 items-center gap-2.5 self-end">
          <input
            type="checkbox"
            checked={isPublished}
            onChange={(event) => setIsPublished(event.target.checked)}
            className="size-5 shrink-0"
          />
          <span className="text-sm text-text-0">Опубликована</span>
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-xs text-text-2">Описание</span>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          className="w-full rounded-lg border border-glass-brd bg-bg-1 px-2.5 py-2 text-sm text-text-0"
        />
      </label>
      <MusicCoverField
        scope="audiobook"
        value={coverKey}
        onChange={setCoverKey}
        label="Обложка — без неё берётся фото чтеца"
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending || !title.trim()}
          onClick={() => void submit()}
          className="btn-mint min-h-11 rounded-xl px-4 text-sm font-semibold disabled:opacity-50"
        >
          Сохранить карточку
        </button>
        {saved && (
          <span role="status" className="text-sm text-text-1">
            Сохранено
          </span>
        )}
      </div>
      {error && <Alert tone="error">{error}</Alert>}
    </section>
  );
}

/**
 * Подбор глав из уже загруженного. Без слова показывает записи чтеца книги,
 * которые ещё не главы ни одной книги, — с них редакция и начинает; со
 * словом ищет по названию и исполнителю по всему каталогу.
 */
function ChapterPicker({
  readerId,
  excluded,
  disabled,
  onAdd,
}: {
  readerId: string | null;
  excluded: Set<string>;
  disabled: boolean;
  onAdd: (track: MusicAdminAudiobookChapterDto) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<
    MusicAdminAudiobookChapterDto[] | null
  >(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(word: string) {
    setLoading(true);
    setError(null);
    try {
      setResults(await findMusicAudiobookCandidates(word, readerId));
    } catch (cause) {
      setError(message(cause, "Не удалось найти записи"));
    } finally {
      setLoading(false);
    }
  }

  const visible = (results ?? []).filter((row) => !excluded.has(row.trackId));

  return (
    <section className="flex flex-col gap-2" aria-label="Добавить главы">
      <h3 className="font-display text-sm font-bold text-text-0">
        Добавить главы из загруженных
      </h3>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void search(q);
        }}
      >
        <input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          className={`${field} min-w-0 flex-1`}
          placeholder="Название записи или исполнитель"
          aria-label="Поиск записи для главы"
        />
        <button
          type="submit"
          disabled={loading}
          className="min-h-11 rounded-lg border border-glass-brd px-3 text-sm font-semibold text-text-0 disabled:opacity-50"
        >
          Найти
        </button>
        {readerId && (
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              setQ("");
              void search("");
            }}
            className="min-h-11 rounded-lg border border-glass-brd px-3 text-sm text-text-1 hover:text-text-0 disabled:opacity-50"
          >
            Записи чтеца
          </button>
        )}
      </form>
      {error && <Alert tone="error">{error}</Alert>}
      {results !== null &&
        (visible.length === 0 ? (
          <p className="text-sm text-text-1" role="status">
            {q.trim()
              ? "Ничего не нашлось среди записей, которые ещё не главы."
              : "У чтеца нет записей вне книг."}
          </p>
        ) : (
          <ul className="flex max-h-72 flex-col gap-0.5 overflow-y-auto">
            {visible.map((track) => (
              <li
                key={track.trackId}
                className="flex items-center gap-2 rounded-lg px-1 py-0.5 hover:bg-glass"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-text-0">
                    {track.title}
                  </span>
                  <span className="block truncate text-xs text-text-2">
                    {[
                      track.artistName ?? "Исполнитель не указан",
                      formatTrackDuration(track.durationSeconds),
                      track.status === "published"
                        ? null
                        : STATUS_LABEL[track.status],
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onAdd(track)}
                  className="min-h-11 shrink-0 rounded-lg border border-glass-brd px-3 text-sm font-semibold text-text-0 disabled:opacity-50"
                  aria-label={`Добавить «${track.title}» главой`}
                >
                  Добавить
                </button>
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
}

function DeleteBook({ book }: { book: MusicAdminAudiobookDto }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (
      !window.confirm(
        `Удалить книгу «${book.title}»? Записи останутся в каталоге, пропадёт только книга и порядок глав.`,
      )
    ) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await deleteMusicAudiobook(book.id);
      router.refresh();
    } catch (cause) {
      setError(message(cause, "Не удалось удалить книгу"));
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t border-glass-brd pt-4">
      <button
        type="button"
        disabled={pending}
        onClick={() => void remove()}
        className="min-h-11 self-start rounded-lg border border-glass-brd px-3 text-sm font-semibold text-text-1 hover:text-magenta disabled:opacity-50"
      >
        Удалить книгу
      </button>
      {error && <Alert tone="error">{error}</Alert>}
    </div>
  );
}

/**
 * Записи чтецов, которые ещё не главы ни одной книги. В каталоге Медиатеки их нет
 * (чтец отмечен), в разделе тоже — без этого списка они пропадали бы из
 * виду. Каждую можно одним нажатием поставить последней главой книги.
 */
function UnassignedTracks({
  tracks,
  books,
}: {
  tracks: MusicAdminAudiobookChapterDto[];
  books: MusicAdminAudiobookDto[];
}) {
  const router = useRouter();
  const [target, setTarget] = useState(books[0]?.id ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function add(track: MusicAdminAudiobookChapterDto) {
    const book = books.find((row) => row.id === target);
    if (!book) return;
    setBusy(track.trackId);
    setError(null);
    try {
      await setMusicAudiobookChapters(book.id, [
        ...book.chapters.map((row) => row.trackId),
        track.trackId,
      ]);
      router.refresh();
    } catch (cause) {
      setError(message(cause, "Не удалось добавить главу"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="glass flex flex-col gap-3 rounded-2xl border border-glass-brd p-4">
      <h2 className="font-display text-base font-bold text-text-0">
        Записи чтецов вне книг · {tracks.length}
      </h2>
      <p className="text-xs text-text-2">
        Их нет ни в каталоге Медиатеки (исполнитель отмечен чтецом), ни в разделе
        «Аудиокниги» (они не главы). Разложите их по книгам.
      </p>
      {books.length === 0 ? (
        <p className="text-sm text-text-1">
          Сначала создайте книгу — потом сюда вернётся кнопка «В книгу».
        </p>
      ) : (
        <label className="block max-w-md">
          <span className="mb-1 block text-xs text-text-2">
            В какую книгу добавлять
          </span>
          <select
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            className={field}
          >
            {books.map((book) => (
              <option key={book.id} value={book.id}>
                {book.title}
                {book.readerName ? ` — ${book.readerName}` : ""}
              </option>
            ))}
          </select>
        </label>
      )}
      <ul className="flex max-h-72 flex-col gap-0.5 overflow-y-auto">
        {tracks.map((track) => (
          <li
            key={track.trackId}
            className="flex items-center gap-2 rounded-lg px-1 py-0.5 hover:bg-glass"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-text-0">
                {track.title}
              </span>
              <span className="block truncate text-xs text-text-2">
                {[
                  track.artistName,
                  formatTrackDuration(track.durationSeconds),
                  track.status === "published"
                    ? null
                    : STATUS_LABEL[track.status],
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
            {books.length > 0 && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void add(track)}
                className="min-h-11 shrink-0 rounded-lg border border-glass-brd px-3 text-sm font-semibold text-text-0 disabled:opacity-50"
                aria-label={`Добавить «${track.title}» в выбранную книгу`}
              >
                В книгу
              </button>
            )}
          </li>
        ))}
      </ul>
      {error && <Alert tone="error">{error}</Alert>}
    </section>
  );
}
