import type { ReactNode } from "react";
import Link from "next/link";
import type { ServiceCard as ServiceCardType } from "@vedamatch/shared";
import { ServiceIcon } from "@/components/icons/service-icons";
import { GripVertical, Pin } from "lucide-react";

export function ServiceCard({
  service,
  badgeCount,
  extra,
  isPinned,
  onTogglePin,
  onOpen,
  dragHandleProps,
}: {
  service: ServiceCardType;
  badgeCount?: number;
  extra?: ReactNode;
  isPinned?: boolean;
  onTogglePin?: () => void;
  onOpen?: () => void;
  dragHandleProps?: {
    onPointerDown: (e: React.PointerEvent<HTMLSpanElement>) => void;
  };
}) {
  const comingSoon = service.status === "coming_soon";

  return (
    <div
      className={`group relative flex h-full flex-col rounded-2xl glass border p-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_24px_rgba(255,62,158,0.18)] sm:p-5 ${
        isPinned
          ? "border-gold/50 shadow-[0_0_20px_rgba(250,204,21,0.12)]"
          : "service-edge"
      }`}
    >
      {/* Перелив живёт в globals.css: движение — забота стилей, а не разметки.
          Для читалки его нет вовсе.

          `relative` на соседних блоках не ставим: область нажатия названия
          растянута через `after:inset-0` и отсчитывается от ближайшего
          позиционированного предка. Стоит сделать позиционированной шапку —
          и нажимаемой останется она одна, а не карточка. */}
      <span aria-hidden className="service-sheen" />

      <div className="mb-3 flex items-center gap-3">
        {dragHandleProps && (
          <span
            {...dragHandleProps}
            className="relative z-10 hidden shrink-0 cursor-grab touch-none select-none items-center text-text-2 hover:text-text-0 active:cursor-grabbing sm:flex"
            aria-label="Перетащить карточку"
          >
            <GripVertical size={16} />
          </span>
        )}
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-glass border-2 border-text-2/35 transition-colors group-hover:border-magenta/50">
          {service.iconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={service.iconUrl} alt="" className="h-8 w-8" />
          ) : (
            <ServiceIcon slug={service.slug} category={service.category} className="h-8 w-8" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          {/* Открывает сервис само название, а областью нажатия ему служит вся
              карточка: `after:inset-0` растягивает невидимый прямоугольник от
              края до края. Кнопки «Открыть» под описанием больше нет — она
              занимала строку в каждой из десяти карточек и повторяла то, что
              карточка и так обещает.

              Обёртывать в ссылку всю карточку нельзя: внутри ручка
              перетаскивания и булавка, а интерактивное внутри ссылки
              клавиатура и скринридер разбирают по-разному. Поэтому ссылка
              одна и на названии — её и объявляет читалка, — а те двое подняты
              над накладкой через `z-10` и остаются нажимаемыми. */}
          <h3 className="font-semibold text-text-0">
            {comingSoon ? (
              service.name
            ) : (
              <Link
                href={service.url}
                onClick={onOpen}
                className="after:absolute after:inset-0 after:rounded-2xl after:content-['']"
              >
                {service.name}
              </Link>
            )}
          </h3>
          {comingSoon && (
            <span className="inline-block rounded-full bg-glass px-2 py-0.5 text-xs font-medium text-text-1 mt-1">
              Скоро
            </span>
          )}
          {service.requiresDevoteeVerification && (
            <span className="mt-1 inline-block rounded-full bg-magenta/20 px-2 py-0.5 text-xs font-medium text-magenta border border-magenta/30">
              Подтвержденный преданный
            </span>
          )}
        </div>
        {(badgeCount ?? 0) > 0 && (
          <span
            aria-label={`Входящих заявок: ${badgeCount}`}
            className="self-start rounded-full bg-magenta px-2.5 py-1 text-xs font-semibold text-white"
          >
            {badgeCount}
          </span>
        )}
        {onTogglePin && (
          <button
            type="button"
            onClick={onTogglePin}
            aria-pressed={isPinned}
            aria-label={isPinned ? "Открепить карточку" : "Закрепить карточку сверху"}
            title={isPinned ? "Открепить" : "Закрепить сверху"}
            className={`relative z-10 shrink-0 rounded-lg p-1.5 transition-colors ${
              isPinned ? "text-gold" : "text-text-2/60 hover:text-text-0"
            }`}
          >
            <Pin size={16} fill={isPinned ? "currentColor" : "none"} />
          </button>
        )}
      </div>
      {/* Описание может быть пустым: администратор вправе снять подпись в
          каталоге. Распорка на её месте остаётся — без неё карточка без
          подписи съезжает по высоте относительно соседних в сетке. */}
      {service.description ? (
        <p className="mb-4 flex-1 text-sm text-text-1">{service.description}</p>
      ) : (
        <div className="mb-4 flex-1" />
      )}
      {extra}
      {/* У недоступного сервиса строка остаётся: «В разработке» сообщает то,
          чего карточка иначе не скажет, — почему нажатие ничего не делает. */}
      {comingSoon && (
        <span className="w-full rounded-xl bg-glass px-4 py-3 text-center text-sm font-medium text-text-2">
          В разработке
        </span>
      )}
    </div>
  );
}
