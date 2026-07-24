"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavbarProps {
  className?: string;
}

const navLinks = [
  { href: "/#features", label: "Возможности" },
  { href: "/#how-it-works", label: "Как это работает" },
  { href: "/union", label: "Union" },
];

export function Navbar({ className }: NavbarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

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
              className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-sm glass lg:hidden"
            >
              <div className="flex flex-col h-full p-6 safe-top">
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

                {/* CTA Button */}
                <div className="mt-auto">
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
