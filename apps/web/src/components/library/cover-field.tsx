"use client";

import { useEffect, useMemo, useState } from "react";
import type { LibraryLocale } from "@vedamatch/shared";
import { COVER_IMAGE_ACCEPT, isCoverImage } from "./cover-image";
import { CoverPicture } from "./cover-picture";
import { t } from "./i18n";

/**
 * Выбор картинки материала в формах публикации (VED-344, VED-355).
 *
 * Одна на обе формы — мастер и «Профи»: раньше поле было только в мастере,
 * и катху из «Профи» публиковали без картинки, не понимая, куда её деть.
 *
 * Показываем выбранное тем же `CoverPicture`, которым картинка выводится в
 * карточке и на странице материала: кадр вписан целиком, поля занимает его
 * же размытая копия. Заказчик дважды просил «чтобы помещалась полностью», и
 * увидеть это надо до публикации, а не после.
 *
 * Файл уезжает не отсюда: эндпоинт обложки требует уже созданную запись, и
 * заливкой занимается форма после ответа на создание.
 */
export function CoverField({
  locale,
  file,
  onChange,
  hasLink,
  idPrefix,
  disabled = false,
}: {
  locale: LibraryLocale;
  file: File | null;
  onChange: (file: File | null) => void;
  /** Материал со ссылкой: картинку ему попробует взять обогащение. */
  hasLink: boolean;
  /** Префикс id — на странице бывает больше одного поля обложки. */
  idPrefix: string;
  disabled?: boolean;
}) {
  const [rejected, setRejected] = useState(false);
  const preview = useObjectUrl(file);
  const hintId = `${idPrefix}-cover-hint`;

  return (
    <div>
      <label className="text-sm text-text-1">
        {t(locale, "add.cover")}{" "}
        <span className="text-text-2">— {t(locale, "add.optional")}</span>
        <input
          type="file"
          // С файловым менеджером на Android (VED-134); не-картинку
          // отсекаем здесь же, ниже.
          accept={COVER_IMAGE_ACCEPT}
          disabled={disabled}
          onChange={(event) => {
            const chosen = event.target.files?.[0] ?? null;
            // Через файловый менеджер можно выбрать что угодно (VED-134), а
            // загрузка картинки после создания молчит о неудаче — поэтому
            // неподходящий файл отбиваем до отправки.
            const unsupported = chosen !== null && !isCoverImage(chosen);
            setRejected(unsupported);
            onChange(unsupported ? null : chosen);
            if (unsupported) event.target.value = "";
          }}
          aria-describedby={hintId}
          className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-sm text-text-0"
        />
      </label>
      <span id={hintId} className="mt-1 block text-xs text-text-2">
        {t(locale, hasLink ? "add.coverHintUrl" : "add.coverHint")} ·{" "}
        {t(locale, "add.coverFits")}
        {file && ` · ${t(locale, "add.coverChosen")}: ${file.name}`}
      </span>

      {rejected && (
        <span role="alert" className="mt-1 block text-xs text-magenta">
          {t(locale, "entry.previewUnsupportedType")}
        </span>
      )}

      {preview && (
        <div className="mt-2">
          <div className="overflow-hidden rounded-2xl border border-glass-brd">
            <CoverPicture src={preview} alt={t(locale, "add.coverPreview")} />
          </div>
          <button
            type="button"
            onClick={() => {
              setRejected(false);
              onChange(null);
            }}
            disabled={disabled}
            className="mt-2 rounded-xl border border-glass-brd px-3 py-1.5 text-xs text-text-1 hover:text-text-0 disabled:opacity-50"
          >
            {t(locale, "add.coverClear")}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Адрес выбранного файла для показа. Отзывается при смене файла и при уходе
 * с формы: без этого каждая примерка картинки оставляла бы в памяти вкладки
 * копию файла до перезагрузки страницы.
 */
function useObjectUrl(file: File | null): string | null {
  // Через useMemo, а не состоянием в эффекте: setState в теле эффекта даёт
  // лишний проход рендера, и правило react-hooks/set-state-in-effect это
  // запрещает. Отзывом занимается эффект — ему адрес приходит уже готовым.
  const url = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file],
  );

  useEffect(() => {
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);

  return url;
}
