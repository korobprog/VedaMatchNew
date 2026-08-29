"use client";

import React, { useId } from "react";

interface ServiceIconProps {
  slug?: string;
  category?: string;
  className?: string;
}

/**
 * Custom SVG icons themed for VedaMatch services (hand-drawn / custom vector aesthetic).
 *
 * Gradient ids are namespaced per instance via `useId`. SVG paint references are
 * resolved document-wide, so a hardcoded id would let one instance hijack another:
 * the header nav renders the same icons as the dashboard cards, and on narrow
 * screens that nav is `display:none`, which left the cards referencing a
 * zero-sized gradient and painting nothing.
 */
export function ServiceIcon({ slug, category, className = "h-7 w-7" }: ServiceIconProps) {
  // Strip the colons React puts in generated ids — they are legal in an id but
  // awkward inside `url(#…)` references.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const gid = (name: string) => `${slug ?? "service"}-${name}-${uid}`;

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
            stroke={`url(#${gid("stem")})`}
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          {/* Left leaf */}
          <path
            d="M16 22C11 22 7 17 8 11C13 11 16 16 16 22Z"
            fill={`url(#${gid("leaf-l")})`}
            stroke="#10B981"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          {/* Right leaf */}
          <path
            d="M16 18C21 18 25 13 24 7C19 7 16 12 16 18Z"
            fill={`url(#${gid("leaf-r")})`}
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
            <linearGradient id={gid("stem")} x1="16" y1="28" x2="16" y2="15" gradientUnits="userSpaceOnUse">
              <stop stopColor="#059669" />
              <stop offset="1" stopColor="#34D399" />
            </linearGradient>
            <linearGradient id={gid("leaf-l")} x1="8" y1="11" x2="16" y2="22" gradientUnits="userSpaceOnUse">
              <stop stopColor="#10B981" stopOpacity="0.8" />
              <stop offset="1" stopColor="#059669" stopOpacity="0.9" />
            </linearGradient>
            <linearGradient id={gid("leaf-r")} x1="24" y1="7" x2="16" y2="18" gradientUnits="userSpaceOnUse">
              <stop stopColor="#6EE7B7" stopOpacity="0.9" />
              <stop offset="1" stopColor="#10B981" stopOpacity="0.8" />
            </linearGradient>
          </defs>
        </svg>
      );

    case "music":
      // Mridanga with a pair of karatalas above it - kirtan and bhajan. The
      // barrel lying on its side reads differently from the round planet of
      // Astro even at nav size, so the two violet icons stay distinguishable.
      return (
        <svg
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
        >
          {/* Karatalas: brass hand cymbals */}
          <circle
            cx="8.5"
            cy="8"
            r="3.8"
            fill={`url(#${gid("karatala")})`}
            stroke="#FDE047"
            strokeWidth="1.2"
          />
          <circle cx="8.5" cy="8" r="1.2" fill="#FEF9C3" />
          <circle
            cx="14.6"
            cy="6.2"
            r="3.2"
            fill={`url(#${gid("karatala")})`}
            stroke="#FDE047"
            strokeWidth="1.2"
          />
          <circle cx="14.6" cy="6.2" r="1" fill="#FEF9C3" />
          {/* Mridanga body: tapered barrel, small head left, big head right */}
          <path
            d="M8.5 16.2C13.5 13.9 20.5 13.7 25 15V24.6C20.5 25.9 13.5 25.7 8.5 23.4V16.2Z"
            fill={`url(#${gid("drum")})`}
            stroke={`url(#${gid("stroke")})`}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          {/* Lacing across the shell */}
          <path
            d="M13.5 15.2V24.6M17.5 14.7V25M21.5 14.7V25"
            stroke="#EDE9FE"
            strokeWidth="1.1"
            strokeOpacity="0.55"
            strokeLinecap="round"
          />
          {/* Heads */}
          <ellipse
            cx="8.5"
            cy="19.8"
            rx="2"
            ry="3.6"
            fill="#EDE9FE"
            stroke={`url(#${gid("stroke")})`}
            strokeWidth="1.3"
          />
          <ellipse
            cx="25"
            cy="19.8"
            rx="2.6"
            ry="4.8"
            fill="#DDD6FE"
            stroke={`url(#${gid("stroke")})`}
            strokeWidth="1.3"
          />
          <circle cx="25" cy="19.8" r="1.4" fill="#4C1D95" fillOpacity="0.7" />
          <defs>
            <linearGradient id={gid("drum")} x1="8.5" y1="14" x2="25" y2="25.9" gradientUnits="userSpaceOnUse">
              <stop stopColor="#5B21B6" stopOpacity="0.9" />
              <stop offset="1" stopColor="#A855F7" stopOpacity="0.85" />
            </linearGradient>
            <linearGradient id={gid("stroke")} x1="8.5" y1="14" x2="25" y2="25.9" gradientUnits="userSpaceOnUse">
              <stop stopColor="#C4B5FD" />
              <stop offset="1" stopColor="#F5D0FE" />
            </linearGradient>
            <linearGradient id={gid("karatala")} x1="5" y1="4" x2="18" y2="12" gradientUnits="userSpaceOnUse">
              <stop stopColor="#B45309" />
              <stop offset="1" stopColor="#FBBF24" />
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
            fill={`url(#${gid("bg")})`}
            stroke={`url(#${gid("stroke")})`}
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
            <linearGradient id={gid("bg")} x1="6" y1="7" x2="26" y2="27" gradientUnits="userSpaceOnUse">
              <stop stopColor="#FF3E9E" stopOpacity="0.75" />
              <stop offset="1" stopColor="#B23EFF" stopOpacity="0.85" />
            </linearGradient>
            <linearGradient id={gid("stroke")} x1="6" y1="7" x2="26" y2="27" gradientUnits="userSpaceOnUse">
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
            fill={`url(#${gid("bg")})`}
            stroke={`url(#${gid("stroke")})`}
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
            <linearGradient id={gid("bg")} x1="5" y1="7.5" x2="27" y2="24.5" gradientUnits="userSpaceOnUse">
              <stop stopColor="#1E3A8A" stopOpacity="0.8" />
              <stop offset="1" stopColor="#3B82F6" stopOpacity="0.7" />
            </linearGradient>
            <linearGradient id={gid("stroke")} x1="5" y1="7.5" x2="27" y2="24.5" gradientUnits="userSpaceOnUse">
              <stop stopColor="#60A5FA" />
              <stop offset="1" stopColor="#93C5FD" />
            </linearGradient>
          </defs>
        </svg>
      );

    case "astro":
      // Natal chart wheel with crescent moon and stars - Vedic astrology
      return (
        <svg
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
        >
          {/* Chart wheel rim */}
          <circle
            cx="15"
            cy="18"
            r="9.5"
            fill={`url(#${gid("bg")})`}
            stroke={`url(#${gid("stroke")})`}
            strokeWidth="1.6"
          />
          {/* House spokes, 12 divisions collapsed to 4 for legibility at small size */}
          <path
            d="M15 8.5V27.5M5.5 18H24.5M8.4 11.4L21.6 24.6M21.6 11.4L8.4 24.6"
            stroke="#C4B5FD"
            strokeWidth="1"
            strokeOpacity="0.65"
            strokeLinecap="round"
          />
          <circle cx="15" cy="18" r="2.4" fill="#FDE047" fillOpacity="0.9" />
          {/* Crescent moon accent, overlapping the rim */}
          <path
            d="M24 6.5C24 9.26 21.76 11.5 19 11.5C18.5 11.5 18.02 11.43 17.57 11.29C19.5 10.4 20.8 8.46 20.8 6.5C20.8 4.54 19.5 2.6 17.57 1.71C18.02 1.57 18.5 1.5 19 1.5C21.76 1.5 24 3.74 24 6.5Z"
            fill="#FBBF24"
          />
          {/* Sparkle stars */}
          <path d="M6 6L6.7 7.8L8.5 8.5L6.7 9.2L6 11L5.3 9.2L3.5 8.5L5.3 7.8L6 6Z" fill="#F0ABFC" />
          <circle cx="26" cy="20" r="1.1" fill="#93C5FD" />
          <defs>
            <linearGradient id={gid("bg")} x1="5.5" y1="8.5" x2="24.5" y2="27.5" gradientUnits="userSpaceOnUse">
              <stop stopColor="#4C1D95" stopOpacity="0.85" />
              <stop offset="1" stopColor="#7C3AED" stopOpacity="0.75" />
            </linearGradient>
            <linearGradient id={gid("stroke")} x1="5.5" y1="8.5" x2="24.5" y2="27.5" gradientUnits="userSpaceOnUse">
              <stop stopColor="#C4B5FD" />
              <stop offset="1" stopColor="#A78BFA" />
            </linearGradient>
          </defs>
        </svg>
      );

    case "library":
      // Bookmark ribbon with a chain link - curated library of external materials
      return (
        <svg
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
        >
          {/* Bookmark ribbon */}
          <path
            d="M8 4H24C24.8 4 25.5 4.7 25.5 5.5V28L16 22.5L6.5 28V5.5C6.5 4.7 7.2 4 8 4Z"
            fill={`url(#${gid("bg")})`}
            stroke={`url(#${gid("stroke")})`}
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          {/* Chain link, symbolising outbound links to external materials */}
          <rect
            x="11.2"
            y="10.5"
            width="6.4"
            height="4.4"
            rx="2.2"
            transform="rotate(-28 11.2 10.5)"
            stroke="#FDE68A"
            strokeWidth="1.6"
          />
          <rect
            x="14.4"
            y="13.3"
            width="6.4"
            height="4.4"
            rx="2.2"
            transform="rotate(-28 14.4 13.3)"
            stroke="#FDE68A"
            strokeWidth="1.6"
          />
          {/* Sparkle accent */}
          <circle cx="21.5" cy="9" r="1.2" fill="#FEF3C7" />
          <defs>
            <linearGradient id={gid("bg")} x1="6.5" y1="4" x2="25.5" y2="28" gradientUnits="userSpaceOnUse">
              <stop stopColor="#92400E" stopOpacity="0.85" />
              <stop offset="1" stopColor="#D97706" stopOpacity="0.75" />
            </linearGradient>
            <linearGradient id={gid("stroke")} x1="6.5" y1="4" x2="25.5" y2="28" gradientUnits="userSpaceOnUse">
              <stop stopColor="#FBBF24" />
              <stop offset="1" stopColor="#FCD34D" />
            </linearGradient>
          </defs>
        </svg>
      );

    case "chat":
      // Two speech bubbles - a conversation, not a broadcast
      return (
        <svg
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
        >
          {/* Bubble of the person who wrote first */}
          <path
            d="M5 10a3 3 0 013-3h11a3 3 0 013 3v6a3 3 0 01-3 3h-6l-5 4v-4H8a3 3 0 01-3-3z"
            fill={`url(#${gid("bg")})`}
            stroke={`url(#${gid("stroke")})`}
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          {/* Reply bubble, overlapping - the answer */}
          <path
            d="M13 20a3 3 0 013-3h8a3 3 0 013 3v4a3 3 0 01-3 3h-3l-4 3v-3h-1a3 3 0 01-3-3z"
            fill={`url(#${gid("bg2")})`}
            stroke={`url(#${gid("stroke")})`}
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          {/* Lines of text in the first bubble */}
          <path
            d="M9 11.5h9M9 14.5h6"
            stroke="#5EEAD4"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <defs>
            <linearGradient id={gid("bg")} x1="5" y1="7" x2="22" y2="23" gradientUnits="userSpaceOnUse">
              <stop stopColor="#134E4A" stopOpacity="0.85" />
              <stop offset="1" stopColor="#0D9488" stopOpacity="0.75" />
            </linearGradient>
            <linearGradient id={gid("bg2")} x1="13" y1="17" x2="27" y2="30" gradientUnits="userSpaceOnUse">
              <stop stopColor="#164E63" stopOpacity="0.85" />
              <stop offset="1" stopColor="#0891B2" stopOpacity="0.75" />
            </linearGradient>
            <linearGradient id={gid("stroke")} x1="5" y1="7" x2="27" y2="30" gradientUnits="userSpaceOnUse">
              <stop stopColor="#2DD4BF" />
              <stop offset="1" stopColor="#67E8F9" />
            </linearGradient>
          </defs>
        </svg>
      );

    case "contacts":
      // Address card with a community network of people - who's who nearby
      return (
        <svg
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
        >
          {/* Card outline */}
          <rect
            x="4"
            y="7"
            width="24"
            height="18"
            rx="3"
            fill={`url(#${gid("bg")})`}
            stroke={`url(#${gid("stroke")})`}
            strokeWidth="1.8"
          />
          {/* Central contact avatar */}
          <circle cx="13" cy="14.5" r="3" fill="#E0FFFB" />
          <path
            d="M8 21.5C8 18.7 10.2 17 13 17C15.8 17 18 18.7 18 21.5"
            stroke="#E0FFFB"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          {/* Linked contacts, community around the person */}
          <circle cx="23" cy="12.5" r="1.6" fill="#A8FFF3" />
          <path
            d="M20 17.5C20 15.8 21.3 14.7 23 14.7C24.7 14.7 26 15.8 26 17.5"
            stroke="#A8FFF3"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
          <path
            d="M18.5 13.5L21 12.8"
            stroke="#A8FFF3"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeOpacity="0.8"
          />
          <defs>
            <linearGradient id={gid("bg")} x1="4" y1="7" x2="28" y2="25" gradientUnits="userSpaceOnUse">
              <stop stopColor="#0F766E" stopOpacity="0.85" />
              <stop offset="1" stopColor="#33CCCC" stopOpacity="0.8" />
            </linearGradient>
            <linearGradient id={gid("stroke")} x1="4" y1="7" x2="28" y2="25" gradientUnits="userSpaceOnUse">
              <stop stopColor="#5CCCCC" />
              <stop offset="1" stopColor="#99F6E4" />
            </linearGradient>
          </defs>
        </svg>
      );

    case "market":
      // Market stall: striped awning over a basket - goods and services from devotees
      return (
        <svg
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
        >
          {/* Awning */}
          <path
            d="M4 5H28L29.5 11H2.5L4 5Z"
            fill={`url(#${gid("awning")})`}
            stroke={`url(#${gid("stroke")})`}
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          {/* Awning stripes */}
          <path
            d="M11 5L9.5 11M20 5L21.5 11"
            stroke="#FFE9C7"
            strokeWidth="1.2"
            strokeOpacity="0.7"
            strokeLinecap="round"
          />
          {/* Basket body */}
          <path
            d="M6 13H26L24 27H8L6 13Z"
            fill={`url(#${gid("basket")})`}
            stroke={`url(#${gid("stroke")})`}
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          {/* Weave */}
          <path
            d="M12.5 16L13.5 24M19.5 16L18.5 24M7.2 19.5H24.8"
            stroke="#FFE9C7"
            strokeWidth="1.2"
            strokeOpacity="0.65"
            strokeLinecap="round"
          />
          <defs>
            <linearGradient id={gid("awning")} x1="2.5" y1="5" x2="29.5" y2="11" gradientUnits="userSpaceOnUse">
              <stop stopColor="#B45309" stopOpacity="0.9" />
              <stop offset="1" stopColor="#F59E0B" stopOpacity="0.85" />
            </linearGradient>
            <linearGradient id={gid("basket")} x1="6" y1="13" x2="26" y2="27" gradientUnits="userSpaceOnUse">
              <stop stopColor="#92400E" stopOpacity="0.85" />
              <stop offset="1" stopColor="#D97706" stopOpacity="0.8" />
            </linearGradient>
            <linearGradient id={gid("stroke")} x1="2.5" y1="5" x2="29.5" y2="27" gradientUnits="userSpaceOnUse">
              <stop stopColor="#FCD34D" />
              <stop offset="1" stopColor="#FDE68A" />
            </linearGradient>
          </defs>
        </svg>
      );

    case "notices":
      // Community notice board: two paper notes pinned under a saffron
      // pushpin. Indigo is the one hue left unused by the other services, and
      // the board silhouette reads differently from the market awning and the
      // contacts card even at nav size.
      return (
        <svg
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
        >
          {/* Board */}
          <rect
            x="3.5"
            y="6.5"
            width="25"
            height="20"
            rx="2.5"
            fill={`url(#${gid("board")})`}
            stroke={`url(#${gid("frame")})`}
            strokeWidth="1.8"
          />
          {/* Left note, pinned slightly askew */}
          <rect
            x="7"
            y="10"
            width="10"
            height="11"
            rx="1"
            fill={`url(#${gid("paper-l")})`}
            transform="rotate(-6 12 15.5)"
          />
          <path
            d="M9.2 13.6H14.8M9.2 16H14.8M9.2 18.4H12.6"
            stroke="#A16207"
            strokeWidth="1"
            strokeLinecap="round"
            strokeOpacity="0.6"
            transform="rotate(-6 12 15.5)"
          />
          {/* Right note, overlapping — a board is never tidy */}
          <rect
            x="16"
            y="12"
            width="9.5"
            height="10"
            rx="1"
            fill={`url(#${gid("paper-r")})`}
            transform="rotate(5 20.75 17)"
          />
          <path
            d="M18 15.2H23.4M18 17.6H23.4M18 20H21.2"
            stroke="#A16207"
            strokeWidth="1"
            strokeLinecap="round"
            strokeOpacity="0.5"
            transform="rotate(5 20.75 17)"
          />
          {/* Saffron pushpin */}
          <circle
            cx="11.4"
            cy="10.6"
            r="2"
            fill="#FBBF24"
            stroke="#B45309"
            strokeWidth="0.9"
          />
          <circle cx="10.8" cy="10" r="0.55" fill="#FEF9C3" />
          <defs>
            <linearGradient
              id={gid("board")}
              x1="3.5"
              y1="6.5"
              x2="28.5"
              y2="26.5"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#312E81" />
              <stop offset="1" stopColor="#4F46E5" />
            </linearGradient>
            <linearGradient
              id={gid("frame")}
              x1="3.5"
              y1="6.5"
              x2="28.5"
              y2="26.5"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#818CF8" />
              <stop offset="1" stopColor="#6366F1" />
            </linearGradient>
            <linearGradient
              id={gid("paper-l")}
              x1="7"
              y1="10"
              x2="17"
              y2="21"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#FEF9C3" />
              <stop offset="1" stopColor="#FDE68A" />
            </linearGradient>
            <linearGradient
              id={gid("paper-r")}
              x1="16"
              y1="12"
              x2="25.5"
              y2="22"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#FFFBEB" />
              <stop offset="1" stopColor="#FEF3C7" />
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
            fill={`url(#${gid("bg")})`}
            stroke={`url(#${gid("stroke")})`}
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
            <linearGradient id={gid("bg")} x1="10" y1="6" x2="22" y2="26" gradientUnits="userSpaceOnUse">
              <stop stopColor="#831843" stopOpacity="0.8" />
              <stop offset="1" stopColor="#DB2777" stopOpacity="0.75" />
            </linearGradient>
            <linearGradient id={gid("stroke")} x1="10" y1="6" x2="22" y2="26" gradientUnits="userSpaceOnUse">
              <stop stopColor="#F472B6" />
              <stop offset="1" stopColor="#FBCFE8" />
            </linearGradient>
          </defs>
        </svg>
      );
  }
}
