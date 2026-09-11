import Link from "next/link";
import {
  BookOpen,
  GraduationCap,
  Heart,
  LayoutGrid,
  Leaf,
  Megaphone,
  MessagesSquare,
  MoonStar,
  Music,
  ShoppingBag,
  Sparkles,
  SquareKanban,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { HomeFeaturedOption } from "@/lib/home-featured";
import { FeaturedServicesEditor } from "@/components/featured-services-editor";

/**
 * Три ходовых сервиса крупным планом, над общей сеткой.
 *
 * Сетка равняет все сервисы между собой — это верно, пока человек ищет
 * нужный. Но в портал заходят чаще всего за одним и тем же, и ради этого
 * одного не должно приходиться разбирать плитку из десяти одинаковых
 * квадратов. Поэтому ходовые вынесены выше и крупнее: они читаются раньше
 * сетки, а сетка остаётся полным списком.
 *
 * Какие три — решает сам человек (VED-86): «ходовое» у каждого своё. Выбор
 * собирает `resolveHomeFeatured` на сервере, здесь только рисуем.
 */
type IconComponent =
  | LucideIcon
  | ((props: { className?: string }) => React.ReactElement);

interface FeaturedLook {
  /** Значок: готовый из lucide или свой, нарисованный здесь. */
  Icon: IconComponent;
  /** Цвет знака: акценты чередуются, чтобы кнопки различались не только словом. */
  accent: string;
}

/**
 * Трубка с волной вызова. Рисованная, а не готовая: соседние значки ряда —
 * штриховые, и гладиентная иконка из каталога сервисов рядом с ними выглядит
 * чужой. Волна отличает её от простой трубки «положить звонок».
 */
function HandsetIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {/* Трубка */}
      <path d="M6.2 3.5h3l1.5 3.7-1.9 1.2a11.5 11.5 0 0 0 5.3 5.3l1.2-1.9 3.7 1.5v3a1.8 1.8 0 0 1-2 1.8A15.6 15.6 0 0 1 4.4 5.5a1.8 1.8 0 0 1 1.8-2Z" />
      {/* Волна вызова */}
      <path d="M15.5 4.6a5.4 5.4 0 0 1 3.9 3.9" strokeOpacity="0.55" />
    </svg>
  );
}

/**
 * Значки штриховые у всех, включая сервисы из каталога: градиентные значки
 * каталога рядом со штриховыми выглядят чужими (см. `HandsetIcon`).
 */
const LOOKS: Record<string, FeaturedLook> = {
  chat: { Icon: MessagesSquare, accent: "text-cyan" },
  music: { Icon: Music, accent: "text-violet" },
  // Звонок начинается внутри диалога, а этот экран отвечает на другой
  // вопрос — кто звонил вчера.
  calls: { Icon: HandsetIcon, accent: "text-gold" },
  union: { Icon: Heart, accent: "text-magenta" },
  vedabase: { Icon: BookOpen, accent: "text-gold" },
  motivation: { Icon: Sparkles, accent: "text-violet" },
  library: { Icon: GraduationCap, accent: "text-cyan" },
  astro: { Icon: MoonStar, accent: "text-violet" },
  market: { Icon: ShoppingBag, accent: "text-gold" },
  work: { Icon: SquareKanban, accent: "text-cyan" },
  notices: { Icon: Megaphone, accent: "text-magenta" },
  wellness: { Icon: Leaf, accent: "text-cyan" },
};

/** Новый сервис каталога, для которого значок ещё не подобран. */
const FALLBACK_LOOK: FeaturedLook = { Icon: LayoutGrid, accent: "text-cyan" };

/**
 * `unread` — непрочитанные беседы и запросы «Общения» одним числом. Значок
 * повторяет колокольчик уведомлений: человек уже знает, что это счётчик
 * ждущего, и второй язык для той же мысли только сбивает.
 */
export function FeaturedServices({
  items,
  options,
  userId,
  unread = 0,
}: {
  /** Что стоит наверху сейчас — ровно то, что отсеяно из сетки ниже. */
  items: HomeFeaturedOption[];
  /** Из чего выбирать в настройке. */
  options: HomeFeaturedOption[];
  userId: string;
  unread?: number;
}) {
  return (
    <section aria-label="Ходовые сервисы" className="mb-4">
      <ul className="grid grid-cols-3 gap-2 sm:gap-3">
        {items.map(({ key, name, hint, href }) => {
          const { Icon, accent } = LOOKS[key] ?? FALLBACK_LOOK;
          const badge = key === "chat" ? unread : 0;
          const label =
            badge > 0 ? `${name}, непрочитанных: ${badge}` : undefined;
          return (
            <li key={key}>
              <Link
                href={href}
                aria-label={label}
                title={label}
                className="service-edge relative flex min-h-[112px] flex-col items-center justify-center gap-2 rounded-2xl glass px-2 py-4 text-center transition-transform duration-200 hover:-translate-y-0.5 sm:min-h-[128px]"
              >
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
                {hint && (
                  <span className="hidden text-xs text-text-2 sm:block">
                    {hint}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
      <FeaturedServicesEditor
        userId={userId}
        current={items.map((item) => item.key)}
        options={options.map(({ key, name }) => ({ key, name }))}
      />
    </section>
  );
}
