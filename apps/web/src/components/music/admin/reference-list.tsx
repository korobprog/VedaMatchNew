"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MusicCategoryKind } from "@vedamatch/shared";
import {
  deleteMusicAlbum,
  deleteMusicArtist,
  deleteMusicCategory,
  updateMusicAlbum,
  updateMusicArtist,
  updateMusicCategory,
} from "@/lib/music-admin-client-api";
import { Alert } from "@/components/ui/alert";
import { MusicCover } from "@/components/music/music-cover";
import { MusicCoverField } from "@/components/music/cover-field";

export type MusicReferenceKind = "artist" | "album" | "category";

export interface MusicReferenceRow {
  id: string;
  primary: string;
  secondary: string;
  badge: string | null;
  /** Обложка, если она уже есть. У разделов каталога обложек не бывает. */
  coverUrl?: string | null;
  /**
   * Вид раздела каталога (VED-165). Только для `kind === "category"` — по
   * ней рисуется переключатель «Корневая» / «Стиль» прямо в списке: без
   * него увидеть, что уже стоит у категории, можно было бы только в базе.
   */
  categoryKind?: MusicCategoryKind;
  /**
   * Корневая категория исполнителя (VED-165-2). Только для
   * `kind === "artist"`, вместе с `rootCategories` у списка: без него у
   * редакции нет способа увидеть или поменять разметку, не открывая каждого
   * исполнителя формой.
   */
  rootCategoryId?: string | null;
  /**
   * Чтец раздела «Аудиокниги» (VED-237). Только для `kind === "artist"`:
   * отметка стоит у исполнителя, и все его записи уходят в раздел, включая
   * будущие.
   */
  isAudiobook?: boolean;
}

/** Опция выбора корневой категории — ровно то, что нужно `<select>` в строке. */
export interface MusicReferenceRootOption {
  id: string;
  title: string;
}

/**
 * Список справочника с правкой и удалением.
 *
 * До этого список был только для чтения: API умел `PATCH` и `DELETE` с
 * самого начала, но клиент звал одни `create*`, и опечатку в имени
 * исполнителя нельзя было исправить ничем, кроме запроса в базу.
 *
 * Переименование идёт на месте, а не в отдельном окне: правится ровно одно
 * поле, и модальное окно ради одной строки — лишний шаг. Слаг не трогаем,
 * его держит сервер: адрес, разъезжающийся с названием на каждой правке,
 * ломает уже разосланные ссылки.
 *
 * Удаление в два нажатия и без `confirm()`: системное окно не переживает
 * тему портала и не объясняет, что именно исчезнет. Ответ сервера — почему
 * не вышло («сначала перевесьте записи») — показывается прямо в строке.
 *
 * Обложка правится здесь же (VED-19). Раньше её можно было задать только при
 * создании карточки: у заведённого исполнителя картинку было не поменять
 * ничем, а альбом без обложки так и оставался серым. Сервер это умел с самого
 * начала — не хватало кнопки.
 */
