"use client";

import { cn } from "@/lib/utils";

interface IrisProps {
  size?: number;
  glow?: boolean;
  className?: string;
}

export function Iris({ size = 40, glow = false, className }: IrisProps) {
  const glowFilter = glow ? (
    <defs>
      <filter id="iris-glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  ) : null;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={cn(glow && "drop-shadow-[0_0_12px_rgba(255,62,158,0.6)]", className)}
      style={glow ? { filter: "url(#iris-glow)" } : undefined}
      aria-hidden="true"
    >
      {glowFilter}
      <defs>
        <radialGradient id="iris-gradient" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
          <stop offset="0%" stopColor="#FFC85C" />
          <stop offset="35%" stopColor="#23F0C7" />
          <stop offset="65%" stopColor="#FF3E9E" />
          <stop offset="100%" stopColor="#B23EFF" />
        </radialGradient>
        <radialGradient id="pupil-gradient" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#1a0a2e" />
          <stop offset="100%" stopColor="#0a0614" />
        </radialGradient>
        <radialGradient id="iris-glow-inner" cx="30%" cy="30%" r="70%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.3)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
      </defs>
      
      {/* Outer iris ring with gradient */}
      <circle 
        cx="50" 
        cy="50" 
        r="45" 
        fill="url(#iris-gradient)"
        opacity="0.9"
      />
      
      {/* Iris texture/pattern */}
      <circle 
        cx="50" 
        cy="50" 
        r="40" 
        fill="none" 
        stroke="rgba(255,255,255,0.15)" 
        strokeWidth="1"
        strokeDasharray="2 4"
      />
      
      {/* Inner glow */}
      <circle 
        cx="50" 
        cy="50" 
        r="35" 
        fill="url(#iris-glow-inner)"
      />
      
      {/* Pupil - dark center */}
      <circle 
        cx="50" 
        cy="50" 
        r="18" 
        fill="url(#pupil-gradient)"
      />
      
      {/* Pupil highlight */}
      <circle 
        cx="44" 
        cy="44" 
        r="5" 
        fill="rgba(255,255,255,0.2)"
      />
    </svg>
  );
}

interface IrisIconProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function IrisIcon({ size = "md", className }: IrisIconProps) {
  const sizeMap = {
    sm: 24,
    md: 32,
    lg: 48,
  };

  return <Iris size={sizeMap[size]} className={className} />;
}
