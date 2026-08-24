import type { SpiritualStage } from "@vedamatch/shared";

/**
 * Самописные значки ступени и статуса администратора — не эмодзи. Единая
 * логика роста: росток → сомкнутый бутон → раскрытый лотос → лотос с
 * огоньком служения. Утверждено в макете ленты друзей, здесь — тот же путь.
 */

export function AdminBadgeIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-2.5" aria-hidden>
      <path
        d="M10 2 L16 4.5 V9.6 C16 13.6 13.2 16.7 10 18 C6.8 16.7 4 13.6 4 9.6 V4.5 Z"
        fill="currentColor"
        fillOpacity={0.16}
        stroke="currentColor"
        strokeWidth={1.3}
        strokeLinejoin="round"
      />
      {/* Внутри — герб портала: та же пара горных вершин под глобусом, что и
          в шапке (components/icons/vedamatch-mark.tsx), только без растровой
          фотографии — глобус на 10 пикселях всё равно превратился бы в кашу,
          поэтому он упрощён до точки. Щит с гербом читается как «печать
          портала», а не общий символ охраны. */}
      <circle cx={10} cy={6.6} r={1.05} fill="currentColor" />
      <path
        d="M6.3 14.6 L8.3 9.6 L10 12.6 L11.7 9.6 L13.7 14.6"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.15}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const PETAL = "M0,-1.6 C-3,-4.2 -3.1,-7.8 0,-10 C3.1,-7.8 3,-4.2 0,-1.6 Z";
const PETAL_TIGHT = "M0,-1.6 C-2.9,-4 -3,-7.2 0,-9.2 C3,-7.2 2.9,-4 0,-1.6 Z";

function Lotus({ petals, petal, radius }: { petals: number; petal: string; radius: number }) {
  const angles = Array.from({ length: petals }, (_, i) => (360 / petals) * i);
  return (
    <g transform={`translate(9,${radius})`}>
      {angles.map((angle) => (
        <g key={angle} transform={`rotate(${angle})`}>
          <path d={petal} fill="currentColor" fillOpacity={0.92} />
        </g>
      ))}
      <circle r={1.4} fill="currentColor" />
    </g>
  );
}

function SeekerIcon() {
  return (
    <svg viewBox="0 0 18 18" className="size-full" aria-hidden>
      <path
        d="M6.6 15 C6.6 10.5 8 9 9.4 5.6"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.4}
        strokeLinecap="round"
      />
      <path
        d="M9.4 5.6 C10.6 5.2 11.6 5.8 12 7.2 C10.5 7.6 9.6 7 9.4 5.6 Z"
        fill="currentColor"
        fillOpacity={0.85}
      />
      <path
        d="M4.4 15.4 H8.8"
        stroke="currentColor"
        strokeWidth={1.2}
        strokeLinecap="round"
        strokeOpacity={0.55}
      />
    </svg>
  );
}

function PractitionerIcon() {
  return (
    <svg viewBox="0 0 18 18" className="size-full" aria-hidden>
      <g transform="translate(9,11)">
        {[-16, 0, 16].map((angle) => (
          <g key={angle} transform={`rotate(${angle})`}>
            <path d={angle === 0 ? PETAL_TIGHT : PETAL} fill="currentColor" fillOpacity={0.9} />
          </g>
        ))}
      </g>
      <path
        d="M4.4 11.4 Q9 14.6 13.6 11.4"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.3}
        strokeLinecap="round"
        strokeOpacity={0.6}
      />
    </svg>
  );
}

function YogiIcon() {
  return (
    <svg viewBox="0 0 18 18" className="size-full" aria-hidden>
      <Lotus petals={6} petal={PETAL} radius={9.6} />
    </svg>
  );
}

function DevoteeIcon() {
  return (
    <svg viewBox="0 0 18 18" className="size-full" aria-hidden>
      <Lotus petals={8} petal={PETAL_TIGHT} radius={10.6} />
      <path
        d="M9 1.6 C10.3 2.9 10.5 4.2 9 5.6 C7.5 4.2 7.7 2.9 9 1.6 Z"
        fill="currentColor"
      />
    </svg>
  );
}

export const STAGE_LABEL: Record<SpiritualStage, string> = {
  seeker: "Ищущий",
  practitioner: "Практикующий основы",
  yogi: "Йог",
  devotee: "Преданный",
};

/** Приглушённые ранние ступени, цветные — состоявшиеся: тот же язык, что и
 *  цвет ступени в остальном портале, просто без готового токена под каждую. */
export const STAGE_TINT: Record<SpiritualStage, string> = {
  seeker: "text-text-2",
  practitioner: "text-text-2",
  yogi: "text-cyan",
  devotee: "text-magenta",
};

export function StageIcon({ stage }: { stage: SpiritualStage }) {
  switch (stage) {
    case "seeker":
      return <SeekerIcon />;
    case "practitioner":
      return <PractitionerIcon />;
    case "yogi":
      return <YogiIcon />;
    case "devotee":
      return <DevoteeIcon />;
  }
}
