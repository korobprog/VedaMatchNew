import Svg, { Line, Path } from 'react-native-svg';

/**
 * Лупа и крестик поиска по порталу (VED-337) — тот же рисунок, что у поиска
 * по ленте уведомлений (`components/notifications/inbox-search-box.tsx`),
 * чтобы поиск в приложении везде выглядел одинаково. Декоративные: смысл
 * несут подписи полей и кнопок.
 */
const STROKE = { strokeWidth: 2, strokeLinecap: 'round' as const, fill: 'none' };

export function SearchGlyph({ color, size = 18 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no">
      <Path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z" stroke={color} {...STROKE} />
      <Line x1={21} y1={21} x2={16.7} y2={16.7} stroke={color} {...STROKE} />
    </Svg>
  );
}

export function ClearGlyph({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no">
      <Line x1={6} y1={6} x2={18} y2={18} stroke={color} {...STROKE} />
      <Line x1={18} y1={6} x2={6} y2={18} stroke={color} {...STROKE} />
    </Svg>
  );
}
