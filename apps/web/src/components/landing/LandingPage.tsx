"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Play } from "lucide-react";
import { Navbar } from "./Navbar";
import { BottomNav } from "./BottomNav";
import { BackgroundOrbs } from "./Orb";
import { NoiseOverlay } from "./NoiseOverlay";
import { Iris } from "./Iris";
import { PhoneMockup } from "./PhoneMockup";
import { HowItWorks } from "./HowItWorks";
import { Features } from "./Features";
import { cn } from "@/lib/utils";

export function LandingPage() {
  return (
    <div className="relative min-h-screen bg-bg-0">
      {/* Background elements */}
      <BackgroundOrbs />
      <NoiseOverlay />

      {/* Navigation */}
      <Navbar />

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center pt-20 pb-32 md:pt-24 md:pb-40 overflow-hidden">
        <div className="mx-auto max-w-7xl px-4 md:px-6 w-full">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left side - Text content */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="text-center lg:text-left"
            >
              {/* Badge */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-6"
              >
                <span className="w-2 h-2 rounded-full bg-cyan animate-pulse" />
                <span className="text-text-1 text-sm font-medium">Новое в VedaMatch</span>
              </motion.div>

              {/* Heading */}
              <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold text-text-0 mb-6 leading-tight">
                Осознанные
                <span className="block bg-gradient-to-r from-magenta via-cyan to-gold bg-clip-text text-transparent">
                  знакомства
                </span>
                и единство
              </h1>

              {/* Description */}
              <p className="text-text-1 text-lg md:text-xl mb-8 max-w-xl mx-auto lg:mx-0 leading-relaxed">
                Находите единомышленников для семьи, дружбы, служения и духовного развития. 
                На основе общих ценностей и намерений.
              </p>

              {/* CTA buttons */}
              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <Link
                  href="/login"
                  className={cn(
                    "group inline-flex items-center justify-center gap-2",
                    "px-8 py-4 rounded-full",
                    "bg-gradient-to-r from-magenta to-[#B23EFF]",
                    "text-white font-semibold text-lg",
                    "transition-all duration-300",
                    "hover:shadow-[0_0_30px_rgba(255,62,158,0.5)]",
                    "hover:-translate-y-0.5"
                  )}
                >
                  Начать бесплатно
                  <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
                </Link>
                
                <button
                  className={cn(
                    "group inline-flex items-center justify-center gap-2",
                    "px-8 py-4 rounded-full",
                    "glass border border-glass-brd",
                    "text-text-0 font-semibold text-lg",
                    "transition-all duration-300",
                    "hover:border-cyan/50 hover:shadow-[0_0_20px_rgba(35,240,199,0.2)]"
                  )}
                >
                  <Play className="w-5 h-5" />
                  Узнать больше
                </button>
              </div>

              {/* Stats */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="flex gap-8 mt-12 justify-center lg:justify-start"
              >
                <div>
                  <div className="font-display text-2xl md:text-3xl font-bold text-text-0">10K+</div>
                  <div className="text-text-2 text-sm">Пользователей</div>
                </div>
                <div className="w-px bg-glass-brd" />
                <div>
                  <div className="font-display text-2xl md:text-3xl font-bold text-text-0">500+</div>
                  <div className="text-text-2 text-sm">Совпадений</div>
                </div>
                <div className="w-px bg-glass-brd" />
                <div>
                  <div className="font-display text-2xl md:text-3xl font-bold text-text-0">98%</div>
                  <div className="text-text-2 text-sm">Довольных</div>
                </div>
              </motion.div>
            </motion.div>

            {/* Right side - Phone mockup */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="relative flex justify-center lg:justify-end"
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
            <span className="text-sm font-medium">Листайте вниз</span>
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

      {/* How It Works Section */}
      <HowItWorks />

      {/* Features Section */}
      <Features />

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
                Готовы начать?
              </h2>
              <p className="text-text-1 text-lg md:text-xl mb-8 max-w-xl mx-auto">
                Присоединяйтесь к тысячам людей, которые уже нашли единомышленников через VedaMatch Union.
              </p>
              
              <Link
                href="/login"
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
                Создать аккаунт
                <ArrowRight className="w-6 h-6 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative py-12 border-t border-glass-brd">
        <div className="mx-auto max-w-6xl px-4 md:px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <Iris size={32} />
              <span className="font-display text-lg font-bold text-text-0">
                VedaMatch
              </span>
            </div>

            {/* Links */}
            <nav className="flex flex-wrap justify-center gap-6 text-text-1 text-sm">
              <Link href="/union" className="hover:text-text-0 transition-colors">
                Union
              </Link>
              <Link href="/motivation" className="hover:text-text-0 transition-colors">
                Motivation
              </Link>
              <Link href="/vedabase" className="hover:text-text-0 transition-colors">
                Vedabase
              </Link>
              <Link href="/gitabase" className="hover:text-text-0 transition-colors">
                Gitabase
              </Link>
            </nav>

            {/* Copyright */}
            <p className="text-text-2 text-sm">
              © 2024 VedaMatch. Все права защищены.
            </p>
          </div>
        </div>
      </footer>

      {/* Mobile Bottom Nav */}
      <BottomNav />
    </div>
  );
}
