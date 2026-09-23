import { RotateCcw, RotateCw } from "lucide-react";

/**
 * Значок перемотки с шагом (VED-388): круговая стрелка и число секунд.
 *
 * Число рядом, а не внутри стрелки: внутри кружка 16px две цифры
 * набирались бы шрифтом в 7px и не читались. Весь значок `aria-hidden` —
 * шаг словами несёт имя кнопки («Назад на 15 секунд»).
 */
export function SeekStepGlyph({
  direction,
  seconds,
}: {
  direction: -1 | 1;
  seconds: number;
}) {
  const Arrow = direction < 0 ? RotateCcw : RotateCw;
  const number = (
    <span className="font-mono text-[11px] font-semibold leading-none tabular-nums">
      {seconds}
    </span>
  );
  return (
    <span aria-hidden="true" className="flex items-center gap-0.5">
      {direction > 0 && number}
      <Arrow className="size-4" strokeWidth={2} />
      {direction < 0 && number}
    </span>
  );
}
