import Link from "next/link";
import type { ContactsCardDto } from "@vedamatch/shared";
import {
  contactsAshramLabels,
  contactsFormatLabels,
  contactsStageLabels,
} from "./labels";
import {
  lastSeenLabel,
  newcomerDay,
  newcomerLabel,
  type NewcomerDay,
} from "./people-presence";

/** Цвет метки по суткам новичка: зелёный, оранжевый, фиолетовый (VED-319). */
const NEWCOMER_TONE: Record<NewcomerDay, string> = {
  0: "border-newcomer-1 text-newcomer-1",
  1: "border-newcomer-2 text-newcomer-2",
  2: "border-newcomer-3 text-newcomer-3",
};

/**
 * Карточка человека в выдаче справочника.
 *
 * Контактных данных здесь нет и быть не может: телефон и мессенджеры
 * раскрываются только через согласие владельца (этап D плана сервиса).
 * Совместимости, возраста и целей знакомства тоже нет — это не Union.
 */
export function PeopleSearchCard({
  card,
  now = new Date(),
}: {
  card: ContactsCardDto;
  /** Для тестов; в жизни — момент отрисовки. */
  now?: Date;
}) {
  const newcomer = newcomerDay(card.joinedAt, now);
  const seen = lastSeenLabel(card.lastSeenAt, now);
  const place = [card.city, card.country].filter(Boolean).join(", ");
  const details = [
    card.ashram ? contactsAshramLabels[card.ashram] : null,
    card.format === "any" ? null : contactsFormatLabels[card.format],
    card.spiritualStage ? contactsStageLabels[card.spiritualStage] : null,
    card.languages.length > 0 ? card.languages.join(", ") : null,
  ].filter(Boolean) as string[];

  return (
    <article className="glass flex flex-col gap-3 rounded-2xl border border-glass-brd p-4 transition hover:border-magenta/40">
      <div className="flex items-start gap-3">
        {card.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.avatarUrl}
            alt={card.name}
            className="h-12 w-12 shrink-0 rounded-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-magenta/25 to-[#B23EFF]/25 font-display text-lg font-bold text-text-0"
          >
            {card.name.charAt(0).toUpperCase()}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate font-display text-base font-semibold text-text-0">
              <Link
                href={`/chat/people/users/${encodeURIComponent(card.userId)}`}
                className="transition hover:text-magenta"
              >
                {card.name}
              </Link>
            </h3>
            {/* Метка новичка справа от имени (VED-319). День назван словами
                для скринридера и в подсказке: цвет — не единственный носитель. */}
            {newcomer !== null && (
              <span
                title={newcomerLabel(newcomer)}
                className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${NEWCOMER_TONE[newcomer]}`}
              >
                <span aria-hidden="true">Новый</span>
                <span className="sr-only">{newcomerLabel(newcomer)}</span>
              </span>
            )}
          </div>
          {card.headline && (
            <p className="mt-0.5 text-sm text-text-1">{card.headline}</p>
          )}
          {place && <p className="mt-0.5 text-xs text-text-2">{place}</p>}
          {/* Точные дата и время последнего визита (VED-318). По этой же
              отметке сортирует порядок по умолчанию «Недавно заходили». */}
          {seen && card.lastSeenAt && (
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-text-2">
              {seen === "в сети" && (
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-full bg-cyan"
                />
              )}
              <time dateTime={card.lastSeenAt}>{seen}</time>
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          {card.isVerifiedDevotee && (
            <span className="rounded-full border border-cyan/40 bg-cyan/10 px-2 py-0.5 text-xs text-cyan">
              Подтверждён
            </span>
          )}
          {card.isPhotoVerified && (
            <span className="rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-xs text-gold">
              Проверенное фото
            </span>
          )}
        </div>
      </div>

      {details.length > 0 && (
        <p className="text-xs text-text-2">{details.join(" · ")}</p>
      )}

      {card.tags.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {card.tags.map((tag) => (
            <li
              key={tag.id}
              className="rounded-full border border-glass-brd bg-bg-1 px-2.5 py-1 text-xs text-text-1"
            >
              {tag.nameRu}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
