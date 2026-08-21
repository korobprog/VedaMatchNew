"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Megaphone, X } from "lucide-react";
import type { HomeAnnouncementDto } from "@vedamatch/shared";
import { MemberCounter } from "@/components/member-counter";
import { statsCallToAction } from "@/lib/stats-call-to-action";
import {
  isNewsDismissed,
  newsDismissalSnapshot,
  rememberNewsDismissal,
  serverNewsDismissal,
  subscribeToNewsDismissal,
} from "@/lib/news-banner-dismissal";

/**
 * Новости портала над карточками-подсказками. Рупор — тот же знак, что у
 * категории «объявления администрации» в колокольчике: одно и то же
 * сообщение от платформы должно узнаваться одинаково.
 *
 * `totalMembers` показывается рядом с новостью и только внутри портала: на
 * лендинге счётчик уже есть в первом экране, и второй был бы дублем.
 */
export function NewsBanner({
  news,
  totalMembers,
  greetName,
}: {
  news: HomeAnnouncementDto | null;
  totalMembers?: number;
  /**
   * Имя для обращения. Приходит, только когда советник молчит: здоровается
   * кто-то один, иначе имя звучит дважды на одном экране.
   */
  greetName?: string;
}) {
  // Хранилище читается через useSyncExternalStore, а не в эффекте: на сервере
  // его нет, и снапшот там честно отдаёт «ничего не скрыто» — разметка сервера
  // и клиента не разъезжается.
  const dismissedId = useSyncExternalStore(
    subscribeToNewsDismissal,
    newsDismissalSnapshot,
    serverNewsDismissal,
  );

  const hidden = news ? isNewsDismissed(dismissedId, news.id) : true;
  const showsCounter = totalMembers != null;
  if (hidden && !showsCounter) return null;

  function dismiss() {
    if (news) rememberNewsDismissal(news.id);
  }

  return (
    <section
      aria-label="Новости VedaMatch"
      className="glass mb-6 flex flex-wrap items-start gap-x-6 gap-y-3 rounded-2xl border border-glass-brd p-4"
    >
      {!hidden && news ? (
        <>
          <Megaphone
            className="mt-0.5 h-5 w-5 shrink-0 text-text-1"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <p className="font-display font-semibold text-text-0">
              {news.title}
            </p>
            <p className="mt-1 whitespace-pre-line text-sm text-text-1">
              {news.body}
            </p>
            <Link
              href="/updates/news"
              className="mt-2 inline-block text-sm text-text-1 underline underline-offset-2 hover:text-text-0"
            >
              Все новости
            </Link>
          </div>
        </>
      ) : (
        <Megaphone
          className="mt-0.5 h-5 w-5 shrink-0 text-text-2"
          aria-hidden="true"
        />
      )}

      {showsCounter && (
        // Ссылка, а не просто цифра: за ней статистика портала и способ
        // поддержать проект — иначе число ничего не предлагает сделать.
        <Link
          href="/stats"
          className="group shrink-0 text-sm text-text-2 transition-colors hover:text-text-1"
        >
          Вместе нас:{" "}
          <MemberCounter
            total={totalMembers}
            className="font-semibold text-text-0"
          />
          <span className="block text-xs underline underline-offset-2 group-hover:text-text-0">
            {statsCallToAction(greetName)}
          </span>
        </Link>
      )}

      {!hidden && news && (
        <button
          type="button"
          onClick={dismiss}
          aria-label="Скрыть новость"
          className="shrink-0 rounded-lg p-1 text-text-2 transition-colors hover:text-text-0"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </section>
  );
}
