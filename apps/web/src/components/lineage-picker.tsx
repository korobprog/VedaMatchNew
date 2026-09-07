"use client";

import {
  LINEAGE_ALL,
  lineageOption,
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

/**
 * Значение `<select>` → то, что понимает API: линия материала или `null`
 * («для всех линий»).
 *
 * Нужно потому, что вариант «для всех» в списке имеет значение `"all"`, а не
 * пустую строку, и наивное `value ? value : null` отправляло на сервер
 * строку `"all"` как идентификатор линии. Сервер отвечал 400 «Неизвестная
 * духовная линия» — то есть модератор, осознанно выбравший «для всех линий»,
 * не мог ни опубликовать запись из очереди, ни сохранить партию пополнения.
 */
export function lineageFromSelect(value: string): LineageId | null {
  return value === NONE || value === LINEAGE_ALL ? null : (value as LineageId);
}

/**
 * Обратное преобразование: `null` показываем как «для всех линий», а не как
 * пустой выбор. Пустой выбор в этих формах означал бы «ещё не решили», а
 * решение уже принято — просто оно «для всех».
 */
export function lineageToSelect(lineage: LineageId | null | undefined): string {
  return lineage ?? LINEAGE_ALL;
}

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
  compact = false,
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
  /**
   * Короткие названия без расшифровок — для переключателей в шапке
   * страницы, где полное «Шри Чайтанья Сарасват Матх» на телефоне занимает
   * всю строку.
   */
  compact?: boolean;
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
              {compact ? item.shortLabel : item.label}
              {!compact && item.hint ? ` — ${item.hint}` : ""}
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
export function inheritLabel(
  profileLineage: LineageId | null,
  compact = false,
): string {
  const option = lineageOption(profileLineage);
  // В компактном виде значение не повторяется: какая линия применена,
  // говорит строка над списком, а в селект на телефоне оно не помещается.
  if (compact) return "Как в профиле";
  return option
    ? `Как в профиле — ${option.label}`
    : "Как в профиле (линия не указана)";
}
