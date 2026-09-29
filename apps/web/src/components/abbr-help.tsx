"use client";

import { useId, useState, type MouseEvent, type ReactNode } from "react";
import { Info } from "lucide-react";
import {
  abbreviationHelpLabel,
  abbreviationIn,
  abbreviationsIn,
  type Abbreviation,
} from "@/lib/lineage-abbr";

/**
 * Аббревиатура со значком «?» (VED-634): снаружи только «ISKCON» или
 * «IPBYS», расшифровка по-русски — по нажатию на значок рядом и повторным
 * нажатием сворачивается. Портальный компонент: линии выводятся в меню,
 * фильтрах, домике, профиле и анкете, и выглядеть это должно одинаково.
 *
 * Расшифровка раскрывается на месте строкой ниже, а не всплывающим окном:
 * значок живёт и внутри меню, которые сами всплывают и прокручиваются, и
 * второй поповер поверх первого там обрезался бы.
 *
 * «?» — отдельная кнопка рядом с пунктом, а не внутри него: в меню, где
 * пункт — кнопка выбора, нажатие на «?» только раскрывает расшифровку и
 * ничего не выбирает (`stopPropagation`).
 */
function HelpToggle({
  item,
  open,
  controls,
  onToggle,
  large,
}: {
  item: Abbreviation;
  open: boolean;
  controls: string;
  onToggle: () => void;
  /** 36px — в строках меню высотой 44px; иначе 24px — в строке текста. */
  large?: boolean;
}) {
  function click(event: MouseEvent<HTMLButtonElement>) {
    // Кнопка стоит в строке выбора или в карточке-метке: нажатие на «?»
    // не должно долетать до них и что-то выбирать.
    event.stopPropagation();
    event.preventDefault();
    onToggle();
  }

  return (
    <button
      type="button"
      aria-label={abbreviationHelpLabel(item.abbr)}
      aria-expanded={open}
      aria-controls={controls}
      title={open ? undefined : abbreviationHelpLabel(item.abbr)}
      onClick={click}
      className={`inline-flex shrink-0 items-center justify-center rounded-full text-text-1 transition-colors hover:text-text-0 ${
        large ? "size-9" : "size-6"
      }`}
    >
      {/* «i» — «информация», а не «?» (VED-648). */}
      <Info aria-hidden className="size-4" />
    </button>
  );
}

function Expansion({
  id,
  open,
  item,
  className = "",
}: {
  id: string;
  open: boolean;
  item: Abbreviation;
  className?: string;
}) {
  return (
    <span
      id={id}
      hidden={!open}
      className={`basis-full text-xs font-normal text-text-1 ${className}`}
    >
      {item.expansion}
    </span>
  );
}

/**
 * Подпись линии с «?», если в ней есть аббревиатура: «ISKCON (?)»,
 * «Гаудия-матх — IPBYS (?)». Аббревиатур несколько («ISKCON, IPBYS») —
 * по «?» на каждую. Без аббревиатуры — просто текст.
 */
export function LineageLabel({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const [open, setOpen] = useState<readonly string[]>([]);
  const baseId = useId();
  const items = abbreviationsIn(text);
  if (items.length === 0) return <span className={className}>{text}</span>;
  const several = items.length > 1;
  return (
    <span className={`inline-flex flex-wrap items-center gap-x-1 ${className}`}>
      <span>{text}</span>
      {items.map((item) => (
        <HelpToggle
          key={item.abbr}
          item={item}
          open={open.includes(item.abbr)}
          controls={`${baseId}-${item.abbr}`}
          onToggle={() =>
            setOpen((current) =>
              current.includes(item.abbr)
                ? current.filter((abbr) => abbr !== item.abbr)
                : [...current, item.abbr],
            )
          }
        />
      ))}
      {items.map((item) => (
        <Expansion
          key={item.abbr}
          id={`${baseId}-${item.abbr}`}
          open={open.includes(item.abbr)}
          item={
            several
              ? { ...item, expansion: `${item.abbr} — ${item.expansion}` }
              : item
          }
        />
      ))}
    </span>
  );
}

/**
 * Строка выбора со «?» справа: `children` — сама кнопка или метка выбора,
 * «?» — соседняя кнопка, расшифровка — строкой под ними. Без аббревиатуры в
 * `text` — та же обёртка без «?»: разметка не меняется при смене значения, и
 * поле внутри (например, `<select>`) не пересоздаётся.
 */
export function WithLineageHelp({
  text,
  children,
  className = "",
  alignEnd = false,
}: {
  /** Подпись пункта, в которой ищется аббревиатура. */
  text: string | null | undefined;
  children: ReactNode;
  className?: string;
  /**
   * Значок — напротив нижнего поля, а не посередине (VED-648): в выборе
   * линии из двух списков аббревиатура стоит во втором — «IPBYS», — и
   * значок посередине между списками не читался как пояснение к нему.
   */
  alignEnd?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const item = abbreviationIn(text);
  return (
    <div
      className={`flex flex-wrap gap-x-1 ${alignEnd ? "items-end" : "items-center"} ${className}`}
    >
      <div className="min-w-0 flex-1">{children}</div>
      {item && (
        <>
          <HelpToggle
            item={item}
            open={open}
            controls={id}
            onToggle={() => setOpen((value) => !value)}
            large
          />
          <Expansion id={id} open={open} item={item} className="px-3 pb-1" />
        </>
      )}
    </div>
  );
}
