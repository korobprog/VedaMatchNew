import Link from "next/link";
import { CalendarClock, Hammer, KanbanSquare, Briefcase } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { WORK_SECTIONS } from "@/lib/work-sections";

export const metadata = {
  title: "Работа — совместные дела",
  description:
    "Планировщик задач, рабочие среды и приглашение своих: довести дело до конца вместе.",
  // Внутри — названия проектов и имена людей. Поисковикам здесь делать нечего.
  robots: { index: false, follow: false },
};

/** Знак раздела. Иконки заданы здесь, а не в WORK_SECTIONS: список разделов —
 *  данные, а компонент — вёрстка, и тащить React в данные незачем. */
const ICONS: Record<string, LucideIcon> = {
  planner: KanbanSquare,
  agenda: CalendarClock,
  jobs: Briefcase,
  services: Hammer,
};

const ACCENT: Record<string, string> = {
  cyan: "text-cyan",
  magenta: "text-magenta",
  gold: "text-gold",
  violet: "text-violet",
  blue: "text-blue",
};

/**
 * Витрина раздела: иконки инструментов, а не сразу доска. Планировщик — не
 * единственное, что здесь будет, и вход через список делает следующий
 * инструмент правкой одной строки, а не переездом маршрутов.
 */
export default function WorkPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 pb-28">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-text-0 sm:text-3xl">
          Работа
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-text-1">
          Совместные дела: доски, задачи и сроки. Заводите рабочую среду под
          проект, зовите своих по ссылке и доводите дело до конца — вместо
          переписки, в которой договорённости теряются на третьем экране.
        </p>
      </div>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {WORK_SECTIONS.map((section) => {
          const Icon = ICONS[section.slug] ?? KanbanSquare;
          const shape =
            "service-edge flex h-full min-h-[132px] flex-col items-center justify-center gap-2 rounded-2xl glass px-3 py-4 text-center";
          const inside = (
            <>
              <Icon
                aria-hidden
                className={`size-7 sm:size-8 ${ACCENT[section.accent]}`}
              />
              <span className="text-sm font-semibold leading-tight text-text-0 sm:text-base">
                {section.name}
              </span>
              <span className="text-xs text-text-2">{section.hint}</span>
              {!section.href && (
                <span className="rounded-full bg-glass px-2 py-0.5 text-[10px] font-medium text-text-1">
                  Скоро
                </span>
              )}
            </>
          );
          return (
            <li key={section.slug}>
              {section.href ? (
                <Link
                  href={section.href}
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

      {/* Подписи разделов на широком экране: на плитке помещается только
          намёк, а понять, чем «Планировщик» отличается от «Моего дня», по
          двум словам нельзя. */}
      <dl className="mt-6 hidden gap-4 sm:grid sm:grid-cols-2">
        {WORK_SECTIONS.map((section) => (
          <div key={section.slug} className="rounded-2xl glass px-4 py-3">
            <dt className="text-sm font-semibold text-text-0">
              {section.name}
              {!section.href && (
                <span className="ml-2 text-xs font-normal text-text-2">
                  скоро
                </span>
              )}
            </dt>
            <dd className="mt-1 text-sm text-text-1">{section.about}</dd>
          </div>
        ))}
      </dl>
    </main>
  );
}