export function MusicReferenceList({
  title,
  empty,
  kind,
  rows,
  rootCategories,
  selection,
}: {
  title: string;
  empty: string;
  kind: MusicReferenceKind;
  rows: MusicReferenceRow[];
  /**
   * Варианты корневой категории (VED-165-2) — только для `kind === "artist"`.
   * Без списка `<select>` в строке не рисуется: подставить категорию, о
   * которой список не знает, было бы нечем.
   */
  rootCategories?: MusicReferenceRootOption[];
  /** Выбор строк чекбоксами — используется массовым действием над списком. */
  selection?: {
    selectedIds: ReadonlySet<string>;
    onToggle: (id: string) => void;
  };
}) {
  return (
    <section className="glass rounded-2xl border border-glass-brd p-4">
      <h3 className="mb-3 font-display text-base font-bold text-text-0">
        {title}
      </h3>
      {rows.length === 0 ? (
        <p className="text-sm text-text-2">{empty}</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((row) => (
            <Row
              key={row.id}
              row={row}
              kind={kind}
              rootCategories={rootCategories}
              selected={selection?.selectedIds.has(row.id) ?? false}
              onToggleSelected={
                selection ? () => selection.onToggle(row.id) : undefined
              }
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function Row({
  row,
  kind,
  rootCategories,
  selected,
  onToggleSelected,
}: {
  row: MusicReferenceRow;
  kind: MusicReferenceKind;
  rootCategories?: MusicReferenceRootOption[];
  selected: boolean;
  onToggleSelected?: () => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "rename" | "confirm" | "cover">(
    "view",
  );
  const [name, setName] = useState(row.primary);
  /* Ключ новой обложки и признак «её трогали». Без второго нажатие
     «Сохранить» сразу после открытия сняло бы обложку, которая уже стоит. */
  const [coverKey, setCoverKey] = useState<string | null>(null);
  const [coverTouched, setCoverTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setPending(true);
    setError(null);
    try {
      await action();
      setMode("view");
      router.refresh();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setPending(false);
    }
  }

  const rename = () => {
    const next = name.trim();
    if (!next || next === row.primary) {
      setMode("view");
      return;
    }
    void run(() =>
      kind === "artist"
        ? updateMusicArtist(row.id, { name: next })
        : kind === "album"
          ? updateMusicAlbum(row.id, { title: next })
          : updateMusicCategory(row.id, { title: next }),
    );
  };

  /**
   * Переключатель вида раздела (VED-165). Прямо в списке, а не отдельной
   * формой: категорий немного, а решение «это корневая или стиль» — то, что
   * редакция может захотеть поправить сразу, увидев список целиком.
   */
  const toggleKind = () =>
    void run(() =>
      updateMusicCategory(row.id, {
        kind: row.categoryKind === "root" ? "style" : "root",
      }),
    );

  /**
   * Корневая категория исполнителя (VED-165-2), прямо в списке — тем же
   * приёмом, что переключатель вида раздела: точечная правка одного
   * исполнителя без открытия отдельной формы. Массовая простановка сразу
   * нескольким — в панели над списком (`MusicBulkArtistRootCategoryBar`).
   */
  const setRootCategory = (rootCategoryId: string) =>
    void run(() =>
      updateMusicArtist(row.id, { rootCategoryId: rootCategoryId || null }),
    );

  /**
   * Отметка «это аудиокниги» (VED-237) — тем же приёмом, что корневая
   * категория выше. Массовая отметка нескольким сразу — в панели над
   * списком (`MusicBulkArtistAudiobookBar`).
   */
  const toggleAudiobook = () =>
    void run(() =>
      updateMusicArtist(row.id, { isAudiobook: !row.isAudiobook }),
    );

  /** Обложка есть только у исполнителя и альбома: раздел каталога — просто имя. */
  const coverScope = kind === "artist" ? "artist" : "album";
  const saveCover = () =>
    void run(() =>
      kind === "artist"
        ? updateMusicArtist(row.id, { coverKey })
        : updateMusicAlbum(row.id, { coverKey }),
    );

  const remove = () =>
    void run(() =>
      kind === "artist"
        ? deleteMusicArtist(row.id)
        : kind === "album"
          ? deleteMusicAlbum(row.id)
          : deleteMusicCategory(row.id),
    );

  const iconButton =
    "flex size-8 shrink-0 items-center justify-center rounded-lg text-text-2 transition-colors hover:text-text-0 disabled:opacity-40";

  return (
    <li className="rounded-lg px-1 py-1.5">
      {mode === "rename" ? (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") rename();
              if (event.key === "Escape") {
                setName(row.primary);
                setMode("view");
              }
            }}
            maxLength={120}
            aria-label={`Название: ${row.primary}`}
            className="h-9 min-w-0 flex-1 rounded-lg border border-glass-brd bg-bg-1 px-2.5 text-sm text-text-0"
          />
          <button
            type="button"
            onClick={rename}
            disabled={pending}
            className="btn-mint h-9 shrink-0 rounded-lg px-3 text-sm font-semibold disabled:opacity-50"
          >
            Сохранить
          </button>
          <button
            type="button"
            onClick={() => {
              setName(row.primary);
              setMode("view");
              setError(null);
            }}
            className="h-9 shrink-0 rounded-lg px-2 text-sm text-text-2 hover:text-text-0"
          >
            Отмена
          </button>
        </div>
      ) : mode === "cover" ? (
        <div className="flex flex-col gap-2">
          <MusicCoverField
            scope={coverScope}
            value={coverKey}
            onChange={(next) => {
              setCoverKey(next);
              setCoverTouched(true);
            }}
            label={`Обложка: ${row.primary}`}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={saveCover}
              /* Пока обложку не трогали, сохранять нечего: иначе нажатие
                 сразу после открытия сняло бы ту, что уже стоит. */
              disabled={pending || !coverTouched}
              className="btn-mint h-9 shrink-0 rounded-lg px-3 text-sm font-semibold disabled:opacity-50"
            >
              Сохранить
            </button>
            <button
              type="button"
              onClick={() => {
                setCoverKey(null);
                setCoverTouched(false);
                setMode("view");
                setError(null);
              }}
              className="h-9 shrink-0 rounded-lg px-2 text-sm text-text-2 hover:text-text-0"
            >
              Отмена
            </button>
          </div>
        </div>
      ) : mode === "confirm" ? (
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm text-text-1">
            Удалить «{row.primary}» безвозвратно?
          </span>
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="h-9 shrink-0 rounded-lg border border-magenta/50 px-3 text-sm font-semibold text-magenta disabled:opacity-50"
          >
            Удалить
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("view");
              setError(null);
            }}
            className="h-9 shrink-0 rounded-lg px-2 text-sm text-text-2 hover:text-text-0"
          >
            Отмена
          </button>
        </div>
      ) : (
        <div className="flex items-baseline gap-2">
          {onToggleSelected && (
            // Цель 32×32 вокруг галочки 16 — та же, что у списка записей:
            // мельче 24×24 не проходит по WCAG 2.5.8.
            <label className="flex size-8 shrink-0 cursor-pointer items-center justify-center self-center">
              <input
                type="checkbox"
                checked={selected}
                onChange={onToggleSelected}
                aria-label={`Выбрать «${row.primary}»`}
                className="size-4"
              />
            </label>
          )}
          {kind !== "category" && (
            <span
              aria-hidden
              className="size-9 shrink-0 self-center overflow-hidden rounded-lg border border-glass-brd"
            >
              <MusicCover url={row.coverUrl ?? null} seed={row.id} alt="" rounded="rounded-lg" />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-text-0">
              {row.primary}
            </span>
            <span className="block truncate text-xs text-text-2">
              {row.secondary}
            </span>
          </span>
          {row.badge && (
            <span className="shrink-0 self-center rounded-full border border-cyan/40 px-2 text-[11px] text-cyan">
              {row.badge}
            </span>
          )}
          {kind === "artist" && rootCategories && rootCategories.length > 0 && (
            <label className="shrink-0 self-center">
              <span className="sr-only">
                Корневая категория «{row.primary}»
              </span>
              <select
                value={row.rootCategoryId ?? ""}
                onChange={(event) => setRootCategory(event.target.value)}
                disabled={pending}
                className="h-7 rounded-full border border-glass-brd bg-bg-1 px-2 text-[11px] text-text-1 disabled:opacity-50"
              >
                <option value="">Без категории</option>
                {rootCategories.map((root) => (
                  <option key={root.id} value={root.id}>
                    {root.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          {kind === "artist" && row.isAudiobook !== undefined && (
            <button
              type="button"
              onClick={toggleAudiobook}
              disabled={pending}
              aria-label={`«${row.primary}»: ${
                row.isAudiobook
                  ? "чтец, записи вне каталога Музыки"
                  : "записи в каталоге Музыки"
              }. Нажмите, чтобы ${
                row.isAudiobook ? "вернуть в каталог Музыки" : "отметить чтецом"
              }`}
              className={`shrink-0 self-center rounded-full border px-2 text-[11px] transition-colors disabled:opacity-50 ${
                row.isAudiobook
                  ? // Цвет — рамкой и подложкой, а не буквами: одиннадцать
                    // пикселей золотом не дают 4.5:1 ни в одной теме.
                    // Состояние здесь и так названо словом, не оттенком.
                    "border-gold/60 bg-gold/15 text-text-0"
                  : "border-glass-brd text-text-2 hover:text-text-0"
              }`}
            >
              {row.isAudiobook ? "чтец" : "медиатека"}
            </button>
          )}
          {kind === "category" && row.categoryKind && (
            <button
              type="button"
              onClick={toggleKind}
              disabled={pending}
              aria-label={`«${row.primary}» сейчас: ${
                row.categoryKind === "root" ? "корневая" : "стиль"
              }. Нажмите, чтобы сделать ${
                row.categoryKind === "root" ? "стилем" : "корневой"
              }`}
              className={`shrink-0 self-center rounded-full border px-2 text-[11px] transition-colors disabled:opacity-50 ${
                row.categoryKind === "root"
                  ? "border-magenta/40 text-magenta hover:bg-magenta/10"
                  : "border-glass-brd text-text-2 hover:text-text-0"
              }`}
            >
              {row.categoryKind === "root" ? "корневая" : "стиль"}
            </button>
          )}
          {kind !== "category" && (
            <button
              type="button"
              onClick={() => setMode("cover")}
              aria-label={`Обложка «${row.primary}»`}
              className={`${iconButton} self-center`}
            >
              <svg
                viewBox="0 0 24 24"
                className="size-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
            </button>
          )}
          <button
            type="button"
            onClick={() => setMode("rename")}
            aria-label={`Переименовать «${row.primary}»`}
            className={`${iconButton} self-center`}
          >
            <svg
              viewBox="0 0 24 24"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setMode("confirm")}
            aria-label={`Удалить «${row.primary}»`}
            className={`${iconButton} self-center hover:text-magenta`}
          >
            <svg
              viewBox="0 0 24 24"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
            </svg>
          </button>
        </div>
      )}

      {error && (
        <div className="mt-1.5">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
    </li>
  );
}
