"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ContactsRequestDto, ContactsRequestsState } from "@vedamatch/shared";
import { CONTACTS_REQUESTS_PER_DAY } from "@vedamatch/shared";
import {
  cancelContactsRequest,
  getContactsRequests,
  respondToContactsRequest,
} from "@/lib/chat-people-api";
import { PeopleDetails } from "./people-details";
import { contactsRequestStatusLabels, formatContactsDate } from "./labels";

/**
 * Запросы контакта: кто просит меня и кого прошу я.
 *
 * Ключевое место — отказ. Он НЕ скрывает человека сам по себе: скрытие
 * включается отдельной галочкой, по умолчанию выключенной. Отказ дать телефон
 * и желание исчезнуть из справочника — разные вещи, и интерфейс не должен
 * склеивать их в одно действие.
 */
export function PeopleRequestsView() {
  const router = useRouter();
  const [state, setState] = useState<ContactsRequestsState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  /** id запроса, по которому сейчас идёт действие: блокирует только его кнопки. */
  const [busyId, setBusyId] = useState<string | null>(null);
  /** id запроса, по которому сейчас открывается чат. */
  const [chatBusyId, setChatBusyId] = useState<string | null>(null);
  /** Галочки скрытия — по запросу. Отсутствие ключа означает «выключена». */
  const [hideFlags, setHideFlags] = useState<Record<string, boolean>>({});

  // Переписку ведут беседы «Общения»: справочник просто уводит туда
  // ссылкой по человеку. Своей ручки «открой чат» у них больше нет —
  // она заводила диалог через чужой модуль.
  function openChat(requestId: string, userId: string) {
    setChatBusyId(requestId);
    router.push(`/chat/with/${userId}`);
  }

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;

    getContactsRequests(controller.signal)
      .then((next) => {
        if (alive) setState(next);
      })
      .catch((e: unknown) => {
        if (!alive || controller.signal.aborted) return;
        // Текст с бэкенда уже русский и объясняет причину — не подменяем своим.
        setLoadError(
          e instanceof Error ? e.message : "Не удалось загрузить запросы",
        );
      });

    return () => {
      alive = false;
      controller.abort();
    };
  }, []);

  async function run(
    requestId: string,
    action: () => Promise<ContactsRequestsState>,
  ) {
    setBusyId(requestId);
    setActionError(null);
    try {
      setState(await action());
    } catch (e: unknown) {
      setActionError(
        e instanceof Error ? e.message : "Не удалось выполнить действие",
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
        Загружаем запросы…
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {actionError && (
        <p
          role="alert"
          className="glass rounded-2xl border border-glass-brd p-4 text-sm text-magenta"
        >
          {actionError}
        </p>
      )}

      <section>
        <h2 className="font-display text-xl font-bold text-text-0">Входящие</h2>
        <p className="mt-1 text-sm text-text-1">
          Эти люди просят открыть им ваши способы связи.
        </p>

        {state.incoming.length === 0 ? (
          <p className="glass mt-3 rounded-2xl border border-glass-brd p-4 text-sm text-text-1">
            Входящих запросов пока нет.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {state.incoming.map((request) => (
              <li key={request.id}>
                <article className="glass flex flex-col gap-3 rounded-2xl border border-glass-brd p-4">
                  <RequestHeader request={request} />

                  {request.status === "pending" ? (
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busyId === request.id}
                          onClick={() =>
                            run(request.id, () =>
                              respondToContactsRequest(request.id, true),
                            )
                          }
                          className="rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] px-4 py-2 text-sm font-medium text-white transition hover:shadow-[0_0_20px_rgba(255,62,158,0.4)] disabled:opacity-50"
                        >
                          Открыть контакты
                        </button>
                        <button
                          type="button"
                          disabled={busyId === request.id}
                          onClick={() =>
                            run(request.id, () =>
                              respondToContactsRequest(
                                request.id,
                                false,
                                hideFlags[request.id] === true,
                              ),
                            )
                          }
                          className="rounded-xl border border-glass-brd px-4 py-2 text-sm font-medium text-text-1 transition hover:text-text-0 disabled:opacity-50"
                        >
                          Отказать
                        </button>
                      </div>

                      {/* Скрытие — отдельное решение, а не следствие отказа. */}
                      <div className="rounded-xl border border-glass-brd bg-bg-1 p-3">
                        <label className="flex items-start gap-2 text-sm text-text-0">
                          <input
                            type="checkbox"
                            checked={hideFlags[request.id] === true}
                            onChange={(event) =>
                              setHideFlags((flags) => ({
                                ...flags,
                                [request.id]: event.target.checked,
                              }))
                            }
                            className="mt-0.5"
                          />
                          <span>
                            Больше не показывать меня этому человеку
                          </span>
                        </label>
                        <p className="mt-1 text-xs text-text-2">
                          Просто отказ ничего не скрывает: человек по-прежнему
                          видит вашу карточку и сможет обратиться снова. Эта
                          галочка — отдельное решение: с ней ваша карточка
                          исчезнет из его справочника.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="text-sm text-text-2">
                        {contactsRequestStatusLabels[request.status]}
                        {request.respondedAt
                          ? ` · ${formatContactsDate(request.respondedAt)}`
                          : ""}
                      </p>
                      {request.status === "accepted" && (
                        <button
                          type="button"
                          disabled={chatBusyId === request.id}
                          onClick={() => openChat(request.id, request.user.userId)}
                          className="rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] px-3 py-1.5 text-sm font-medium text-white transition hover:shadow-[0_0_20px_rgba(255,62,158,0.4)] disabled:opacity-50"
                        >
                          {chatBusyId === request.id
                            ? "Открываем чат…"
                            : "Написать в чат"}
                        </button>
                      )}
                    </div>
                  )}
                </article>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-display text-xl font-bold text-text-0">Исходящие</h2>
        <p className="mt-1 text-sm text-text-1" data-testid="contacts-remaining">
          Сегодня можно отправить ещё {state.remainingToday} из{" "}
          {CONTACTS_REQUESTS_PER_DAY} запросов.
        </p>

        {state.outgoing.length === 0 ? (
          <p className="glass mt-3 rounded-2xl border border-glass-brd p-4 text-sm text-text-1">
            Вы пока никому не отправляли запрос контакта.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {state.outgoing.map((request) => (
              <li key={request.id}>
                <article className="glass flex flex-col gap-3 rounded-2xl border border-glass-brd p-4">
                  <RequestHeader request={request} />

                  <p className="text-sm text-text-2">
                    {contactsRequestStatusLabels[request.status]}
                  </p>

                  {/* Контакты приходят только при действующем доступе. */}
                  {request.contacts && (
                    <>
                      <PeopleDetails contacts={request.contacts} />
                      <div>
                        <button
                          type="button"
                          disabled={chatBusyId === request.id}
                          onClick={() => openChat(request.id, request.user.userId)}
                          className="rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] px-4 py-2 text-sm font-medium text-white transition hover:shadow-[0_0_20px_rgba(255,62,158,0.4)] disabled:opacity-50"
                        >
                          {chatBusyId === request.id
                            ? "Открываем чат…"
                            : "Написать в чат"}
                        </button>
                      </div>
                    </>
                  )}

                  {request.status === "pending" && (
                    <div>
                      <button
                        type="button"
                        disabled={busyId === request.id}
                        onClick={() =>
                          run(request.id, () => cancelContactsRequest(request.id))
                        }
                        className="rounded-xl border border-glass-brd px-4 py-2 text-sm font-medium text-text-1 transition hover:text-text-0 disabled:opacity-50"
                      >
                        Отозвать запрос
                      </button>
                    </div>
                  )}
                </article>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function RequestHeader({ request }: { request: ContactsRequestDto }) {
  const subtitle = [request.user.headline, request.user.city]
    .filter(Boolean)
    .join(" · ");

  return (
    <div>
      <Link
        href={`/chat/people/users/${request.user.userId}`}
        className="font-display text-base font-semibold text-text-0 transition hover:text-magenta"
      >
        {request.user.name}
      </Link>
      {subtitle && <p className="mt-0.5 text-sm text-text-1">{subtitle}</p>}
      <p className="mt-0.5 text-xs text-text-2">
        {formatContactsDate(request.createdAt)}
      </p>
      {request.message && (
        <p className="mt-2 whitespace-pre-line rounded-xl border border-glass-brd bg-bg-1 p-3 text-sm text-text-1">
          {request.message}
        </p>
      )}
    </div>
  );
}
