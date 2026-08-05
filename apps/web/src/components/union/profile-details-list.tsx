import type { UnionProfileDetails } from "@vedamatch/shared";
import {
  unionChildrenStatusLabels,
  unionDietLabels,
  unionEducationLabels,
  unionHousingLabels,
  unionIncomeLabels,
  unionRegulativePrincipleLabels,
  unionSpiritualEducationLabels,
} from "./dictionaries";

/** Заполненные поля блока «О себе»; пустые не показываем вовсе. */
function toRows(details: UnionProfileDetails): Array<[string, string]> {
  const rows: Array<[string, string | null]> = [
    ["Рост", details.heightCm ? `${details.heightCm} см` : null],
    ["Дети", details.childrenStatus ? unionChildrenStatusLabels[details.childrenStatus] : null],
    ["Питание", details.diet ? unionDietLabels[details.diet] : null],
    [
      "Регулирующие принципы",
      details.regulativePrinciples.length > 0
        ? details.regulativePrinciples
            .map((principle) => unionRegulativePrincipleLabels[principle])
            .join(", ")
        : null,
    ],
    ["Образование", details.education ? unionEducationLabels[details.education] : null],
    [
      "Духовное образование",
      details.spiritualEducation
        ? unionSpiritualEducationLabels[details.spiritualEducation]
        : null,
    ],
    ["Жилищные условия", details.housing ? unionHousingLabels[details.housing] : null],
    ["Достаток", details.income ? unionIncomeLabels[details.income] : null],
    ["Домашние животные", details.pets.length > 0 ? details.pets.join(", ") : null],
  ];
  return rows.filter((row): row is [string, string] => row[1] !== null);
}

export function ProfileDetailsList({
  details,
}: {
  details: UnionProfileDetails;
}) {
  const rows = toRows(details);
  if (rows.length === 0) return null;

  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-magenta">О человеке</summary>
      <dl className="mt-3 space-y-1.5">
        {rows.map(([label, value]) => (
          <div key={label} className="flex gap-3">
            <dt className="w-40 shrink-0 text-xs text-text-2">{label}</dt>
            <dd className="flex-1 text-xs text-text-1">{value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
