"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ChatConferenceInviteDto } from "@vedamatch/shared";
import {
  getChatConferenceInvite,
  joinChatConference,
} from "@/lib/chat-conference-api";
import { ChatAvatar } from "@/components/chat/chat-avatar";
import {
  conferenceAppLink,
  conferenceCallLine,
  conferenceExpiryLine,
  conferenceJoinStep,
  conferenceSeatsLine,
} from "./conference-join-step";

/**
 * Экран, на который приводит ссылка конференции.
 *
 * Обещание задачи — «открыл ссылку и оказался в комнате», поэтому у
 * вошедшего здесь нет ни одной кнопки: карточка приглашения спрашивается,
 * вход выполняется сам, браузер уходит в беседу. Видно это ровно столько,
 * сколько идут два запроса.
 *
 * Гость видит карточку: кто зовёт, идёт ли разговор, сколько мест и до
 * какого часа работает ссылка, — и одну кнопку «Войти и присоединиться».
 * Она уносит на вход с `?returnTo=` на эту же страницу, и портал возвращает
 * сюда же — в том числе после ПЕРВОГО входа, который в портале и есть
 * регистрация.
 *
 * Анонимов дальше не пускаем осознанно: портал — сообщество, где общаются
 * по именам, и модерировать безымянного гостя нечем.
 */
export function ConferenceJoinView({
  token,
  signedIn,
}: {
  token: string;
  signedIn: boolean;
}) {
  const router = useRouter();
  const [invite, setInvite] = useState<ChatConferenceInviteDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Вход выполняется один раз: React в разработке монтирует эффект дважды,
  // а второй POST в ту же комнату — лишний запрос и лишняя запись в логах.
  const entering = useRef(false);

  useEffect(() => {
    let alive = true;
    getChatConferenceInvite(token)
      .then((next) => {
        if (alive) setInvite(next);
      })
      .catch((cause: unknown) => {
        if (alive)
          setError(
            cause instanceof Error ? cause.message : "Ссылка не открылась",
          );
      });
    return () => {
      alive = false;
    };
  }, [token]);

  const step = conferenceJoinStep({ token, signedIn, invite, error });

  useEffect(() => {
    if (step.kind !== "enter" || entering.current) return;
    entering.current = true;
    joinChatConference(token)
      .then((room) => router.replace(`/chat/${room.conversationId}`))
      .catch((cause: unknown) => {
        entering.current = false;
        setError(cause instanceof Error ? cause.message : "Не получилось войти");
      });
  }, [step.kind, token, router]);

  if (step.kind === "denied") {
    return (
      <section className="rounded-2xl border border-glass-brd bg-glass p-6">
        <h1 className="font-display text-xl font-bold text-text-0">
          {step.title}
        </h1>
        <p role="alert" className="mt-2 text-sm text-text-1">
          {step.text}
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex min-h-11 items-center rounded-xl border border-glass-brd px-4 text-sm text-text-0"
        >
          На главную
        </Link>
      </section>
    );
  }

  if (step.kind === "loading" || step.kind === "enter") {
    return (
      <section className="rounded-2xl border border-glass-brd bg-glass p-6">
        <h1 className="font-display text-xl font-bold text-text-0">
          {step.kind === "enter" ? step.note : "Открываем приглашение…"}
        </h1>
        <p className="mt-2 text-sm text-text-1">Это займёт секунду.</p>
      </section>
    );
  }

  const card = invite!;
  return (
    <section className="rounded-2xl border border-glass-brd bg-glass p-6">
      <p className="text-sm text-text-1">Вас зовут в конференцию</p>
      <h1 className="mt-1 font-display text-2xl font-bold text-text-0">
        {card.title}
      </h1>
      <div className="mt-4 flex items-center gap-3">
        <ChatAvatar kind="direct" user={card.host} title={card.host.name} size={44} />
        <div>
          <p className="text-sm font-medium text-text-0">{card.host.name}</p>
          <p className="text-sm text-text-1">{conferenceCallLine(card)}</p>
        </div>
      </div>
      <dl className="mt-5 space-y-1 text-sm text-text-1">
        <div>
          <dt className="sr-only">Места</dt>
          <dd>{conferenceSeatsLine(card)}</dd>
        </div>
        <div>
          <dt className="sr-only">Срок ссылки</dt>
          <dd>{conferenceExpiryLine(card.expiresAt)}</dd>
        </div>
      </dl>
      <Link
        href={step.href}
        className="mt-6 flex min-h-11 w-full items-center justify-center rounded-xl border border-mint-edge bg-mint px-4 font-medium text-on-mint"
      >
        {step.action}
      </Link>
      <p className="mt-3 text-sm text-text-2">
        Отдельной регистрации нет: первый вход создаёт аккаунт и сразу
        возвращает вас сюда.
      </p>
      {/* Обычная ссылка на телефоне открывается браузером: проверенных
          app-links у домена нет. Этот переход отдаёт ту же комнату
          приложению; если его не установили, ничего не произойдёт и
          человек останется здесь. */}
      <a
        href={conferenceAppLink(token)}
        className="mt-4 flex min-h-11 items-center justify-center rounded-xl border border-glass-brd px-4 text-sm text-text-0"
      >
        Открыть в приложении
      </a>
    </section>
  );
}
