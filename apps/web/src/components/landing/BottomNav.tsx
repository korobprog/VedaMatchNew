"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { 
  LayoutGrid, 
  Search, 
  Heart, 
  MessageCircle, 
  User,
  Sparkles 
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  iconFilled?: React.ReactNode;
  badge?: number;
  isCenter?: boolean;
}

const navItems: NavItem[] = [
  { 
    href: "/", 
    label: "Главная", 
    icon: <LayoutGrid size={24} />,
    iconFilled: <LayoutGrid size={24} className="fill-current" />,
  },
  { 
    href: "/union/recommendations", 
    label: "Лента", 
    icon: <Sparkles size={24} />,
    iconFilled: <Sparkles size={24} className="fill-current" />,
  },
  { 
    href: "/union/connections", 
    label: "Любовь", 
    icon: <Heart size={32} />,
    isCenter: true,
  },
  { 
    href: "/union/chats", 
    label: "Чаты", 
    icon: <MessageCircle size={24} />,
    iconFilled: <MessageCircle size={24} className="fill-current" />,
    badge: 3,
  },
  { 
    href: "/profile", 
    label: "Профиль", 
    icon: <User size={24} />,
    iconFilled: <User size={24} className="fill-current" />,
  },
];

export function BottomNav() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/" || href === "/union/recommendations") {
      return pathname === "/" || pathname === "/union" || pathname === "/union/recommendations";
    }
    return pathname.startsWith(href);
  };

  return (
    <nav 
      className={cn(
        "fixed bottom-3 left-3 right-3 z-50",
        "md:hidden",
        "safe-bottom"
      )}
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      {/* Floating bar */}
      <div 
        className={cn(
          "relative flex items-center justify-around",
          "bg-bg-1/80 backdrop-blur-xl",
          "border border-glass-brd",
          "rounded-3xl",
          "py-2 px-2",
          "shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.1)]"
        )}
      >
        {navItems.map((item, index) => {
          const active = isActive(item.href);
          const isCenter = item.isCenter;

          if (isCenter) {
            return (
              <div key={item.href} className="relative flex items-center justify-center -mt-8">
                {/* Glow ring behind button */}
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-magenta to-purple-600 blur-lg opacity-60 animate-pulse" />
                
                {/* Main button */}
                <Link
                  href={item.href}
                  className={cn(
                    "relative w-16 h-16 rounded-full",
                    "bg-gradient-to-br from-magenta to-purple-600",
                    "flex items-center justify-center",
                    "text-white",
                    "shadow-[0_4px_20px_rgba(255,62,158,0.6)]",
                    "border-[3px] border-white/30",
                    "hover:scale-105 active:scale-95",
                    "transition-transform duration-200"
                  )}
                >
                  <motion.div
                    whileTap={{ scale: 0.9 }}
                    className="flex items-center justify-center"
                  >
                    {item.icon}
                  </motion.div>
                </Link>
                
                {/* Label above */}
                <span className="absolute -top-6 text-[10px] font-medium text-magenta whitespace-nowrap">
                  {item.label}
                </span>
              </div>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex flex-col items-center justify-center",
                "w-16 h-16 rounded-2xl",
                "transition-all duration-200",
                active 
                  ? "text-magenta" 
                  : "text-text-2 hover:text-text-1"
              )}
            >
              {active && (
                <motion.div
                  layoutId="activeIndicator"
                  className="absolute inset-0 rounded-2xl bg-magenta/10"
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              )}
              
              <div className="relative z-10">
                <motion.div
                  animate={{ scale: active ? 1.15 : 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 20 }}
                  className="flex items-center justify-center"
                >
                  {active && item.iconFilled ? item.iconFilled : item.icon}
                </motion.div>
              </div>
              
              <span 
                className={cn(
                  "text-[10px] font-medium mt-0.5 transition-colors duration-200",
                  active ? "text-magenta" : "text-text-2"
                )}
              >
                {item.label}
              </span>
              
              {item.badge && (
                <span className="absolute top-1 right-1 min-w-[16px] h-4 flex items-center justify-center bg-magenta text-white text-[9px] font-bold rounded-full px-1 shadow-[0_2px_8px_rgba(255,62,158,0.5)]">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
