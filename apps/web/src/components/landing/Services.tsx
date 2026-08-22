"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import { ServiceIcon } from "@/components/icons/service-icons";
import { useServiceNames } from "@/components/service-catalog-provider";
import { Briefcase, Music } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  PLANNED_SERVICES,
  SERVICE_CONTENT,
  serviceTagline,
} from "@/lib/service-content";
import { cn } from "@/lib/utils";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.07 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, damping: 26, stiffness: 300 },
  },
};

/** Знак будущего сервиса: своей иконки в каталоге у него ещё нет. */
const PLANNED_ICONS: Record<string, LucideIcon> = {
  music: Music,
  work: Briefcase,
};

export function Services() {
  const t = useTranslations("Landing.services");
  const locale = useLocale();
  const names = useServiceNames();
  return (
    <section id="services" className="relative py-20 md:py-32">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold text-text-0 mb-4">
            {t("title")}
          </h2>
          <p className="text-text-1 text-lg max-w-2xl mx-auto">{t("subtitle")}</p>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {SERVICE_CONTENT.map((service) => (
            <motion.div key={service.slug} variants={itemVariants}>
              {/* Ведём на страницу сервиса с описанием и кнопкой регистрации, а не сразу
                  на защищённый маршрут — иначе анонимного гостя мгновенно выкидывает на
                  логин без единого слова о том, зачем ему регистрироваться. */}
              <Link
                href={`/services/${service.slug}`}
                className={cn(
                  "group relative flex h-full flex-col rounded-2xl glass border p-6",
                  "transition-all duration-300 hover:-translate-y-1",
                  service.featured
                    ? "border-magenta/40 hover:border-magenta/60 hover:shadow-[0_0_24px_rgba(255,62,158,0.25)]"
                    : "border-glass-brd hover:border-cyan/40 hover:shadow-[0_0_20px_rgba(35,240,199,0.15)]",
                )}
              >
                {service.featured && (
                  <span className="absolute -top-3 right-5 rounded-full bg-gradient-to-r from-magenta to-[#B23EFF] px-3 py-1 text-xs font-bold uppercase tracking-wider text-white shadow-[0_0_16px_rgba(255,62,158,0.4)]">
                    {t("featured")}
                  </span>
                )}
                <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-glass border-2 border-text-2/35 transition-colors group-hover:border-magenta/50">
                  <ServiceIcon slug={service.slug} className="h-8 w-8" />
                </span>
                <h3 className="font-display text-lg font-bold text-text-0 mb-2">
                  {names(service.slug, service.name)}
                </h3>
                <p className="text-text-1 text-sm leading-relaxed flex-1">
                  {serviceTagline(service, locale)}
                </p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-cyan opacity-0 transition-opacity group-hover:opacity-100">
                  {t("learnMore")}
                </span>
              </Link>
            </motion.div>
          ))}

          {/* Будущие сервисы — плашки, а не ссылки: вести гостя на страницу,
              которой нет, хуже, чем честно сказать «в планах». */}
          {PLANNED_SERVICES.map((service) => {
            const Icon = PLANNED_ICONS[service.slug];
            return (
              <motion.div key={service.slug} variants={itemVariants}>
                <div className="group relative flex h-full flex-col rounded-2xl glass border border-glass-brd p-6 opacity-80">
                  <span className="absolute -top-3 right-5 rounded-full border border-glass-brd bg-bg-1 px-3 py-1 text-xs font-bold uppercase tracking-wider text-text-1">
                    {t("planned")}
                  </span>
                  <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl border-2 border-text-2/35 bg-glass">
                    {Icon && (
                      <Icon
                        aria-hidden
                        className={
                          service.slug === "music"
                            ? "h-7 w-7 text-violet"
                            : "h-7 w-7 text-gold"
                        }
                      />
                    )}
                  </span>
                  <h3 className="mb-2 font-display text-lg font-bold text-text-0">
                    {locale === "en" ? service.nameEn : service.name}
                  </h3>
                  <p className="flex-1 text-sm leading-relaxed text-text-1">
                    {locale === "en" ? service.taglineEn : service.tagline}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
