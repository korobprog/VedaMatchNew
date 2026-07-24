"use client";

export function NoiseOverlay() {
  return (
    <div 
      className="fixed inset-0 -z-[100] pointer-events-none opacity-[0.03]"
      aria-hidden="true"
    >
      <svg 
        className="w-full h-full"
        xmlns="http://www.w3.org/2000/svg"
      >
        <filter id="noise">
          <feTurbulence 
            type="fractalNoise" 
            baseFrequency="0.8" 
            numOctaves="4" 
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect 
          width="100%" 
          height="100%" 
          filter="url(#noise)" 
        />
      </svg>
    </div>
  );
}
