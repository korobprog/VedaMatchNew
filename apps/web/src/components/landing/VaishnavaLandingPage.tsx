"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowRight,
  BookOpen,
  Briefcase,
  Compass,
  Heart,
  Home,
  LogIn,
  Music,
  Play,
  ShieldCheck,
  Sparkles,
  Users,
  WifiOff,
  Ban,
  Eye,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type {
  ChatMapCommunity,
  LineageGroup,
  PricingPlan,
} from "@vedamatch/shared";
import { LINEAGES, LINEAGE_GROUP_LABELS } from "@vedamatch/shared";
import { ServiceIcon } from "@/components/icons/service-icons";
import { useServiceNames } from "@/components/service-catalog-provider";
import { MemberCounter } from "@/components/member-counter";
import { InstallBanner } from "@/components/pwa/install-banner";
import { PLANNED_SERVICES, SERVICE_CONTENT } from "@/lib/service-content";
import { loginHref } from "@/lib/return-to";
import { cn } from "@/lib/utils";
import { Navbar } from "./Navbar";
import { BackgroundOrbs } from "./Orb";
import { HexScales } from "./HexScales";
import { NoiseOverlay } from "./NoiseOverlay";
import { Iris } from "./Iris";
import { CommunitiesMap } from "./CommunitiesMap";
import { CommunityMapStats } from "./CommunityMapStats";
import { Pricing } from "./Pricing";
import { Footer } from "./Footer";

/**
 * Лендинг для вайшнавов — отдельная витрина портала под поддомен.
 *
 * Отличие от главной: та продаёт «единый вход во все сервисы» любому, кто
 * живёт в благости, а эта говорит с преданным на его языке — линия, ятра,
 * храм, Гуна-милан, тексты офлайн. Сервисы те же восемь, но описаны через
 * то, что они дают именно вайшнаву. Фон, шапка, тариф и подвал общие с
 * главной: страница — часть портала, а не чужой сайт.
 *
 * Все цифры настоящие: счётчики берутся из `/stats/community`, карта общин —
 * из `/chat/public-map`. Придуманных «500+ преданных» здесь нет намеренно —
 * статистика портала открыта участникам, и подделка бросалась бы в глаза.
 */

const SERVICE_ORDER = [
  "union",
  "chat",
  "vedabase",
  "library",
  "motivation",
  "astro",
  "notices",
  "market",
] as const;

type ServiceSlug = (typeof SERVICE_ORDER)[number];

/** Знак будущего сервиса: своей иконки в каталоге у него ещё нет. */
const PLANNED_ICONS: Record<string, LucideIcon> = {
  music: Music,
  work: Briefcase,
};

const AUDIENCE = [
  { key: "devotee", icon: BookOpen, accent: "magenta" },
  { key: "community", icon: Home, accent: "cyan" },
  { key: "family", icon: Heart, accent: "gold" },
] as const;

const STEPS = [
  { key: "login", icon: LogIn },
  { key: "stage", icon: Compass },
  { key: "portal", icon: Sparkles },
] as const;

const PRINCIPLES = [
  { key: "noAds", icon: Ban, accent: "magenta" },
  { key: "moderation", icon: ShieldCheck, accent: "cyan" },
  { key: "privacy", icon: Eye, accent: "gold" },
  { key: "verified", icon: Users, accent: "magenta" },
  { key: "offline", icon: WifiOff, accent: "cyan" },
  { key: "onePlan", icon: Wallet, accent: "gold" },
] as const;

/** Порядок групп линий на странице — тот же, что в списках выбора. */
const LINEAGE_GROUPS: LineageGroup[] = ["iskcon", "gaudiya_math", "parivara"];

type Accent = "magenta" | "cyan" | "gold";

const accentStyles: Record<
  Accent,
  { border: string; icon: string; glow: string; line: string }
