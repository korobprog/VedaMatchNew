"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Check, Gift } from "lucide-react";
import { cn } from "@/lib/utils";
import { PLAN } from "@/lib/plan";

export function Pricing() {
  return (
    <section id="pricing" className="relative py-20 md:py-32">
      <div className="mx-auto max-w-4xl px-4 md:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-12 text-center"
        >
          <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold text-text-0 mb-4">
            Простой тариф
          </h2>
          <p className="text-text-1 text-lg md:text-xl">
            Один тариф на всю платформу. Первый месяц — бесплатно, без карты.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="glass relative overflow-hidden rounded-3xl border border-glass-brd p-8 md:p-12"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-magenta/10 via-cyan/5 to-gold/10" />

          <div className="relative z-10 grid gap-10 md:grid-cols-2 md:items-center">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-cyan/40 bg-cyan/10 px-3 py-1 text-sm font-medium text-text-0">
                <Gift className="h-4 w-4 text-cyan" />
                {PLAN.trialDays} дней бесплатно
              </span>

              <div className="mt-6 flex items-end gap-2">
                <span className="font-display text-5xl md:text-6xl font-bold text-text-0">
                  {PLAN.priceRub} ₽
                </span>
                <span className="pb-2 text-text-1 text-lg">/ месяц</span>
              </div>
              <p className="mt-2 text-text-1">
                или{" "}
                <span className="font-semibold text-text-0">
                  {PLAN.priceUsdt} USDT
                </span>{" "}
                в месяц
              </p>
              <p className="mt-4 text-sm text-text-2">
                Пробный месяц включается автоматически при регистрации. Оплата —
                после него, отказаться можно в любой момент.
              </p>

              <Link
                href="/login"
                className={cn(
                  "group mt-8 inline-flex items-center justify-center gap-2",
                  "px-8 py-4 rounded-full",
                  "bg-gradient-to-r from-magenta to-[#B23EFF]",
                  "text-white font-semibold text-lg",
                  "transition-all duration-300",
                  "hover:shadow-[0_0_30px_rgba(255,62,158,0.5)]",
                  "hover:-translate-y-0.5",
                )}
              >
                Попробовать бесплатно
                <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>

            <ul className="space-y-3">
              {PLAN.features.map((feature) => (
                <li key={feature} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan/15">
                    <Check className="h-4 w-4 text-cyan" />
                  </span>
                  <span className="text-text-1">{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        </motion.div>

        <p className="mt-6 text-center text-sm text-text-2">
          Вопросы по оплате?{" "}
          <Link href="/support" className="text-text-1 underline hover:text-text-0">
            Напишите в поддержку
          </Link>{" "}
          — ответим даже без регистрации.
        </p>
      </div>
    </section>
  );
}
