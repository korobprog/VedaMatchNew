"use client";

import { useId, useState } from "react";
import {
  LINEAGE_ALL,
  LINEAGE_GROUP_LABELS,
  LINEAGE_GROUPS,
  lineageOption,
  lineagesOfGroup,
  type LineageGroup,
  type LineageId,
} from "@vedamatch/shared";
import { fieldClassName } from "@/components/ui/input";
import {
  lineageDetailOptions,
  lineageDetailPrompt,
  lineageDetailValue,
  lineageFirstStepPick,
  lineageFirstStepValue,
  lineageGroupHasDetail,
  lineageGroupOptions,
  lineageValueGroup,
} from "@/lib/lineage-steps";

/**
 * Выбор духовной линии. Портальный компонент: линия — поле `User`, и
 * спрашивают её в мастере приветствия, в анкете, в профиле и в настройках
 * Образования и Музыки. Список один, из `LINEAGES`; сервисы его не копируют.
 *
 * Выбор в два шага (VED-568): сначала группа — ISKCON, Гаудия-матх,
 * Паривары; у группы из нескольких линий следом появляется второй шаг —
 * какой именно матх или паривар. ISKCON — одна линия, и надпись «ISKCON»
 * в списке одна. Арифметика шагов — `lib/lineage-steps.ts`, её же зовут
 * меню «Линия» и фильтр Образования.
 *
 * Две формы одного вопроса:
 * - `LineageCards` — карточки, для первого выбора: сначала три группы,
 *   затем линии выбранной;
 * - `LineageSelect` — выпадающий список группы и второй список линии, для
 *   форм, где линия одно из десяти полей. Без `<optgroup>`: Android рисует
 *   заголовки групп отдельными строками, похожими на варианты (VED-288).
 *
 * Значение — строка, чтобы `<select>` и радио были контролируемыми без
 * жонглирования `null`: `""` означает «не выбрано» либо «как в профиле» (что
 * именно — говорит подпись у пустого варианта), `"all"` — все линии.
 * Группу целиком выбрать нельзя (VED-568), но `group:<группа>`, сохранённое
 * в фильтре раньше, показывается группой на первом шаге с неуточнённым
 * вторым.
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

/**
 * Группа, выбранная на первом шаге, пока не выбрана линия. Привязана к
 * значению, при котором её выбрали: сменилось значение снаружи — черновик
 * сам перестаёт действовать, без эффекта-сброса.
 */
