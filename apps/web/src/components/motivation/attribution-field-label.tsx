import { BookOpen, UserRound } from "lucide-react";
import {
  ATTRIBUTION_ICON_CLASS,
  ATTRIBUTION_LABEL_CLASS,
  ATTRIBUTION_OPTIONAL_CLASS,
  ATTRIBUTION_TITLE_CLASS,
} from "./field-label";

const ICONS = { author: UserRound, source: BookOpen } as const;
const TITLES = { author: "Автор", source: "Источник" } as const;

/**
 * Подпись графы «Автор» или «Источник» в мастере «Вдохновения» (VED-203):
 * у открыток и у роликов одна и та же, чтобы две половины мастера не
 * разъехались. Почему выглядит именно так — см. `field-label.ts`.
 *
 * Стоит внутри `<label>` поля, поэтому имя поля для скринридера — текст
 * целиком: «Автор (необязательно)». Значок `aria-hidden`: слово уже сказано.
 */
export function AttributionFieldLabel({
  kind,
}: {
  kind: keyof typeof TITLES;
}) {
  const Icon = ICONS[kind];
  return (
    <span className={ATTRIBUTION_LABEL_CLASS}>
      <Icon aria-hidden className={ATTRIBUTION_ICON_CLASS} />
      <span className={ATTRIBUTION_TITLE_CLASS}>{TITLES[kind]}</span>{" "}
      <span className={ATTRIBUTION_OPTIONAL_CLASS}>(необязательно)</span>
    </span>
  );
}
