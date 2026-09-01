"use client";

import { collectNameWarnings, findNameError } from "@vedamatch/shared";

/**
 * Подсказки под полем имени. Сохранить они не мешают — это не валидация, а
 * замечание: «Ааааа», «ИВАН», «Ivанов» чаще всего опечатка или шутка, но
 * бывают и настоящие написания, и решать человеку.
 *
 * Жёсткие отказы (цифры, ссылки, пустота) сюда тоже попадают, чтобы человек
 * увидел их до отправки, — но окончательное «нет» говорит сервер, см.
 * `findNameError` в `@vedamatch/shared`.
 */
export function NameHints({
  value,
  label,
}: {
  value: string;
  /** Предложный падеж: «в обычном имени», «в духовном имени». */
  label: string;
}) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const error = findNameError(trimmed);
  const warnings = error ? [] : collectNameWarnings(trimmed);
  if (!error && warnings.length === 0) return null;

  return (
    <div
      role="status"
      className="mt-2 rounded-xl border border-gold/40 bg-gold/10 px-3 py-2 text-sm text-text-1"
    >
      <p className="mb-1 text-text-0">Проверьте, что вы написали в {label}:</p>
      <ul className="list-disc space-y-0.5 pl-5">
        {error ? (
          <li>{error}</li>
        ) : (
          warnings.map((warning) => <li key={warning}>{warning}</li>)
        )}
      </ul>
    </div>
  );
}
