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
 * Пока все три — будущие сервисы, поэтому это не ссылки, а плашки со
 * словом «Скоро»: приглушённая ссылка ведёт на пустую страницу, и человек
 * возвращается ни с чем. Как только сервис появится в каталоге, здесь
 * останется подставить `href` и снять `comingSoon`.
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
  { name: "Музыка", hint: "Киртаны и бхаджаны", Icon: Music, accent: "text-cyan" },
  { name: "Работа", hint: "Вакансии и услуги", Icon: Briefcase, accent: "text-gold" },
];

export function FeaturedServices() {
  return (
    <section aria-label="Ходовые сервисы" className="mb-4">
      <ul className="grid grid-cols-3 gap-2 sm:gap-3">
        {FEATURED.map(({ name, hint, Icon, accent, href }) => {
          const shape =
            "service-edge relative flex min-h-[112px] flex-col items-center justify-center gap-2 rounded-2xl glass px-2 py-4 text-center sm:min-h-[128px]";
          const inside = (
            <>
              <Icon aria-hidden className={`size-7 sm:size-8 ${accent}`} />
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
