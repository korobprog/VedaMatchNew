"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { UserProfile } from "@vedamatch/shared";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, Home, LifeBuoy, Bell, MoreHorizontal } from "lucide-react";
import { ServiceIcon } from "@/components/icons/service-icons";
import { LogoutButton } from "@/components/logout-button";
import { CartBadge } from "@/components/market/cart-badge";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import { LocaleToggle } from "@/components/locale-toggle";
import { VedaMatchMark } from "@/components/icons/vedamatch-mark";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { href: "/", label: "Главная", icon: <Home size={20} /> },
  { href: "/union", label: "Знакомства", icon: <ServiceIcon slug="union" className="h-5 w-5" /> },
  { href: "/motivation", label: "Мотивация", icon: <ServiceIcon slug="motivation" className="h-5 w-5" /> },
  { href: "/vedabase", label: "Книги", icon: <ServiceIcon slug="vedabase" className="h-5 w-5" /> },
  { href: "/library", label: "Библиотека", icon: <ServiceIcon slug="library" className="h-5 w-5" /> },
  { href: "/astro", label: "Джйотиш", icon: <ServiceIcon slug="astro" className="h-5 w-5" /> },
  { href: "/market", label: "Рынок", icon: <ServiceIcon slug="market" className="h-5 w-5" /> },
];

