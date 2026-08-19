import Link from "next/link";
import type { ServiceCard as ServiceCardType } from "@vedamatch/shared";
import { ServiceIcon } from "@/components/icons/service-icons";
import { Lock } from "lucide-react";

/**
 * Сервис в компактном режиме: знак, слово и счётчик — больше в плитку
 * ничего не помещается.
 *
 * Что осталось за бортом и почему:
 *
 * • Описание. Его читают один раз, при знакомстве с порталом. Ради этого
 *   есть подробный режим, и новичок начинает именно с него.
 * • Кнопка «Открыть». Нажимается вся плитка: кнопка внутри плитки в 88
 *   пикселей — это мишень поверх мишени.
 * • Закрепить и перетащить. Ручке и «пину» здесь негде стоять, они живут
 *   в подробном режиме. Порядок при этом общий — переставил там, здесь
 *   тот же.
 *
 * Счётчик, наоборот, становится главным: кроме него плитки ничем не
 * отличаются друг от друга по срочности, и человек выбирает по нему.
 */
export function ServiceTile({
  service,
  badgeCount,
  onOpen,
}: {
  service: ServiceCardType;
  badgeCount?: number;
  onOpen?: () => void;
}) {
  const comingSoon = service.status === "coming_soon";
  const count = badgeCount ?? 0;

  const inside = (
    <>
      {count > 0 && (
        <span
          aria-label={`Новое: ${count}`}
          className="absolute right-1.5 top-1.5 min-w-[18px] rounded-full bg-magenta px-1.5 text-center text-[10px] font-bold leading-[18px] text-white tabular-nums"
        >
          {count}
        </span>
      )}
      {service.requiresDevoteeVerification && (
        // Замок вместо плашки «Подтверждённый преданный»: объяснение
        // целиком есть в подробном режиме и на странице самого сервиса.
        <span
          aria-label="Нужен статус «Преданный»"
          title="Нужен статус «Преданный»"
          className="absolute left-1.5 top-1.5 text-text-2"
        >
          <Lock aria-hidden className="size-3" />
        </span>
      )}
      {service.iconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={service.iconUrl} alt="" className="h-6 w-6" />
      ) : (
        <ServiceIcon
          slug={service.slug}
          category={service.category}
          className="h-6 w-6"
        />
      )}
      <span className="text-[11px] font-medium leading-tight">
        {service.name}
        {comingSoon && <span className="text-text-2"> · скоро</span>}
      </span>
    </>
  );

  const shape =
    "relative flex min-h-[88px] flex-col items-center justify-center gap-2 rounded-2xl glass px-1 py-3 text-center";

  // Недоступный сервис — не ссылка. Приглушения мало: по приглушённой
  // ссылке всё равно тыкают, а потом возвращаются с пустой страницы.
  if (comingSoon) {
    return (
      <div className={`${shape} service-edge text-text-2 opacity-50`}>
        {inside}
      </div>
    );
  }

  return (
    <Link
      href={service.url}
      onClick={onOpen}
      className={`${shape} service-edge text-text-1 transition-transform duration-200 hover:-translate-y-0.5 hover:text-text-0`}
    >
      {inside}
    </Link>
  );
}
