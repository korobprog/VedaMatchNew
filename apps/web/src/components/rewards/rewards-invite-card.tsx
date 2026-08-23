"use client";

import { useState } from "react";
import type { RewardsMeDto } from "@vedamatch/shared";
import { balanceNote, shareLink } from "@/lib/rewards-share";

/**
 * Баланс и приглашение. Клиентский компонент: копирование ссылки и отклик
 * кнопки живут в браузере, всё остальное на экране — серверная разметка.
 */
export function RewardsInviteCard({ data }: { data: RewardsMeDto }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(data.link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Буфер закрыт настройками браузера — ссылка рядом, её можно выделить.
      setCopied(false);
    }
  }

  return (
    <section className="glass mb-6 rounded-2xl border border-glass-brd p-6">
      <p className="font-body text-sm text-text-1">Ваш баланс</p>
      <p className="font-display text-5xl font-bold text-text-0">
        {data.total}
        <span className="ml-2 font-body text-base font-normal text-text-1">
          {data.total === 1 ? "балл" : "баллов"}
        </span>
      </p>
      {data.reserved > 0 && (
        <p className="mt-1 font-body text-sm text-text-1">
          В резерве под оплату: {data.reserved}. Доступно: {data.available}.
        </p>
      )}
      {/* Пояснение обязательно на самом экране: без него человек в бете видит
          баланс, которым нельзя воспользоваться, и идёт в поддержку. */}
      <p className="mt-3 max-w-prose font-body text-sm text-text-1">
        {balanceNote(data.spendEnabled)}
      </p>

      <div className="mt-6">
        <p className="mb-2 font-body text-sm text-text-1" id="rewards-link-label">
          Ваша ссылка для приглашений
        </p>
        {/* На телефоне ссылка занимает всю ширину и стоит над кнопкой: в одну
            строку с ней от адреса оставалось меньше половины. Переносится, а
            не обрезается многоточием: `https://vedamatch.ru/?ref=КОД` шире
            экрана телефона на пару символов, и именно хвост с кодом — то
            единственное, что человеку нужно прочитать или продиктовать. */}
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          <code
            aria-labelledby="rewards-link-label"
            className="min-w-0 break-all rounded-xl border border-glass-brd bg-bg-2 px-3 py-2 font-mono text-sm text-text-0 sm:flex-1"
          >
            {data.link}
          </code>
          <button
            type="button"
            onClick={() => void copy()}
            className="btn-mint rounded-xl px-4 py-2 font-body text-sm font-medium"
          >
            {copied ? "Скопировано" : "Скопировать"}
          </button>
        </div>
        {/* Отклик на копирование — не только сменой надписи: человек со
            скринридером иначе не узнает, что нажатие сработало. */}
        <p role="status" aria-live="polite" className="sr-only">
          {copied ? "Ссылка скопирована" : ""}
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={shareLink("telegram", data.link)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-mint-outline rounded-xl px-4 py-2 font-body text-sm"
          >
            Отправить в Telegram
          </a>
          <a
            href={shareLink("whatsapp", data.link)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-mint-outline rounded-xl px-4 py-2 font-body text-sm"
          >
            Отправить в WhatsApp
          </a>
        </div>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div>
          <dt className="font-body text-sm text-text-1">Приглашено</dt>
          <dd className="font-mono text-xl text-text-0">{data.invitedTotal}</dd>
        </div>
        <div>
          <dt className="font-body text-sm text-text-1">Выполнили условие</dt>
          <dd className="font-mono text-xl text-text-0">
            {data.qualifiedTotal}
          </dd>
        </div>
        <div>
          <dt className="font-body text-sm text-text-1">Начислено за месяц</dt>
          <dd className="font-mono text-xl text-text-0">
            {data.earnedThisMonth}
            {data.monthlyCap > 0 && (
              <span className="font-body text-sm text-text-1">
                {" "}
                из {data.monthlyCap}
              </span>
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}
