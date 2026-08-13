"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ContactsRequestDto } from "@vedamatch/shared";
import {
  CONTACTS_MAX_MESSAGE_LENGTH,
  createContactsRequest,
  getContactsRequests,
} from "@/lib/contacts-api";
import { ContactsDetails, type ContactsDetailsValue } from "./contacts-details";

/**
 * Запрос контакта с карточки человека.
 *
 * Контакты показываются только из того, что прислал бэкенд: поле `contacts`
 * приходит непустым исключительно при действующем раскрытии. Своей проверки
 * «а можно ли» здесь нет — иначе интерфейс начал бы решать за сервер.
 */
export function ContactsRequestButton({
  userId,
  contacts,
}: {
  userId: string;
  /** Поле `contacts` карточки: непустое — доступ уже открыт. */
  contacts: ContactsDetailsValue | null;
}) {
  const [outgoing, setOutgoing] = useState<ContactsRequestDto | null>(null);
  const [remainingToday, setRemainingToday] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;

    getContactsRequests(controller.signal)
      .then((state) => {
        if (!alive) return;
        setOutgoing(
          state.outgoing.find((item) => item.user.userId === userId) ?? null,
        );
        setRemainingToday(state.remainingToday);
      })
      // Список запросов — только подсказка о состоянии. Если он не пришёл,
      // кнопка всё равно должна работать: решение всё равно за бэкендом.
      .catch(() => undefined)
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
      controller.abort();
    };
  }, [userId]);

  async function send() {
    setSending(true);
    setError(null);
    try {
      const state = await createContactsRequest(userId, message);
      setOutgoing(
        state.outgoing.find((item) => item.user.userId === userId) ?? null,
      );
      setRemainingToday(state.remainingToday);
      setMessage("");
    } catch (e: unknown) {
      // Текст с бэкенда уже русский и объясняет причину — не подменяем своим.
      setError(
        e instanceof Error ? e.message : "Не удалось отправить запрос контакта",
      );
    } finally {
      setSending(false);
    }
  }

  // Карточка отдаёт контакты только при действующем доступе; принятый запрос
  // несёт их же — берём то, что есть.
  const open = contacts ?? outgoing?.contacts ?? null;
  if (open) {
    return <ContactsDetails contacts={open} />;
  }

  if (loading) {
    return (
      <p className="glass rounded-2xl border border-glass-brd p-4 text-sm text-text-1">
        Проверяем, отправляли ли вы запрос…
      </p>
    );
  }

  if (outgoing?.status === "pending") {
    return (
      <section className="glass rounded-2xl border border-glass-brd p-4">
        <p className="text-sm text-text-0">Запрос отправлен, ждём ответа.</p>
        <p className="mt-1 text-xs text-text-2">
          Человек сам решает, открывать ли контакты. Отозвать запрос можно на
          странице «Мои запросы».
        </p>
        <Link
          href="/contacts/requests"
          className="mt-3 inline-block rounded-xl border border-glass-brd px-4 py-2 text-sm font-medium text-text-1 transition hover:text-text-0"
        >
          Мои запросы
        </Link>
      </section>
    );
  }

  const limitReached = remainingToday === 0;
  const left = CONTACTS_MAX_MESSAGE_LENGTH - message.length;

  return (
    <section className="glass rounded-2xl border border-glass-brd p-4">
      <h3 className="font-display text-base font-semibold text-text-0">
        Запросить контакт
      </h3>
      <p className="mt-1 text-xs text-text-2">
        Способы связи откроются, только если человек согласится. Коротко
        напишите, зачем вы обращаетесь, — так соглашаются чаще.
      </p>

      <label className="mt-3 block">
        <span className="sr-only">Сообщение к запросу</span>
        <textarea
          value={message}
          maxLength={CONTACTS_MAX_MESSAGE_LENGTH}
          rows={3}
          disabled={limitReached || sending}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Например: ищу повара на программу в Москве 20 сентября"
          className="w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
        />
      </label>
      <p className="mt-1 text-xs text-text-2">
        Необязательно. Осталось символов: {left}
      </p>

      {limitReached && (
        <p className="mt-2 text-sm text-text-1">
          Лимит запросов на сегодня исчерпан. Попробуйте завтра.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm text-magenta">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={send}
        disabled={limitReached || sending}
        className="mt-3 rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] px-4 py-2 text-sm font-medium text-white transition hover:shadow-[0_0_20px_rgba(255,62,158,0.4)] disabled:opacity-50"
      >
        {sending ? "Отправляем…" : "Запросить контакт"}
      </button>

      {remainingToday !== null && !limitReached && (
        <p className="mt-2 text-xs text-text-2">
          Сегодня можно отправить ещё {remainingToday}.
        </p>
      )}
    </section>
  );
}
