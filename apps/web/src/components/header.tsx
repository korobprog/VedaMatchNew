"use client";

import Link from "next/link";
import Image from "next/image";
import type { UserProfile } from "@vedamatch/shared";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, Home, Users, BookOpen, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { href: "/", label: "Главная", icon: <Home size={20} /> },
  { href: "/union", label: "Union", icon: <Users size={20} /> },
  { href: "/motivation", label: "Motivation", icon: <Sparkles size={20} /> },
  { href: "/vedabase", label: "Vedabase", icon: <BookOpen size={20} /> },
];

function LogoutItem() {
  return (
    <form action="/api/auth/signout" method="post">
      <button
        type="submit"
        className="flex w-full items-center gap-3 px-4 py-3 rounded-xl text-text-1 hover:text-red-400 hover:bg-red-400/10 transition-colors"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16,17 21,12 16,7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
        <span className="text-sm">Выйти</span>
      </button>
    </form>
  );
}

export function Header({ user }: { user: UserProfile }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-50 bg-bg-0/80 backdrop-blur-xl border-b border-glass-brd safe-top">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 h-14">
          {/* Logo */}
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <Image
              src="/logo_tilak.png"
              alt="VedaMatch"
              width={36}
              height={36}
              priority
              className="h-9 w-9 rounded-lg object-contain"
            />
            <span className="font-display font-bold text-text-0 hidden sm:block">VedaMatch</span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1">
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

          {/* Right side */}
          <div className="flex items-center gap-2">
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
                  alt={user.name}
                  className="h-8 w-8 rounded-full"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-glass text-sm font-semibold text-text-0">
                  {user.name.charAt(0).toUpperCase()}
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
                  </motion.div>
                )}

                <div className="mt-auto pt-4 border-t border-glass-brd space-y-1">
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
