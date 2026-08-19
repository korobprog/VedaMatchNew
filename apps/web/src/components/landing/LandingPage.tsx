"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { ArrowRight, Play } from "lucide-react";
import type { PricingPlan } from "@vedamatch/shared";
import { Navbar } from "./Navbar";
import { BackgroundOrbs } from "./Orb";
import { NoiseOverlay } from "./NoiseOverlay";
import { Iris } from "./Iris";
import { PhoneMockup } from "./PhoneMockup";
import { Services } from "./Services";
import { HowItWorks } from "./HowItWorks";
import { Features } from "./Features";
import { Pricing } from "./Pricing";
import { Footer } from "./Footer";
import { cn } from "@/lib/utils";
import { SilentRefresh } from "@/components/silent-refresh";
import { InstallBanner } from "@/components/pwa/install-banner";
import { MemberCounter } from "@/components/member-counter";
import { loginHref } from "@/lib/return-to";

export function LandingPage({
  returnTo,
  plan,
  totalMembers,
}: {
  returnTo?: string;
  plan?: PricingPlan;
  totalMembers?: number;
}) {
  const t = useTranslations("Landing");
  return (
    <div className="relative min-h-screen bg-bg-0">
      <SilentRefresh returnTo={returnTo} />
      {/* Background elements */}
      <BackgroundOrbs />
      <NoiseOverlay />

      {/* Navigation */}
      <Navbar returnTo={returnTo} />

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center pt-20 pb-32 md:pt-24 md:pb-40 overflow-hidden">
        <div className="mx-auto max-w-7xl px-4 md:px-6 w-full">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left side - Text content */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="min-w-0 text-center lg:text-left"
            >
              {/* Badge */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-6"
              >
                <span className="w-2 h-2 rounded-full bg-cyan animate-pulse" />
                <span className="text-text-1 text-sm font-medium">{t("hero.badge")}</span>
              </motion.div>

              {/* Heading */}
              <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold text-text-0 mb-6 leading-tight">
                {t("hero.titleLine1")}
                <span className="block bg-gradient-to-r from-magenta via-cyan to-gold bg-clip-text text-transparent">
                  {t("hero.titleLine2")}
                </span>
                {t("hero.titleLine3")}
              </h1>

              {/* Description */}
              <p className="text-text-1 text-lg md:text-xl mb-8 max-w-xl mx-auto lg:mx-0 leading-relaxed">
                {t("hero.description")}
              </p>

              {/* CTA buttons */}
              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <Link
                  href={loginHref(returnTo)}
                  className={cn(
                    "group inline-flex items-center justify-center gap-2",
                    "px-5 py-2.5 rounded-full sm:px-8 sm:py-4",
                    "bg-gradient-to-r from-magenta to-[#B23EFF]",
                    "text-white font-semibold text-base sm:text-lg",
                    "transition-all duration-300",
                    "hover:shadow-[0_0_30px_rgba(255,62,158,0.5)]",
                    "hover:-translate-y-0.5"
                  )}
                >
                  {t("hero.ctaStart")}
                  <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 transition-transform group-hover:translate-x-1" />
                </Link>

                <a
                  href="#services"
                  className={cn(
                    "group inline-flex items-center justify-center gap-2",
                    "px-5 py-2.5 rounded-full sm:px-8 sm:py-4",
                    "glass border border-glass-brd",
                    "text-text-0 font-semibold text-base sm:text-lg",
                    "transition-all duration-300",
                    "hover:border-cyan/50 hover:shadow-[0_0_20px_rgba(35,240,199,0.2)]"
                  )}
                >
                  <Play className="w-4 h-4 sm:w-5 sm:h-5" />
                  {t("hero.ctaMore")}
                </a>
              </div>

              {/* Подсказка про экосистему — знакомства это только один из сервисов */}
              <a
                href="#services"
                className="mt-6 inline-flex items-center gap-2 text-sm text-text-2 hover:text-text-0 transition-colors"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan/15 text-cyan text-xs font-bold">
                  8
                </span>
                {t("hero.ecosystem")}
              </a>

              {/* Stats */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="flex gap-4 sm:gap-8 mt-12 justify-center lg:justify-start"
              >
                <div className="shrink-0">
                  {totalMembers != null && (
                    <div className="font-display text-2xl md:text-3xl font-bold text-text-0">
                      <MemberCounter total={totalMembers} />
                    </div>
                  )}
                  <div className="text-text-2 text-xs sm:text-sm whitespace-nowrap">{t("hero.statUsers")}</div>
                </div>
                <div className="w-px bg-glass-brd shrink-0" />
                <div className="shrink-0">
                  <div className="font-display text-2xl md:text-3xl font-bold text-text-0">500+</div>
                  <div className="text-text-2 text-xs sm:text-sm whitespace-nowrap">{t("hero.statMatches")}</div>
                </div>
                <div className="w-px bg-glass-brd shrink-0" />
                <div className="shrink-0">
                  <div className="font-display text-2xl md:text-3xl font-bold text-text-0">98%</div>
                  <div className="text-text-2 text-xs sm:text-sm whitespace-nowrap">{t("hero.statHappy")}</div>
                </div>
              </motion.div>
            </motion.div>

            {/* Right side - Phone mockup */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="relative flex min-w-0 justify-center lg:justify-end"
            >
              <PhoneMockup />
            </motion.div>
          </div>
        </div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
        >
          <div className="flex flex-col items-center gap-2 text-text-2">
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

      {/* Services Section — весь каталог из 8 сервисов платформы */}
      <Services />

      {/* How It Works Section */}
      <HowItWorks />

      {/* Features Section */}
      <Features />

      {/* Pricing Section */}
      <Pricing plan={plan} returnTo={returnTo} />

      {/* CTA Section */}
      <section className="relative py-20 md:py-32">
        <div className="mx-auto max-w-4xl px-4 md:px-6 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="glass rounded-3xl p-8 md:p-12 relative overflow-hidden"
          >
            {/* Background glow */}
            <div className="absolute inset-0 bg-gradient-to-br from-magenta/10 via-cyan/5 to-gold/10" />
            
            {/* Iris decoration */}
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
                href={loginHref(returnTo)}
                className={cn(
                  "group inline-flex items-center justify-center gap-2",
                  "px-10 py-5 rounded-full",
                  "bg-gradient-to-r from-magenta to-[#B23EFF]",
                  "text-white font-semibold text-xl",
                  "transition-all duration-300",
                  "hover:shadow-[0_0_40px_rgba(255,62,158,0.5)]",
                  "hover:-translate-y-1"
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
