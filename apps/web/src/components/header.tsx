"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { UserProfile } from "@vedamatch/shared";
import { useCallback, useId, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, Home, LifeBuoy, Bell, MoreHorizontal } from "lucide-react";
import { ServiceIcon } from "@/components/icons/service-icons";
import { LogoutButton } from "@/components/logout-button";
import { CartBadge } from "@/components/market/cart-badge";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import { LocaleToggle } from "@/components/locale-toggle";
import { VedaMatchMark } from "@/components/icons/vedamatch-mark";
import { SERVICE_CONTENT } from "@/lib/service-content";
import { useDialogFocus, useDismissable } from "@/lib/use-dismissable";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

// Список сервисов — единый источник `lib/service-content.ts`: в шапке те же
// 8 пунктов и в том же порядке, что на лендинге и в /services.
const navItems: NavItem[] = [
  { href: "/", label: "Главная", icon: <Home size={20} /> },
  ...SERVICE_CONTENT.map((service) => ({
    href: service.route,
    label: service.name,
    icon: <ServiceIcon slug={service.slug} className="h-5 w-5" />,
  })),
];

/** Текущий раздел: точное совпадение для «/», иначе — префикс маршрута. */
export function isCurrentRoute(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

const navLinkClass =
  "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-text-1 hover:text-text-0 hover:bg-glass transition-colors aria-[current=page]:bg-glass aria-[current=page]:text-text-0";

function MoreNavMenu({ items, pathname }: { items: NavItem[]; pathname: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const close = useCallback(() => setOpen(false), []);
  useDismissable(ref, close, open);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-center p-2 rounded-xl text-text-1 hover:text-text-0 hover:bg-glass transition-colors"
        aria-label="Остальные сервисы"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
      >
        <MoreHorizontal size={20} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            id={menuId}
            role="menu"
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
                role="menuitem"
                aria-current={isCurrentRoute(pathname, item.href) ? "page" : undefined}
                onClick={close}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-text-1 hover:text-text-0 hover:bg-glass transition-colors aria-[current=page]:bg-glass aria-[current=page]:text-text-0"
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
    <LogoutButton
      variant="ghost"
      className="w-full justify-start gap-3 px-4 py-3 text-sm font-normal hover:bg-red-400/10 hover:text-red-400"
    >
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
  const drawerId = useId();
  const drawerRef = useRef<HTMLDivElement>(null);
  const burgerRef = useRef<HTMLButtonElement>(null);
  const closeDrawer = useCallback(() => setIsOpen(false), []);
  useDismissable(drawerRef, closeDrawer, isOpen);
  useDialogFocus(isOpen, drawerRef, burgerRef);
  const currentAttr = (href: string) =>
    isCurrentRoute(pathname, href) ? ("page" as const) : undefined;

  return (
    <>
      <header className="sticky top-0 z-50 bg-bg-0/80 backdrop-blur-xl border-b border-glass-brd safe-top">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 h-14">
          {/* Logo */}
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <VedaMatchMark className="h-9 w-9" />
            <span className="hidden items-center gap-1.5 sm:flex">
              <span className="font-display font-bold text-text-0">VedaMatch</span>
              {/* Значок беты стоит рядом с названием, а не на самом знаке —
                  здесь он виден на каждой странице портала, а не только на
                  главной, и не перекрывает мелкую деталь логотипа. */}
              <span className="rounded-full bg-gradient-to-r from-magenta to-[#B23EFF] px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider leading-none text-white shadow-[0_0_6px_rgba(255,62,158,0.6)]">
                Beta
              </span>
            </span>
          </Link>

          {/* Desktop Navigation: полный ряд на широких экранах, узкий переход на md/lg — иконки без подписи */}
          <nav aria-label="Сервисы" className="hidden xl:flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={currentAttr(item.href)}
                className={navLinkClass}
              >
                {item.icon}
                {item.label}
              </Link>
            ))}
          </nav>

          {/* На md/lg не хватает места под полные подписи — показываем первый пункт и остальные под тремя точками */}
          <nav aria-label="Сервисы" className="hidden md:flex xl:hidden items-center gap-1">
            <Link
              href={navItems[0].href}
              aria-current={currentAttr(navItems[0].href)}
              aria-label={navItems[0].label}
              className={navLinkClass}
              title={navItems[0].label}
            >
              {navItems[0].icon}
            </Link>
            <MoreNavMenu items={navItems.slice(1)} pathname={pathname} />
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
              ref={burgerRef}
              type="button"
              onClick={() => setIsOpen(!isOpen)}
              className="md:hidden p-2 rounded-lg text-text-1 hover:text-text-0 hover:bg-glass transition-colors"
              aria-label={isOpen ? "Закрыть меню" : "Открыть меню"}
              aria-expanded={isOpen}
              aria-controls={drawerId}
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
              onClick={closeDrawer}
            />
            <motion.div
              ref={drawerRef}
              id={drawerId}
              role="dialog"
              aria-modal="true"
              aria-label="Меню"
              tabIndex={-1}
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed top-0 right-0 bottom-0 z-50 w-72 overflow-y-auto border-l border-glass-brd bg-bg-1 outline-none md:hidden"
            >
              <div className="flex flex-col h-full p-6 pt-20">
                <nav aria-label="Сервисы" className="flex flex-col gap-1">
                  {navItems.map((item, index) => (
                    <motion.div
                      key={item.href}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <Link
                        href={item.href}
                        aria-current={currentAttr(item.href)}
                        onClick={closeDrawer}
                        className="flex items-center gap-3 px-4 py-3 rounded-xl text-text-1 hover:text-text-0 hover:bg-glass transition-colors aria-[current=page]:bg-glass aria-[current=page]:text-text-0"
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
                      onClick={closeDrawer}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-magenta hover:bg-magenta/10 transition-colors"
                    >
                      <span className="text-sm font-medium">Админ панель</span>
                    </Link>
                    <Link
                      href="/admin/tickets"
                      onClick={closeDrawer}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-magenta hover:bg-magenta/10 transition-colors"
                    >
                      <span className="text-sm font-medium">Обращения</span>
                    </Link>
                    <Link
                      href="/admin/astro"
                      onClick={closeDrawer}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-magenta hover:bg-magenta/10 transition-colors"
                    >
                      <span className="text-sm font-medium">Астрология</span>
                    </Link>
                    <Link
                      href="/admin/settings"
                      onClick={closeDrawer}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-magenta hover:bg-magenta/10 transition-colors"
                    >
                      <span className="text-sm font-medium">Настройки</span>
                    </Link>
                    <Link
                      href="/admin/changelog"
                      onClick={closeDrawer}
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
                    onClick={closeDrawer}
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
                    onClick={closeDrawer}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-text-1 hover:text-cyan hover:bg-glass transition-colors"
                  >
                    <Bell size={20} />
                    <span className="text-sm">Уведомления</span>
                  </Link>
                  <Link
                    href="/support"
                    onClick={closeDrawer}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-text-1 hover:text-cyan hover:bg-glass transition-colors"
                  >
                    <LifeBuoy size={20} />
                    <span className="text-sm">Поддержка</span>
                  </Link>
                  <Link
                    href="/updates"
                    onClick={closeDrawer}
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
