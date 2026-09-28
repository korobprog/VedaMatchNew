"use client";

import { useId } from "react";
import {
  AUDIENCE_STAGES,
  AUDIENCE_STAGE_LABELS,
  LINEAGE_ALL,
  type BlogPostCategory,
  type SpiritualStage,
} from "@vedamatch/shared";
import { LineageSelect } from "@/components/lineage-picker";
import { BlogCategorySelect } from "./blog-category-select";
import { toggleBlogAudience, type BlogAudienceValue } from "./blog-post-marks";

/** Поля во всю ширину колонки — три строки стоят ровно одна под другой. */
const FIELD =
  "min-h-11 w-full rounded-lg border border-glass-brd bg-bg-1 px-3 text-sm text-text-0 disabled:opacity-60";

/**
 * Подписи — первой ступенью цвета, а не второй: вторая на стекле тёмной темы
 * ниже порога для 12px. Высота строки поля — подпись напротив поля, а не над
 * ним, и у ряда ступеней, который переносится, она стоит у первой строки.
 */
const LABEL = "flex min-h-11 items-center self-start text-xs text-text-1";

function chipClass(checked: boolean): string {
  return `inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border bg-bg-1 px-2.5 text-xs transition-colors has-[:disabled]:cursor-default has-[:disabled]:opacity-60 ${
    checked
      ? "border-magenta/60 font-semibold text-text-0"
      : "border-glass-brd text-text-1 hover:border-cyan/60"
  }`;
}

/**
 * «Категория», «Линия» и «Ступень» в форме публикации и правки (VED-590):
 * без всех трёх пост не публикуется. Линия — портальный двухшаговый выбор
 * (группа, затем какой именно матх или паривар), как в Образовании и
 * анкете. Ступени самоидентификации — мультивыбор, как разметка материалов
 * Образования и Медиатеки. «Для всех» у линии и у ступеней — отдельный явный
 * вариант, пустого нет.
 *
 * Сеткой в две колонки (VED-633, «ровно и компактно»): подписи слева одной
 * колонкой, поля справа одной ширины.
 */
export function BlogPostMarksFields({
  category,
  lineage,
  audience,
  onCategoryChange,
  onLineageChange,
  onAudienceChange,
  disabled = false,
}: {
  category: BlogPostCategory | "";
  /** `""` — не выбрана, `"all"` — для всех, иначе линия. */
  lineage: string;
  audience: BlogAudienceValue;
  onCategoryChange: (value: BlogPostCategory | "") => void;
  onLineageChange: (value: string) => void;
  onAudienceChange: (value: BlogAudienceValue) => void;
  disabled?: boolean;
}) {
  const categoryId = useId();
  const lineageId = useId();
  const audienceId = useId();

  function toggle(choice: SpiritualStage | typeof LINEAGE_ALL) {
    onAudienceChange(toggleBlogAudience(audience, choice));
  }

  const choices: Array<{
    value: SpiritualStage | typeof LINEAGE_ALL;
    label: string;
    checked: boolean;
  }> = [
    {
      value: LINEAGE_ALL,
      label: "Для всех",
      checked: audience === LINEAGE_ALL,
    },
    ...AUDIENCE_STAGES.map((stage) => ({
      value: stage,
      label: AUDIENCE_STAGE_LABELS[stage],
      checked: Array.isArray(audience) && audience.includes(stage),
    })),
  ];

  return (
    <div className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2">
      <label htmlFor={categoryId} className={LABEL}>
        Категория
      </label>
      <BlogCategorySelect
        id={categoryId}
        value={category}
        onChange={onCategoryChange}
        disabled={disabled}
        className={FIELD}
      />

      <label htmlFor={lineageId} className={LABEL}>
        Линия
      </label>
      <LineageSelect
        id={lineageId}
        ariaLabel="Линия"
        value={lineage}
        onChange={onLineageChange}
        allLabel="Для всех"
        disabled={disabled}
        className={FIELD}
      />

      <span id={audienceId} className={LABEL}>
        Ступень
      </span>
      <div
        role="group"
        aria-labelledby={audienceId}
        className="flex flex-wrap gap-1.5"
      >
        {choices.map((choice) => (
          <label key={choice.value} className={chipClass(choice.checked)}>
            <input
              type="checkbox"
              checked={choice.checked}
              disabled={disabled}
              onChange={() => toggle(choice.value)}
              className="size-4 shrink-0 accent-magenta"
            />
            {choice.label}
          </label>
        ))}
      </div>
    </div>
  );
}
