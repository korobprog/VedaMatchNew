"use client";

import { Briefcase, LayoutGrid, MessagesSquare, Music, Rows3 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ServiceIcon } from "@/components/icons/service-icons";
import { useServiceNames } from "@/components/service-catalog-provider";
import { VedaMatchMark } from "@/components/icons/vedamatch-mark";
import { SERVICE_CONTENT } from "@/lib/service-content";
import { cn } from "@/lib/utils";

/**
 * Уменьшенная копия главной страницы кабинета: гость видит, куда попадёт
 * после входа, до того как заведёт аккаунт. Не скриншот — настоящие иконки
 * и названия сервисов из каталога, поэтому переименование сервиса в админке
 * доезжает и сюда, а не оставляет на лендинге устаревшую картинку.
 *
 * Целиком декоративна и скрыта от скринридера: тот же список сервисов
 * лежит ниже разделом «Сервисы» — уже ссылками и с описаниями, — а
 * дублирующая озвучка макета только удлиняет путь. По той же причине здесь
 * нет ни заголовков, ни ссылок: картинке нечего давать фокусу.
 */

/** Ходовые сервисы крупными кнопками — как в кабинете над сеткой. */
const FEATURED: Array<{ name: string; Icon: LucideIcon; accent: string }> = [
  { name: "Общение", Icon: MessagesSquare, accent: "text-cyan" },
  { name: "Музыка", Icon: Music, accent: "text-violet" },
  { name: "Работа", Icon: Briefcase, accent: "text-gold" },
];

/** Значок «Общения» повторяет счётчик непрочитанного из кабинета. */
const UNREAD_SAMPLE = 3;

/**
 * Фото в аватаре. Тот же снимок, что и в демо-колоде Знакомств: лежит
 * локально в public, поэтому макет не зависит ни от S3, ни от того, дал ли
 * кто-нибудь согласие на публичный показ.
 */
const AVATAR_PHOTO = "/landing/profiles/ekaterina.jpg";

/**
 * Сервисы сетки. «Общение» отсеяно так же, как в кабинете: оно уже стоит
 * крупной кнопкой выше, и второй раз в списке было бы шумом (см. фильтр по
 * FEATURED_ROUTES на главной).
 */
const GRID = SERVICE_CONTENT.filter((service) => service.slug !== "chat");

export function PortalPreview({ className }: { className?: string }) {
  const names = useServiceNames();

  return (
    <div aria-hidden className={cn("relative select-none", className)}>
      <div className="relative mx-auto w-full max-w-[420px]">
        <div className="rounded-3xl border border-glass-brd bg-bg-1 p-2 shadow-2xl shadow-black/40">
          {/* Обвязка окна: три точки — привычный знак «это приложение» */}
          <div className="flex items-center gap-1.5 px-3 py-2">
            <span className="h-2 w-2 rounded-full bg-magenta/60" />
            <span className="h-2 w-2 rounded-full bg-gold/60" />
            <span className="h-2 w-2 rounded-full bg-cyan/60" />
          </div>

          <div className="rounded-2xl bg-bg-0 p-3.5">
            {/* Шапка портала */}
            <div className="mb-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <VedaMatchMark className="h-6 w-6" />
                <span className="font-display text-sm font-bold text-text-0">
                  VedaMatch
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-magenta" />
                {/* Аватар как в шапке портала — там ровно такой же
                    кружок с фотографией. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={AVATAR_PHOTO}
                  alt=""
                  className="h-6 w-6 rounded-full object-cover"
                />
              </div>
            </div>

            {/* Строка советника */}
            <div className="mb-3.5 rounded-xl border border-glass-brd bg-glass px-3 py-2">
              <p className="text-[11px] font-semibold text-text-0">
                Приветствуем на портале VedaMatch!
              </p>
              <p className="text-[10px] leading-tight text-text-2">
                Сегодня экадаши · 3 новых отклика
              </p>
            </div>

            {/* Ходовые сервисы */}
            <div className="mb-3 grid grid-cols-3 gap-2">
              {FEATURED.map(({ name, Icon, accent }) => (
                <div
                  key={name}
                  className="flex min-h-[62px] flex-col items-center justify-center gap-1.5 rounded-xl border border-glass-brd bg-glass px-1 text-center"
                >
                  <span className="relative">
                    <Icon className={cn("size-5", accent)} />
                    {name === "Общение" && (
                      <span className="absolute -right-2 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-magenta px-1 text-[9px] font-bold leading-none text-white">
                        {UNREAD_SAMPLE}
                      </span>
                    )}
                  </span>
                  <span className="text-[10px] font-semibold leading-tight text-text-0">
                    {name}
                  </span>
                </div>
              ))}
            </div>

            {/* Переключатель вида — он же стоит над сеткой в кабинете */}
            <div className="mb-2 flex justify-end">
              <div className="flex rounded-lg border border-glass-brd p-0.5">
                <span className="rounded-md bg-glass p-1 text-text-0">
                  <LayoutGrid className="size-3" />
                </span>
                <span className="p-1 text-text-2">
                  <Rows3 className="size-3" />
                </span>
              </div>
            </div>

            {/* Сетка сервисов в режиме «плитками» */}
            <div className="grid grid-cols-4 gap-2">
              {GRID.map((service) => (
                <div
                  key={service.slug}
                  className="flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-xl border border-glass-brd bg-glass px-0.5 text-center"
                >
                  <ServiceIcon slug={service.slug} className="h-5 w-5" />
                  <span className="text-[9px] font-medium leading-tight text-text-1">
                    {names(service.slug, service.name)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Свечение под окном — как у макета телефона на странице Знакомств */}
        <div className="absolute -inset-4 -z-10 bg-gradient-to-r from-magenta/20 via-cyan/20 to-gold/20 opacity-50 blur-xl" />
      </div>
    </div>
  );
}
