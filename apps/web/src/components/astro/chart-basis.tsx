import { chartBasis, type ChartBasisSource } from "@/lib/astro-chart-basis";

/**
 * «Карта посчитана на» (VED-672): строки в списке фактов рядом с лагной.
 * Две карты с «одинаковыми» данными сверяются по ним за секунду: разница в
 * часе, поясе или месте видна сразу, а Луна показывает, откуда пошли даши.
 */
export function ChartBasisFacts({
  source,
  moonLongitude,
}: {
  source: ChartBasisSource;
  moonLongitude: number;
}) {
  const basis = chartBasis(source, moonLongitude);
  return (
    <div>
      <dt className="text-text-2">Карта посчитана на</dt>
      <dd className="text-base">
        {basis.local}
        <span className="block text-sm text-text-1">
          {basis.zone} · {basis.place}
        </span>
        <span className="block text-sm text-text-1">
          Луна: {basis.moon} — от неё отсчитываются даши
        </span>
      </dd>
    </div>
  );
}