> = {
  magenta: {
    border: "hover:border-magenta/50",
    icon: "text-magenta",
    glow: "hover:shadow-[0_0_20px_rgba(255,62,158,0.3)]",
    line: "from-magenta/50 to-transparent",
  },
  cyan: {
    border: "hover:border-cyan/50",
    icon: "text-cyan",
    glow: "hover:shadow-[0_0_20px_rgba(35,240,199,0.3)]",
    line: "from-cyan/50 to-transparent",
  },
  gold: {
    border: "hover:border-gold/50",
    icon: "text-gold",
    glow: "hover:shadow-[0_0_20px_rgba(255,200,92,0.3)]",
    line: "from-gold/50 to-transparent",
  },
};

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

function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
      className="text-center mb-14 md:mb-16"
    >
      <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold text-text-0 mb-4">
        {title}
      </h2>
      <p className="text-text-1 text-lg max-w-2xl mx-auto">{subtitle}</p>
    </motion.div>
  );
}

export function VaishnavaLandingPage({
  plan,
  totalMembers,
  totalCities,
  totalCommunities,
  communities = [],
}: {
  plan?: PricingPlan;
  totalMembers?: number;
  totalCities?: number;
  totalCommunities?: number;
  /** Общины для карты; пусто — секции карты не будет. */
  communities?: ChatMapCommunity[];
}) {
  const t = useTranslations("Vaishnava");
  const tNav = useTranslations("Landing.nav");
  const locale = useLocale();
  const names = useServiceNames();
  // После входа человек попадает на главную портала: у лендинга нет своего
  // защищённого маршрута, куда стоило бы возвращать.
  const startHref = loginHref("/");

  const services = SERVICE_ORDER.map((slug) => ({
    slug,
    content: SERVICE_CONTENT.find((service) => service.slug === slug),
  })).filter(
    (item): item is { slug: ServiceSlug; content: (typeof SERVICE_CONTENT)[number] } =>
      Boolean(item.content),
  );

  return (
    <div className="hex-cursor relative min-h-dvh bg-bg-0">
      <HexScales />
      <BackgroundOrbs />
      <NoiseOverlay />

      <Navbar returnTo="/" />

      {/* Hero */}
      <section className="relative min-h-dvh flex items-center pt-20 pb-32 md:pt-24 md:pb-40 overflow-hidden">
        <div className="mx-auto max-w-5xl px-4 md:px-6 w-full text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-6"
          >
            <span className="w-2 h-2 rounded-full bg-gold animate-pulse" />
            <span className="text-text-1 text-sm font-medium">
              {t("hero.badge")}
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.25 }}
            className="font-display text-4xl md:text-5xl lg:text-6xl font-bold text-text-0 mb-6 leading-tight"
          >
            {t("hero.titleLine1")}
            <span className="block bg-gradient-to-r from-gold via-magenta to-cyan bg-clip-text text-transparent">
              {t("hero.titleLine2")}
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.35 }}
            className="text-text-1 text-lg md:text-xl mb-10 max-w-2xl mx-auto leading-relaxed"
          >
            {t("hero.description")}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 }}
            className="flex flex-col sm:flex-row gap-4 justify-center"
          >
            <Link
              href={startHref}
              className={cn(
                "group inline-flex items-center justify-center gap-2",
                "px-6 py-3.5 rounded-full sm:px-8 sm:py-4",
                "bg-gradient-to-r from-magenta to-[#B23EFF]",
                "text-white font-semibold text-base sm:text-lg",
                "transition-all duration-300",
                "hover:shadow-[0_0_30px_rgba(255,62,158,0.5)]",
                "hover:-translate-y-0.5",
              )}
            >
              {t("hero.ctaStart")}
              <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 transition-transform group-hover:translate-x-1" />
            </Link>
            <a
              href="#services"
              className={cn(
                "group inline-flex items-center justify-center gap-2",
                "px-6 py-3.5 rounded-full sm:px-8 sm:py-4",
                "glass border border-glass-brd",
                "text-text-0 font-semibold text-base sm:text-lg",
                "transition-all duration-300",
                "hover:border-cyan/50 hover:shadow-[0_0_20px_rgba(35,240,199,0.2)]",
              )}
            >
              <Play className="w-4 h-4 sm:w-5 sm:h-5" />
              {t("hero.ctaMore")}
            </a>
          </motion.div>

          {/* Счётчики. Плитка с нулём не рисуется: пустой портал честно
              молчит, а не хвастается «0 общин». */}
          {(totalMembers != null ||
            (totalCities ?? 0) > 0 ||
            (totalCommunities ?? 0) > 0) && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="flex gap-4 sm:gap-8 mt-14 justify-center"
            >
              {totalMembers != null && (
                <div className="shrink-0">
                  <div className="font-display text-2xl md:text-3xl font-bold text-text-0">
                    <MemberCounter total={totalMembers} />
                  </div>
                  <div className="text-text-1 text-xs sm:text-sm whitespace-nowrap">
                    {t("hero.statUsers")}
                  </div>
                </div>
              )}
              {totalCities != null && totalCities > 0 && (
                <>
                  <div className="w-px bg-glass-brd shrink-0" />
                  <div className="shrink-0">
                    <div className="font-display text-2xl md:text-3xl font-bold text-text-0">
                      {totalCities}
                    </div>
                    <div className="text-text-1 text-xs sm:text-sm whitespace-nowrap">
                      {t("hero.statCities")}
                    </div>
                  </div>
                </>
              )}
              {totalCommunities != null && totalCommunities > 0 && (
                <>
                  <div className="w-px bg-glass-brd shrink-0" />
                  <div className="shrink-0">
                    <div className="font-display text-2xl md:text-3xl font-bold text-text-0">
                      {totalCommunities}
                    </div>
                    <div className="text-text-1 text-xs sm:text-sm whitespace-nowrap">
                      {t("hero.statCommunities")}
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          )}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
        >
          <div className="flex flex-col items-center gap-2 text-text-1">
            <span className="text-sm font-medium">{t("hero.scroll")}</span>
            <motion.div
              animate={{ y: [0, 8, 0] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="w-6 h-10 rounded-full border-2 border-text-2 flex justify-center pt-2"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-text-2" />
            </motion.div>
          </div>
        </motion.div>
      </section>

      {/* Кому это нужно */}
      <section id="audience" className="relative py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-4 md:px-6">
          <SectionHeader
            title={t("audience.title")}
            subtitle={t("audience.subtitle")}
          />
          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6"
          >
            {AUDIENCE.map(({ key, icon: Icon, accent }) => {
              const styles = accentStyles[accent];
              return (
                <motion.div
                  key={key}
                  variants={itemVariants}
                  className={cn(
                    "group relative glass rounded-2xl p-6 md:p-8 border border-glass-brd",
                    "transition-all duration-300 hover:-translate-y-1",
                    styles.border,
                    styles.glow,
                  )}
                >
                  <div
                    className={cn(
                      "w-14 h-14 rounded-xl flex items-center justify-center mb-5",
                      "bg-gradient-to-br from-white/10 to-white/5 border border-glass-brd",
                      styles.icon,
                    )}
                  >
                    <Icon className="w-7 h-7" aria-hidden />
                  </div>
                  <h3 className="font-display text-xl font-bold text-text-0 mb-2">
                    {t(`audience.items.${key}.title`)}
                  </h3>
                  <p className="text-text-1 text-sm leading-relaxed">
                    {t(`audience.items.${key}.description`)}
                  </p>
                  <div
                    className={cn(
                      "absolute bottom-0 left-0 right-0 h-1 rounded-b-2xl bg-gradient-to-r",
                      styles.line,
                      "opacity-0 group-hover:opacity-100 transition-opacity duration-300",
                    )}
                  />
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* Сервисы для преданных */}
      <section id="services" className="relative py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-4 md:px-6">
          <SectionHeader
            title={t("services.title")}
            subtitle={t("services.subtitle")}
          />
          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {services.map(({ slug, content }) => (
              <motion.div key={slug} variants={itemVariants}>
                {/* Ведём на публичную страницу сервиса, а не на защищённый
                    маршрут: гостя иначе выкинет на логин без объяснений. */}
                <Link
                  href={`/services/${slug}`}
                  className={cn(
                    "group relative flex h-full flex-col rounded-2xl glass border p-6",
                    "transition-all duration-300 hover:-translate-y-1",
                    content.featured
                      ? "border-magenta/40 hover:border-magenta/60 hover:shadow-[0_0_24px_rgba(255,62,158,0.25)]"
                      : "border-glass-brd hover:border-cyan/40 hover:shadow-[0_0_20px_rgba(35,240,199,0.15)]",
                  )}
                >
                  <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-glass border-2 border-text-2/35 transition-colors group-hover:border-magenta/50">
                    <ServiceIcon slug={slug} className="h-8 w-8" />
                  </span>
                  <h3 className="font-display text-lg font-bold text-text-0 mb-2">
                    {names(slug, content.name)}
                  </h3>
                  <p className="text-text-1 text-sm leading-relaxed flex-1">
                    {t(`services.items.${slug}`)}
                  </p>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-cyan opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                    {t("services.learnMore")}
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </span>
                </Link>
              </motion.div>
            ))}

            {/* Будущие сервисы — плашки, а не ссылки: страницы у них нет. */}
            {PLANNED_SERVICES.map((service) => {
              const Icon = PLANNED_ICONS[service.slug];
              return (
                <motion.div key={service.slug} variants={itemVariants}>
                  <div className="relative flex h-full flex-col rounded-2xl glass border border-glass-brd p-6 opacity-80">
                    <span className="absolute -top-3 right-5 rounded-full border border-glass-brd bg-bg-1 px-3 py-1 text-xs font-bold uppercase tracking-wider text-text-1">
                      {t("services.planned")}
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
                      {t(`services.items.${service.slug}`)}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* Линии */}
      <section id="lineage" className="relative py-20 md:py-28">
        <div className="mx-auto max-w-5xl px-4 md:px-6">
          <SectionHeader
            title={t("lineage.title")}
            subtitle={t("lineage.subtitle")}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="glass relative overflow-hidden rounded-3xl border border-glass-brd p-6 sm:p-8 md:p-10"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-gold/10 via-magenta/5 to-cyan/10" />
            <div className="relative z-10">
              <p className="text-sm font-semibold uppercase tracking-wider text-text-2 mb-6">
                {t("lineage.groupsTitle")}
              </p>
              <dl className="grid gap-6 md:grid-cols-3">
                {LINEAGE_GROUPS.map((group) => (
                  <div key={group}>
                    <dt className="font-display text-lg font-bold text-text-0 mb-3">
                      {LINEAGE_GROUP_LABELS[group]}
                    </dt>
                    <dd className="flex flex-wrap gap-2">
                      {LINEAGES.filter((item) => item.group === group).map(
                        (item) => (
                          <span
                            key={item.id}
                            title={item.hint}
                            className="inline-flex items-center rounded-full border border-glass-brd bg-bg-1/70 px-3 py-1.5 text-sm text-text-0"
                          >
                            {item.label}
                          </span>
                        ),
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-8 text-text-1 text-sm leading-relaxed">
                {t("lineage.note")}
              </p>
              <p className="mt-2 text-text-2 text-sm">
                {t("lineage.footnote")}{" "}
                <Link
                  href="/support"
                  className="text-text-0 underline underline-offset-4 hover:text-magenta transition-colors"
                >
                  {tNav("support")}
                </Link>
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Карта общин — только когда API отдал точки: пустая карта океана
          обещает то, чего нет. */}
      {communities.length > 0 && (
        <section id="map" className="relative py-20 md:py-28">
          <div className="mx-auto max-w-6xl px-4 md:px-6">
            <SectionHeader
              title={t("map.title")}
              subtitle={t("map.description")}
            />
            <CommunityMapStats communities={communities} />
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <CommunitiesMap communities={communities} />
            </motion.div>
          </div>
        </section>
      )}

      {/* Как начать */}
      <section id="how-it-works" className="relative py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-4 md:px-6">
          <SectionHeader
            title={t("howItWorks.title")}
            subtitle={t("howItWorks.subtitle")}
          />
          <motion.ol
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6 list-none p-0 m-0"
          >
            {STEPS.map(({ key, icon: Icon }, index) => (
              <motion.li
                key={key}
                variants={itemVariants}
                className="relative glass rounded-2xl p-6 md:p-8 border border-glass-brd"
              >
                <div className="flex items-center gap-4 mb-5">
                  <span className="font-mono text-3xl font-bold bg-gradient-to-r from-magenta via-cyan to-gold bg-clip-text text-transparent">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-glass border border-glass-brd text-text-0">
                    <Icon className="w-6 h-6" aria-hidden />
                  </span>
                </div>
                <h3 className="font-display text-xl font-bold text-text-0 mb-2">
                  {t(`howItWorks.steps.${key}.title`)}
                </h3>
                <p className="text-text-1 text-sm leading-relaxed">
                  {t(`howItWorks.steps.${key}.description`)}
                </p>
              </motion.li>
            ))}
          </motion.ol>
        </div>
      </section>

      {/* Принципы */}
      <section id="principles" className="relative py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-4 md:px-6">
          <SectionHeader
            title={t("principles.title")}
            subtitle={t("principles.subtitle")}
          />
          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {PRINCIPLES.map(({ key, icon: Icon, accent }) => {
              const styles = accentStyles[accent];
              return (
                <motion.div
                  key={key}
                  variants={itemVariants}
                  className={cn(
                    "group relative glass rounded-2xl p-6 border border-glass-brd",
                    "transition-all duration-300 hover:-translate-y-1",
                    styles.border,
                    styles.glow,
                  )}
                >
                  <div
                    className={cn(
                      "w-12 h-12 rounded-xl flex items-center justify-center mb-4",
                      "bg-gradient-to-br from-white/10 to-white/5 border border-glass-brd",
                      styles.icon,
                    )}
                  >
                    <Icon className="w-6 h-6" aria-hidden />
                  </div>
                  <h3 className="font-display text-lg font-bold text-text-0 mb-2">
                    {t(`principles.items.${key}.title`)}
                  </h3>
                  <p className="text-text-1 text-sm leading-relaxed">
                    {t(`principles.items.${key}.description`)}
                  </p>
                  <div
                    className={cn(
                      "absolute bottom-0 left-0 right-0 h-1 rounded-b-2xl bg-gradient-to-r",
                      styles.line,
                      "opacity-0 group-hover:opacity-100 transition-opacity duration-300",
                    )}
                  />
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>

      <Pricing plan={plan} returnTo="/" />

      {/* CTA */}
      <section className="relative py-20 md:py-32">
        <div className="mx-auto max-w-4xl px-4 md:px-6 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="glass rounded-3xl p-8 md:p-12 relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-gold/10 via-magenta/5 to-cyan/10" />
            <div className="absolute -top-10 -right-10 w-40 h-40 opacity-20">
              <Iris size={160} />
            </div>
            <div className="relative z-10">
              <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold text-text-0 mb-4">
                {t("cta.title")}
              </h2>
              <p className="text-text-1 text-lg md:text-xl mb-8 max-w-xl mx-auto">
                {t("cta.description")}
              </p>
              <Link
                href={startHref}
                className={cn(
                  "group inline-flex items-center justify-center gap-2",
                  "px-10 py-5 rounded-full",
                  "bg-gradient-to-r from-magenta to-[#B23EFF]",
                  "text-white font-semibold text-xl",
                  "transition-all duration-300",
                  "hover:shadow-[0_0_40px_rgba(255,62,158,0.5)]",
                  "hover:-translate-y-1",
                )}
              >
                {t("cta.button")}
                <ArrowRight className="w-6 h-6 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      <Footer />
      <InstallBanner />
    </div>
  );
}
