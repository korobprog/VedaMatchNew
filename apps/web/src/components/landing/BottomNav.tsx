"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { 
  Sparkles, 
  Search, 
  Heart, 
  MessageCircle, 
  User 
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  iconFilled?: React.ReactNode;
  badge?: number;
}

const navItems: NavItem[] = [
  { 
    href: "/union/recommendations", 
    label: "Лента", 
    icon: <Sparkles size={24} />,
    iconFilled: <Sparkles size={24} className="fill-current" />,
  },
  { 
    href: "/union/location", 
    label: "Поиск", 
    icon: <Search size={24} />,
    iconFilled: <Search size={24} className="fill-current" />,
  },
  { 
    href: "/union/connections", 
    label: "Совпадения", 
    icon: <Heart size={28} />,
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
    if (href === "/union/recommendations") {
      return pathname === "/union" || pathname === "/union/recommendations";
    }
    return pathname.startsWith(href);
  };

  return (
    <nav 
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50",
        "flex md:hidden items-center justify-around",
        "glass-light",
        "border-t border-glass-brd",
        "safe-bottom"
      )}
      style={{ 
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        borderRadius: "20px 20px 0 0",
      }}
    >
      {navItems.map((item, index) => {
        const active = isActive(item.href);
        const isCenter = index === 2;

        if (isCenter) {
          return (
            <Link
              key={item.href}
              href={item.href}
              className="relative flex flex-col items-center -mt-6"
            >
              <motion.div
                whileTap={{ scale: 0.9 }}
                className={cn(
                  "w-14 h-14 rounded-full",
                  "bg-gradient-to-br from-magenta to-[#B23EFF]",
                  "flex items-center justify-center",
                  "text-white",
                  "shadow-[0_0_24px_rgba(255,62,158,0.5)]",
                  "border-2 border-white/20"
                )}
              >
                {item.icon}
              </motion.div>
            </Link>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-col items-center gap-1 py-3 px-4",
              "min-w-[64px] min-h-[56px]",
              "transition-colors duration-200"
            )}
          >
            {active && (
              <motion.div
                layoutId="activeIndicator"
                className="absolute -top-0.5 w-1 h-1 rounded-full bg-magenta"
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              />
            )}
            <motion.div
              animate={{ scale: active ? 1.1 : 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 20 }}
              className={cn(
                "transition-all duration-200",
                active 
                  ? "text-magenta drop-shadow-[0_0_8px_rgba(255,62,158,0.5)]" 
                  : "text-text-2"
              )}
            >
              {active && item.iconFilled ? item.iconFilled : item.icon}
            </motion.div>
            <span 
              className={cn(
                "text-xs font-medium transition-colors duration-200",
                active ? "text-magenta" : "text-text-2"
              )}
            >
              {item.label}
            </span>
            {item.badge && (
              <span className="absolute top-2 right-2 min-w-[18px] h-[18px] flex items-center justify-center bg-magenta text-white text-[10px] font-bold rounded-full px-1">
                {item.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