function MoreNavMenu({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-center p-2 rounded-xl text-text-1 hover:text-text-0 hover:bg-glass transition-colors"
        aria-label="Остальные сервисы"
        aria-expanded={open}
      >
        <MoreHorizontal size={20} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-48 rounded-xl border border-glass-brd bg-bg-1 p-1.5 shadow-lg z-50"
          >
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-text-1 hover:text-text-0 hover:bg-glass transition-colors"
              >
                {item.icon}
                {item.label}
              </Link>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function LogoutItem() {
  return (
    <LogoutButton className="flex w-full items-center gap-3 rounded-xl border-0 px-4 py-3 text-text-1 hover:bg-red-400/10 hover:text-red-400 dark:border-0 dark:text-text-1">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16,17 21,12 16,7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </svg>
      <span className="text-sm">Выйти</span>
    </LogoutButton>
  );
}

export function Header({ user }: { user: UserProfile }) {
  const [isOpen, setIsOpen] = useState(false);
  // Корзина принадлежит «Рынку»: на Джйотише или в Книгах она сбивает с толку,
  // да и опрашивать счётчик там незачем.
  const pathname = usePathname();
  const inMarket = pathname === "/market" || pathname.startsWith("/market/");

  return (
    <>
      <header className="sticky top-0 z-50 bg-bg-0/80 backdrop-blur-xl border-b border-glass-brd safe-top">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 h-14">
          {/* Logo */}
          <Link href="/" className="flex shrink-0 items-center gap-2">
            {/* Вектор, а не logo_tilak.png: в растре знак запечён тёмно-синим
                и на тёмной теме сливается с фоном шапки. */}
            <VedaMatchMark className="h-9 w-9 text-text-0" />
            <span className="font-display font-bold text-text-0 hidden sm:block">VedaMatch</span>
          </Link>

          {/* Desktop Navigation: полный ряд на широких экранах, узкий переход на md/lg — иконки без подписи */}
          <nav className="hidden xl:flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-text-1 hover:text-text-0 hover:bg-glass transition-colors"
              >
                {item.icon}
                {item.label}
              </Link>
            ))}
          </nav>

          {/* На md/lg не хватает места под полные подписи — показываем первый пункт и остальные под тремя точками */}
          <nav className="hidden md:flex xl:hidden items-center gap-1">
            <Link
              href={navItems[0].href}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-text-1 hover:text-text-0 hover:bg-glass transition-colors"
              title={navItems[0].label}
            >
              {navItems[0].icon}
            </Link>
            <MoreNavMenu items={navItems.slice(1)} />
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2">
            {/* Виден и на мобильном: это основной вход в уведомления,
                прятать его в бургер — значит прятать и значок. */}
            {inMarket && <CartBadge />}
            <NotificationBell />
            <LocaleToggle className="hidden sm:flex" />
            <ThemeToggle className="hidden sm:flex" />

            {user.role === "admin" && (
              <Link
                href="/admin/users"
                className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-text-1 hover:text-magenta border border-glass-brd hover:border-magenta/30 transition-colors"
              >
                Админ
              </Link>
            )}
            
            <Link href="/profile" className="flex items-center gap-2">
              {user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.avatarUrl}
                  alt={user.displayName}
                  className="h-8 w-8 shrink-0 rounded-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-glass text-sm font-semibold text-text-0">
                  {user.displayName.charAt(0).toUpperCase()}
                </span>
              )}
            </Link>
            
            {/* Mobile menu button */}
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="md:hidden p-2 rounded-lg text-text-1 hover:text-text-0 hover:bg-glass transition-colors"
              aria-label="Меню"
            >
              <motion.div animate={{ rotate: isOpen ? 90 : 0 }}>
                {isOpen ? <X size={20} /> : <Menu size={20} />}
              </motion.div>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile menu overlay */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-bg-0/95 backdrop-blur-xl md:hidden"
              onClick={() => setIsOpen(false)}
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed top-0 right-0 bottom-0 z-50 w-72 bg-bg-1 border-l border-glass-brd md:hidden"
            >
              <div className="flex flex-col h-full p-6 pt-20">
                <nav className="flex flex-col gap-1">
                  {navItems.map((item, index) => (
                    <motion.div
                      key={item.href}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <Link
                        href={item.href}
                        onClick={() => setIsOpen(false)}
                        className="flex items-center gap-3 px-4 py-3 rounded-xl text-text-1 hover:text-text-0 hover:bg-glass transition-colors"
                      >
                        {item.icon}
                        <span className="font-medium">{item.label}</span>
                      </Link>
                    </motion.div>
                  ))}
                </nav>
                
                {user.role === "admin" && (
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: navItems.length * 0.05 }}
                    className="mt-4 pt-4 border-t border-glass-brd"
                  >
                    <Link
                      href="/admin/users"
                      onClick={() => setIsOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-magenta hover:bg-magenta/10 transition-colors"
                    >
                      <span className="text-sm font-medium">Админ панель</span>
                    </Link>
                    <Link
                      href="/admin/tickets"
                      onClick={() => setIsOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-magenta hover:bg-magenta/10 transition-colors"
                    >
                      <span className="text-sm font-medium">Обращения</span>
                    </Link>
                    <Link
                      href="/admin/astro"
                      onClick={() => setIsOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-magenta hover:bg-magenta/10 transition-colors"
                    >
                      <span className="text-sm font-medium">Астрология</span>
                    </Link>
                    <Link
                      href="/admin/settings"
                      onClick={() => setIsOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-magenta hover:bg-magenta/10 transition-colors"
                    >
                      <span className="text-sm font-medium">Настройки</span>
                    </Link>
                    <Link
                      href="/admin/changelog"
                      onClick={() => setIsOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-magenta hover:bg-magenta/10 transition-colors"
                    >
                      <span className="text-sm font-medium">Версия и новости</span>
                    </Link>
                  </motion.div>
                )}

                <div className="mt-auto pt-4 border-t border-glass-brd space-y-1">
                  <div className="px-1 pb-3">
                    <p className="mb-2 px-3 text-xs font-medium uppercase tracking-wide text-text-2">
                      Язык
                    </p>
                    <LocaleToggle variant="full" />
                  </div>
                  <div className="px-1 pb-3">
                    <p className="mb-2 px-3 text-xs font-medium uppercase tracking-wide text-text-2">
                      Тема
                    </p>
                    <ThemeToggle variant="full" />
                  </div>
                  <Link
                    href="/self-identification"
                    onClick={() => setIsOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-text-1 hover:text-gold hover:bg-glass transition-colors"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 11l3 3L22 4" />
                      <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
                    </svg>
                    <span className="text-sm">Самоидентификация</span>
                  </Link>
                  <Link
                    href="/notifications"
                    onClick={() => setIsOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-text-1 hover:text-cyan hover:bg-glass transition-colors"
                  >
                    <Bell size={20} />
                    <span className="text-sm">Уведомления</span>
                  </Link>
                  <Link
                    href="/support"
                    onClick={() => setIsOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-text-1 hover:text-cyan hover:bg-glass transition-colors"
                  >
                    <LifeBuoy size={20} />
                    <span className="text-sm">Поддержка</span>
                  </Link>
                  <Link
                    href="/updates"
                    onClick={() => setIsOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-text-1 hover:text-cyan hover:bg-glass transition-colors"
                  >
                    <span className="text-sm">Что нового</span>
                  </Link>
                  <LogoutItem />
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
