"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ContactsCardDto } from "@vedamatch/shared";
import { ContactsApiError, getContactsCard } from "@/lib/chat-people-api";
import { PeopleRequestButton } from "./people-request-button";
import {
  contactsAshramLabels,
  contactsFormatLabels,
  contactsStageLabels,
  contactsTagKindLabels,
  contactsTagKindOrder,
} from "./labels";

/**
 * Чужая карточка справочника целиком.
 *
 * Сама карточка контактных данных не показывает. Телефон и мессенджеры живут
 * в блоке под ней и берутся только из поля `contacts`, которое бэкенд
 * заполняет исключительно при действующем раскрытии.
 *
 * 404 показывается одним и тем же текстом «Карточка не найдена» — бэкенд
 * специально не разделяет «карточки нет» и «вам её не видно», и интерфейс
 * не должен восстанавливать эту разницу по своей формулировке.
 */
/**
 * Результат помнит, чью карточку он описывает. Пока `userId` не совпал —
 * идёт загрузка; отдельный флаг не нужен, и старые данные не могут
 * показаться под другим человеком.
 */
type Result = { userId: string } & (
  | { status: "ready"; card: ContactsCardDto }
  | { status: "missing" }
  | { status: "error"; message: string }
);

export function PeopleCardView({ userId }: { userId: string }) {
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;

    getContactsCard(userId, controller.signal)
      .then((card) => {
        if (alive) setResult({ userId, status: "ready", card });
      })
      .catch((e: unknown) => {
        if (!alive || controller.signal.aborted) return;
        if (e instanceof ContactsApiError && e.status === 404) {
          setResult({ userId, status: "missing" });
          return;
        }
        // Текст с бэкенда уже русский и объясняет причину — не подменяем своим.
        setResult({
          userId,
          status: "error",
          message:
            e instanceof Error ? e.message : "Не удалось открыть карточку",
        });
      });

    return () => {
      alive = false;
      controller.abort();
    };
  }, [userId]);

  const state = result?.userId === userId ? result : null;

  if (!state) {
    return (
      <p className="glass rounded-2xl border border-glass-brd p-4 text-sm text-text-1">
        Открываем карточку…
      </p>
    );
  }

  if (state.status === "missing") {
    return (
      <div className="glass rounded-3xl border border-glass-brd p-10 text-center">
        <h2 className="font-display text-xl font-bold text-text-0">
          Карточка не найдена
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-text-1">
          Проверьте ссылку — возможно, она устарела. Нужного человека можно
          поискать в справочнике.
        </p>
        <Link
          href="/chat/people"
          className="mt-5 inline-block rounded-xl border border-glass-brd px-4 py-2 text-sm font-medium text-text-1 transition hover:text-text-0"
        >
          К поиску по справочнику
        </Link>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <p
        role="alert"
        className="glass rounded-2xl border border-glass-brd p-4 text-sm text-magenta"
      >
        {state.message}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ContactsCard card={state.card} />
      {/* Кнопка запроса и сами контакты — отдельным блоком под карточкой:
          карточка описывает человека, а этот блок — доступ к нему. */}
      <PeopleRequestButton
        userId={state.card.userId}
        contacts={state.card.contacts}
      />
    </div>
  );
}

function ContactsCard({ card }: { card: ContactsCardDto }) {
  const place = [card.city, card.country].filter(Boolean).join(", ");
  const facts: { label: string; value: string }[] = [];
  if (place) facts.push({ label: "Город", value: place });
  if (card.ashram) {
    facts.push({ label: "Ашрам", value: contactsAshramLabels[card.ashram] });
  }
  facts.push({ label: "Формат", value: contactsFormatLabels[card.format] });
  if (card.spiritualStage) {
    facts.push({
      label: "Духовный этап",
      value: contactsStageLabels[card.spiritualStage],
    });
  }
  if (card.languages.length > 0) {
    facts.push({ label: "Языки", value: card.languages.join(", ") });
  }

  const tagGroups = contactsTagKindOrder
    .map((kind) => ({
      kind,
      items: card.tags.filter((tag) => tag.kind === kind),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <article className="glass flex flex-col gap-6 rounded-3xl border border-glass-brd p-6">
      <div className="flex flex-wrap items-start gap-4">
        {card.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.avatarUrl}
            alt={card.name}
            className="h-20 w-20 shrink-0 rounded-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-magenta/25 to-[#B23EFF]/25 font-display text-2xl font-bold text-text-0"
          >
            {card.name.charAt(0).toUpperCase()}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl font-bold text-text-0 sm:text-2xl">
            {card.name}
          </h2>
          {card.headline && (
            <p className="mt-1 text-sm text-text-1">{card.headline}</p>
          )}
          {(card.isVerifiedDevotee || card.isPhotoVerified) && (
            <div className="mt-2 flex flex-wrap gap-2">
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
          )}
        </div>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2">
        {facts.map((fact) => (
          <div key={fact.label}>
            <dt className="text-xs uppercase tracking-wide text-text-2">
              {fact.label}
            </dt>
            <dd className="mt-0.5 text-sm text-text-0">{fact.value}</dd>
          </div>
        ))}
      </dl>

      {card.about && (
        <section>
          <h3 className="font-display text-base font-semibold text-text-0">
            О себе
          </h3>
          <p className="mt-1 whitespace-pre-line text-sm text-text-1">
            {card.about}
          </p>
        </section>
      )}

      {card.offers && (
        <section>
          <h3 className="font-display text-base font-semibold text-text-0">
            Чем может быть полезен
          </h3>
          <p className="mt-1 whitespace-pre-line text-sm text-text-1">
            {card.offers}
          </p>
        </section>
      )}

      {tagGroups.map((group) => (
        <section key={group.kind}>
          <h3 className="font-display text-base font-semibold text-text-0">
            {contactsTagKindLabels[group.kind]}
          </h3>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {group.items.map((tag) => (
              <li
                key={tag.id}
                className="rounded-full border border-glass-brd bg-bg-1 px-2.5 py-1 text-xs text-text-1"
              >
                {tag.nameRu}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </article>
  );
}
