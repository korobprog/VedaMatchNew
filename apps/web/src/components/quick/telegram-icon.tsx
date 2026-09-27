/**
 * Значок Телеграма для горячей кнопки «Телеграм» (VED-562).
 *
 * В lucide логотипа мессенджера нет, а его `Send` — просто самолётик, без
 * круга, и Телеграм в нём не узнают. Здесь — круг и бумажный самолётик
 * Телеграма в сетке lucide (24 × 24, обводка 2): рядом с соседними
 * значками панели он той же величины и той же толщины линии. Цвет — от
 * текста (`currentColor`), поэтому значок переживает смену темы.
 */
export function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-icon="telegram"
      className={className}
    >
      <circle cx="12" cy="12" r="10" />
      <path
        fill="currentColor"
        stroke="none"
        d="M17.2 7.1 5.9 11.5c-.6.25-.6 1.05.02 1.25l2.8.9 1.05 3.3c.18.55.88.7 1.27.28l1.5-1.6 2.9 2.15c.45.33 1.1.08 1.2-.47l1.8-8.9c.12-.62-.48-1.13-1.07-.9Z"
      />
    </svg>
  );
}
