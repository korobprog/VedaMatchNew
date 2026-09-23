import type { WellnessCheckDto } from "@vedamatch/shared";
import {
  checkCostLabel,
  checkReasonLabel,
  checkStatusLabel,
  proposedChange,
  sourceLevelLabel,
} from "./check-labels";

/**
 * Что сделала автопроверка с карточкой (VED-384): предложение ИИ рядом с
 * присланным, источники с тем, насколько им можно верить, и почему карточка
 * не принята сама. Модератор — последняя ступень, и решает, видя всё это.
 */
export function CheckPanel({ check }: { check: WellnessCheckDto }) {
  const { proposal, submitted } = check;
  const changes = [
    {
      label: "Название",
      value: proposedChange(submitted.name, proposal.name),
    },
    {
      label: "Производитель",
      value: proposedChange(submitted.brand, proposal.brand),
    },
    {
      label: "Состав из источников",
      value: proposedChange(submitted.ingredientsRaw, proposal.ingredientsRaw),
    },
  ].filter((row): row is { label: string; value: string } => Boolean(row.value));
  const cost = checkCostLabel(check.costUsd);

  return (
    <div className="mt-3 rounded-xl border border-glass-brd bg-bg-1 p-3 text-sm">
      <p className="font-medium text-text-0">
        Автопроверка: {checkStatusLabel(check.status)}
        {cost && <span className="font-mono text-xs text-text-1"> · {cost}</span>}
      </p>

      {check.reasons.length > 0 && (
        <ul className="mt-1 list-disc pl-5 text-text-1">
          {check.reasons.map((reason) => (
            <li key={reason}>{checkReasonLabel(reason)}</li>
          ))}
        </ul>
      )}

      {changes.length > 0 && (
        <dl className="mt-2 space-y-1">
          {changes.map((row) => (
            <div key={row.label}>
              <dt className="text-xs text-text-1">ИИ предлагает — {row.label.toLowerCase()}</dt>
              <dd className="text-text-0">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {proposal.conflicts.length > 0 && (
        <div className="mt-2">
          <p className="text-xs text-text-1">Расхождения, которые нашёл ИИ</p>
          <ul className="list-disc pl-5 text-text-0">
            {proposal.conflicts.map((conflict) => (
              <li key={conflict}>{conflict}</li>
            ))}
          </ul>
        </div>
      )}

      {check.sources.length > 0 && (
        <div className="mt-2">
          <p className="text-xs text-text-1">Источники</p>
          <ul className="space-y-1">
            {check.sources.map((source) => (
              <li key={source.url} className="text-text-0">
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="break-all underline"
                >
                  {source.title || source.url}
                </a>
                <span className="text-xs text-text-1">
                  {" "}
                  — {sourceLevelLabel(source.level)}
                  {source.ingredientsOnPage ? ", состав на странице" : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
