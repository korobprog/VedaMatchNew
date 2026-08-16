import { Check } from "lucide-react";
import type { MotivationReviewStatus } from "@vedamatch/shared";

const STAGES = [
  { key: "quote", label: "Цитата" },
  { key: "text", label: "Текст" },
  { key: "image", label: "Изображение" },
  { key: "published", label: "Публикация" },
] as const;

/** Порядковый номер этапа, на котором стоит мотивация. */
const STAGE_BY_STATUS: Record<MotivationReviewStatus, number> = {
  discovered: 0,
  source_verified: 0,
  text_review: 1,
  image_queued: 2,
  image_review: 2,
  published: 3,
  rejected: 1,
  failed: 1,
};

/** Что именно ждут от админа на текущем этапе. */
const HINTS: Record<MotivationReviewStatus, string> = {
  discovered: "Нейросеть готовит пояснение и переводы.",
  source_verified: "Нейросеть готовит пояснение и переводы.",
  text_review: "Проверьте цитату и пояснение, затем одобрите текст.",
  image_queued: "Изображение создаётся, карточка обновится сама.",
  image_review: "Проверьте изображение и опубликуйте.",
  published: "Опубликовано и видно в ленте.",
  rejected: "Отклонено.",
  failed: "Сорвалось — посмотрите код ошибки и повторите.",
};

export function stageHint(status: MotivationReviewStatus): string {
  return HINTS[status];
}

/**
 * Полоса этапов: где мотивация сейчас и что будет дальше. Без неё статус читался
 * только по строковому `reviewStatus` в углу карточки.
 */
export function PipelineStages({
  status,
  className,
}: {
  status: MotivationReviewStatus;
  className?: string;
}) {
  const current = STAGE_BY_STATUS[status];
  const broken = status === "failed" || status === "rejected";

  return (
    <div className={className}>
      <ol className="flex items-center gap-1" aria-label="Этапы подготовки">
        {STAGES.map((stage, index) => {
          const done = index < current || status === "published";
          const active = index === current && !done;
          return (
            <li key={stage.key} className="flex min-w-0 flex-1 flex-col gap-1">
              <span
                aria-hidden
                className={[
                  "h-1 rounded-full",
                  broken && active
                    ? "bg-red-500"
                    : done
                      ? "bg-cyan"
                      : active
                        ? "bg-gold"
                        : "bg-glass-brd",
                ].join(" ")}
              />
              <span
                className={[
                  "flex items-center gap-1 truncate text-[11px]",
                  done || active ? "text-text-1" : "text-text-2",
                ].join(" ")}
              >
                {done && <Check className="h-3 w-3 shrink-0 text-cyan" />}
                {stage.label}
              </span>
            </li>
          );
        })}
      </ol>
      <p
        className={[
          "mt-2 text-xs",
          broken ? "text-red-500" : "text-text-2",
        ].join(" ")}
      >
        {HINTS[status]}
      </p>
    </div>
  );
}
