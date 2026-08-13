"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ContactsDisclosuresState } from "@vedamatch/shared";
import {
  getContactsDisclosures,
  revokeContactsDisclosure,
} from "@/lib/contacts-api";
import { formatContactsDate } from "./labels";

/**
 * Журнал «кому я открыл контакты».
 *
 * Отозванные записи остаются в списке с датой отзыва и показываются
 * погашенными: это журнал, а не список активных доступов. Строка, исчезающая
 * после отзыва, скрыла бы от человека его же историю.
 */
export function ContactsDisclosuresView() {
  const [state, setState] = useState<ContactsDisclosuresState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;

    getContactsDisclosures(controller.signal)
      .then((next) => {
        if (alive) setState(next);
      })
      .catch((e: unknown) => {
        if (!alive || controller.signal.aborted) return;
        // Текст с бэкенда уже русский и объясняет причину — не подменяем своим.
        setLoadError(
          e instanceof Error ? e.message : "Не удалось загрузить журнал",
        );
      });

    return () => {
      alive = false;
      controller.abort();
    };
  }, []);

  async function revoke(id: string) {
    setBusyId(id);
    setActionError(null);
    try {
      setState(await revokeContactsDisclosure(id));
    } catch (e: unknown) {
      setActionError(
        e instanceof Error ? e.message : "Не удалось закрыть доступ",
      );
    } finally {
      setBusyId(null);
    }
  }

  if (loadError) {
    return (
      <p
        role="alert"
        className="glass rounded-2xl border border-glass-brd p-4 text-sm text-magenta"
      >
        {loadError}
      </p>
    );
  }

  if (!state) {
    return (
      <p className="glass rounded-2xl border border-glass-brd p-4 text-sm text-text-1">
        Загружаем журнал…
      </p>
    );
  }

  if (state.items.length === 0) {
    return (
      <p className="glass rounded-2xl border border-glass-brd p-4 text-sm text-text-1">
        Вы пока никому не открывали свои контакты.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {actionError && (
        <p
          role="alert"
          className="glass rounded-2xl border border-glass-brd p-4 text-sm text-magenta"
        >
          {actionError}
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {state.items.map((item) => {
          const revoked = item.revokedAt !== null;
          return (
            <li key={item.id}>
              <article
                data-testid="contacts-disclosure"
                data-revoked={revoked ? "true" : "false"}
                className={`glass flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-glass-brd p-4 ${
                  revoked ? "opacity-60" : ""
                }`}
              >
                <div className="min-w-0">
                  <Link
                    href={`/contacts/users/${item.user.userId}`}
                    className={`font-display text-base font-semibold transition hover:text-magenta ${
                      revoked ? "text-text-2 line-through" : "text-text-0"
                    }`}
                  >
                    {item.user.name}
                  </Link>
                  {item.user.headline && (
                    <p className="mt-0.5 text-sm text-text-1">
                      {item.user.headline}
                    </p>
                  )}
                  <p className="mt-0.5 text-xs text-text-2">
                    Доступ открыт {formatContactsDate(item.grantedAt)}
                  </p>
                  {item.revokedAt && (
                    <p className="mt-0.5 text-xs text-text-2">
                      Доступ закрыт {formatContactsDate(item.revokedAt)}
                    </p>
                  )}
                </div>

                {revoked ? (
                  <span className="rounded-full border border-glass-brd px-3 py-1 text-xs text-text-2">
                    Доступ закрыт
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => revoke(item.id)}
                    className="rounded-xl border border-glass-brd px-4 py-2 text-sm font-medium text-text-1 transition hover:text-text-0 disabled:opacity-50"
                  >
                    Закрыть доступ
                  </button>
                )}
              </article>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
