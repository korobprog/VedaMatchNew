"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, Sparkles } from "lucide-react";
import { ServiceIcon } from "@/components/icons/service-icons";
import { Navbar } from "./Navbar";
import { BackgroundOrbs } from "./Orb";
import { NoiseOverlay } from "./NoiseOverlay";
import { Footer } from "./Footer";
import type { ServiceContent } from "@/lib/service-content";
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
}: {
  service: ServiceContent;
  otherServices: ServiceContent[];
}) {
  // Ведём на настоящий маршрут сервиса, а не на /login — так же, как остальное
  // приложение уже обрабатывает неавторизованный доступ (редирект на "/?returnTo=…"
  // с автоматическим silent-refresh). "/login?returnTo=" в этом приложении никто не
  // читает: сама страница логина и OAuth-колбэк параметр returnTo не используют.
  const ctaHref = service.route;

  return (
    <div className="relative min-h-screen bg-bg-0">
      <BackgroundOrbs />
      <NoiseOverlay />
      <Navbar />

      {/* Hero */}
      <section className="relative pt-28 pb-16 md:pt-36 md:pb-24">
        <div className="mx-auto max-w-4xl px-4 md:px-6 text-center">
          <Link
            href="/#services"
            className="inline-flex items-center gap-1.5 text-sm text-text-2 hover:text-text-0 transition-colors mb-8"
          >
            <ArrowLeft className="w-4 h-4" />
            Все сервисы
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
              Флагманский сервис
            </motion.span>
          )}

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="font-display text-3xl md:text-5xl font-bold text-text-0 mb-4 leading-tight"
          >
            {service.name}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="text-lg md:text-xl bg-gradient-to-r from-magenta via-cyan to-gold bg-clip-text text-transparent font-semibold mb-6"
          >
            {service.tagline}
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
              Зарегистрироваться бесплатно
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
              Тариф
            </Link>
          </motion.div>
        </div>
      </section>

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

      {/* Other services */}
      {otherServices.length > 0 && (
        <section className="relative py-16 md:py-24">
          <div className="mx-auto max-w-6xl px-4 md:px-6">
            <h2 className="font-display text-2xl md:text-3xl font-bold text-text-0 mb-8 text-center">
              Ещё сервисы платформы
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
                    {other.name}
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
                Готовы попробовать «{service.name}»?
              </h2>
              <p className="text-text-1 text-base md:text-lg mb-8 max-w-xl mx-auto">
                Первый месяц бесплатно, доступ ко всем 8 сервисам платформы в одном аккаунте.
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
                Создать аккаунт
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
