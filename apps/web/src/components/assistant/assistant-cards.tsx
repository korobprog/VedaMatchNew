"use client";

import Link from "next/link";
import type { AssistantActionCard, AssistantLinkCard } from "@vedamatch/shared";
import { highlightParts } from "@/lib/search-highlight";
import { serviceLabel } from "./assistant-share";

/**
 * Карточки ответа. Ссылка ведёт в сервис — там живой объект; в чате его
 * только показывают. Картинка не обязательна: у стиха или трека её может
 * не быть, и карточка без неё читается как список.
 */
export function AssistantLinkCardView({
  card,
  highlight,
}: {
  card: AssistantLinkCard;
  /**
   * Запрос, слова которого подсветить (VED-98). Передаёт выдача поиска; в
   * чате ассистента подсвечивать нечего — там отвечают на вопрос, а не на
   * набор слов.
   */
  highlight?: string;
}) {
  const text = (value: string) =>
    highlight ? <Highlighted text={value} query={highlight} /> : value;
  return (
    <Link
      href={card.href}
      className="flex gap-3 rounded-2xl border border-glass-brd bg-bg-1 p-3 transition-colors hover:border-cyan/40"
    >
      {card.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={card.imageUrl}
          alt=""
          className="size-16 shrink-0 rounded-xl object-cover"
        />
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-gold">
          {serviceLabel(card.service)}
        </span>
        <span className="font-display text-sm font-semibold leading-5 text-text-0">
          {text(card.title)}
        </span>
        {card.subtitle && (
          <span className="text-xs text-text-1">{text(card.subtitle)}</span>
        )}
        {card.body && (
          <span className="line-clamp-3 text-xs leading-4 text-text-2">
            {text(card.body)}
          </span>
        )}
      </span>
    </Link>
  );
}

/**
 * Текст с подсвеченными словами запроса. `<mark>` — чтобы скринридер тоже
 * знал, что это совпадение; фон тёплый, цвет текста остаётся своим: иначе
 * серый отрывок с яркими словами читался бы вразнобой.
 */
function Highlighted({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlightParts(text, query).map((part, index) =>
        part.hit ? (
          <mark
            key={index}
            className="rounded-sm bg-gold/25 px-0.5 font-semibold text-inherit"
          >
            {part.text}
          </mark>
        ) : (
          part.text
        ),
      )}
    </>
  );
}

/**
 * Предложенное действие. Кнопки живут в карточке, а не в тексте: модель
 * могла написать «опубликовал», но решает всегда человек.
 */
export function AssistantActionCardView({
  card,
  busy,
  onDecide,
}: {
  card: AssistantActionCard;
  busy: boolean;
  onDecide: (confirm: boolean) => void;
}) {
  const tone =
    card.status === "confirmed"
      ? "border-mint-edge bg-mint/10"
      : card.status === "failed"
        ? "border-magenta/30 bg-magenta/10"
        : card.status === "cancelled"
          ? "border-glass-brd bg-bg-1 opacity-70"
          : "border-gold/34 bg-gold/8";
  return (
    <div className={`flex flex-col gap-2 rounded-2xl border p-3 ${tone}`}>
      <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-gold">
        {card.status === "pending" ? "Нужно подтверждение" : statusLabel(card.status)}
      </span>
      <p className="text-sm leading-5 text-text-0">{card.summary}</p>
      {card.status === "pending" ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onDecide(true)}
            className="btn-mint rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {card.label}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onDecide(false)}
            className="rounded-xl border border-glass-brd px-4 py-2 text-sm text-text-1 hover:text-text-0 disabled:opacity-50"
          >
            Не нужно
          </button>
        </div>
      ) : (
        <>
          {card.resultText && (
            <p className="text-xs leading-4 text-text-1">{card.resultText}</p>
          )}
          {card.resultHref && (
            <Link
              href={card.resultHref}
              className="text-sm font-medium text-cyan hover:underline"
            >
              Открыть →
            </Link>
          )}
        </>
      )}
    </div>
  );
}

function statusLabel(status: AssistantActionCard["status"]): string {
  switch (status) {
    case "confirmed":
      return "Выполнено";
    case "failed":
      return "Не получилось";
    case "cancelled":
      return "Отменено";
    default:
      return "";
  }
}
