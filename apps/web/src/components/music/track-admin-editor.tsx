"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { MusicArtistDto, MusicTrackDetailDto } from "@vedamatch/shared";
import { updateMusicTrack } from "@/lib/music-admin-client-api";
import {
  buildTrackEditPatch,
  type MusicTrackEditState,
} from "@/lib/music-track-edit";
import { MusicBlankLinesTool } from "./music-blank-lines-tool";
import { MusicCoverField } from "./cover-field";
import {
  MUSIC_LYRICS_EDIT_PARAM,
  wantsLyricsEdit,
  wantsTrackEdit,
} from "./player/lyrics-edit-link";

const fieldClass =
  "w-full rounded-lg border border-glass-brd bg-bg-1 px-2.5 text-sm text-text-0";

function stateOf(track: MusicTrackDetailDto): MusicTrackEditState {
  return {
    title: track.title,
    artistId: track.artist?.id ?? "",
    artistCredit: track.artistCredit ?? "",
    lyrics: track.lyrics.lyrics ?? "",
    transliteration: track.lyrics.transliteration ?? "",
    translation: track.lyrics.translation ?? "",
  };
}

/**
 * Правка записи прямо в карточке — для редакции Музыки (VED-102, VED-109).
 *
 * Название и исполнителя раньше можно было поправить только в админке, а
 * текст бхаджана и картинку записи — нигде: колонки в базе были, формы не
 * было. Редакция замечает опечатку, когда слушает, то есть здесь, и уходить
 * ради неё в админку и искать запись в списке — лишний круг.
 *
 * Свёрнуто по умолчанию: карточку открывают слушать, и форма на полэкрана
 * мешала бы самой редакции.
 *
 * Открывается и параметром `?edit=lyrics` в адресе (VED-269), не только
 * своей кнопкой — так на неё ведёт кнопка-карандаш в панели текста плеера
 * (`lyrics-panel.tsx`): та смонтирована глобально и не имеет права
 * импортировать эту форму напрямую (компонент портала не может
 * импортировать компоненты Музыки), а ссылка — может. Тот же приём, что у
 * шторки «В плейлист» и параметра `?add=1`. При таком открытии форма ещё и
 * прокручивает к себе страницу и ставит фокус в поле «Текст бхаджана» —
 * человек пришёл сюда именно за ним, а не разглядывать название записи
 * сверху.
 */