function usePendingGroup(value: string) {
  const [pending, setPending] = useState<{
    group: LineageGroup;
    forValue: string;
  } | null>(null);
  const group = pending && pending.forValue === value ? pending.group : null;
  return [
    group,
    (next: LineageGroup | null) =>
      setPending(next ? { group: next, forValue: value } : null),
  ] as const;
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
  const [pending, setPending] = usePendingGroup(value);
  const group = pending ?? lineageValueGroup(value);
  const groupsId = useId();

  const cardClass = (checked: boolean) =>
    `cursor-pointer rounded-xl border px-4 py-2 text-sm transition ${
      checked
        ? "border-magenta bg-magenta/10 text-text-0"
        : "border-glass-brd text-text-1 hover:text-text-0"
    } ${disabled ? "opacity-60" : ""}`;

  function pickGroup(picked: LineageGroup) {
    const next = lineageFirstStepPick(picked, value);
    if (!next) return setPending(null);
    if ("pending" in next) return setPending(next.pending);
    setPending(null);
    onChange(next.value as LineageId);
  }

  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="sr-only">Духовная линия</legend>
        <div className="flex flex-wrap gap-2">
          {LINEAGE_GROUPS.map((option) => {
            const checked = group === option;
            const sole = lineagesOfGroup(option);
            const hint = sole.length === 1 ? sole[0].hint : undefined;
            return (
              <label key={option} className={cardClass(checked)}>
                <input
                  type="radio"
                  name={`${name}-group-${groupsId}`}
                  value={option}
                  checked={checked}
                  disabled={disabled}
                  onChange={() => pickGroup(option)}
                  className="sr-only"
                />
                {LINEAGE_GROUP_LABELS[option]}
                {hint && (
                  <span className="block text-xs text-text-2">{hint}</span>
                )}
              </label>
            );
          })}
        </div>
      </fieldset>
      {group && lineageGroupHasDetail(group) && (
        <fieldset>
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-2">
            {lineageDetailPrompt(group)}
          </legend>
          <div className="flex flex-wrap gap-2">
            {lineagesOfGroup(group).map((item) => {
              const checked = value === item.id;
              return (
                <label key={item.id} className={cardClass(checked)}>
                  <input
                    type="radio"
                    name={name}
                    value={item.id}
                    checked={checked}
                    disabled={disabled}
                    onChange={() => {
                      setPending(null);
                      onChange(item.id);
                    }}
                    className="sr-only"
                  />
                  {item.label}
                  {item.hint && (
                    <span className="block text-xs text-text-2">
                      {item.hint}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </fieldset>
      )}
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
  ariaLabel,
}: {
  /**
   * `""`, `"all"`, идентификатор линии или сохранённое раньше в фильтре
   * `group:<группа>` — его уже не предлагаем, но показываем.
   */
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
  /**
   * Имя поля для скринридера, когда видимой подписи нет: в списке из многих
   * одинаковых полей «Духовная линия» не различить.
   */
  ariaLabel?: string;
}) {
  const [pending, setPending] = usePendingGroup(value);
  const first = lineageFirstStepValue(value, pending);
  const group = pending ?? lineageValueGroup(value);
  const detail = lineageDetailValue(value, pending);
  const fieldClass = className ?? fieldClassName;
  const autoId = useId();
  const selectId = id ?? autoId;
  const name = label ? undefined : (ariaLabel ?? "Духовная линия");

  function pickFirst(picked: string) {
    const next = lineageFirstStepPick(picked, value);
    if (!next) return setPending(null);
    if ("pending" in next) return setPending(next.pending);
    setPending(null);
    onChange(next.value);
  }

  const groupSelect = (
    <select
      id={selectId}
      aria-label={name}
      value={first}
      disabled={disabled}
      onChange={(event) => pickFirst(event.target.value)}
      className={fieldClass}
    >
      {emptyLabel !== undefined ? (
        <option value={NONE}>{emptyLabel}</option>
      ) : (
        first === NONE && (
          <option value={NONE} disabled>
            Выберите линию
          </option>
        )
      )}
      {allLabel !== undefined && (
        <option value={LINEAGE_ALL}>{allLabel}</option>
      )}
      {lineageGroupOptions(compact).map((option) => (
        <option key={option.value} value={option.value} title={option.title}>
          {option.label}
        </option>
      ))}
    </select>
  );

  // Второй шаг — только у группы из нескольких линий: какой именно матх или
  // паривар. Пока линия не выбрана, значение поля прежнее — «просто
  // Гаудия-матх» не сохранить ни в материал, ни в фильтр (VED-568). Группа
  // целиком из старой настройки стоит на подсказке «Какой именно…».
  const detailSelect =
    group && lineageGroupHasDetail(group) ? (
      <select
        aria-label={
          name
            ? `${name}: ${lineageDetailPrompt(group).toLowerCase()}`
            : lineageDetailPrompt(group)
        }
        aria-invalid={pending ? true : undefined}
        value={detail}
        disabled={disabled}
        onChange={(event) => {
          setPending(null);
          onChange(event.target.value);
        }}
        className={fieldClass}
      >
        {detail === NONE && (
          <option value={NONE} disabled>
            {lineageDetailPrompt(group)}…
          </option>
        )}
        {lineageDetailOptions(group, { compact }).map((option) => (
          <option key={option.value} value={option.value} title={option.title}>
            {option.label}
          </option>
        ))}
      </select>
    ) : null;

  const steps = (
    <span
      className={
        compact
          ? "inline-flex max-w-full flex-wrap gap-1"
          : "flex flex-col gap-2"
      }
    >
      {groupSelect}
      {detailSelect}
    </span>
  );

  if (!label) return steps;
  return (
    <div className="block">
      <label htmlFor={selectId} className="mb-1 block text-xs text-text-2">
        {label}
      </label>
      {steps}
      {hint && <span className="mt-1 block text-xs text-text-2">{hint}</span>}
    </div>
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
