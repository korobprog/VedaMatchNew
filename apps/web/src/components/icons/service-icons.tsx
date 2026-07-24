import React from "react";

interface ServiceIconProps {
  slug?: string;
  category?: string;
  className?: string;
}

/**
 * Custom SVG icons themed for VedaMatch services (hand-drawn / custom vector aesthetic).
 */
export function ServiceIcon({ slug, category, className = "h-7 w-7" }: ServiceIconProps) {
  switch (slug) {
    case "motivation":
      // Sprouts / Lotus sprout with glowing aura - Meditation & Daily growth
      return (
        <svg
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
        >
          <path
            d="M16 28V15"
            stroke="url(#motivation-grad-stem)"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          {/* Left leaf */}
          <path
            d="M16 22C11 22 7 17 8 11C13 11 16 16 16 22Z"
            fill="url(#motivation-grad-leaf-l)"
            stroke="#10B981"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          {/* Right leaf */}
          <path
            d="M16 18C21 18 25 13 24 7C19 7 16 12 16 18Z"
            fill="url(#motivation-grad-leaf-r)"
            stroke="#34D399"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          {/* Sun / Aura rays */}
          <circle cx="16" cy="7" r="2.5" fill="#FBBF24" />
          <path
            d="M16 2V3.5M21 4L20 5.2M11 4L12 5.2"
            stroke="#F59E0B"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <defs>
            <linearGradient id="motivation-grad-stem" x1="16" y1="28" x2="16" y2="15" gradientUnits="userSpaceOnUse">
              <stop stopColor="#059669" />
              <stop offset="1" stopColor="#34D399" />
            </linearGradient>
            <linearGradient id="motivation-grad-leaf-l" x1="8" y1="11" x2="16" y2="22" gradientUnits="userSpaceOnUse">
              <stop stopColor="#10B981" stopOpacity="0.8" />
              <stop offset="1" stopColor="#059669" stopOpacity="0.9" />
            </linearGradient>
            <linearGradient id="motivation-grad-leaf-r" x1="24" y1="7" x2="16" y2="18" gradientUnits="userSpaceOnUse">
              <stop stopColor="#6EE7B7" stopOpacity="0.9" />
              <stop offset="1" stopColor="#10B981" stopOpacity="0.8" />
            </linearGradient>
          </defs>
        </svg>
      );

    case "union":
      // Joined hands forming a heart / lotus - Conscious Relationships & Devotee Union
      return (
        <svg
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
        >
          {/* Heart/Lotus outline made of two interlocking hands */}
          <path
            d="M16 27C16 27 6 20 6 13C6 9.5 8.8 7 12 7C14.2 7 15.4 8.2 16 9.2C16.6 8.2 17.8 7 20 7C23.2 7 26 9.5 26 13C26 20 16 27 16 27Z"
            fill="url(#union-grad-bg)"
            stroke="url(#union-grad-stroke)"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          {/* Clasped hands inner detail */}
          <path
            d="M11 15C13 17 15 18 16 18C17 18 19 17 21 15"
            stroke="#FFF"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeOpacity="0.85"
          />
          <path
            d="M13.5 12.5C14.5 13.8 15.3 14.5 16 14.5C16.7 14.5 17.5 13.8 18.5 12.5"
            stroke="#FFD1E8"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          {/* Sparkle */}
          <circle cx="16" cy="5" r="1.5" fill="#FFE500" />
          <defs>
            <linearGradient id="union-grad-bg" x1="6" y1="7" x2="26" y2="27" gradientUnits="userSpaceOnUse">
              <stop stopColor="#FF3E9E" stopOpacity="0.75" />
              <stop offset="1" stopColor="#B23EFF" stopOpacity="0.85" />
            </linearGradient>
            <linearGradient id="union-grad-stroke" x1="6" y1="7" x2="26" y2="27" gradientUnits="userSpaceOnUse">
              <stop stopColor="#FF85C0" />
              <stop offset="1" stopColor="#D896FF" />
            </linearGradient>
          </defs>
        </svg>
      );

    case "vedabase":
      // Open Sacred Scripture / Palm leaf manuscript with Om/Feather motif
      return (
        <svg
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
        >
          {/* Book pages shadow */}
          <path
            d="M5 24.5C9.5 22.5 14 23.5 16 24.5C18 23.5 22.5 22.5 27 24.5V9.5C22.5 7.5 18 8.5 16 9.5C14 8.5 9.5 7.5 5 9.5V24.5Z"
            fill="url(#vedabase-grad-bg)"
            stroke="url(#vedabase-grad-stroke)"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          {/* Center binding line */}
          <path d="M16 9.5V24.5" stroke="#60A5FA" strokeWidth="1.5" strokeLinecap="round" />
          {/* Text lines (scripture markings) */}
          <path d="M8 13.5H13M8 16.5H12M8 19.5H13" stroke="#93C5FD" strokeWidth="1.3" strokeLinecap="round" opacity="0.8" />
          <path d="M19 13.5H24M20 16.5H24M19 19.5H24" stroke="#93C5FD" strokeWidth="1.3" strokeLinecap="round" opacity="0.8" />
          {/* Peacock feather / Glowing bookmark */}
          <path
            d="M16 6C16.8 4 18.5 3 20 3.5C20.5 4.8 19.5 6.5 16 9.5"
            stroke="#FBBF24"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <circle cx="19" cy="4.5" r="1" fill="#F59E0B" />
          <defs>
            <linearGradient id="vedabase-grad-bg" x1="5" y1="7.5" x2="27" y2="24.5" gradientUnits="userSpaceOnUse">
              <stop stopColor="#1E3A8A" stopOpacity="0.8" />
              <stop offset="1" stopColor="#3B82F6" stopOpacity="0.7" />
            </linearGradient>
            <linearGradient id="vedabase-grad-stroke" x1="5" y1="7.5" x2="27" y2="24.5" gradientUnits="userSpaceOnUse">
              <stop stopColor="#60A5FA" />
              <stop offset="1" stopColor="#93C5FD" />
            </linearGradient>
          </defs>
        </svg>
      );

    case "devotee-space":
    default:
      // Sacred Temple / Lotus flower with Crown / Lock emblem - Restricted Space
      return (
        <svg
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
        >
          {/* Lotus base petals */}
          <path
            d="M16 6C13 10 10 14 10 19C10 23.5 12.7 26 16 26C19.3 26 22 23.5 22 19C22 14 19 10 16 6Z"
            fill="url(#devotee-grad-bg)"
            stroke="url(#devotee-grad-stroke)"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          {/* Side lotus petals */}
          <path
            d="M10 19C6 17 4 14 5 11C8 11 11 14 12 18"
            stroke="#EC4899"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M22 19C26 17 28 14 27 11C24 11 21 14 20 18"
            stroke="#EC4899"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          {/* Tilak emblem in center */}
          <path
            d="M16 12V18M14.5 14C14.5 16.5 16 19 16 19C16 19 17.5 16.5 17.5 14"
            stroke="#FDE047"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <circle cx="16" cy="21" r="1" fill="#FACC15" />
          <defs>
            <linearGradient id="devotee-grad-bg" x1="10" y1="6" x2="22" y2="26" gradientUnits="userSpaceOnUse">
              <stop stopColor="#831843" stopOpacity="0.8" />
              <stop offset="1" stopColor="#DB2777" stopOpacity="0.75" />
            </linearGradient>
            <linearGradient id="devotee-grad-stroke" x1="10" y1="6" x2="22" y2="26" gradientUnits="userSpaceOnUse">
              <stop stopColor="#F472B6" />
              <stop offset="1" stopColor="#FBCFE8" />
            </linearGradient>
          </defs>
        </svg>
      );
  }
}
