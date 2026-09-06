"use client";

import {
  LINEAGE_ALL,
  lineageLabel,
  lineagesByGroup,
  type LineageId,
} from "@vedamatch/shared";
import { fieldClassName } from "@/components/ui/input";

/**
 * Выбор духовной линии. Портальный компонент: линия — поле `User`, и
 * спрашивают её в мастере приветствия, в анкете, в профиле и в настройках
 * Образования и Музыки. Список один, из `LINEAGES`; сервисы его не копируют.
 *
 * Две формы одного вопроса:
 * - `LineageCards` — карточки по группам, для первого выбора: человек видит
 *   все варианты разом и понимает, что ISKCON, матхи и паривары — разные
 *   ветви одного древа;
 * - `LineageSelect` — выпадающий список с `<optgroup>`, для форм, где линия
 *   одно из десяти полей.
 *
 * Значение — строка, чтобы `<select>` и радио были контролируемыми без
 * жонглирования `null`: `""` означает «не выбрано» либо «как в профиле» (что
 * именно — говорит подпись у пустого варианта), `"all"` — все линии.
 */

const NONE = "";

export function LineageCards({
  value,
  onChange,
  name = "lineage",
  disabled = false,
}: {
  value: string;
  onChange: (lineage: LineageId) => void;
  name?: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-4">
      {lineagesByGroup().map((group) => (
        <fieldset key={group.group}>
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-2">
            {group.label}
          </legend>
          <div className="flex flex-wrap gap-2">
            {group.items.map((item) => {
              const checked = value === item.id;
              return (
                <label
                  key={item.id}
                  className={`cursor-pointer rounded-xl border px-4 py-2 text-sm transition ${
                    checked
                      ? "border-magenta bg-magenta/10 text-text-0"
                      : "border-glass-brd text-text-1 hover:text-text-0"
                  } ${disabled ? "opacity-60" : ""}`}
                >
                  <input
                    type="radio"
                    name={name}
                    value={item.id}
                    checked={checked}
                    disabled={disabled}
                    onChange={() => onChange(item.id)}
                    className="sr-only"
                  />
                  {item.label}
                  {item.hint && (
                    <span className="block text-xs text-text-2">{item.hint}</span>
                  )}
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

export function LineageSelect({
  value,
  onChange,
  emptyLabel,
  allLabel,
  label,
  hint,
  disabled = false,
  id,
  className,
}: {
  /** `""`, `"all"` или идентификатор линии. */
  value: string;
  onChange: (value: string) => void;
  /**
   * Подпись пустого варианта. Без неё пустого варианта нет — выбирать
   * придётся из линий (и «всех», если они разрешены).
   */
  emptyLabel?: string;
  /** Подпись варианта «все линии». Без неё варианта нет. */
  allLabel?: string;
  /** Видимая подпись поля. Без неё поле подписано только для скринридера. */
  label?: string;
  hint?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}) {
  const select = (
    <select
      id={id}
      aria-label={label ? undefined : "Духовная линия"}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className={className ?? fieldClassName}
    >
      {emptyLabel !== undefined && <option value={NONE}>{emptyLabel}</option>}
      {allLabel !== undefined && (
        <option value={LINEAGE_ALL}>{allLabel}</option>
      )}
      {lineagesByGroup().map((group) => (
        <optgroup key={group.group} label={group.label}>
          {group.items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
              {item.hint ? ` — ${item.hint}` : ""}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );

  if (!label) return select;
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-text-2">{label}</span>
      {select}
      {hint && <span className="mt-1 block text-xs text-text-2">{hint}</span>}
    </label>
  );
}

/**
 * Подпись варианта «как в профиле» с текущим значением: «Как в профиле —
 * ISKCON». Без значения — честно говорит, что линия в профиле не указана.
 */
export function inheritLabel(profileLineage: LineageId | null): string {
  const label = lineageLabel(profileLineage);
  return label ? `Как в профиле — ${label}` : "Как в профиле (линия не указана)";
}
