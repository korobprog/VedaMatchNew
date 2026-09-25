import Svg, { Path, Rect } from 'react-native-svg';

/**
 * Значки Знакомств — те же контуры, что у сайта (`swipe-deck.tsx`,
 * `union-boost-button.tsx`, `archive-button.tsx`, `union-likes-panel.tsx`).
 * Рисованные, а не эмодзи и не глифы шрифта: системный 🔥 и ♥ меняются от
 * телефона к телефону и выпадают из ряда нарисованных кнопок. Все
 * декоративные — смысл кнопки несёт её `accessibilityLabel`.
 */

interface IconProps {
  color: string;
  size?: number;
}

const hidden = { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' } as const;

const stroke = (color: string, width = 2) => ({
  stroke: color,
  strokeWidth: width,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  fill: 'none',
});

export function HeartIcon({ color, size = 30 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...hidden}>
      <Path
        fill={color}
        d="M12 21.2c-.4 0-.8-.15-1.1-.42C6.3 16.7 3 13.6 3 9.7 3 6.6 5.4 4.2 8.4 4.2c1.5 0 2.8.62 3.6 1.6.8-.98 2.1-1.6 3.6-1.6 3 0 5.4 2.4 5.4 5.5 0 3.9-3.3 7-7.9 11.08-.3.27-.7.42-1.1.42Z"
      />
    </Svg>
  );
}

export function FlameIcon({ color, size = 28 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...hidden}>
      <Path fill={color} d="M13.4 2.2c.3 2.6-.6 4.3-2.3 6-1.9 1.9-3 3.6-3 5.9a6 6 0 0 0 11.5 2.4c1-2.4.4-5-1.2-7.2-.4 1-1.1 1.7-2 2 .5-3.4-.8-6.4-3-9.1Z" />
      <Path fill={color} d="M9.6 13.8c-1 .9-1.6 2-1.6 3.3a4 4 0 0 0 4 4c-1.3-1-2-2.2-2-3.6 0-1.3.5-2.4 1.4-3.4-.6.2-1.3 0-1.8-.3Z" />
    </Svg>
  );
}

export function BoltIcon({ color, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...hidden}>
      <Path fill={color} d="M13.6 2 5 13.4h5.2L9.4 22 19 10.2h-5.8L13.6 2Z" />
    </Svg>
  );
}

export function CloseIcon({ color, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...hidden}>
      <Path d="M18 6 6 18M6 6l12 12" {...stroke(color, 2.5)} />
    </Svg>
  );
}

export function UndoIcon({ color, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...hidden}>
      <Path d="M4 4v6h6" {...stroke(color, 2.2)} />
      <Path d="M20 17a8 8 0 0 0-14.6-4.6L4 10" {...stroke(color, 2.2)} />
    </Svg>
  );
}

export function ChevronIcon({ color, size = 22, direction }: IconProps & { direction: 'up' | 'down' | 'left' | 'right' }) {
  const d = {
    up: 'm6 15 6-6 6 6',
    down: 'm6 9 6 6 6-6',
    left: 'm15 6-6 6 6 6',
    right: 'm9 6 6 6-6 6',
  }[direction];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...hidden}>
      <Path d={d} {...stroke(color, 2.5)} />
    </Svg>
  );
}

export function StarIcon({ color, size = 20, filled }: IconProps & { filled: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...hidden}>
      <Path
        d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8L3.5 9.7l5.9-.9z"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        fill={filled ? color : 'none'}
      />
    </Svg>
  );
}

export function ArchiveIcon({ color, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...hidden}>
      <Path d="M3 8.5 12 4l9 4.5v7L12 20l-9-4.5z" {...stroke(color)} />
      <Path d="M3 8.5 12 13l9-4.5" {...stroke(color)} />
      <Path d="M12 13v7" {...stroke(color)} />
    </Svg>
  );
}

export function CheckIcon({ color, size = 12 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...hidden}>
      <Path d="m4 12.5 5 5L20 6.5" {...stroke(color, 2.5)} />
    </Svg>
  );
}

export function HomeIcon({ color, size = 12 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...hidden}>
      <Path d="M3 10.5 12 3l9 7.5" {...stroke(color)} />
      <Path d="M5 9.5V20h14V9.5" {...stroke(color)} />
    </Svg>
  );
}

export function RulerIcon({ color, size = 12 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...hidden}>
      <Path d="M4 15.5 15.5 4l4.5 4.5L8.5 20z" {...stroke(color)} />
      <Path d="m8 11.5 2 2M11 8.5l2 2M14.5 5.5l2 2" {...stroke(color)} />
    </Svg>
  );
}

export function LotusIcon({ color, size = 12 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...hidden}>
      <Path d="M12 20c-4.5 0-8-3-8-6 2 0 3.5.6 4.6 1.5" {...stroke(color)} />
      <Path d="M12 20c4.5 0 8-3 8-6-2 0-3.5.6-4.6 1.5" {...stroke(color)} />
      <Path d="M12 20c-2.5-2-4-4.6-4-7.2S9.5 7 12 4c2.5 3 4 6.2 4 8.8S14.5 18 12 20Z" {...stroke(color)} />
    </Svg>
  );
}

/** Колода: карточка поверх стопки, со следом уходящей вбок. */
export function DeckIcon({ color, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...hidden}>
      <Rect x={6} y={4} width={12} height={16} rx={2.5} {...stroke(color)} />
      <Path d="M4 7.5 2.6 9a2 2 0 0 0-.3 2.4l3 5.2" {...stroke(color)} />
      <Path d="M20 7.5 21.4 9a2 2 0 0 1 .3 2.4l-3 5.2" {...stroke(color)} />
    </Svg>
  );
}

/** Сетка: четыре ячейки — «крупнее»; девять — «плотнее». */
export function GridIcon({ color, size = 20, cells }: IconProps & { cells: 2 | 3 }) {
  const step = cells === 2 ? 10.5 : 6.75;
  const cell = cells === 2 ? 7.5 : 4.5;
  const origins = Array.from({ length: cells }, (_, i) => 3 + i * step);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...hidden}>
      {origins.flatMap((y) =>
        origins.map((x) => <Rect key={`${x}-${y}`} x={x} y={y} width={cell} height={cell} rx={1.2} {...stroke(color, 1.8)} />),
      )}
    </Svg>
  );
}
