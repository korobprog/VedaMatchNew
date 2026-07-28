/**
 * Значок преданного, статус которого подтвердила администрация.
 * `overlay` — вариант поверх фото карточки, `inline` — в строке с именем.
 */
export function VerifiedBadge({
  variant = "inline",
}: {
  variant?: "inline" | "overlay";
}) {
  const label = "Преданный подтверждён администрацией";

  return (
    <span
      title={label}
      aria-label={label}
      data-testid="verified-devotee-badge"
      className={`inline-flex shrink-0 items-center gap-1 rounded-full text-xs font-semibold ${
        variant === "overlay"
          ? "bg-cyan/90 px-2 py-1 text-[#06231F] shadow-[0_0_14px_var(--vm-glow-cyan)]"
          : "border border-cyan/40 bg-cyan/10 px-2 py-0.5 text-cyan"
      }`}
    >
      <CheckShieldIcon />
      Проверен
    </span>
  );
}

/** Отдельный значок: администрация сверила фото с живым человеком. */
export function PhotoVerifiedBadge({
  variant = "inline",
}: {
  variant?: "inline" | "overlay";
}) {
  const label = "Фото проверено администрацией";

  return (
    <span
      title={label}
      aria-label={label}
      data-testid="photo-verified-badge"
      className={`inline-flex shrink-0 items-center gap-1 rounded-full text-xs font-semibold ${
        variant === "overlay"
          ? "bg-gold/90 px-2 py-1 text-[#2A1B00] shadow-[0_0_14px_var(--vm-glow-gold)]"
          : "border border-gold/40 bg-gold/10 px-2 py-0.5 text-gold"
      }`}
    >
      <CameraCheckIcon />
      Фото
    </span>
  );
}

function CameraCheckIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h3L9 5h6l1.5 2h3A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5Z" />
      <path d="m9.5 12.5 2 2 3.5-3.5" />
    </svg>
  );
}

function CheckShieldIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
