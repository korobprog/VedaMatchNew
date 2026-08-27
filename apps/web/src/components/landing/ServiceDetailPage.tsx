"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import type { ChatMapCommunity, UnionShowcaseCard } from "@vedamatch/shared";
import { ArrowLeft, ArrowRight, Check, Sparkles } from "lucide-react";
import { ServiceIcon } from "@/components/icons/service-icons";
import { useServiceNames } from "@/components/service-catalog-provider";
import { Navbar } from "./Navbar";
import { BackgroundOrbs } from "./Orb";
import { HexScales } from "./HexScales";
import { NoiseOverlay } from "./NoiseOverlay";
import { PhoneMockup } from "./PhoneMockup";
import { CommunitiesMap } from "./CommunitiesMap";
import { CommunityMapStats } from "./CommunityMapStats";
import { AstroMockup } from "./AstroMockup";
import { MarketMockup } from "./MarketMockup";
import type { MarketListingSummary } from "@vedamatch/shared";
import { Footer } from "./Footer";
import {
  serviceTagline,
  type ServiceContent,
} from "@/lib/service-content";
import { cn } from "@/lib/utils";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, damping: 26, stiffness: 300 },
  },
};

export function ServiceDetailPage({
  service,
  otherServices,
  showcase = [],
  communities = [],
  marketListings = null,
}: {
  service: ServiceContent;
  otherServices: ServiceContent[];
  /** Анкеты для витрины Знакомств; у остальных сервисов пусто. */
  showcase?: UnionShowcaseCard[];
  /** Общины для карты «Общения»; у остальных сервисов пусто. */
  communities?: ChatMapCommunity[];
  /** Объявления для витрины Рынка; `null` — API молчит, покажем запасные. */
  marketListings?: MarketListingSummary[] | null;
}) {
  const t = useTranslations("Landing.serviceDetail");
  const locale = useLocale();
  const names = useServiceNames();
  const name = names(service.slug, service.name);
  // Ведём на настоящий маршрут сервиса, а не на /login: вошедший попадает
  // сразу в сервис, гостя proxy отправит на "/?returnTo=…" — оттуда и кнопка
  // «Начать», и OAuth-колбэк вернут его на этот же маршрут.
  const ctaHref = service.route;

  return (
    <div className="hex-cursor relative min-h-dvh bg-bg-0">
      {/* Фон и курсор те же, что на главной: страница сервиса — её
          продолжение, и переход по «Узнать больше» не должен выглядеть
          уходом на чужой сайт. */}
      <HexScales />
      <BackgroundOrbs />
      <NoiseOverlay />
      <Navbar returnTo={service.route} />

      {/* Hero */}
      <section className="relative pt-28 pb-16 md:pt-36 md:pb-24">
        <div className="mx-auto max-w-4xl px-4 md:px-6 text-center">
          <Link
            href="/#services"
            className="inline-flex items-center gap-1.5 text-sm text-text-2 hover:text-text-0 transition-colors mb-8"
          >
            <ArrowLeft className="w-4 h-4" />
            {t("allServices")}
          </Link>

          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", damping: 20, stiffness: 260 }}
            className={cn(
              "mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl glass border-2",
              service.featured ? "border-magenta/40" : "border-glass-brd",
            )}
          >
            <ServiceIcon slug={service.slug} className="h-11 w-11" />
          </motion.div>

          {service.featured && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-magenta to-[#B23EFF] px-3 py-1 text-xs font-bold uppercase tracking-wider text-white mb-4"
            >
              <Sparkles className="h-3 w-3" />
              {t("featured")}
            </motion.span>
          )}

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="font-display text-3xl md:text-5xl font-bold text-text-0 mb-4 leading-tight"
          >
            {name}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="text-lg md:text-xl bg-gradient-to-r from-magenta via-cyan to-gold bg-clip-text text-transparent font-semibold mb-6"
          >
            {serviceTagline(service, locale)}
          </motion.p>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-text-1 text-base md:text-lg max-w-2xl mx-auto leading-relaxed mb-10"
          >
            {service.description}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="flex flex-col sm:flex-row gap-4 justify-center"
          >
            <Link
              href={ctaHref}
              className={cn(
                "group inline-flex items-center justify-center gap-2",
                "px-6 py-3.5 sm:px-8 sm:py-4 rounded-full",
                "bg-gradient-to-r from-magenta to-[#B23EFF]",
                "text-white font-semibold text-base sm:text-lg",
                "transition-all duration-300",
                "hover:shadow-[0_0_30px_rgba(255,62,158,0.5)]",
                "hover:-translate-y-0.5",
              )}
            >
              {t("register")}
              <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              href="/#pricing"
              className={cn(
                "inline-flex items-center justify-center gap-2",
                "px-6 py-3.5 sm:px-8 sm:py-4 rounded-full",
                "glass border border-glass-brd",
                "text-text-0 font-semibold text-base sm:text-lg",
                "transition-all duration-300",
                "hover:border-cyan/50",
              )}
            >
              {t("pricing")}
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Витрина колоды — только у Знакомств: у остальных сервисов нет
          карточек, которые этот макет показывает. */}
      {service.slug === "union" && (
        <section className="relative pb-4 md:pb-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="flex justify-center px-4 md:px-6"
          >
            <PhoneMockup cards={showcase} />
          </motion.div>
        </section>
      )}

      {/* Витрина Рынка — только у него: макет показывает объявления, и у
          остальных сервисов их нет. Раньше страница Рынка была сплошным
          текстом, и рядом с роликами соседей площадка читалась как
          обещание, а не как работающий магазин. */}
      {service.slug === "market" && (
        <section className="relative pb-4 md:pb-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="flex justify-center px-4 md:px-6"
          >
            <MarketMockup listings={marketListings} />
          </motion.div>
        </section>
      )}

      {/* Витрина сверки карт — только у Астрологии: у остальных сервисов
          нет расчёта, который этот макет показывает. */}
      {service.slug === "astro" && (
        <section className="relative pb-4 md:pb-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="flex justify-center px-4 md:px-6"
          >
            <AstroMockup />
          </motion.div>
        </section>
      )}

      {/* Features */}
      <section className="relative py-16 md:py-24">
        <div className="mx-auto max-w-5xl px-4 md:px-6">
          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid grid-cols-1 md:grid-cols-2 gap-6"
          >
            {service.features.map((feature) => (
              <motion.div
                key={feature.title}
                variants={itemVariants}
                className="glass rounded-2xl border border-glass-brd p-6 hover:border-cyan/40 transition-colors duration-300"
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan/15">
                    <Check className="h-4 w-4 text-cyan" />
                  </span>
                  <div>
                    <h3 className="font-display font-bold text-text-0 mb-1.5">{feature.title}</h3>
                    <p className="text-text-1 text-sm leading-relaxed">{feature.description}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>

          {/* Highlight callout */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-6 glass rounded-2xl border border-gold/30 bg-gold/5 p-6 flex items-start gap-3"
          >
            <Sparkles className="h-5 w-5 shrink-0 text-gold mt-0.5" />
            <p className="text-text-1 text-sm md:text-base leading-relaxed">{service.highlight}</p>
          </motion.div>
        </div>
      </section>

      {/*
        Карта общин — только у «Общения». Секции нет вовсе, когда ни одна
        община не указала место: пустая карта России ничего не доказывает,
        а раздел с подписью «пока никого» на витрине сервиса лишний.
      */}
      {service.slug === "chat" && communities.length > 0 && (
        <section className="relative pb-16 md:pb-24">
          <div className="mx-auto max-w-5xl px-4 md:px-6">
            <h2 className="font-display text-2xl md:text-3xl font-bold text-text-0 mb-3 text-center">
              {t("mapTitle")}
            </h2>
            <p className="mx-auto mb-8 max-w-2xl text-center text-sm md:text-base leading-relaxed text-text-1">
              {t("mapDescription")}
            </p>
            <CommunityMapStats communities={communities} />
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <CommunitiesMap communities={communities} />
            </motion.div>
          </div>
        </section>
      )}

      {/* Other services */}
      {otherServices.length > 0 && (
        <section className="relative py-16 md:py-24">
          <div className="mx-auto max-w-6xl px-4 md:px-6">
            <h2 className="font-display text-2xl md:text-3xl font-bold text-text-0 mb-8 text-center">
              {t("otherServices")}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {otherServices.map((other) => (
                <Link
                  key={other.slug}
                  href={`/services/${other.slug}`}
                  className="group flex flex-col items-center gap-2 rounded-xl glass border border-glass-brd p-4 text-center hover:border-cyan/40 transition-colors"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-glass border border-text-2/30 group-hover:border-cyan/50 transition-colors">
                    <ServiceIcon slug={other.slug} className="h-6 w-6" />
                  </span>
                  <span className="text-xs font-medium text-text-1 group-hover:text-text-0 transition-colors">
                    {names(other.slug, other.name)}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Final CTA */}
      <section className="relative py-20 md:py-28">
        <div className="mx-auto max-w-3xl px-4 md:px-6 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="glass rounded-3xl p-8 md:p-12 relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-magenta/10 via-cyan/5 to-gold/10" />
            <div className="relative z-10">
              <h2 className="font-display text-2xl md:text-4xl font-bold text-text-0 mb-4">
                {t("readyTitle", { name })}
              </h2>
              <p className="text-text-1 text-base md:text-lg mb-8 max-w-xl mx-auto">
                {t("readyDescription")}
              </p>
              <Link
                href={ctaHref}
                className={cn(
                  "group inline-flex items-center justify-center gap-2",
                  "px-8 py-4 rounded-full",
                  "bg-gradient-to-r from-magenta to-[#B23EFF]",
                  "text-white font-semibold text-lg",
                  "transition-all duration-300",
                  "hover:shadow-[0_0_40px_rgba(255,62,158,0.5)]",
                  "hover:-translate-y-1",
                )}
              >
                {t("createAccount")}
                <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
