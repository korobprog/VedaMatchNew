"use client";

import { cn } from "@/lib/utils";

interface OrbProps {
  className?: string;
  color?: "magenta" | "cyan" | "purple" | "gold";
  size?: "sm" | "md" | "lg";
  animate?: boolean;
}

const colorMap = {
  magenta: "bg-magenta",
  cyan: "bg-cyan",
  purple: "bg-purple-500",
  gold: "bg-gold",
};

const sizeMap = {
  sm: "w-[200px] h-[200px]",
  md: "w-[400px] h-[400px]",
  lg: "w-[600px] h-[600px]",
};

export function Orb({ 
  className, 
  color = "magenta", 
  size = "md",
  animate = true 
}: OrbProps) {
  return (
    <div
      className={cn(
        "absolute rounded-full blur-[90px] opacity-40",
        colorMap[color],
        sizeMap[size],
        animate && "animate-drift",
        className
      )}
      aria-hidden="true"
    />
  );
}

export function BackgroundOrbs() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden="true">
      {/* Magenta orb - top left */}
      <Orb 
        color="magenta" 
        size="lg" 
        className="top-[-10%] left-[-15%] animate-drift"
      />
      
      {/* Cyan orb - top right */}
      <Orb 
        color="cyan" 
        size="md" 
        className="top-[20%] right-[-10%] animate-drift-reverse"
      />
      
      {/* Purple orb - center */}
      <Orb 
        color="purple" 
        size="lg" 
        className="top-[40%] left-[30%] animate-drift opacity-30"
      />
      
      {/* Gold orb - bottom */}
      <Orb 
        color="gold" 
        size="md" 
        className="bottom-[10%] right-[20%] animate-drift-reverse"
      />
      
      {/* Small accent orbs */}
      <Orb 
        color="magenta" 
        size="sm" 
        className="bottom-[30%] left-[10%] animate-drift-reverse"
      />
      <Orb 
        color="cyan" 
        size="sm" 
        className="top-[60%] right-[5%] animate-drift"
      />
    </div>
  );
}
