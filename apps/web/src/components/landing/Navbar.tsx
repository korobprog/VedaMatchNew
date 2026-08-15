"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { LocaleToggle } from "@/components/locale-toggle";
import { ServiceIcon } from "@/components/icons/service-icons";
import { SERVICE_CONTENT } from "@/lib/service-content";

interface NavbarProps {
  className?: string;
}

const navLinks = [
  { href: "/#how-it-works", label: "Как это работает" },
  { href: "/#pricing", label: "Тариф" },
  { href: "/support", label: "Поддержка" },
];

/** Выпадающее меню «Сервисы» на десктопе: прямые ссылки на все 7 страниц-описаний,
 * а не один якорь-скролл — оглавление сайта должно отражать его реальную структуру. */
function ServicesMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-text-1 hover:text-text-0 transition-colors duration-200 font-medium"
        aria-expanded={open}
      >
        Сервисы
        <ChevronDown size={16} className={cn("transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="absolute left-1/2 top-full mt-3 w-80 -translate-x-1/2 rounded-2xl border border-glass-brd bg-bg-1 p-2 shadow-xl z-50"
          >
            {SERVICE_CONTENT.map((service) => (
              <Link
                key={service.slug}
                href={`/services/${service.slug}`}
                onClick={() => setOpen(false)}
                className="flex items-start gap-3 rounded-xl p-2.5 hover:bg-glass transition-colors"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-glass border border-text-2/30">
                  <ServiceIcon slug={service.slug} className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-text-0">{service.name}</span>
                  <span className="block text-xs text-text-2 truncate">{service.tagline}</span>
                </span>
              </Link>
            ))}
            <Link
              href="/#services"
              onClick={() => setOpen(false)}
              className="mt-1 block rounded-xl p-2.5 text-center text-sm font-semibold text-cyan hover:bg-glass transition-colors"
            >
              Смотреть всё на одной странице
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Navbar({ className }: NavbarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [servicesExpanded, setServicesExpanded] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  return (
    <>
      <header
        className={cn(
          "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
          "safe-top",
          isScrolled
            ? "glass shadow-lg shadow-black/20"
            : "bg-transparent",
          className
        )}
      >
        <nav className="mx-auto flex h-14 md:h-16 max-w-7xl items-center justify-between px-4 md:px-6">
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center gap-3 transition-transform hover:scale-105 focus-visible:outline-none"
          >
            <Image
              src="/logo_tilak.png"
              alt="VedaMatch"
              width={48}
              height={48}
              priority
              className="h-12 w-12 object-contain"
            />
            <span className="font-display text-lg md:text-xl font-bold text-text-0 hidden sm:block">
              VedaMatch
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center gap-8">
            <ServicesMenu />
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-text-1 hover:text-text-0 transition-colors duration-200 font-medium"
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Desktop CTA */}
          <div className="hidden lg:flex items-center gap-4">
            <LocaleToggle />
            <ThemeToggle />
            <Link
              href="/login"
              className="px-5 py-2.5 rounded-full bg-gradient-to-r from-magenta to-[#B23EFF] text-white font-semibold transition-all duration-200 hover:shadow-[0_0_24px_rgba(255,62,158,0.45)] hover:-translate-y-0.5"
            >
              Начать
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="lg:hidden p-2 -mr-2 text-text-0 hover:text-magenta transition-colors"
            aria-label={isOpen ? "Закрыть меню" : "Открыть меню"}
            aria-expanded={isOpen}
          >
            <motion.div
              animate={{ rotate: isOpen ? 90 : 0 }}
              transition={{ duration: 0.2 }}
            >
              {isOpen ? <X size={24} /> : <Menu size={24} />}
            </motion.div>
          </button>
        </nav>
      </header>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-bg-0/80 backdrop-blur-sm lg:hidden"
              onClick={() => setIsOpen(false)}
              aria-hidden="true"
            />

            {/* Menu Panel */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-sm glass lg:hidden overflow-y-auto"
            >
              <div className="flex min-h-full flex-col p-6 safe-top">
                {/* Close Button */}
                <div className="flex justify-end mb-8">
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-2 -mr-2 text-text-0 hover:text-magenta transition-colors"
                    aria-label="Закрыть меню"
                  >
                    <X size={24} />
                  </button>
                </div>

                {/* Navigation Links */}
                <nav className="flex flex-col gap-6">
                  {/* Раскрывающийся список сервисов вместо одного якоря на секцию */}
                  <div>
                    <button
                      onClick={() => setServicesExpanded((v) => !v)}
                      className="flex w-full items-center justify-between text-2xl font-display font-bold text-text-0 hover:text-magenta transition-colors"
                      aria-expanded={servicesExpanded}
                    >
                      Сервисы
                      <ChevronDown
                        size={22}
                        className={cn("transition-transform", servicesExpanded && "rotate-180")}
                      />
                    </button>
                    <AnimatePresence initial={false}>
                      {servicesExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-3 flex flex-col gap-1 pl-1">
                            {SERVICE_CONTENT.map((service) => (
                              <Link
                                key={service.slug}
                                href={`/services/${service.slug}`}
                                onClick={() => setIsOpen(false)}
                                className="flex items-center gap-2.5 rounded-lg py-1.5 text-base font-medium text-text-1 hover:text-text-0 transition-colors"
                              >
                                <ServiceIcon slug={service.slug} className="h-5 w-5 shrink-0" />
                                {service.name}
                              </Link>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {navLinks.map((link, index) => (
                    <motion.div
                      key={link.href}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                    >
                      <Link
                        href={link.href}
                        onClick={() => setIsOpen(false)}
                        className="block text-2xl font-display font-bold text-text-0 hover:text-magenta transition-colors"
                      >
                        {link.label}
                      </Link>
                    </motion.div>
                  ))}
                </nav>

                {/* Language */}
                <div className="mt-10">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-2">
                    Язык
                  </p>
                  <LocaleToggle variant="full" />
                </div>

                {/* Theme */}
                <div className="mt-4">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-2">
                    Тема
                  </p>
                  <ThemeToggle variant="full" />
                </div>

                {/* CTA Button */}
                <div className="mt-auto pt-8 pb-4">
                  <Link
                    href="/login"
                    onClick={() => setIsOpen(false)}
                    className="block w-full py-4 px-6 rounded-full bg-gradient-to-r from-magenta to-[#B23EFF] text-white font-semibold text-center text-lg transition-all duration-200 hover:shadow-[0_0_24px_rgba(255,62,158,0.45)]"
                  >
                    Начать
                  </Link>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