export function MusicTrackAdminEditor({
  track,
  artists,
}: {
  track: MusicTrackDetailDto;
  artists: MusicArtistDto[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const forLyrics = wantsLyricsEdit(params);
  // «Редактировать запись» в ряду действий (VED-657) — тоже адресом.
  const fromUrl = forLyrics || wantsTrackEdit(params);
  const sectionRef = useRef<HTMLElement | null>(null);
  const initial = stateOf(track);
  // Та же схема, что у `MusicAddToPlaylist`: открытость выводится из
  // адреса, а не переносится в состояние эффектом.
  const open = fromUrl;
  const [draft, setDraft] = useState<MusicTrackEditState>(initial);
  /** `undefined` — картинку не трогали, см. `buildTrackEditPatch`. */
  const [coverKey, setCoverKey] = useState<string | null | undefined>(
    undefined,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const lyricsFieldRef = useRef<HTMLTextAreaElement | null>(null);

  const patch = buildTrackEditPatch(initial, draft, coverKey);
  const changed = Object.keys(patch).length > 0;

  // Пришли по ссылке из панели текста плеера — форма сама раскрыта видимой
  // строкой ниже (`open`), а сюда, в поле «Текст бхаджана», нужно ещё и
  // докрутить страницу и поставить фокус: человек искал не саму запись, а
  // конкретно это поле.
  useEffect(() => {
    if (!fromUrl) return;
    if (!forLyrics) {
      // Кнопка стоит выше, в ряду действий, — форму надо показать.
      sectionRef.current?.scrollIntoView({ block: "start" });
      return;
    }
    lyricsFieldRef.current?.scrollIntoView({ block: "center" });
    lyricsFieldRef.current?.focus();
    // Зависимость только от `fromUrl` — срабатывает один раз на переход по
    // ссылке, а не на каждый рендер: иначе любой ввод в поле (он тоже
    // меняет рендер формы) уводил бы фокус с текущей позиции курсора
    // обратно в начало поля.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- см. выше
  }, [fromUrl]);

  function set<K extends keyof MusicTrackEditState>(key: K, value: string) {
    setDraft((was) => ({ ...was, [key]: value }));
    setSaved(false);
  }

  // Общее закрытие для «Отмена» и после успешного сохранения. Снимает
  // параметр из адреса, если форму открыла ссылка из панели текста плеера:
  // иначе «назад» в браузере возвращал бы форму раскрытой, а обновление
  // страницы открывало бы её заново — та же причина, что и в
  // `MusicAddToPlaylist`.
  function closeForm() {
    if (fromUrl) {
      const rest = new URLSearchParams(params.toString());
      rest.delete(MUSIC_LYRICS_EDIT_PARAM);
      const query = rest.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    }
  }

  function cancel() {
    setDraft(stateOf(track));
    setCoverKey(undefined);
    setError(null);
    closeForm();
  }

  async function save() {
    setPending(true);
    setError(null);
    try {
      await updateMusicTrack(track.id, patch);
      setCoverKey(undefined);
      setSaved(true);
      closeForm();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось сохранить");
    } finally {
      setPending(false);
    }
  }

  // Кнопка открытия — в ряду действий записи (VED-657, `TrackEditButton`);
  // здесь, пока форма свёрнута, остаётся только отметка «Сохранено».
  if (!open) {
    return saved ? (
      <p role="status" className="mt-6 text-xs text-cyan">
        Сохранено
      </p>
    ) : null;
  }

  return (
    <section
      ref={sectionRef}
      aria-label="Правка записи"
      className="glass mt-6 rounded-2xl border border-glass-brd p-4"
    >
      <h2 className="font-display text-base font-bold text-text-0">
        Правка записи
      </h2>
      <p className="mt-1 text-xs text-text-2">
        Видно только редакции Музыки. Изменения сразу видят все слушатели.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs text-text-2">Название</span>
          <input
            value={draft.title}
            onChange={(event) => set("title", event.target.value)}
            maxLength={200}
            className={`${fieldClass} h-9`}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs text-text-2">Исполнитель</span>
          <select
            value={draft.artistId}
            onChange={(event) => set("artistId", event.target.value)}
            className={`${fieldClass} h-9`}
          >
            <option value="">Не указан</option>
            {artists.map((artist) => (
              <option key={artist.id} value={artist.id}>
                {artist.name}
              </option>
            ))}
          </select>
        </label>

        {/* Подпись под названием только у этой записи (VED-660): папка
            исполнителя и другие его записи не меняются. */}
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs text-text-2">
            Подпись исполнителя у этой записи
          </span>
          <input
            value={draft.artistCredit}
            onChange={(event) => set("artistCredit", event.target.value)}
            maxLength={200}
            placeholder={
              artists.find((artist) => artist.id === draft.artistId)?.name ??
              "Как у исполнителя"
            }
            className={`${fieldClass} h-9`}
          />
          <span className="mt-1 block text-xs text-text-2">
            Пусто — подпись по исполнителю.
          </span>
        </label>
      </div>

      <div className="mt-3">
        <MusicCoverField
          scope="track"
          value={coverKey ?? null}
          onChange={setCoverKey}
          label="Картинка записи — без неё показывается обложка альбома или исполнителя"
        />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        {(
          [
            ["lyrics", "Текст бхаджана"],
            ["transliteration", "Транслитерация"],
            ["translation", "Перевод"],
          ] as const
        ).map(([key, label]) => (
          <div key={key}>
            <label className="block">
              <span className="mb-1 block text-xs text-text-2">{label}</span>
              <textarea
                // Только у «Текст бхаджана»: сюда докручивает и ставит фокус
                // переход по ссылке из панели плеера — остальные два поля
                // этой ссылкой не адресуются.
                ref={key === "lyrics" ? lyricsFieldRef : undefined}
                value={draft[key]}
                onChange={(event) => set(key, event.target.value)}
                rows={8}
                className={`${fieldClass} py-2 font-body leading-relaxed`}
              />
            </label>
            {/* Уборка пустых строк (VED-477) — под каждым полем. */}
            <MusicBlankLinesTool
              label={label}
              value={draft[key]}
              onChange={(next) => set(key, next)}
              disabled={pending}
            />
          </div>
        ))}
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-magenta">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!changed || pending}
          onClick={() => void save()}
          className="btn-mint h-9 rounded-xl px-4 text-sm font-semibold disabled:opacity-50"
        >
          {pending ? "Сохраняем…" : "Сохранить"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={cancel}
          className="h-9 rounded-xl px-3 text-sm text-text-2 hover:text-text-0"
        >
          Отмена
        </button>
      </div>
    </section>
  );
}
