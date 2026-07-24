"use client";

import { motion } from "framer-motion";
import { UserPlus, Heart, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface Step {
  number: number;
  title: string;
  description: string;
  icon: React.ReactNode;
}

const steps: Step[] = [
  {
    number: 1,
    title: "Создайте профиль",
    description: "Расскажите о себе, своих интересах, ценностях и том, что вы ищете в отношениях и общении.",
    icon: <UserPlus className="w-6 h-6" />,
  },
  {
    number: 2,
    title: "Найдите совпадения",
    description: "Система анализирует ваши данные и предлагает людей с похожими интересами и намерениями.",
    icon: <Heart className="w-6 h-6" />,
  },
  {
    number: 3,
    title: "Начните общение",
    description: "После взаимной симпатии откроется чат. Общайтесь, делитесь практиками, создавайте проекты.",
    icon: <Sparkles className="w-6 h-6" />,
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.2,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
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

export function HowItWorks() {
  return (
    <section id="how-it-works" className="relative py-20 md:py-32">
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
            Как это работает
          </h2>
          <p className="text-text-1 text-lg max-w-2xl mx-auto">
            Три простых шага к осознанным знакомствам и объединению
          </p>
        </motion.div>

        {/* Steps */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12"
        >
          {steps.map((step) => (
            <motion.div
              key={step.number}
              variants={itemVariants}
              className="relative"
            >
              {/* Connector line (desktop only) */}
              {step.number < steps.length && (
                <div className="hidden md:block absolute top-12 left-[60%] w-[80%] h-px bg-gradient-to-r from-magenta/50 to-cyan/50" />
              )}

              <div className="glass rounded-2xl p-6 md:p-8 text-center relative z-10 hover:-translate-y-1 transition-transform duration-300">
                {/* Step number circle */}
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  className={cn(
                    "relative w-20 h-20 mx-auto mb-6 rounded-full",
                    "flex items-center justify-center",
                    "bg-gradient-to-br from-magenta to-cyan",
                    "shadow-[0_0_30px_rgba(255,62,158,0.4)]"
                  )}
                >
                  {/* Glow ring */}
                  <div className="absolute inset-0 rounded-full bg-gradient-to-br from-magenta to-cyan blur-lg opacity-50" />
                  
                  {/* Icon */}
                  <div className="relative text-white z-10">
                    {step.icon}
                  </div>

                  {/* Step number badge */}
                  <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-bg-0 border-2 border-magenta flex items-center justify-center">
                    <span className="font-display font-bold text-magenta text-sm">
                      {step.number}
                    </span>
                  </div>
                </motion.div>

                {/* Content */}
                <h3 className="font-display text-xl md:text-2xl font-bold text-text-0 mb-3">
                  {step.title}
                </h3>
                <p className="text-text-1 text-sm md:text-base leading-relaxed">
                  {step.description}
                </p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
