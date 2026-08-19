"use client";

import { useEffect, useRef, useState } from "react";
import type { DonationRequisite, DonationSettingsDto } from "@vedamatch/shared";

/**
 * Кнопка «Поддержать развитие VedaMatch» и шторка с реквизитами.
 *
 * Портальная, а не сервисная: реквизиты одни на весь портал и вводятся в
 * /admin/settings. Это не платёж внутри приложения — мы только показываем
 * реквизиты, человек переводит сам, поэтому ничего не отправляется и не
 * хранится. Если пожертвования выключены или реквизитов нет, кнопка не
 * рисуется вовсе.
 */
export function DonateButton({
  donation,
  className,
  label = "Поддержать развитие VedaMatch",
}: {
  donation: DonationSettingsDto | null | undefined;
  className?: string;
  label?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  if (!donation?.enabled || donation.requisites.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className={
          className ??
          "inline-flex items-center gap-2 rounded-xl border border-gold/50 bg-gold/10 px-4 py-2 text-sm font-semibold text-gold hover:bg-gold/20"
        }
      >
        <span aria-hidden="true">💛</span>
        {label}
      </button>
      <DonateSheet ref={dialogRef} donation={donation} />
    </>
  );
}

function DonateSheet({
  ref,
  donation,
}: {
  ref: React.RefObject<HTMLDialogElement | null>;
  donation: DonationSettingsDto;
}) {
  return (
    // Нативный dialog: фокус, Esc и затемнение даёт браузер.
    <dialog
      ref={ref}
      aria-labelledby="donate-title"
      className="m-auto w-[min(92vw,28rem)] rounded-3xl border border-glass-brd bg-bg-0 p-0 text-text-0 shadow-2xl backdrop:bg-black/60"
    >
      {/* text-left: кнопка живёт и на центрированных слайдах ленты, шторка наследовать это не должна. */}
      <form method="dialog" className="p-6 text-left">
        <h2 id="donate-title" className="font-display text-xl font-bold">
          Поддержать развитие VedaMatch
        </h2>
        <p className="mt-2 text-sm text-text-1">
          {donation.text ||
            "Генерация видео и картинок стоит реальных денег. Пожертвование идёт на развитие портала. Спасибо."}
        </p>
        <ul className="mt-4 space-y-2">
          {donation.requisites.map((item, index) => (
            <li key={`${item.kind}-${index}`}>
              <RequisiteRow item={item} />
            </li>
          ))}
        </ul>
        <button className="btn-mint mt-5 w-full rounded-xl px-4 py-2 text-sm font-semibold" value="close">
          Закрыть
        </button>
      </form>
    </dialog>
  );
}

function RequisiteRow({ item }: { item: DonationRequisite }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(item.value);
      setCopied(true);
    } catch {
      // Буфер недоступен (http, старый браузер) — значение и так на экране.
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-glass-brd bg-bg-1 px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="text-xs uppercase tracking-wide text-text-2">{item.label}</div>
        <div className="truncate font-mono text-sm text-text-0">{item.value}</div>
      </div>
      {item.kind === "link" ? (
        <a
          href={item.value}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border border-glass-brd px-3 py-1 text-xs font-medium text-text-1 hover:bg-bg-2"
        >
          Открыть
        </a>
      ) : (
        <button
          type="button"
          onClick={copy}
          aria-live="polite"
          className="rounded-lg border border-glass-brd px-3 py-1 text-xs font-medium text-text-1 hover:bg-bg-2"
        >
          {copied ? "Скопировано" : "Копировать"}
        </button>
      )}
    </div>
  );
}
