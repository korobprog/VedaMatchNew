import type { ReactNode } from "react";

/**
 * Кольцо вокруг аватара. Обёртка, а не проп у `ChatAvatar`: так восемь мест,
 * где аватар уже нарисован, остаются нетронутыми, а кольцо появляется ровно
 * там, где моменты и показывают.
 *
 * Цвета — токены темы. Непросмотренное кольцо горит акцентом, просмотренное
 * гаснет до цвета второстепенного текста: разница должна читаться и в светлой
 * теме, где яркая рамка на белом почти не видна.
 */
export function MomentRing({
  state,
  size,
  children,
}: {
  state: "unseen" | "seen";
  /** Размер аватара внутри; кольцо занимает четыре пикселя вокруг него. */
  size: number;
  children: ReactNode;
}) {
  const box = size + 8;
  return (
    <span
      aria-hidden
      style={{
        width: box,
        height: box,
        background:
          state === "unseen"
            ? "linear-gradient(135deg, var(--vm-magenta), var(--vm-cyan))"
            : "var(--vm-text-2)",
      }}
      className="flex shrink-0 items-center justify-center rounded-full"
    >
      <span
        style={{ width: size + 4, height: size + 4 }}
        className="flex items-center justify-center rounded-full bg-bg-0"
      >
        {children}
      </span>
    </span>
  );
}
