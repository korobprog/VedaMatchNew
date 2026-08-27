import Link from "next/link";
import { Briefcase, MessagesSquare, Music } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Три ходовых сервиса крупным планом, над общей сеткой.
 *
 * Сетка равняет все сервисы между собой — это верно, пока человек ищет
 * нужный. Но в портал заходят чаще всего за одним и тем же, и ради этого
 * одного не должно приходиться разбирать плитку из десяти одинаковых
 * квадратов. Поэтому ходовые вынесены выше и крупнее: они читаются раньше
 * сетки, а сетка остаётся полным списком.
 *
 * Работа — будущий сервис, поэтому это не ссылка, а плашка со словом
 * «Скоро»: приглушённая ссылка ведёт на пустую страницу, и человек
 * возвращается ни с чем. Как только сервис появится, здесь останется
 * подставить `href` — как это уже сделано для Музыки.
 */
interface FeaturedService {
  name: string;
  hint: string;
  Icon: LucideIcon;
  /** Цвет знака: акценты чередуются, чтобы кнопки различались не только словом. */
  accent: string;
  /** Готовый сервис — ссылка; будущий — плашка со словом «Скоро». */
  href?: string;
}

const FEATURED: FeaturedService[] = [
  {
    name: "Общение",
    hint: "Чаты и беседы",
    Icon: MessagesSquare,
    accent: "text-cyan",
    href: "/chat",
  },
  {
    name: "Музыка",
    hint: "Киртаны и бхаджаны",
    Icon: Music,
    accent: "text-violet",
    // `href` здесь делает две вещи сразу: плитка становится ссылкой и
    // пропадает из общей сетки ниже — она отсеивает по FEATURED_ROUTES.
    // Без него Музыка показывалась дважды: крупной плиткой и карточкой
    // «В разработке» из каталога.
    href: "/music",
  },
  {
    name: "Работа",
    hint: "Вакансии, услуги и инструменты",
    Icon: Briefcase,
    accent: "text-gold",
  },
];

/**
 * `unread` — непрочитанные беседы и запросы «Общения» одним числом. Значок
 * повторяет колокольчик уведомлений: человек уже знает, что это счётчик
 * ждущего, и второй язык для той же мысли только сбивает.
 */
/**
 * Маршруты, вынесенные наверх. Сетка по ним отсеивает свои плитки: сервис,
 * показанный крупной кнопкой, второй раз в списке — просто шум.
 */
export const FEATURED_ROUTES: string[] = FEATURED.map(
  (service) => service.href,
).filter((href): href is string => Boolean(href));

export function FeaturedServices({ unread = 0 }: { unread?: number }) {
  return (
    <section aria-label="Ходовые сервисы" className="mb-4">
      <ul className="grid grid-cols-3 gap-2 sm:gap-3">
        {FEATURED.map(({ name, hint, Icon, accent, href }) => {
          const badge = href === "/chat" ? unread : 0;
          const label =
            badge > 0 ? `${name}, непрочитанных: ${badge}` : undefined;
          const shape =
            "service-edge relative flex min-h-[112px] flex-col items-center justify-center gap-2 rounded-2xl glass px-2 py-4 text-center sm:min-h-[128px]";
          const inside = (
            <>
              <span className="relative">
                <Icon aria-hidden className={`size-7 sm:size-8 ${accent}`} />
                {badge > 0 && (
                  <span
                    aria-hidden="true"
                    className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-magenta px-1 text-[10px] font-bold leading-none text-white shadow-[0_0_10px_rgba(255,62,158,0.6)]"
                  >
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </span>
              <span className="text-sm font-semibold leading-tight text-text-0 sm:text-base">
                {name}
              </span>
              {/* Подпись прячется на узком экране: рядом с ней слово сервиса
                  перестаёт быть первым, что видно. */}
              <span className="hidden text-xs text-text-2 sm:block">{hint}</span>
              {!href && (
                <span className="rounded-full bg-glass px-2 py-0.5 text-[10px] font-medium text-text-1">
                  Скоро
                </span>
              )}
            </>
          );
          return (
            <li key={name}>
              {href ? (
                <Link
                  href={href}
                  aria-label={label}
                  title={label}
                  className={`${shape} transition-transform duration-200 hover:-translate-y-0.5`}
                >
                  {inside}
                </Link>
              ) : (
                <div className={`${shape} opacity-70`}>{inside}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
