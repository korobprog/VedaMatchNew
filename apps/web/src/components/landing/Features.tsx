"use client";

import { motion } from "framer-motion";
import { 
  Heart, 
  Sparkles, 
  Users, 
  Shield, 
  Compass, 
  MessageCircle 
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Feature {
  icon: React.ReactNode;
  title: string;
  description: string;
  accentColor: "magenta" | "cyan" | "gold";
}

const features: Feature[] = [
  {
    icon: <Heart className="w-7 h-7" />,
    title: "Осознанный матчинг",
    description: "Система сравнивает ваши намерения, интересы и ценности, чтобы найти по-настоящему совместимых людей.",
    accentColor: "magenta",
  },
  {
    icon: <Sparkles className="w-7 h-7" />,
    title: "Духовные этапы",
    description: "Учитываем ваш этап пути — от ищущего до преданного — для более точных рекомендаций.",
    accentColor: "cyan",
  },
  {
    icon: <Users className="w-7 h-7" />,
    title: "Все типы связей",
    description: "Семья, дружба, служение, проекты или духовное общение — выбирайте то, что вам нужно.",
    accentColor: "gold",
  },
  {
    icon: <Shield className="w-7 h-7" />,
    title: "Приватность под контролем",
    description: "Вы решаете, что видно другим. Контакты и локация открываются только после взаимного согласия.",
    accentColor: "magenta",
  },
  {
    icon: <Compass className="w-7 h-7" />,
    title: "Умный поиск",
    description: "Фильтруйте по городу, радиусу, интересам и типу отношений, которые вы ищете.",
    accentColor: "cyan",
  },
  {
    icon: <MessageCircle className="w-7 h-7" />,
    title: "Встроенный чат",
    description: "Общайтесь с совпадениями сразу в приложении. Без перехода в мессенджеры.",
    accentColor: "gold",
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: {
      type: "spring" as const,
      damping: 25,
      stiffness: 300,
    },
  },
};

const accentColorMap = {
  magenta: {
    border: "hover:border-magenta/50",
    icon: "text-magenta",
    glow: "hover:shadow-[0_0_20px_rgba(255,62,158,0.3)]",
    badge: "bg-magenta/20 text-magenta border-magenta/30",
  },
  cyan: {
    border: "hover:border-cyan/50",
    icon: "text-cyan",
    glow: "hover:shadow-[0_0_20px_rgba(35,240,199,0.3)]",
    badge: "bg-cyan/20 text-cyan border-cyan/30",
  },
  gold: {
    border: "hover:border-gold/50",
    icon: "text-gold",
    glow: "hover:shadow-[0_0_20px_rgba(255,200,92,0.3)]",
    badge: "bg-gold/20 text-gold border-gold/30",
  },
};

export function Features() {
  return (
    <section id="features" className="relative py-20 md:py-32">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold text-text-0 mb-4">
            Возможности
          </h2>
          <p className="text-text-1 text-lg max-w-2xl mx-auto">
            Всё для осознанных знакомств и объединения единомышленников
          </p>
        </motion.div>

        {/* Features grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {features.map((feature) => {
            const colors = accentColorMap[feature.accentColor];
            
            return (
              <motion.div
                key={feature.title}
                variants={itemVariants}
                className={cn(
                  "group relative",
                  "glass rounded-2xl p-6",
                  "border border-glass-brd",
                  "transition-all duration-300",
                  "hover:-translate-y-1",
                  colors.border,
                  colors.glow
                )}
              >
                {/* Icon */}
                <div className={cn(
                  "w-14 h-14 rounded-xl",
                  "flex items-center justify-center",
                  "bg-gradient-to-br from-white/10 to-white/5",
                  "border border-glass-brd",
                  "mb-5",
                  colors.icon
                )}>
                  {feature.icon}
                </div>

                {/* Title */}
                <h3 className="font-display text-xl font-bold text-text-0 mb-2">
                  {feature.title}
                </h3>

                {/* Description */}
                <p className="text-text-1 text-sm leading-relaxed">
                  {feature.description}
                </p>

                {/* Accent line */}
                <div className={cn(
                  "absolute bottom-0 left-0 right-0 h-1 rounded-b-2xl",
                  "bg-gradient-to-r",
                  feature.accentColor === "magenta" && "from-magenta/50 to-transparent",
                  feature.accentColor === "cyan" && "from-cyan/50 to-transparent",
                  feature.accentColor === "gold" && "from-gold/50 to-transparent",
                  "opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                )} />
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
