"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";
import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { stepPreview } from "./picture-queue";

export interface PreviewPicture {
  id: string;
  src: string;
  name: string;
  selected: boolean;
  selectable: boolean;
}

/**
 * Картинка из очереди во весь экран (VED-302): прежде чем прикрепить
 * открытку, её хочется рассмотреть — миниатюра в строке очереди мелкая.
 *
 * Esc и крестик закрывают, стрелки листают соседние. Фокус после закрытия
 * возвращает форма — на миниатюру той картинки, что была открыта последней.
 */
export function PicturePreviewDialog({
  pictures,
  index,
  onIndexChange,
  onToggle,
  onClose,
}: {
  pictures: readonly PreviewPicture[];
  index: number;
  onIndexChange: (index: number) => void;
  onToggle: (id: string) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const picture = pictures[index];
  const many = pictures.length > 1;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  function close() {
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
    else onClose();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (many && event.key === "ArrowRight") {
      event.preventDefault();
      onIndexChange(stepPreview(index, 1, pictures.length));
    } else if (many && event.key === "ArrowLeft") {
      event.preventDefault();
      onIndexChange(stepPreview(index, -1, pictures.length));
    }
  }

  if (!picture) return null;

  const iconButton =
    "inline-flex h-11 w-11 items-center justify-center rounded-full border border-glass-brd bg-bg-1 text-text-0 hover:bg-bg-2";

  return (
    <dialog
      ref={dialogRef}
      aria-label={`Просмотр картинки ${index + 1} из ${pictures.length}`}
      onKeyDown={onKeyDown}
      // Esc браузер закрывает сам; отменяем, чтобы закрытие шло одним путём.
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClose={onClose}
      className="m-0 h-dvh max-h-none w-screen max-w-none bg-bg-0 p-0 text-text-0 backdrop:bg-black/80"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-3 border-b border-glass-brd px-4 py-3">
          <p className="min-w-0 flex-1 truncate text-sm text-text-1">
            <span className="font-mono">
              {index + 1} / {pictures.length}
            </span>{" "}
            · {picture.name}
          </p>
          {picture.selectable && (
            <button
              type="button"
              aria-pressed={picture.selected}
              onClick={() => onToggle(picture.id)}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-glass-brd bg-bg-1 px-4 text-sm font-medium text-text-0 hover:bg-bg-2"
            >
              <span
                aria-hidden
                className={`flex h-5 w-5 items-center justify-center rounded border-2 ${
                  picture.selected
                    ? "border-magenta bg-magenta text-white"
                    : "border-text-1"
                }`}
              >
                {picture.selected && <Check className="h-3.5 w-3.5" />}
              </span>
              {picture.selected ? "Выбрана" : "Выбрать"}
            </button>
          )}
          <button
            type="button"
            autoFocus
            onClick={close}
            aria-label="Закрыть просмотр"
            className={iconButton}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="relative min-h-0 flex-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={picture.src}
            alt={`Картинка ${index + 1}: ${picture.name}`}
            className="h-full w-full object-contain"
          />
          {many && (
            <>
              <button
                type="button"
                onClick={() =>
                  onIndexChange(stepPreview(index, -1, pictures.length))
                }
                aria-label="Предыдущая картинка"
                className={`${iconButton} absolute top-1/2 left-3 -translate-y-1/2`}
              >
                <ChevronLeft className="h-5 w-5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() =>
                  onIndexChange(stepPreview(index, 1, pictures.length))
                }
                aria-label="Следующая картинка"
                className={`${iconButton} absolute top-1/2 right-3 -translate-y-1/2`}
              >
                <ChevronRight className="h-5 w-5" aria-hidden />
              </button>
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}
